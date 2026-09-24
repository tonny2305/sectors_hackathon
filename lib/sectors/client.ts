import 'server-only';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { dailyResponseSchema, dateRangeSchema, filingsResponseSchema, symbolSchema, type Filing } from './schemas.ts';
import { normalizeSymbol } from './normalize.ts';

export type ApiCallLog = {
  endpoint: string;
  requested_at: string;
  status_code: number | null;
  latency_ms: number;
  estimated_credit_cost: number;
  cache_hit: boolean;
  error: string | null;
};

export class SectorsError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, status: number | null = null) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

type Options = {
  apiKey: string;
  onApiCall: (log: ApiCallLog) => Promise<void>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  timeoutMs?: number;
};

export class SectorsClient {
  #options: Options;
  constructor(options: Options) {
    if (!options.apiKey.trim()) throw new SectorsError('MISSING_SECTORS_API_KEY');
    if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)) {
      throw new SectorsError('INVALID_TIMEOUT');
    }
    this.#options = options;
  }

  private async request<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    const url = new URL(path, 'https://api.sectors.app');
    url.search = new URLSearchParams(params).toString();
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = performance.now();
      const log: ApiCallLog = { endpoint: path, requested_at: new Date().toISOString(),
        status_code: null, latency_ms: 0, estimated_credit_cost: 1, cache_hit: false, error: null };
      let failure: SectorsError | undefined;
      let result: T | undefined;
      let retryAfterMs = 0;
      const signal = AbortSignal.timeout(this.#options.timeoutMs ?? 30_000);
      try {
        const response = await (this.#options.fetch ?? fetch)(url, {
          headers: { Authorization: this.#options.apiKey }, signal, redirect: 'error', cache: 'no-store',
        });
        log.status_code = response.status;
        if (!response.ok) {
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            retryAfterMs = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
            if (!Number.isFinite(retryAfterMs)) retryAfterMs = 0;
          }
          await response.body?.cancel();
          throw new SectorsError(`HTTP_${response.status}`, response.status);
        }
        let payload: unknown;
        try { payload = await response.json(); }
        catch { throw new SectorsError(signal.aborted ? 'TIMEOUT' : 'INVALID_JSON', response.status); }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) throw new SectorsError('INVALID_PAYLOAD', response.status);
        result = parsed.data;
      } catch (error) {
        // Never log response bodies, headers, raw exceptions, or validation input.
        failure = error instanceof SectorsError ? error : new SectorsError(signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
        log.error = failure.code;
      }
      log.latency_ms = Math.round(performance.now() - started);
      // A failed audit write must fail the request, not silently lose observability.
      try { await this.#options.onApiCall(log); }
      catch { throw new SectorsError('API_LOG_PERSISTENCE_FAILED'); }
      if (!failure) return result as T;
      const transient = failure.code === 'NETWORK_ERROR' || failure.code === 'TIMEOUT' ||
        failure.status === 429 || (failure.status !== null && failure.status >= 500);
      if (!transient || attempt === 2) throw failure;
      // Three total attempts means two waits (1s, 2s); never wait after the final failure.
      await (this.#options.sleep ?? sleep)(Math.min(30_000, Math.max(1000 * 2 ** attempt, retryAfterMs)));
    }
    throw new SectorsError('RETRY_EXHAUSTED');
  }

  async filings(input: { start: string; end: string; symbol?: string; maxPages?: number }) {
    const range = dateRangeSchema.parse(input);
    const maxPages = z.number().int().min(1).max(100).parse(input.maxPages ?? 3);
    const symbol = input.symbol === undefined ? undefined : symbolSchema.parse(input.symbol);
    const records: Filing[] = [];
    let offset = 0;
    for (let page = 1; page <= maxPages; page++) {
      const payload = await this.request('/v2/filings/', {
        ...range, limit: '30', offset: String(offset), ...(symbol ? { symbol } : {}),
      }, filingsResponseSchema);
      if (payload.pagination.offset !== offset) throw new SectorsError('PAGINATION_OFFSET_MISMATCH');
      records.push(...payload.results);
      if (!payload.pagination.has_next) return { records, pagesFetched: page, status: 'COMPLETE' as const, warning: null };
      offset = payload.pagination.next_offset!;
    }
    return { records, pagesFetched: maxPages, status: 'PARTIAL' as const, warning: 'MAX_FILINGS_PAGES_REACHED' };
  }

  async daily(symbolInput: string, start: string, end: string) {
    const symbol = normalizeSymbol(symbolSchema.parse(symbolInput));
    const range = dateRangeSchema.parse({ start, end });
    if ((Date.parse(end) - Date.parse(start)) / 86_400_000 >= 90) throw new SectorsError('DAILY_RANGE_EXCEEDS_90_DAYS');
    try {
      const records = await this.request(`/v2/daily/${symbol}/`, range, dailyResponseSchema);
      if (records.some(row => normalizeSymbol(row.symbol) !== symbol || row.date < start || row.date > end)) {
        throw new SectorsError('DAILY_CONTEXT_MISMATCH');
      }
      const usable = records.some(row => row.close != null && row.volume != null);
      return { records, contextUnavailable: !usable, reason: usable ? null : 'EMPTY_DAILY_DATA' };
    } catch (error) {
      if (error instanceof SectorsError && error.status === 404) {
        return { records: [], contextUnavailable: true, reason: 'DAILY_NOT_FOUND' };
      }
      throw error;
    }
  }
}
