import 'server-only';
import { z } from 'zod';
import { deliverTelegramAlert } from '../lib/alerts/delivery.ts';
import { Store } from '../lib/db/store.ts';

async function main() {
  const alertId = z.string().uuid().parse(process.argv[2]);
  if (process.argv.length > 3) throw new Error('USAGE: npm run telegram:deliver -- <alert-uuid>');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!url || !serviceKey || !botToken || !chatId) throw new Error('MISSING_DELIVERY_CREDENTIALS');

  const result = await deliverTelegramAlert(
    new Store(url, serviceKey),
    alertId,
    botToken,
    chatId,
    { appBaseUrl: process.env.APP_BASE_URL || undefined },
  );
  console.log(JSON.stringify({ alertId, ...result }));
  if (result.status === 'FAILED' || result.status === 'UNKNOWN') process.exitCode = 1;
}

main().catch(error => {
  console.error('Telegram delivery failed:', error instanceof Error ? error.message : 'UNEXPECTED_DELIVERY_ERROR');
  process.exitCode = 1;
});