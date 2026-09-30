import { describe, expect, it, vi } from 'vitest';
import { deliverTelegramAlert } from '../lib/alerts/delivery.ts';
import type { Store, TelegramDeliveryRecord } from '../lib/db/store.ts';
import { evaluateEvent } from '../lib/materiality/engine.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import filingFixture from '../fixtures/filings.documented.json';

const alertId = '33333333-3333-4333-8333-333333333333';
const filingId = '11111111-1111-4111-8111-111111111111';
const event = normalizeFiling({
  ...filingFixture.results[0]!,
  symbol: 'NSSS.JK',
  timestamp: '2026-09-24T10:30:00',
  holder_name: 'Samuel Sekuritas Indonesia',
  share_percentage_before: 40.17,
  share_percentage_after: 42.73,
  holding_before: 9559919000,
  holding_after: 10169179100,
  amount_transaction: 609260100,
});
const evaluation = evaluateEvent({ event, enrichmentSkipped: true });
const record: TelegramDeliveryRecord = { alertId, filingId, event, evaluation };

function createStore(initialStatus: 'PENDING' | 'FAILED' | 'SENT' | 'UNKNOWN' = 'PENDING') {
  let status = initialStatus;
  let sentAt: string | null = initialStatus === 'SENT' ? '2026-09-30T16:00:00.000Z' : null;
  let messageId: string | null = initialStatus === 'SENT' ? 'persisted-message-id' : null;
  const store = {
    getRetryableTelegramAlerts: vi.fn(async (requestedId: string) =>
      requestedId === alertId && (status === 'PENDING' || status === 'FAILED') ? [record] : []),
    claimTelegramAlert: vi.fn(async (requestedId: string) => {
      if (requestedId !== alertId || (status !== 'PENDING' && status !== 'FAILED')) return false;
      status = 'UNKNOWN';
      sentAt = null;
      messageId = null;
      return true;
    }),
    updateAlertDeliveryStatus: vi.fn(async (_id: string, nextStatus: 'SENT' | 'FAILED' | 'UNKNOWN', nextMessageId?: string) => {
      status = nextStatus;
      sentAt = nextStatus === 'SENT' ? new Date().toISOString() : null;
      messageId = nextStatus === 'SENT' ? nextMessageId ?? null : null;
    }),
  };
  return {
    store: store as unknown as Pick<Store, 'getRetryableTelegramAlerts' | 'claimTelegramAlert' | 'updateAlertDeliveryStatus'>,
    get status() { return status; },
    get sentAt() { return sentAt; },
    get messageId() { return messageId; },
  };
}

const deliver = (store: ReturnType<typeof createStore>['store'], fetcher: typeof fetch) =>
  deliverTelegramAlert(store, alertId, '12345:TEST', '999999', { fetch: fetcher });

describe('delivery-only Telegram path', () => {
  it('sends only through Telegram and persists SENT, timestamp, and message ID', async () => {
    const harness = createStore();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, result: { message_id: 7788 } }));

    const result = await deliver(harness.store, fetcher);

    expect(result).toEqual({ status: 'SENT', messageId: '7788' });
    expect(evaluation.materialityState).toBe('MATERIAL');
    expect(harness.status).toBe('SENT');
    expect(harness.sentAt).not.toBeNull();
    expect(harness.messageId).toBe('7788');
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/^https:\/\/api\.telegram\.org\/bot.*\/sendMessage$/);
    expect(harness.store.getRetryableTelegramAlerts).toHaveBeenCalledWith(alertId);
    expect(harness.store.claimTelegramAlert).toHaveBeenCalledWith(alertId);
  });

  it('retries confirmed rejection and never resends a SENT alert', async () => {
    const harness = createStore();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rejected', { status: 400 }))
      .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 7789 } }));

    expect(await deliver(harness.store, fetcher)).toEqual({ status: 'FAILED' });
    expect(harness.sentAt).toBeNull();
    expect(await deliver(harness.store, fetcher)).toEqual({ status: 'SENT', messageId: '7789' });
    const sentAt = harness.sentAt;
    const messageId = harness.messageId;

    expect(await deliver(harness.store, fetcher)).toEqual({ status: 'SKIPPED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(harness.sentAt).toBe(sentAt);
    expect(harness.messageId).toBe(messageId);
  });

  it('uses the atomic claim to permit one concurrent send', async () => {
    const harness = createStore();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, result: { message_id: 7790 } }));

    const results = await Promise.all([deliver(harness.store, fetcher), deliver(harness.store, fetcher)]);

    expect(results.map(result => result.status).sort()).toEqual(['SENT', 'SKIPPED']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps ambiguous delivery UNKNOWN and excludes it from later attempts', async () => {
    const harness = createStore();
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('connection reset'); });

    expect(await deliver(harness.store, fetcher)).toEqual({ status: 'UNKNOWN' });
    expect(await deliver(harness.store, fetcher)).toEqual({ status: 'SKIPPED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
