import 'server-only';
import { randomUUID } from 'node:crypto';
import { SectorsClient, type ApiCallLog } from '../sectors/client.ts';
import { Store, StoreError } from '../db/store.ts';
import { normalizeFiling, normalizeSymbol, type OwnershipEvent } from '../sectors/normalize.ts';
import { evaluateEvent, ENGINE_VERSION } from '../materiality/engine.ts';
import { computeAttentionMetrics } from '../materiality/metrics.ts';
import { formatTelegramMessage, sendTelegramNotification } from '../alerts/telegram.ts';
import type { AttentionMetrics, MaterialityEvaluation } from '../materiality/types.ts';

export interface MonitorCycleOptions {
  startDate?: string;
  endDate?: string;
  maxPages?: number;
  maxApiAttempts?: number;
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
    maxAttempts: options.maxApiAttempts ?? Number(process.env.MAX_SECTORS_API_ATTEMPTS_PER_RUN || 15),
    onApiCall: async (log: ApiCallLog) => {
      estimatedCredits += log.estimated_credit_cost;
      apiLatencyMsTotal += log.latency_ms;
      await store.logApiCall(runId, log);
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
    if (normalizedWatchlist.size === 0) throw new StoreError('EMPTY_WATCHLIST');

    // 2. Fetch filings from Sectors API
    const filingsResult = await client.filings({
      start,
      end,
      maxPages,
    });

    // 3. Normalize & Deduplicate in Database
    const ingestResult = await store.ingestWithRows(filingsResult.records);
    const sortedFilings = filingsResult.records
      .map(raw => ({ raw, event: normalizeFiling(raw) }))
      .sort((a, b) => a.event.source_timestamp.localeCompare(b.event.source_timestamp));
    const storedRows = await store.getFilingIdsByFingerprint(sortedFilings.map(item => item.event.fingerprint));
    const storedIds = new Map(storedRows.map(row => [row.fingerprint, row.id]));
    const evaluatedIds = await store.getEvaluatedFilingIds(storedRows.map(row => row.id), ENGINE_VERSION);

    // 4. Filter Eligible New Filings
    const evaluatedResults: Array<{
      filingId: string;
      symbol: string;
      holderName: string | null;
      event: OwnershipEvent;
      evaluation: MaterialityEvaluation;
      pushSent?: boolean;
    }> = [];

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    let deliveryHealthy = Boolean(botToken && chatId);

    for (const { event } of sortedFilings) {
      const dbId = storedIds.get(event.fingerprint);

      // A prior run may have inserted this filing but failed before evaluation.
      if (!dbId || evaluatedIds.has(dbId)) continue;

      if (!normalizedWatchlist.has(event.symbol)) {
        continue;
      }

      // 5. Load prior holder behavior
      const priorEvents = await store.getPriorHolderEventsBefore(
        event.symbol,
        event.normalized_holder_name || '',
        event.source_timestamp,
      );

      // 6. Frozen B2 policy: daily liquidity must not change alert decisions.
      const evaluation = evaluateEvent({
        event,
        priorHolderEvents: priorEvents,
        enrichmentSkipped: true,
      });

      // 8. Persist evaluation
      const evalId = await store.saveEvaluation(dbId, evaluation);

      // 9. Queue alert if MATERIAL or STRUCTURAL; dispatch from the persisted queue below.
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

    const deliveredFilingIds = new Set<string>();
    if (botToken && chatId) {
      const retryableAlerts = await store.getRetryableTelegramAlerts();
      for (const alert of retryableAlerts) {
        try {
          const message = formatTelegramMessage({
            event: alert.event,
            evaluation: alert.evaluation,
            appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
            filingId: alert.filingId,
          });
          if (!await store.claimTelegramAlert(alert.alertId)) continue;
          const sendResult = await sendTelegramNotification(botToken, chatId, message, options.fetch);
          if (sendResult.ok) {
            await store.updateAlertDeliveryStatus(alert.alertId, 'SENT', sendResult.messageId);
            deliveredFilingIds.add(alert.filingId);
          } else {
            await store.updateAlertDeliveryStatus(alert.alertId, sendResult.retryable ? 'FAILED' : 'UNKNOWN');
            deliveryHealthy = false;
          }
        } catch {
          // Keep the claim UNKNOWN if the delivery outcome or status write is uncertain.
          deliveryHealthy = false;
        }
      }
    }

    // 11. Compute Attention Intelligence Metrics
    for (const result of evaluatedResults) {
      if (deliveredFilingIds.has(result.filingId)) result.pushSent = true;
    }
    const attentionMetrics = computeAttentionMetrics({
      eligibleNewFilings: evaluatedResults.length,
      evaluations: evaluatedResults,
      deliveryHealthy,
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
