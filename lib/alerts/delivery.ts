import 'server-only';
import type { Store } from '../db/store.ts';
import { formatTelegramMessage, sendTelegramNotification, TelegramError } from './telegram.ts';

type DeliveryStore = Pick<Store, 'getRetryableTelegramAlerts' | 'claimTelegramAlert' | 'updateAlertDeliveryStatus'>;

export async function deliverTelegramAlert(
  store: DeliveryStore,
  alertId: string,
  botToken: string,
  chatId: string,
  options: { appBaseUrl?: string; fetch?: typeof fetch } = {},
): Promise<{ status: 'SENT' | 'FAILED' | 'UNKNOWN' | 'SKIPPED'; messageId?: string }> {
  if (!botToken.trim() || !chatId.trim()) throw new TelegramError('MISSING_TELEGRAM_CREDENTIALS');

  const [alert] = (await store.getRetryableTelegramAlerts(alertId))
    .filter(candidate => candidate.alertId === alertId);
  if (!alert) return { status: 'SKIPPED' };

  const message = formatTelegramMessage({
    event: alert.event,
    evaluation: alert.evaluation,
    appBaseUrl: options.appBaseUrl,
    filingId: alert.filingId,
  });
  if (!await store.claimTelegramAlert(alert.alertId)) return { status: 'SKIPPED' };

  const result = await sendTelegramNotification(botToken, chatId, message, options.fetch);
  if (result.ok && result.messageId) {
    await store.updateAlertDeliveryStatus(alert.alertId, 'SENT', result.messageId);
    return { status: 'SENT', messageId: result.messageId };
  }

  const status = result.retryable ? 'FAILED' : 'UNKNOWN';
  await store.updateAlertDeliveryStatus(alert.alertId, status);
  return { status };
}