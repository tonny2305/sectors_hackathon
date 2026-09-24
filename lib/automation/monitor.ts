import 'server-only';
import { randomUUID } from 'node:crypto';
import { SectorsClient, type ApiCallLog } from '../sectors/client.ts';
import { Store, StoreError } from '../db/store.ts';
import { normalizeFiling, normalizeSymbol, type OwnershipEvent } from '../sectors/normalize.ts';
import { evaluateEvent } from '../materiality/engine.ts';
import { computeAttentionMetrics } from '../materiality/metrics.ts';
import type { AttentionMetrics, MaterialityEvaluation } from '../materiality/types.ts';
import type { DailyRecord } from '../sectors/schemas.ts';

export interface MonitorCycleOptions {
  startDate?: string;
  endDate?: string;
  maxPages?: number;
  triggerType?: 'SCHEDULED_CRON' | 'MANUAL_DISPATCH' | 'MANUAL_CLI' | 'E2E_TEST';
  watchlistSymbols?: string[];
  fetch?: typeof fetch;
}

export interface MonitorCycleResult {
  runId: string;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  warning: string | null;
  pagesFetched: number;
  recordsScanned: number;
  newEvents: number;
  eligibleNewFilings: number;
  attentionMetrics: AttentionMetrics;
  estimatedCredits: number;
  apiLatencyMsTotal: number;
  evaluations: Array<{
    filingId: string;
    symbol: string;
    holderName: string | null;
    evaluation: MaterialityEvaluation;
  }>;
}

export function getJakartaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

