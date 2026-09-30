import 'server-only';
import { z } from 'zod';
import { normalizeFiling, type OwnershipEvent } from '../sectors/normalize.ts';
import type { ApiCallLog } from '../sectors/client.ts';
import type { MaterialityEvaluation, MaterialityState, PriorHolderEvent } from '../materiality/types.ts';

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

export interface TelegramDeliveryRecord {
  alertId: string;
  filingId: string;
  event: OwnershipEvent;
  evaluation: MaterialityEvaluation;
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

  async getPriorHolderEventsBefore(symbol: string, normalizedHolderName: string, currentTimestamp: string): Promise<PriorHolderEvent[]> {
    const start = new Date(Date.parse(currentTimestamp.slice(0, 10)) - 180 * 86_400_000).toISOString().slice(0, 10);
    const query = `filings?symbol=eq.${encodeURIComponent(symbol)}&normalized_holder_name=eq.${encodeURIComponent(normalizedHolderName)}&source_date=gte.${start}&source_timestamp=lt.${encodeURIComponent(currentTimestamp)}&select=id,source_timestamp,source_date,transaction_type,ownership_delta_pp,event_evaluations(materiality_state,created_at)&order=source_timestamp.desc&limit=1000`;
    const rows = (await this.request(query, 'GET')) as Array<{
      id: string;
      source_timestamp: string;
      source_date: string;
      transaction_type: 'buy' | 'sell' | 'others';
      ownership_delta_pp: number | null;
      event_evaluations?: Array<{ materiality_state: PriorHolderEvent['materiality_state']; created_at: string }>;
    }>;
    if (!Array.isArray(rows) || rows.length >= 1000) throw new StoreError('HOLDER_HISTORY_INCOMPLETE');
    // ponytail: capped read fails closed at 1,000 rows; paginate if a holder reaches that ceiling.
    return rows.map(({ event_evaluations, ...row }) => ({ ...row,
      materiality_state: event_evaluations?.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.materiality_state,
    }));
  }

  async getFilingIdsByFingerprint(fingerprints: string[]) {
    if (!fingerprints.length) return [];
    const query = `filings?fingerprint=in.(${fingerprints.map(encodeURIComponent).join(',')})&select=id,fingerprint`;
    const rows = await this.request(query, 'GET');
    if (!Array.isArray(rows) || rows.length !== new Set(fingerprints).size) throw new StoreError('FILING_LOOKUP_INCOMPLETE');
    return savedRowsSchema.parse(rows);
  }

  async getEvaluatedFilingIds(ids: string[], engineVersion: string) {
    if (!ids.length) return new Set<string>();
    const query = `event_evaluations?filing_id=in.(${ids.join(',')})&engine_version=eq.${encodeURIComponent(engineVersion)}&select=filing_id`;
    const rows = await this.request(query, 'GET');
    if (!Array.isArray(rows)) throw new StoreError('EVALUATION_LOOKUP_FAILED');
    return new Set(rows.map(row => z.string().uuid().parse(row.filing_id)));
  }

