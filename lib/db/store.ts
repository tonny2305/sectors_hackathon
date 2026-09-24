import 'server-only';
import { z } from 'zod';
import { normalizeFiling } from '../sectors/normalize.ts';
import type { ApiCallLog } from '../sectors/client.ts';

export class StoreError extends Error {}

const savedRowsSchema = z.array(z.object({ id: z.uuid(), fingerprint: z.string() }));

export class Store {
  #url: string;
  #key: string;
  #fetch: typeof fetch;
  constructor(url: string, serviceRoleKey: string, fetcher: typeof fetch = fetch) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new StoreError('INVALID_SUPABASE_URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new StoreError('INVALID_SUPABASE_URL');
    }
    if (!serviceRoleKey.trim()) throw new StoreError('MISSING_SUPABASE_SERVICE_ROLE_KEY');
    this.#url = `${parsed.origin}/rest/v1/`;
    this.#key = serviceRoleKey;
    this.#fetch = fetcher;
  }

  private async request(path: string, method: 'POST' | 'PATCH', body: unknown, representation = false): Promise<unknown> {
    try {
      const response = await this.#fetch(this.#url + path, {
        method, headers: { apikey: this.#key, Authorization: `Bearer ${this.#key}`,
          'Content-Type': 'application/json', Prefer: representation ? 'return=representation' : 'return=minimal' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), redirect: 'error', cache: 'no-store',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new StoreError(`DATABASE_HTTP_${response.status}`);
      }
      return representation ? await response.json() : null;
    } catch (error) {
      if (error instanceof StoreError) throw error;
      // Database responses and transport errors may contain credentials or raw evidence.
      throw new StoreError('DATABASE_REQUEST_FAILED');
    }
  }

  async ingest(filings: unknown[]) {
    const events = filings.map(normalizeFiling);
    if (!events.length) return { inserted: 0, duplicates: 0 };
    const response = await this.request('rpc/ingest_filings', 'POST', { p_events: events }, true);
    const parsed = savedRowsSchema.safeParse(response);
    if (!parsed.success || parsed.data.length > events.length) throw new StoreError('INVALID_DATABASE_RESPONSE');
    return { inserted: parsed.data.length, duplicates: events.length - parsed.data.length };
  }

  async startRun(id: string) {
    z.uuid().parse(id);
    await this.request('automation_runs', 'POST', { id, trigger_type: 'MANUAL_DATA_CORE', status: 'RUNNING' });
  }

  async logApiCall(runId: string, log: ApiCallLog) {
    z.uuid().parse(runId);
    await this.request('api_call_logs', 'POST', { run_id: runId, ...log });
  }

  async finishRun(id: string, result: {
    status: 'COMPLETE' | 'PARTIAL' | 'FAILED'; pages_fetched: number; records_scanned: number;
    new_events: number; estimated_credits: number; api_latency_ms_total: number; error_summary: string | null;
  }) {
    z.uuid().parse(id);
    const response = await this.request(`automation_runs?id=eq.${id}`, 'PATCH', {
      ...result, finished_at: new Date().toISOString(),
    }, true);
    if (!Array.isArray(response) || response.length !== 1) throw new StoreError('RUN_UPDATE_NOT_CONFIRMED');
  }
}
