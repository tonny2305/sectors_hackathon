import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/db/store.ts';
import { runMonitoringCycle } from '../lib/automation/monitor.ts';
import filingFixture from '../fixtures/filings.documented.json';

const migration = await readFile(
  new URL('../supabase/migrations/202609240001_data_core.sql', import.meta.url),
  'utf8',
);

let db: PGlite;
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sentinel-phase3-'));
  db = new PGlite(directory);
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;',
  );
  await db.exec(migration);
}, 30000);

afterAll(async () => {
  if (db) await db.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('Autonomous Monitoring Orchestration (Phase 3)', () => {
  it('runs complete monitoring cycle, persists evaluations, queues alerts for material, and updates holder state', async () => {
    const rawFiling = filingFixture.results[0]!;

    // Mock API returns
    const filingsPayload = {
      results: [
        // 1. Silent routine move (+0.05 pp)
        {
          ...rawFiling,
          symbol: 'BBCA.JK',
          timestamp: '2026-09-24T10:00:00',
          holder_name: 'Silent Fund',
          share_percentage_before: 5.0,
          share_percentage_after: 5.05,
          holding_before: 10000000,
          holding_after: 10100000,
          amount_transaction: 100000,
        },
        // 2. Material large move (+2.56 pp)
        {
          ...rawFiling,
          symbol: 'NSSS.JK',
          timestamp: '2026-09-24T10:30:00',
          holder_name: 'Samuel Sekuritas Indonesia',
          share_percentage_before: 40.17,
          share_percentage_after: 42.73,
          holding_before: 9559919000,
          holding_after: 10169179100,
          amount_transaction: 609260100,
        },
      ],
      pagination: {
        has_next: false,
        next_offset: null,
        offset: 0,
        limit: 30,
      },
    };

    let fetchFilingsCount = 0;
    let fetchDailyCount = 0;

    const mockFetch = vi.fn<typeof fetch>(async (url, options) => {
      const urlStr = String(url);

      // PostgREST mock handling via PGlite
      if (urlStr.includes('/rest/v1/')) {
        const path = urlStr.split('/rest/v1/')[1] || '';

        if (path.startsWith('rpc/ingest_filings')) {
          const body = JSON.parse(String(options?.body)) as { p_events: unknown[] };
          const rows = (
            await db.query('select * from public.ingest_filings($1::jsonb)', [
              JSON.stringify(body.p_events),
            ])
          ).rows;
          return Response.json(rows);
        }

        if (path.startsWith('automation_runs')) {
          if (options?.method === 'POST') {
            const body = JSON.parse(String(options?.body));
            await db.query(
              'insert into automation_runs (id, trigger_type, status) values ($1, $2, $3)',
              [body.id, body.trigger_type, body.status],
            );
            return new Response(null, { status: 201 });
          }
          if (options?.method === 'PATCH') {
            const body = JSON.parse(String(options?.body));
            const id = urlStr.match(/id=eq\.([a-f0-9-]+)/)?.[1];
            await db.query(
              `update automation_runs set status = $1, pages_fetched = $2, records_scanned = $3,
               new_events = $4, eligible_new_filings = $5, silent_count = $6, watch_count = $7,
               material_count = $8, structural_count = $9, suppressed_from_push_count = $10,
               alerts_sent = $11, interruption_reduction = $12, duplicate_alert_count = $13,
               duplicate_alert_rate = $14, explainability_coverage = $15, estimated_credits = $16,
               api_latency_ms_total = $17, error_summary = $18, finished_at = now() where id = $19`,
              [
                body.status,
                body.pages_fetched,
                body.records_scanned,
                body.new_events,
                body.eligible_new_filings ?? null,
                body.silent_count ?? null,
                body.watch_count ?? null,
                body.material_count ?? null,
                body.structural_count ?? null,
                body.suppressed_from_push_count ?? null,
                body.alerts_sent ?? null,
                body.interruption_reduction ?? null,
                body.duplicate_alert_count ?? null,
                body.duplicate_alert_rate ?? null,
                body.explainability_coverage ?? null,
                body.estimated_credits,
                body.api_latency_ms_total,
                body.error_summary ?? null,
                id,
              ],
            );
            return Response.json([{ id }]);
          }
        }

        if (path.startsWith('api_call_logs')) {
          const body = JSON.parse(String(options?.body));
          await db.query(
            'insert into api_call_logs (run_id, endpoint, requested_at, status_code, latency_ms, estimated_credit_cost, error) values ($1, $2, $3, $4, $5, $6, $7)',
            [
              body.run_id,
              body.endpoint,
              body.requested_at,
              body.status_code,
              body.latency_ms,
              body.estimated_credit_cost,
              body.error,
            ],
          );
          return new Response(null, { status: 201 });
        }

        if (path.startsWith('event_evaluations') && options?.method === 'GET') {
          return Response.json((await db.query('select filing_id from event_evaluations')).rows);
        }
        if (path.startsWith('event_evaluations')) {
          const body = JSON.parse(String(options?.body));
          const result = await db.query<{ id: string }>(
            `insert into event_evaluations (
              filing_id, materiality_state, reason_codes_json, suppression_reason_codes_json,
              relative_position_change, new_position, near_exit, repeat_count_30d, repeat_count_90d,
              repeat_count_180d, cumulative_same_direction_delta_pp_180d, previous_holder_event_timestamp,
              previous_materiality_state_for_holder, escalated_from_prior_state, median_daily_liquidity_proxy_20d,
              transaction_to_liquidity_proxy, context_unavailable, enrichment_skipped, engine_version
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) returning id`,
            [
              body.filing_id,
              body.materiality_state,
              JSON.stringify(body.reason_codes_json),
              JSON.stringify(body.suppression_reason_codes_json),
              body.relative_position_change,
              body.new_position,
              body.near_exit,
              body.repeat_count_30d,
              body.repeat_count_90d,
              body.repeat_count_180d,
              body.cumulative_same_direction_delta_pp_180d,
              body.previous_holder_event_timestamp,
              body.previous_materiality_state_for_holder,
              body.escalated_from_prior_state,
              body.median_daily_liquidity_proxy_20d,
              body.transaction_to_liquidity_proxy,
              body.context_unavailable,
              body.enrichment_skipped,
              body.engine_version,
            ],
          );
          return Response.json(result.rows);
        }

        if (path.startsWith('alerts')) {
          const body = JSON.parse(String(options?.body));
          await db.query(
            'insert into alerts (filing_id, evaluation_id, channel, delivery_status) values ($1, $2, $3, $4)',
            [body.filing_id, body.evaluation_id, body.channel, body.delivery_status],
          );
          return new Response(null, { status: 201 });
        }

        if (path.startsWith('holder_activity_state')) {
          const body = JSON.parse(String(options?.body));
          await db.query(
            `insert into holder_activity_state (
              symbol, normalized_holder_name, last_transaction_type, last_event_timestamp,
              same_direction_count_30d, same_direction_count_90d, same_direction_count_180d,
              cumulative_same_direction_delta_pp_180d, latest_materiality_state, updated_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
            on conflict (symbol, normalized_holder_name) do update set
              last_transaction_type = excluded.last_transaction_type,
              last_event_timestamp = excluded.last_event_timestamp,
              same_direction_count_30d = excluded.same_direction_count_30d,
              same_direction_count_90d = excluded.same_direction_count_90d,
              same_direction_count_180d = excluded.same_direction_count_180d,
              cumulative_same_direction_delta_pp_180d = excluded.cumulative_same_direction_delta_pp_180d,
              latest_materiality_state = excluded.latest_materiality_state,
              updated_at = now()`,
            [
              body.symbol,
              body.normalized_holder_name,
              body.last_transaction_type,
              body.last_event_timestamp,
              body.same_direction_count_30d,
              body.same_direction_count_90d,
              body.same_direction_count_180d,
              body.cumulative_same_direction_delta_pp_180d,
              body.latest_materiality_state,
            ],
          );
          return new Response(null, { status: 201 });
        }

        if (path.startsWith('filings?')) {
          if (path.includes('fingerprint=in.')) {
            const filter = new URL(`https://example.test/${path}`).searchParams.get('fingerprint')!;
            const fingerprints = filter.slice(4, -1).split(',');
            return Response.json((await db.query<{ id: string; fingerprint: string }>('select id, fingerprint from filings')).rows
              .filter(row => fingerprints.includes(row.fingerprint)));
          }
          return Response.json([]);
        }

        if (path.startsWith('watchlist_symbols')) {
          return Response.json([]);
        }
      }

      // Sectors API Mock
      if (urlStr.includes('/v2/filings/')) {
        fetchFilingsCount++;
        return Response.json(filingsPayload);
      }

      if (urlStr.includes('/v2/daily/')) {
        fetchDailyCount++;
        return Response.json([
          {
            symbol: 'NSSS.JK',
            date: '2026-09-24',
            close: 1000,
            open: 980,
            high: 1020,
            low: 970,
            volume: 5000000,
            market_cap: 1000000000000,
          },
        ]);
      }

      return new Response('Not found', { status: 404 });
    });

    const store = new Store('https://example.supabase.co', 'test-only-key', mockFetch);
    const result = await runMonitoringCycle(store, 'test-sectors-key', {
      startDate: '2026-09-24',
      endDate: '2026-09-24',
      fetch: mockFetch,
      watchlistSymbols: ['BBCA.JK', 'NSSS.JK'],
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.pagesFetched).toBe(1);
    expect(result.recordsScanned).toBe(2);
    expect(result.newEvents).toBe(2);
    expect(result.eligibleNewFilings).toBe(2);

    // Verify Attention Metrics
    expect(result.attentionMetrics.silentCount).toBe(1);
    expect(result.attentionMetrics.materialCount).toBe(1);
    expect(result.attentionMetrics.pushAlertsSent).toBe(0);
    expect(result.attentionMetrics.interruptionReduction).toBeNull();
    expect(result.attentionMetrics.duplicateAlertRate).toBeNull();
    expect(result.attentionMetrics.explainabilityCoverage).toBeNull();

    // Verify Database state
    const evaluations = (await db.query('select * from event_evaluations')).rows;
    expect(evaluations).toHaveLength(2);

    const alerts = (await db.query('select * from alerts')).rows;
    expect(alerts).toHaveLength(1); // Only 1 alert for the MATERIAL event!

    const holderState = (await db.query('select * from holder_activity_state')).rows;
    expect(holderState.length).toBeGreaterThanOrEqual(1);

    const runs = (await db.query<{ status: string }>('select status from automation_runs')).rows;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('COMPLETE');

    // A failure after raw persistence must not leave an event permanently unevaluated.
    const silentId = (await db.query<{ filing_id: string }>("select filing_id from event_evaluations where materiality_state = 'SILENT' limit 1")).rows[0]!.filing_id;
    await db.query('delete from event_evaluations where filing_id = $1', [silentId]);
    const replay = await runMonitoringCycle(store, 'test-sectors-key', {
      startDate: '2026-09-24', endDate: '2026-09-24', fetch: mockFetch,
      watchlistSymbols: ['BBCA.JK', 'NSSS.JK'],
    });
    expect(replay.newEvents).toBe(0);
    expect(replay.eligibleNewFilings).toBe(1);
    expect((await db.query('select id from event_evaluations')).rows).toHaveLength(2);
    expect((await db.query('select id from alerts')).rows).toHaveLength(1);
  });

  it('credit-aware routing skips daily API for silent non-candidate events', async () => {
    const rawFiling = filingFixture.results[0]!;

    const silentOnlyPayload = {
      results: [
        {
          ...rawFiling,
          symbol: 'BBCA.JK',
          timestamp: '2026-09-24T12:00:00',
          holder_name: 'Silent Tiny Mover',
          share_percentage_before: 2.0,
          share_percentage_after: 2.01,
          holding_before: 2000000,
          holding_after: 2010000,
          amount_transaction: 10000,
          transaction_value: 50000,
        },
      ],
      pagination: {
        has_next: false,
        next_offset: null,
        offset: 0,
        limit: 30,
      },
    };

    let dailyApiCalls = 0;

    const mockFetch = vi.fn<typeof fetch>(async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('/rest/v1/')) {
        const path = urlStr.split('/rest/v1/')[1] || '';
        if (path.startsWith('rpc/ingest_filings')) {
          const body = JSON.parse(String(options?.body)) as { p_events: unknown[] };
          const rows = (
            await db.query('select * from public.ingest_filings($1::jsonb)', [
              JSON.stringify(body.p_events),
            ])
          ).rows;
          return Response.json(rows);
        }
        if (path.startsWith('automation_runs')) {
          return options?.method === 'PATCH'
            ? Response.json([{ id: 'mock' }])
            : new Response(null, { status: 201 });
        }
        if (path.startsWith('api_call_logs')) return new Response(null, { status: 201 });
        if (path.startsWith('event_evaluations')) return options?.method === 'GET' ? Response.json([]) : Response.json([{ id: 'eval-1' }]);
        if (path.startsWith('filings?')) {
          if (!path.includes('fingerprint=in.')) return Response.json([]);
          const filter = new URL(`https://example.test/${path}`).searchParams.get('fingerprint')!;
          const fingerprints = filter.slice(4, -1).split(',');
          return Response.json((await db.query<{ id: string; fingerprint: string }>('select id, fingerprint from filings')).rows
            .filter(row => fingerprints.includes(row.fingerprint)));
        }
        if (path.startsWith('watchlist_symbols')) return Response.json([]);
        if (path.startsWith('holder_activity_state')) return new Response(null, { status: 201 });
      }

      if (urlStr.includes('/v2/filings/')) {
        return Response.json(silentOnlyPayload);
      }
      if (urlStr.includes('/v2/daily/')) {
        dailyApiCalls++;
        return Response.json([]);
      }
      return new Response('Not found', { status: 404 });
    });

    const store = new Store('https://example.supabase.co', 'test-only-key', mockFetch);
    const result = await runMonitoringCycle(store, 'test-key', {
      startDate: '2026-09-24',
      endDate: '2026-09-24',
      fetch: mockFetch,
      watchlistSymbols: ['BBCA.JK'],
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.attentionMetrics.silentCount).toBe(1);
    expect(dailyApiCalls).toBe(0); // Daily lookup was skipped, saving credit!
  });

  it('marks status PARTIAL with warning when page cap limit is reached', async () => {
    const rawFiling = filingFixture.results[0]!;

    const mockFetch = vi.fn<typeof fetch>(async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('/rest/v1/')) {
        const path = urlStr.split('/rest/v1/')[1] || '';
        if (path.startsWith('rpc/ingest_filings')) {
          const body = JSON.parse(String(options?.body)) as { p_events: unknown[] };
          return Response.json((await db.query('select * from public.ingest_filings($1::jsonb)', [JSON.stringify(body.p_events)])).rows);
        }
        if (path.startsWith('automation_runs')) {
          return options?.method === 'PATCH'
            ? Response.json([{ id: 'mock' }])
            : new Response(null, { status: 201 });
        }
        if (path.startsWith('api_call_logs')) return new Response(null, { status: 201 });
        if (path.startsWith('filings?fingerprint=in.')) {
          const filter = new URL(`https://example.test/${path}`).searchParams.get('fingerprint')!;
          const fingerprints = filter.slice(4, -1).split(',');
          return Response.json((await db.query<{ id: string; fingerprint: string }>('select id, fingerprint from filings')).rows
            .filter(row => fingerprints.includes(row.fingerprint)));
        }
        if (path.startsWith('event_evaluations') && options?.method === 'GET') return Response.json([]);
        if (path.startsWith('watchlist_symbols')) return Response.json([]);
      }

      if (urlStr.includes('/v2/filings/')) {
        // Return has_next: true always
        return Response.json({
          results: [{ ...rawFiling, timestamp: '2026-09-24T12:00:00' }],
          pagination: {
            has_next: true,
            next_offset: 30,
            offset: 0,
            limit: 30,
          },
        });
      }
      return new Response('Not found', { status: 404 });
    });

    const store = new Store('https://example.supabase.co', 'test-only-key', mockFetch);
    const result = await runMonitoringCycle(store, 'test-key', {
      startDate: '2026-09-24',
      endDate: '2026-09-24',
      maxPages: 1,
      fetch: mockFetch,
      watchlistSymbols: ['BBCA.JK'],
    });

    expect(result.status).toBe('PARTIAL');
    expect(result.warning).toBe('MAX_FILINGS_PAGES_REACHED');
    expect(result.pagesFetched).toBe(1);
  });

  it('records FAILED status in automation_runs when Sectors API fails', async () => {
    let runFailedStatusRecorded = false;

    const mockFetch = vi.fn<typeof fetch>(async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('/rest/v1/')) {
        const path = urlStr.split('/rest/v1/')[1] || '';
        if (path.startsWith('automation_runs')) {
          if (options?.method === 'PATCH') {
            const body = JSON.parse(String(options?.body));
            if (body.status === 'FAILED') runFailedStatusRecorded = true;
            return Response.json([{ id: 'mock' }]);
          }
          return new Response(null, { status: 201 });
        }
        if (path.startsWith('api_call_logs')) return new Response(null, { status: 201 });
        if (path.startsWith('watchlist_symbols')) return Response.json([]);
      }

      if (urlStr.includes('/v2/filings/')) {
        return new Response(null, { status: 500 });
      }
      return new Response('Not found', { status: 404 });
    });

    const store = new Store('https://example.supabase.co', 'test-only-key', mockFetch);
    await expect(
      runMonitoringCycle(store, 'test-key', {
        startDate: '2026-09-24',
        endDate: '2026-09-24',
        fetch: mockFetch,
        watchlistSymbols: ['NSSS.JK'],
      }),
    ).rejects.toThrow();

    expect(runFailedStatusRecorded).toBe(true);
  });
});