  async getWatchlistSymbols(): Promise<string[]> {
    const rows = (await this.request('watchlist_symbols?enabled=eq.true&select=symbol', 'GET')) as Array<{ symbol: string }>;
    if (!Array.isArray(rows)) throw new StoreError('INVALID_WATCHLIST_RESPONSE');
    return rows.map(r => r.symbol);
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

  async getRetryableTelegramAlerts(alertId?: string): Promise<TelegramDeliveryRecord[]> {
    const alertFilter = alertId ? `id=eq.${z.string().uuid().parse(alertId)}&` : '';
    const alerts = z.array(z.object({
      id: z.string().uuid(),
      filing_id: z.string().uuid(),
      evaluation_id: z.string().uuid(),
    })).parse(await this.request(
      `alerts?${alertFilter}channel=eq.telegram&delivery_status=in.(PENDING,FAILED)&select=id,filing_id,evaluation_id`,
      'GET',
    ));
    if (!alerts.length) return [];

    const filingIds = [...new Set(alerts.map(alert => alert.filing_id))];
    const evaluationIds = [...new Set(alerts.map(alert => alert.evaluation_id))];
    const filings = z.array(z.object({
      id: z.string().uuid(),
      raw_payload_json: z.unknown(),
      ownership_delta_pp: z.union([z.number(), z.string()]).nullable(),
    })).parse(await this.request(`filings?id=in.(${filingIds.join(',')})&select=id,raw_payload_json,ownership_delta_pp`, 'GET'));
    const evaluations = await this.request(`event_evaluations?id=in.(${evaluationIds.join(',')})&select=*`, 'GET') as Array<Record<string, unknown>>;
    if (!Array.isArray(evaluations)) throw new StoreError('INVALID_EVALUATION_RESPONSE');

    const eventsById = new Map(filings.map(row => [row.id, {
      ...normalizeFiling(row.raw_payload_json),
      ownership_delta_pp: row.ownership_delta_pp === null ? null : Number(row.ownership_delta_pp),
    }]));
    const evaluationsById = new Map(evaluations.map(row => [String(row.id), row]));
    const result: TelegramDeliveryRecord[] = [];
    for (const alert of alerts) {
      const event = eventsById.get(alert.filing_id);
      const row = evaluationsById.get(alert.evaluation_id);
      if (!event || !row) throw new StoreError('TELEGRAM_ALERT_EVIDENCE_MISSING');

      const state = row.materiality_state as MaterialityState;
      if (state !== 'MATERIAL' && state !== 'STRUCTURAL') continue;
      const delta = event.ownership_delta_pp;
      result.push({
        alertId: alert.id,
        filingId: alert.filing_id,
        event,
        evaluation: {
          materialityState: state,
          reasonCodes: row.reason_codes_json as MaterialityEvaluation['reasonCodes'],
          suppressionReasonCodes: row.suppression_reason_codes_json as MaterialityEvaluation['suppressionReasonCodes'],
          features: {
            ownershipDeltaPp: delta,
            absOwnershipDeltaPp: delta === null ? null : Math.abs(delta),
            relativePositionChange: row.relative_position_change as number | null,
            newPosition: row.new_position as boolean,
            nearExit: row.near_exit as boolean,
            repeatCount30d: row.repeat_count_30d as number,
            repeatCount90d: row.repeat_count_90d as number,
            repeatCount180d: row.repeat_count_180d as number,
            cumulativeSameDirectionDeltaPp180d: row.cumulative_same_direction_delta_pp_180d as number,
            previousHolderEventTimestamp: row.previous_holder_event_timestamp as string | null,
            previousMaterialityStateForHolder: row.previous_materiality_state_for_holder as MaterialityState | null,
            escalatedFromPriorState: row.escalated_from_prior_state as boolean,
            medianDailyLiquidityProxy20d: row.median_daily_liquidity_proxy_20d as number | null,
            transactionToLiquidityProxy: row.transaction_to_liquidity_proxy as number | null,
            contextUnavailable: row.context_unavailable as boolean,
            enrichmentSkipped: row.enrichment_skipped as boolean,
          },
          engineVersion: row.engine_version as string,
        },
      });
    }
    return result;
  }

  async claimTelegramAlert(alertId: string): Promise<boolean> {
    z.string().uuid().parse(alertId);
    const response = await this.request(
      `alerts?id=eq.${alertId}&channel=eq.telegram&delivery_status=in.(PENDING,FAILED)`,
      'PATCH',
      { delivery_status: 'UNKNOWN', sent_at: null, external_message_id: null },
      true,
    );
    return Array.isArray(response) && response.length === 1;
  }

  async updateAlertDeliveryStatus(alertId: string, status: 'SENT' | 'FAILED' | 'UNKNOWN', messageId?: string): Promise<void> {
    z.string().uuid().parse(alertId);
    const response = await this.request(`alerts?id=eq.${alertId}&delivery_status=eq.UNKNOWN`, 'PATCH', {
      delivery_status: status,
      sent_at: status === 'SENT' ? new Date().toISOString() : null,
      external_message_id: status === 'SENT' ? messageId ?? null : null,
    }, true);
    if (!Array.isArray(response) || response.length !== 1) throw new StoreError('ALERT_DELIVERY_UPDATE_NOT_CONFIRMED');
  }
}
