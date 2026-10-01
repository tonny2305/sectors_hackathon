import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMonitoringCycle } from '../lib/automation/monitor.ts';
import type { Store, TelegramDeliveryRecord } from '../lib/db/store.ts';
import { evaluateEvent } from '../lib/materiality/engine.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import filingFixture from '../fixtures/filings.documented.json';

const filingId = '11111111-1111-4111-8111-111111111111';
const evaluationId = '22222222-2222-4222-8222-222222222222';
const rawFiling = {
  ...filingFixture.results[0]!,
  symbol: 'NSSS.JK',
  timestamp: '2026-09-24T10:30:00',
  holder_name: 'Samuel Sekuritas Indonesia',
  share_percentage_before: 40.17,
  share_percentage_after: 42.73,
  holding_before: 9559919000,
  holding_after: 10169179100,
  amount_transaction: 609260100,
};
const event = normalizeFiling(rawFiling);
const evaluation = evaluateEvent({ event, enrichmentSkipped: true });

interface HarnessOptions {
  telegramResponse?: (call: number) => Promise<Response>;
  initiallyEvaluated?: boolean;
  initialAlertStatus?: 'PENDING' | 'FAILED' | 'SENT' | 'UNKNOWN';
  waitForConcurrentQueueReads?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
  let evaluated = options.initiallyEvaluated ?? false;
  let alertStatus = options.initialAlertStatus ?? null;
  let sentAt: string | null = alertStatus === 'SENT' ? new Date().toISOString() : null;
  let telegramCalls = 0;
  let readyReads = 0;
  let releaseReadyReads: (() => void) | undefined;
  const concurrentReadyReads = new Promise<void>(resolve => { releaseReadyReads = resolve; });
  const finishedRunStatuses: string[] = [];
  const deliveryRecord: TelegramDeliveryRecord = { alertId: '33333333-3333-4333-8333-333333333333', filingId, event, evaluation };

  const store = {
    startRun: vi.fn(async () => {}),
    logApiCall: vi.fn(async () => {}),
    ingestWithRows: vi.fn(async () => ({ inserted: 0, duplicates: 1, rows: [] })),
    getFilingIdsByFingerprint: vi.fn(async (fingerprints: string[]) => fingerprints.map(fingerprint => ({ id: filingId, fingerprint }))),
    getEvaluatedFilingIds: vi.fn(async (ids: string[]) => evaluated ? new Set(ids) : new Set<string>()),
    getPriorHolderEventsBefore: vi.fn(async () => []),
    saveEvaluation: vi.fn(async () => { evaluated = true; return evaluationId; }),
    queueAlert: vi.fn(async () => {
      if (!alertStatus) alertStatus = 'PENDING';
      return alertStatus === 'PENDING';
    }),
    getRetryableTelegramAlerts: vi.fn(async () => {
      const ready = alertStatus === 'PENDING' || alertStatus === 'FAILED' ? [deliveryRecord] : [];
      if (options.waitForConcurrentQueueReads) {
        readyReads++;
        if (readyReads === 2) releaseReadyReads?.();
        await concurrentReadyReads;
      }
      return ready;
    }),
    claimTelegramAlert: vi.fn(async () => {
      if (alertStatus !== 'PENDING' && alertStatus !== 'FAILED') return false;
      alertStatus = 'UNKNOWN';
      sentAt = null;
      return true;
    }),
    updateAlertDeliveryStatus: vi.fn(async (_id: string, status: 'SENT' | 'FAILED' | 'UNKNOWN') => {
      alertStatus = status;
      sentAt = status === 'SENT' ? new Date().toISOString() : null;
    }),
    upsertHolderActivityState: vi.fn(async () => {}),
    finishRun: vi.fn(async (_id: string, result: { status: string }) => { finishedRunStatuses.push(result.status); }),
  } as unknown as Store;

  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/v2/filings/')) {
      return Response.json({
        results: [rawFiling],
        pagination: { has_next: false, next_offset: null, offset: 0, limit: 30 },
      });
    }
    if (url.includes('api.telegram.org')) {
      telegramCalls++;
      return options.telegramResponse
        ? options.telegramResponse(telegramCalls)
        : Response.json({ ok: true, result: { message_id: 8888 } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  return {
    store,
    fetcher,
    get alertStatus() { return alertStatus; },
    get sentAt() { return sentAt; },
    get telegramCalls() { return telegramCalls; },
    finishedRunStatuses,
  };
}

async function runCycle(store: Store, fetcher: typeof fetch) {
  return runMonitoringCycle(store, 'test-sectors-key', {
    startDate: '2026-09-24',
    endDate: '2026-09-24',
    watchlistSymbols: ['NSSS.JK'],
    fetch: fetcher,
  });
}

describe('Telegram delivery idempotency', () => {
  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '12345:TEST');
    vi.stubEnv('TELEGRAM_CHAT_ID', '999999');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('persists SENT and its timestamp only after Telegram confirms success', async () => {
    const harness = createHarness();
    const result = await runCycle(harness.store, harness.fetcher);

    expect(result.status).toBe('COMPLETE');
    expect(evaluation.materialityState).toBe('MATERIAL');
    expect(harness.telegramCalls).toBe(1);
    expect(harness.alertStatus).toBe('SENT');
    expect(harness.sentAt).not.toBeNull();
    expect(harness.store.updateAlertDeliveryStatus).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333', 'SENT', '8888');
  });

  it('sends no additional successful message when the same filing is rerun', async () => {
    const harness = createHarness();
    await runCycle(harness.store, harness.fetcher);
    await runCycle(harness.store, harness.fetcher);

    expect(harness.telegramCalls).toBe(1);
    expect(harness.alertStatus).toBe('SENT');
  });

  it('retries a confirmed Telegram rejection and records the later success', async () => {
    const harness = createHarness({
      telegramResponse: async call => call === 1
        ? Response.json({ ok: false, description: 'temporary rejection' })
        : Response.json({ ok: true, result: { message_id: 8889 } }),
    });

    await runCycle(harness.store, harness.fetcher);
    expect(harness.alertStatus).toBe('FAILED');
    expect(harness.sentAt).toBeNull();
    await runCycle(harness.store, harness.fetcher);

    expect(harness.telegramCalls).toBe(2);
    expect(harness.alertStatus).toBe('SENT');
    expect(harness.sentAt).not.toBeNull();
  });

  it('allows only one concurrent run to claim and send the same queued alert', async () => {
    const harness = createHarness({
      initiallyEvaluated: true,
      initialAlertStatus: 'PENDING',
      waitForConcurrentQueueReads: true,
    });

    await Promise.all([
      runCycle(harness.store, harness.fetcher),
      runCycle(harness.store, harness.fetcher),
    ]);

    expect(harness.store.claimTelegramAlert).toHaveBeenCalledTimes(2);
    expect(harness.telegramCalls).toBe(1);
    expect(harness.alertStatus).toBe('SENT');
  });

  it('keeps filing, evaluation, alert, and run evidence when Telegram is unavailable', async () => {
    const harness = createHarness({ telegramResponse: async () => { throw new Error('offline'); } });
    const result = await runCycle(harness.store, harness.fetcher);

    expect(result.status).toBe('COMPLETE');
    expect(harness.alertStatus).toBe('UNKNOWN');
    expect(harness.store.saveEvaluation).toHaveBeenCalledTimes(1);
    expect(harness.store.finishRun).toHaveBeenCalledTimes(1);
    expect(harness.finishedRunStatuses).toEqual(['COMPLETE']);
  });
});