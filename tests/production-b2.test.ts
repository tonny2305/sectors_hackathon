import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runMonitoringCycle } from '../lib/automation/monitor.ts';
import { Store } from '../lib/db/store.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import frozen from './production-b2-sealed.json';

it('production monitor matches all 117 frozen B2 decisions and preserves replay idempotency', async () => {
  // Golden decisions are extracted from checkpoint 925465b, never recomputed by this test.
  const rows = frozen.events.map(row => {
    const event = normalizeFiling(row.event.raw_payload_json);
    expect(event.fingerprint, row.input_id).toBe(row.event.fingerprint);
    return { ...row, event };
  });
  expect(frozen.checkpoint).toBe('925465b');
  expect(frozen.event_count).toBe(117);
  expect(rows).toHaveLength(frozen.event_count);
  expect(new Set(rows.map(row => row.input_id)).size).toBe(117);

  const evaluations = new Map<string, Record<string, unknown>>();
  const alerts = new Set<string>();
  let ingested = false;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (url.pathname === '/v2/filings/') {
      const offset = Number(url.searchParams.get('offset'));
      const page = rows.slice(offset, offset + 30);
      const hasNext = offset + page.length < rows.length;
      return Response.json({ results: page.map(row => row.event.raw_payload_json), pagination: {
        offset, limit: 30, has_next: hasNext, next_offset: hasNext ? offset + 30 : null,
      } });
    }
    const path = url.pathname.replace('/rest/v1/', '');
    if (path === 'rpc/ingest_filings') {
      const inserted = ingested ? [] : rows.map(row => ({ id: row.input_id, fingerprint: row.event.fingerprint }));
      ingested = true;
      return Response.json(inserted);
    }
    if (path === 'filings') {
      if (url.searchParams.has('fingerprint')) {
        return Response.json(rows.map(row => ({ id: row.input_id, fingerprint: row.event.fingerprint })));
      }
      const symbol = url.searchParams.get('symbol')!.slice(3);
      const holder = url.searchParams.get('normalized_holder_name')!.slice(3);
      const cutoff = url.searchParams.get('source_date')!.slice(4);
      const before = url.searchParams.get('source_timestamp')!.slice(3);
      const current = rows.find(({ event }) => event.symbol === symbol &&
        event.normalized_holder_name === holder && event.source_timestamp === before);
      const priorEventIds = new Set(current?.prior_event_ids ?? []);
      return Response.json(rows.filter(({ event }) => priorEventIds.has(event.fingerprint) &&
        event.symbol === symbol &&
        event.normalized_holder_name === holder && event.source_date >= cutoff && event.source_timestamp < before)
        .sort((a, b) => b.event.source_timestamp.localeCompare(a.event.source_timestamp))
        .slice(0, Number(url.searchParams.get('limit'))).map(({ input_id, event }) => ({
          id: input_id, source_timestamp: event.source_timestamp, source_date: event.source_date,
          transaction_type: event.transaction_type, ownership_delta_pp: event.ownership_delta_pp,
          event_evaluations: evaluations.has(input_id) ? [{
            materiality_state: evaluations.get(input_id)!.materiality_state, created_at: '2026-09-30T00:00:00Z',
          }] : [],
        })));
    }
    if (path === 'event_evaluations') {
      if (options?.method === 'GET') return Response.json([...evaluations.values()].map(row => ({ filing_id: row.filing_id })));
      evaluations.set(body.filing_id, body);
      return Response.json([{ id: randomUUID() }]);
    }
    if (path === 'alerts') {
      expect(alerts.has(body.filing_id)).toBe(false);
      alerts.add(body.filing_id);
      return new Response(null, { status: 201 });
    }
    if (path === 'automation_runs') return options?.method === 'PATCH'
      ? Response.json([{ id: 'mock-run' }]) : new Response(null, { status: 201 });
    if (path === 'api_call_logs' || path === 'holder_activity_state') return new Response(null, { status: 201 });
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  const store = new Store('https://example.supabase.co', 'test-only-key', fetcher);
  const options = { fetch: fetcher, maxPages: 4,
    startDate: '2026-01-01', endDate: '2026-09-30', watchlistSymbols: [...new Set(rows.map(row => row.event.symbol))] };
  // Queue decisions are under test; no Telegram credentials or delivery are needed.
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  vi.stubEnv('TELEGRAM_CHAT_ID', '');
  try {
    const result = await runMonitoringCycle(store, 'test-only-key', options);
    expect(result.status).toBe('COMPLETE');
    expect(result.eligibleNewFilings).toBe(117);
    expect(evaluations.size).toBe(117);
    for (const row of rows) {
      const evaluation = evaluations.get(row.input_id)!;
      expect(evaluation.materiality_state, row.input_id).toBe(row.expected.state);
      expect(alerts.has(row.input_id), row.input_id).toBe(row.expected.interrupt);
      expect(evaluation.reason_codes_json, row.input_id).toEqual(row.expected.reason_codes);
      expect(evaluation.suppression_reason_codes_json, row.input_id).toEqual(row.expected.suppression_reason_codes);
      expect(evaluation.repeat_count_180d, row.input_id).toBe(row.expected.repeat_count_180d);
      expect(evaluation.enrichment_skipped).toBe(true);
      expect(evaluation.context_unavailable).toBe(true);
      expect(evaluation.median_daily_liquidity_proxy_20d).toBeNull();
      expect(evaluation.transaction_to_liquidity_proxy).toBeNull();
    }
    expect(alerts.size).toBe(64);
    const replay = await runMonitoringCycle(store, 'test-only-key', options);
    expect(replay.newEvents).toBe(0);
    expect(replay.eligibleNewFilings).toBe(0);
    expect(alerts.size).toBe(64);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/v2/daily/'))).toHaveLength(0);
  } finally {
    vi.unstubAllEnvs();
  }
});
