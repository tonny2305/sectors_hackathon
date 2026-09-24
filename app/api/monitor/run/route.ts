import { NextResponse } from 'next/server';
import { Store } from '../../../../lib/db/store.ts';
import { runMonitoringCycle } from '../../../../lib/automation/monitor.ts';
import { hasBearerToken } from '../../../../lib/auth/bearer.ts';
import { z } from 'zod';
import { dateSchema, symbolSchema } from '../../../../lib/sectors/schemas.ts';

const bodySchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  maxPages: z.number().int().min(1).optional(),
  watchlistSymbols: z.array(symbolSchema).max(20).optional(),
}).strict();

export async function POST(request: Request) {
  if (!process.env.MONITOR_TRIGGER_TOKEN || process.env.MONITOR_TRIGGER_TOKEN.length < 32) {
    return NextResponse.json({ error: 'TRIGGER_NOT_CONFIGURED' }, { status: 503 });
  }
  if (!hasBearerToken(request, process.env.MONITOR_TRIGGER_TOKEN)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
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
    if (Number(request.headers.get('content-length')) > 2048) {
      return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > 2048) return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    const parsed = bodySchema.safeParse(raw ? JSON.parse(raw) : {});
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const body = parsed.data;

    const store = new Store(url, serviceKey);
    const cap = Number(process.env.MAX_FILINGS_PAGES_PER_RUN || 3);
    if (!Number.isInteger(cap) || cap < 1 || cap > 10) throw new Error('INVALID_PAGE_CAP');
    const maxPages = body.maxPages ?? cap;
    if (maxPages > cap) return NextResponse.json({ error: 'PAGE_CAP_EXCEEDED' }, { status: 400 });

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
    return NextResponse.json({ ok: false, error: 'MONITOR_RUN_FAILED' }, { status: 500 });
  }
}
