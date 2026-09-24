import 'server-only';
import { z } from 'zod';
import type { MaterialityEvaluation } from '../materiality/types.ts';
import type { OwnershipEvent } from '../sectors/normalize.ts';

export class TelegramError extends Error {}

export interface FormatTelegramAlertInput {
  event: OwnershipEvent;
  evaluation: MaterialityEvaluation;
  appBaseUrl?: string;
  filingId?: string;
}

export function formatTelegramMessage(input: FormatTelegramAlertInput): string {
  const { event, evaluation, appBaseUrl = 'https://sectors-sentinel.app', filingId } = input;
  const state = evaluation.materialityState;

  const emoji = state === 'STRUCTURAL' ? '⚡' : '🚨';
  const header = `${emoji} *${state} OWNERSHIP CHANGE*`;

  const symbol = event.symbol;
  const holder = event.holder_name || event.normalized_holder_name || 'Unknown Entity';
  const type = (event.transaction_type || 'transaction').toUpperCase();

  const beforePct = event.ownership_before_pct !== null ? `${event.ownership_before_pct}%` : 'N/A';
  const afterPct = event.ownership_after_pct !== null ? `${event.ownership_after_pct}%` : 'N/A';
  const deltaSign = (evaluation.features.ownershipDeltaPp ?? 0) >= 0 ? '+' : '';
  const deltaStr = evaluation.features.ownershipDeltaPp !== null
    ? `${deltaSign}${evaluation.features.ownershipDeltaPp} pp`
    : 'N/A';

  const sharesTransacted = event.shares_transacted !== null
    ? event.shares_transacted.toLocaleString('en-US')
    : 'N/A';

  const valueIdr = event.transaction_value_idr !== null
    ? `IDR ${event.transaction_value_idr.toLocaleString('id-ID')}`
    : 'N/A';

  const reasonLines = evaluation.reasonCodes.map(r => `• \`${r}\``).join('\n');

  const link = filingId ? `${appBaseUrl}/alerts/${filingId}` : appBaseUrl;

  return [
    header,
    '',
    `*Ticker:* \`${symbol}\``,
    `*Holder:* ${holder}`,
    `*Action:* ${type} (${sharesTransacted} shares)`,
    `*Stake:* ${beforePct} ➔ ${afterPct} (${deltaStr})`,
    `*Value:* ${valueIdr}`,
    '',
    '*Decision Reasons:*',
    reasonLines,
    '',
    `*Provenance Timestamp:* \`${event.source_timestamp}\``,
    `*Inspection Link:* [View Event Evidence](${link})`,
    '',
    '_Information and analysis only. No investment recommendations._',
  ].join('\n');
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!botToken.trim() || !chatId.trim()) {
    throw new TelegramError('MISSING_TELEGRAM_CREDENTIALS');
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: `TELEGRAM_HTTP_${response.status}: ${errorText}` };
    }

    const data = (await response.json()) as { ok: boolean; result?: { message_id: number } };
    return {
      ok: data.ok,
      messageId: data.result?.message_id ? String(data.result.message_id) : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'TELEGRAM_NETWORK_ERROR',
    };
  }
}