export async function runMonitoringCycle(
  store: Store,
  sectorsApiKey: string,
  options: MonitorCycleOptions = {},
): Promise<MonitorCycleResult> {
  const runId = randomUUID();
  const triggerType = options.triggerType || 'SCHEDULED_CRON';
  const today = getJakartaDate();
  const start = options.startDate || today;
  const end = options.endDate || today;
  const maxPages = options.maxPages ?? 3;

  let estimatedCredits = 0;
  let apiLatencyMsTotal = 0;

  const client = new SectorsClient({
    apiKey: sectorsApiKey,
    fetch: options.fetch,
    onApiCall: async (log: ApiCallLog) => {
      estimatedCredits += log.estimated_credit_cost;
      apiLatencyMsTotal += log.latency_ms;
      try {
        await store.logApiCall(runId, log);
      } catch {
        // Continue if log audit write fails
      }
    },
  });

  await store.startRun(runId, triggerType);

  try {
    // 1. Fetch active watchlist symbols
    let activeWatchlist = options.watchlistSymbols || [];
    if (activeWatchlist.length === 0) {
      activeWatchlist = await store.getWatchlistSymbols();
    }
    const normalizedWatchlist = new Set(activeWatchlist.map(s => normalizeSymbol(s)));

    // 2. Fetch filings from Sectors API
    const filingsResult = await client.filings({
      start,
      end,
      maxPages,
    });

    // 3. Normalize & Deduplicate in Database
    const ingestResult = await store.ingestWithRows(filingsResult.records);
    const newInsertedMap = new Map<string, string>(); // fingerprint -> database filing ID
    for (const row of ingestResult.rows) {
      newInsertedMap.set(row.fingerprint, row.id);
    }

    // 4. Filter Eligible New Filings
    const evaluatedResults: Array<{
      filingId: string;
      symbol: string;
      holderName: string | null;
      event: OwnershipEvent;
      evaluation: MaterialityEvaluation;
      isDuplicatePush?: boolean;
    }> = [];

    const dailyCache = new Map<string, DailyRecord[]>();

    for (const raw of filingsResult.records) {
      const event = normalizeFiling(raw);
      const dbId = newInsertedMap.get(event.fingerprint);

      // Only evaluate newly inserted events that match the watchlist (or all if watchlist is empty)
      if (!dbId) continue;

      if (normalizedWatchlist.size > 0 && !normalizedWatchlist.has(event.symbol)) {
        continue;
      }

      // 5. Load prior holder behavior
      const priorEvents = await store.getPriorHolderEvents(
        event.symbol,
        event.normalized_holder_name || '',
      );

      // 6. Base evaluation without daily call (Credit-Aware)
      let evaluation = evaluateEvent({
        event,
        priorHolderEvents: priorEvents,
        enrichmentSkipped: true,
      });

      // 7. Conditional Daily Enrichment (Credit-Aware Routing)
      // Call daily ONLY if base state is WATCH or candidate for liquidity escalation
      const isCandidate =
        evaluation.materialityState === 'WATCH' ||
        (event.transaction_value_idr !== null && event.transaction_value_idr > 0 && evaluation.materialityState === 'SILENT' && (evaluation.features.absOwnershipDeltaPp ?? 0) >= 0.10);

      if (isCandidate) {
        let dailyRecords = dailyCache.get(event.symbol);
        if (!dailyRecords) {
          try {
            // Calculate 30-day window ending on event date
            const eventDateMs = Date.parse(event.source_date);
            const start30d = new Date(eventDateMs - 30 * 86_400_000).toISOString().slice(0, 10);
            const dailyRes = await client.daily(event.symbol, start30d, event.source_date);
            dailyRecords = dailyRes.records;
            dailyCache.set(event.symbol, dailyRecords);
          } catch {
            dailyRecords = [];
          }
        }

        if (dailyRecords && dailyRecords.length > 0) {
          evaluation = evaluateEvent({
            event,
            priorHolderEvents: priorEvents,
            dailyRecords,
            enrichmentSkipped: false,
          });
        }
      }

      // 8. Persist evaluation
      const evalId = await store.saveEvaluation(dbId, evaluation);

      // 9. Queue alert if MATERIAL or STRUCTURAL
      if (evaluation.materialityState === 'MATERIAL' || evaluation.materialityState === 'STRUCTURAL') {
        await store.queueAlert(dbId, evalId, 'telegram');
      }

      // 10. Update Holder Activity State Table
      if (event.normalized_holder_name) {
        try {
          await store.upsertHolderActivityState({
            symbol: event.symbol,
            normalized_holder_name: event.normalized_holder_name,
            last_transaction_type: event.transaction_type,
            last_event_timestamp: event.source_timestamp,
            same_direction_count_30d: evaluation.features.repeatCount30d,
            same_direction_count_90d: evaluation.features.repeatCount90d,
            same_direction_count_180d: evaluation.features.repeatCount180d,
            cumulative_same_direction_delta_pp_180d: evaluation.features.cumulativeSameDirectionDeltaPp180d,
            latest_materiality_state: evaluation.materialityState,
          });
        } catch {
          // Non-critical cache failure
        }
      }

      evaluatedResults.push({
        filingId: dbId,
        symbol: event.symbol,
        holderName: event.holder_name,
        event,
        evaluation,
      });
    }

    // 11. Compute Attention Intelligence Metrics
    const attentionMetrics = computeAttentionMetrics({
      eligibleNewFilings: evaluatedResults.length,
      evaluations: evaluatedResults,
    });

    // 12. Finish & Confirm Run in Store
    await store.finishRun(runId, {
      status: filingsResult.status,
      pages_fetched: filingsResult.pagesFetched,
      records_scanned: filingsResult.records.length,
      new_events: ingestResult.inserted,
      estimated_credits: estimatedCredits,
      api_latency_ms_total: apiLatencyMsTotal,
      error_summary: filingsResult.warning,
      eligible_new_filings: attentionMetrics.eligibleNewFilings,
      silent_count: attentionMetrics.silentCount,
      watch_count: attentionMetrics.watchCount,
      material_count: attentionMetrics.materialCount,
      structural_count: attentionMetrics.structuralCount,
      suppressed_from_push_count: attentionMetrics.suppressedCount,
      alerts_sent: attentionMetrics.pushAlertsSent,
      interruption_reduction: attentionMetrics.interruptionReduction,
      duplicate_alert_count: attentionMetrics.duplicatePushAlerts,
      duplicate_alert_rate: attentionMetrics.duplicateAlertRate,
      explainability_coverage: attentionMetrics.explainabilityCoverage,
    });

    return {
      runId,
      status: filingsResult.status,
      warning: filingsResult.warning,
      pagesFetched: filingsResult.pagesFetched,
      recordsScanned: filingsResult.records.length,
      newEvents: ingestResult.inserted,
      eligibleNewFilings: attentionMetrics.eligibleNewFilings,
      attentionMetrics,
      estimatedCredits,
      apiLatencyMsTotal,
      evaluations: evaluatedResults.map(r => ({
        filingId: r.filingId,
        symbol: r.symbol,
        holderName: r.holderName,
        evaluation: r.evaluation,
      })),
    };
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : 'UNEXPECTED_MONITOR_ERROR';

    await store.finishRun(runId, {
      status: 'FAILED',
      pages_fetched: 0,
      records_scanned: 0,
      new_events: 0,
      estimated_credits: estimatedCredits,
      api_latency_ms_total: apiLatencyMsTotal,
      error_summary: errorSummary,
    });

    throw error;
  }
}
