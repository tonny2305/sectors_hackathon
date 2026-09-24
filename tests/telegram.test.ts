import { describe, expect, it, vi } from 'vitest';
import { formatTelegramMessage, sendTelegramNotification } from '../lib/alerts/telegram.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import { evaluateEvent } from '../lib/materiality/engine.ts';

describe('Telegram Alert Dispatcher (Section 18 & 26)', () => {
  it('formats material alert with factual data, before/after stake, reason codes, provenance, and disclaimer', () => {
    const raw = {
      symbol: 'NSSS.JK',
      timestamp: '2026-07-09T14:29:39',
      holder_name: 'Samuel Sekuritas Indonesia',
      holder_type: 'institution',
      transaction_type: 'buy',
      holding_before: 9559919000,
      holding_after: 10169179100,
      amount_transaction: 609260100,
      share_percentage_before: 40.17,
      share_percentage_after: 42.73,
      transaction_value: 351225097500,
      source: 'https://idx.co.id/filing/sample',
    };

    const event = normalizeFiling(raw);
    const evaluation = evaluateEvent({ event, enrichmentSkipped: true });

    const message = formatTelegramMessage({
      event,
      evaluation,
      appBaseUrl: 'https://sentinel.sectors.app',
      filingId: 'test-filing-uuid',
    });

    expect(message).toContain('MATERIAL OWNERSHIP CHANGE');
    expect(message).toContain('`NSSS.JK`');
    expect(message).toContain('Samuel Sekuritas Indonesia');
    expect(message).toContain('40.17% ➔ 42.73% (+2.56 pp)');
    expect(message).toContain('LARGE_STAKE_MOVE_GE_1PP');
    expect(message).toContain('2026-07-09T14:29:39');
    expect(message).toContain('https://sentinel.sectors.app/alerts/test-filing-uuid');
    expect(message).toContain('Information and analysis only. No investment recommendations.');
  });

  it('dispatches alert via Telegram Bot API with mock fetcher', async () => {
    const mockFetch = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toContain('https://api.telegram.org/bot12345:TEST/sendMessage');
      const body = JSON.parse(String(init?.body));
      expect(body.chat_id).toBe('999999');
      expect(body.text).toContain('TEST ALERT');
      return Response.json({ ok: true, result: { message_id: 8888 } });
    });

    const result = await sendTelegramNotification('12345:TEST', '999999', 'TEST ALERT', mockFetch);
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('8888');
  });

  it('handles Telegram API errors gracefully', async () => {
    const mockFetch = vi.fn<typeof fetch>(async () => new Response('Chat not found', { status: 400 }));
    const result = await sendTelegramNotification('12345:TEST', 'invalid-chat', 'TEST', mockFetch);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('TELEGRAM_HTTP_400');
  });
});
