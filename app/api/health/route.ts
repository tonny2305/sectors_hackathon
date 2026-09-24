import { NextResponse } from 'next/server';

export async function GET() {
  const sectorsConfigured = Boolean(process.env.SECTORS_API_KEY);
  const supabaseUrlConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let dbStatus = 'UNCONFIGURED';
  let activeSymbolsCount = 0;
  let scheduledRunsCount = 0;

  if (url && key) {
    try {
      const [wlRes, runsRes] = await Promise.all([
        fetch(`${url}/rest/v1/watchlist_symbols?enabled=eq.true&select=symbol`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: 'no-store',
        }),
        fetch(`${url}/rest/v1/automation_runs?trigger_type=eq.SCHEDULED_CRON&select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: 'no-store',
        }),
      ]);

      if (wlRes.ok && runsRes.ok) {
        dbStatus = 'CONNECTED';
        const symbols = await wlRes.json();
        activeSymbolsCount = Array.isArray(symbols) ? symbols.length : 0;
        const scheduled = await runsRes.json();
        scheduledRunsCount = Array.isArray(scheduled) ? scheduled.length : 0;
      } else {
        dbStatus = 'DEGRADED';
      }
    } catch {
      dbStatus = 'UNREACHABLE';
    }
  }

  return NextResponse.json({
    status: dbStatus === 'CONNECTED' && sectorsConfigured && activeSymbolsCount > 0 ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    engineVersion: 'v2.0.0-materiality-sentinel',
    configuration: {
      sectorsApi: sectorsConfigured ? 'CONFIGURED' : 'MISSING',
      supabase: supabaseUrlConfigured && supabaseKeyConfigured ? 'CONFIGURED' : 'MISSING',
      telegramAlerts: telegramConfigured ? 'ENABLED' : 'OPTIONAL_UNCONFIGURED',
      database: dbStatus,
    },
    monitoring: {
      activeWatchlistCount: activeSymbolsCount,
      scheduler: scheduledRunsCount > 0 ? 'SCHEDULED_RUN_RECORDED' : 'UNVERIFIED',
      maxPagesCap: Number(process.env.MAX_FILINGS_PAGES_PER_RUN || 3),
    },
  });
}
