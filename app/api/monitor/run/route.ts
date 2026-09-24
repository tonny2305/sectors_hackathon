import { NextResponse } from 'next/server';
import { Store } from '../../../../lib/db/store.ts';
import { runMonitoringCycle } from '../../../../lib/automation/monitor.ts';

export async function POST(request: Request) {
  const sectorsApiKey = process.env.SECTORS_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sectorsApiKey || !url || !serviceKey) {
    return NextResponse.json(
      { error: 'MISSING_SERVER_CREDENTIALS', message: 'API keys or Supabase credentials are missing on server.' },
      { status: 500 },
    );
  }

  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is allowed
    }

    const store = new Store(url, serviceKey);
    const maxPages = Number(body.maxPages || process.env.MAX_FILINGS_PAGES_PER_RUN || 3);

    const result = await runMonitoringCycle(store, sectorsApiKey, {
      startDate: body.startDate,
      endDate: body.endDate,
      maxPages,
      triggerType: 'MANUAL_DISPATCH',
      watchlistSymbols: body.watchlistSymbols,
    });

    return NextResponse.json({
      ok: true,
      runId: result.runId,
      status: result.status,
      warning: result.warning,
      pagesFetched: result.pagesFetched,
      recordsScanned: result.recordsScanned,
      newEvents: result.newEvents,
      eligibleNewFilings: result.eligibleNewFilings,
      attentionMetrics: result.attentionMetrics,
      estimatedCredits: result.estimatedCredits,
      apiLatencyMsTotal: result.apiLatencyMsTotal,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'MONITOR_RUN_FAILED';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
