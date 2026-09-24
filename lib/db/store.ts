import 'server-only';
import { z } from 'zod';
import { normalizeFiling, type OwnershipEvent } from '../sectors/normalize.ts';
import type { ApiCallLog } from '../sectors/client.ts';
import type { MaterialityEvaluation, PriorHolderEvent } from '../materiality/types.ts';

export class StoreError extends Error {}

const savedRowsSchema = z.array(z.object({ id: z.string(), fingerprint: z.string() }));

export interface HolderActivityStateRecord {
  symbol: string;
  normalized_holder_name: string;
  last_transaction_type: string | null;
  last_event_timestamp: string | null;
  same_direction_count_30d: number;
  same_direction_count_90d: number;
  same_direction_count_180d: number;
  cumulative_same_direction_delta_pp_180d: number;
  latest_materiality_state: string;
}

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

  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    body?: unknown,
    representation = false,
    extraHeaders?: Record<string, string>,
  ): Promise<unknown> {
    try {
      const headers: Record<string, string> = {
        apikey: this.#key,
        Authorization: `Bearer ${this.#key}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      };
      if (representation) {
        headers['Prefer'] = headers['Prefer']
          ? `${headers['Prefer']},return=representation`
          : 'return=representation';
      }
      const response = await this.#fetch(this.#url + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new StoreError(`DATABASE_HTTP_${response.status}`);
      }
      return representation || method === 'GET' ? await response.json() : null;
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
    return {
      inserted: parsed.data.length,
      duplicates: events.length - parsed.data.length,
    };
  }

  async ingestWithRows(filings: unknown[]): Promise<{
    inserted: number;
    duplicates: number;
    rows: Array<{ id: string; fingerprint: string }>;
  }> {
    const events = filings.map(normalizeFiling);
    if (!events.length) return { inserted: 0, duplicates: 0, rows: [] };
    const response = await this.request('rpc/ingest_filings', 'POST', { p_events: events }, true);
    const parsed = savedRowsSchema.safeParse(response);
    if (!parsed.success || parsed.data.length > events.length) throw new StoreError('INVALID_DATABASE_RESPONSE');
    return {
      inserted: parsed.data.length,
      duplicates: events.length - parsed.data.length,
      rows: parsed.data,
    };
  }

  async startRun(id: string, triggerType = 'MANUAL_DATA_CORE') {
    z.string().uuid().parse(id);
    await this.request('automation_runs', 'POST', { id, trigger_type: triggerType, status: 'RUNNING' });
  }

  async logApiCall(runId: string, log: ApiCallLog) {
    z.string().uuid().parse(runId);
    await this.request('api_call_logs', 'POST', { run_id: runId, ...log });
  }

  async finishRun(id: string, result: {
    status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
    pages_fetched: number;
    records_scanned: number;
    new_events: number;
    estimated_credits: number;
    api_latency_ms_total: number;
    error_summary: string | null;
    eligible_new_filings?: number;
    silent_count?: number;
    watch_count?: number;
    material_count?: number;
    structural_count?: number;
    suppressed_from_push_count?: number;
    alerts_sent?: number;
    interruption_reduction?: number | null;
    duplicate_alert_count?: number;
    duplicate_alert_rate?: number | null;
    explainability_coverage?: number | null;
  }) {
    z.string().uuid().parse(id);
    const response = await this.request(`automation_runs?id=eq.${id}`, 'PATCH', {
      ...result,
      finished_at: new Date().toISOString(),
    }, true);
    if (!Array.isArray(response) || response.length !== 1) throw new StoreError('RUN_UPDATE_NOT_CONFIRMED');
  }

  async saveEvaluation(filingId: string, evaluation: MaterialityEvaluation): Promise<string> {
    z.string().uuid().parse(filingId);
    const payload = {
      filing_id: filingId,
      materiality_state: evaluation.materialityState,
      reason_codes_json: evaluation.reasonCodes,
      suppression_reason_codes_json: evaluation.suppressionReasonCodes,
      relative_position_change: evaluation.features.relativePositionChange,
      new_position: evaluation.features.newPosition,
      near_exit: evaluation.features.nearExit,
      repeat_count_30d: evaluation.features.repeatCount30d,
      repeat_count_90d: evaluation.features.repeatCount90d,
      repeat_count_180d: evaluation.features.repeatCount180d,
      cumulative_same_direction_delta_pp_180d: evaluation.features.cumulativeSameDirectionDeltaPp180d,
      previous_holder_event_timestamp: evaluation.features.previousHolderEventTimestamp,
      previous_materiality_state_for_holder: evaluation.features.previousMaterialityStateForHolder,
      escalated_from_prior_state: evaluation.features.escalatedFromPriorState,
      median_daily_liquidity_proxy_20d: evaluation.features.medianDailyLiquidityProxy20d,
      transaction_to_liquidity_proxy: evaluation.features.transactionToLiquidityProxy,
      context_unavailable: evaluation.features.contextUnavailable,
      enrichment_skipped: evaluation.features.enrichmentSkipped,
      engine_version: evaluation.engineVersion,
    };

    const response = await this.request('event_evaluations', 'POST', payload, true);
    if (!Array.isArray(response) || response.length === 0 || !response[0]?.id) {
      throw new StoreError('FAILED_TO_SAVE_EVALUATION');
    }
    return response[0].id as string;
  }

  async getPriorHolderEvents(symbol: string, normalizedHolderName: string): Promise<PriorHolderEvent[]> {
    const query = `filings?symbol=eq.${encodeURIComponent(symbol)}&normalized_holder_name=eq.${encodeURIComponent(normalizedHolderName)}&select=id,source_timestamp,source_date,transaction_type,ownership_delta_pp&order=source_date.desc&limit=50`;
    const rows = (await this.request(query, 'GET')) as Array<{
      id: string;
      source_timestamp: string;
      source_date: string;
      transaction_type: 'buy' | 'sell' | 'others';
      ownership_delta_pp: number | null;
    }>;
    return rows || [];
  }

  async getWatchlistSymbols(): Promise<string[]> {
    try {
      const rows = (await this.request('watchlist_symbols?enabled=eq.true&select=symbol', 'GET')) as Array<{ symbol: string }>;
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map(r => r.symbol);
      }
    } catch {
      // If table is empty or query fails, return empty list (caller can use all market or default list)
    }
    return [];
  }

  async upsertHolderActivityState(state: HolderActivityStateRecord): Promise<void> {
    const payload = {
      symbol: state.symbol,
      normalized_holder_name: state.normalized_holder_name,
      last_transaction_type: state.last_transaction_type,
      last_event_timestamp: state.last_event_timestamp,
      same_direction_count_30d: state.same_direction_count_30d,
      same_direction_count_90d: state.same_direction_count_90d,
      same_direction_count_180d: state.same_direction_count_180d,
      cumulative_same_direction_delta_pp_180d: state.cumulative_same_direction_delta_pp_180d,
      latest_materiality_state: state.latest_materiality_state,
      updated_at: new Date().toISOString(),
    };

    await this.request(
      'holder_activity_state?on_conflict=symbol,normalized_holder_name',
      'POST',
      payload,
      false,
      { Prefer: 'resolution=merge-duplicates' },
    );
  }

  async queueAlert(filingId: string, evaluationId: string, channel = 'telegram'): Promise<boolean> {
    z.string().uuid().parse(filingId);
    z.string().uuid().parse(evaluationId);
    try {
      await this.request('alerts', 'POST', {
        filing_id: filingId,
        evaluation_id: evaluationId,
        channel,
        delivery_status: 'PENDING',
      });
      return true;
    } catch (error) {
      if (error instanceof StoreError && error.message.includes('409')) {
        // Unique constraint on filing_id prevents duplicate alerts
        return false;
      }
      throw error;
    }
  }

  async updateAlertDeliveryStatus(filingId: string, status: 'SENT' | 'FAILED', messageId?: string): Promise<void> {
    z.string().uuid().parse(filingId);
    await this.request(`alerts?filing_id=eq.${filingId}`, 'PATCH', {
      delivery_status: status,
      sent_at: new Date().toISOString(),
      external_message_id: messageId ?? null,
    });
  }
}
