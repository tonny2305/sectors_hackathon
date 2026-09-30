import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import filingExample from '../fixtures/filings.documented.json';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import { evaluateEvent } from '../lib/materiality/engine.ts';
import { Store } from '../lib/db/store.ts';

const filing = filingExample.results[0]!;
const migration = await readFile(new URL('../supabase/migrations/202609240001_data_core.sql', import.meta.url), 'utf8');
let db: PGlite;
let directory: string;

async function insert(rows: unknown[]) {
  return (await db.query<{ id: string; fingerprint: string }>(
    'select * from public.ingest_filings($1::jsonb)', [JSON.stringify(rows.map(normalizeFiling))],
  )).rows;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sentinel-phase1-'));
  db = new PGlite(directory);
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
  await db.exec(migration);
}, 30000);

afterAll(async () => {
  if (db) await db.close();
  // Only remove the unique test directory created by mkdtemp above.
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('actual PostgreSQL migration and ingestion RPC', () => {
  it('stores one event for duplicates in a batch and across overlapping windows', async () => {
    expect(await insert([filing, filing])).toHaveLength(1);
    expect(await insert([filing])).toHaveLength(0);
    const second = { ...filing, timestamp: '2026-07-10T14:29:39', holding_after: 10169179101 };
    const results = await Promise.all([insert([filing, second]), insert([second, filing])]);
    expect(results.flat()).toHaveLength(1);
    expect((await db.query('select id from filings')).rows).toHaveLength(2);
  });

  it('preserves provenance, exact timestamp, raw payload, normalized fields and numeric precision', async () => {
    const result = await db.query<Record<string, unknown>>('select * from filings where fingerprint = $1', [normalizeFiling(filing).fingerprint]);
    expect(result.rows[0]).toMatchObject({
      source_url: filing.source, source_timestamp: '2026-07-09T14:29:39',
      symbol: 'NSSS.JK', holder_name: filing.holder_name,
      normalized_holder_name: 'samuel sekuritas indonesia',
      transaction_type: 'buy', holding_before: '9559919000', holding_after: '10169179100',
      shares_transacted: '609260100', transaction_value_idr: '351225097500',
      ownership_before_pct: '40.17', ownership_after_pct: '42.73', raw_payload_json: filing,
    });
    expect(result.rows[0]!.ownership_delta_pp).toBe('2.56');
  });

  it('keeps null values and missing raw keys', async () => {
    const raw = { symbol: 'BBCA', timestamp: '2026-07-09T23:59:59+07:00', holder_name: 'Example',
      transaction_type: 'others', holding_after: 2, holding_before: null, transaction_value: null };
    const rows = await insert([raw]);
    const stored = (await db.query<Record<string, unknown>>('select * from filings where id = $1', [rows[0]!.id])).rows[0]!;
    expect(stored.ownership_delta_pp).toBeNull();
    expect(stored.holding_before).toBeNull();
    expect(stored.transaction_value_idr).toBeNull();
    expect(stored.shares_transacted).toBeNull();
    expect(stored.raw_payload_json).toEqual(raw);
    expect(stored.source_timestamp).toBe(raw.timestamp);
  });

  it('does not collapse different holders sharing a source URL', async () => {
    expect(await insert([{ ...filing, holder_name: 'Different Holder' }])).toHaveLength(1);
  });

  it('rolls back a whole batch on a database constraint violation', async () => {
    const valid = normalizeFiling({ ...filing, holder_name: 'Rollback Holder' });
    const bad = { ...valid, fingerprint: 'invalid' };
    await expect(db.query('select * from ingest_filings($1::jsonb)', [JSON.stringify([valid, bad])])).rejects.toThrow();
    expect((await db.query('select id from filings where fingerprint = $1', [valid.fingerprint])).rows).toHaveLength(0);
  });

  it('enforces one alert record per filing even for repeated evaluations', async () => {
    const filingId = (await db.query<{ id: string }>('select id from filings limit 1')).rows[0]!.id;
    const evaluation = (await db.query<{ id: string }>(`insert into event_evaluations
      (filing_id, materiality_state, reason_codes_json, suppression_reason_codes_json,
       context_unavailable, enrichment_skipped, engine_version)
      values ($1, 'MATERIAL', '["TEST_ONLY"]', '[]', true, true, 'test-only') returning id`, [filingId])).rows[0]!.id;
    const params = [filingId, evaluation];
    await db.query("insert into alerts (filing_id, evaluation_id, channel, delivery_status) values ($1, $2, 'test-only', 'PENDING')", params);
    await expect(db.query("insert into alerts (filing_id, evaluation_id, channel, delivery_status) values ($1, $2, 'test-only', 'PENDING')", params)).rejects.toThrow();
  });

  it('claims Telegram alerts once and persists sent_at only after confirmed success', async () => {
    const filingId = (await insert([{ ...filing, holder_name: 'Telegram Claim Test' }]))[0]!.id;
    const evaluationId = (await db.query<{ id: string }>(`insert into event_evaluations
      (filing_id, materiality_state, reason_codes_json, suppression_reason_codes_json,
       context_unavailable, enrichment_skipped, engine_version)
      values ($1, 'MATERIAL', '["TEST_ONLY"]', '[]', true, true, 'telegram-claim-test') returning id`, [filingId])).rows[0]!.id;
    const alertId = (await db.query<{ id: string }>(`insert into alerts
      (filing_id, evaluation_id, channel, delivery_status)
      values ($1, $2, 'telegram', 'PENDING') returning id`, [filingId, evaluationId])).rows[0]!.id;

    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const requestUrl = new URL(String(url));
      const body = JSON.parse(String(init?.body)) as { delivery_status: string; sent_at: string | null; external_message_id: string | null };
      const eligibleStatus = requestUrl.searchParams.get('delivery_status') === 'in.(PENDING,FAILED)';
      const rows = eligibleStatus
        ? await db.query(
          `update alerts set delivery_status = 'UNKNOWN', sent_at = null, external_message_id = null
           where id = $1 and channel = 'telegram' and delivery_status in ('PENDING', 'FAILED') returning id`,
          [alertId],
        )
        : await db.query(
          `update alerts set delivery_status = $1, sent_at = $2, external_message_id = $3
           where id = $4 and delivery_status = 'UNKNOWN' returning id`,
          [body.delivery_status, body.sent_at, body.external_message_id, alertId],
        );
      return Response.json(rows.rows);
    });
    const store = new Store('https://example.supabase.co', 'test-only-key', fetcher);

    const claims = await Promise.all([store.claimTelegramAlert(alertId), store.claimTelegramAlert(alertId)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await store.updateAlertDeliveryStatus(alertId, 'FAILED');
    let status = (await db.query<{ delivery_status: string; sent_at: string | null }>(
      'select delivery_status, sent_at from alerts where id = $1', [alertId],
    )).rows[0]!;
    expect(status).toEqual({ delivery_status: 'FAILED', sent_at: null });

    expect(await store.claimTelegramAlert(alertId)).toBe(true);
    await store.updateAlertDeliveryStatus(alertId, 'SENT', 'telegram-message-1');
    status = (await db.query<{ delivery_status: string; sent_at: string | null }>(
      'select delivery_status, sent_at from alerts where id = $1', [alertId],
    )).rows[0]!;
    expect(status.delivery_status).toBe('SENT');
    expect(status.sent_at).not.toBeNull();
    await expect(store.updateAlertDeliveryStatus(alertId, 'FAILED')).rejects.toThrow('ALERT_DELIVERY_UPDATE_NOT_CONFIRMED');
  });

  it('rebuilds retryable Telegram delivery from persisted filing and evaluation evidence', async () => {
    const raw = {
      ...filing,
      symbol: 'NSSS.JK',
      timestamp: '2026-09-24T10:30:00',
      holder_name: 'Telegram Retry Evidence',
      share_percentage_before: 40.17,
      share_percentage_after: 42.73,
      holding_before: 9559919000,
      holding_after: 10169179100,
      amount_transaction: 609260100,
    };
    const event = normalizeFiling(raw);
    const evaluation = evaluateEvent({ event, enrichmentSkipped: true });
    const persistedEvent = { ...event, ownership_delta_pp: evaluation.features.ownershipDeltaPp };
    const alertId = randomUUID();
    const filingId = randomUUID();
    const evaluationId = randomUUID();
    const features = evaluation.features;
    const fetcher = vi.fn<typeof fetch>(async url => {
      const path = String(url).split('/rest/v1/')[1] || '';
      if (path.startsWith('alerts?')) return Response.json([{ id: alertId, filing_id: filingId, evaluation_id: evaluationId }]);
      if (path.startsWith('filings?')) return Response.json([{
        id: filingId,
        raw_payload_json: raw,
        ownership_delta_pp: evaluation.features.ownershipDeltaPp,
      }]);
      if (path.startsWith('event_evaluations?')) return Response.json([{
        id: evaluationId,
        materiality_state: evaluation.materialityState,
        reason_codes_json: evaluation.reasonCodes,
        suppression_reason_codes_json: evaluation.suppressionReasonCodes,
        relative_position_change: features.relativePositionChange,
        new_position: features.newPosition,
        near_exit: features.nearExit,
        repeat_count_30d: features.repeatCount30d,
        repeat_count_90d: features.repeatCount90d,
        repeat_count_180d: features.repeatCount180d,
        cumulative_same_direction_delta_pp_180d: features.cumulativeSameDirectionDeltaPp180d,
        previous_holder_event_timestamp: features.previousHolderEventTimestamp,
        previous_materiality_state_for_holder: features.previousMaterialityStateForHolder,
        escalated_from_prior_state: features.escalatedFromPriorState,
        median_daily_liquidity_proxy_20d: features.medianDailyLiquidityProxy20d,
        transaction_to_liquidity_proxy: features.transactionToLiquidityProxy,
        context_unavailable: features.contextUnavailable,
        enrichment_skipped: features.enrichmentSkipped,
        engine_version: evaluation.engineVersion,
      }]);
      return new Response('Not found', { status: 404 });
    });
    const store = new Store('https://example.supabase.co', 'test-only-key', fetcher);

    const retryable = await store.getRetryableTelegramAlerts();

    expect(retryable).toEqual([{ alertId, filingId, event: persistedEvent, evaluation }]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('denies browser roles table and RPC access, permits the service role', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query('select * from filings')).rejects.toThrow(/permission denied/);
        await expect(db.query("select * from ingest_filings('[]'::jsonb)")).rejects.toThrow(/permission denied/);
      } finally { await db.exec('reset role'); }
    }
    await db.exec('set role service_role');
    try { expect(await insert([filing])).toHaveLength(0); }
    finally { await db.exec('reset role'); }
    const tables = await db.query('select tablename from pg_tables where schemaname = \'public\' and rowsecurity');
    expect(tables.rows).toHaveLength(8);
  });

  it('survives database close/reopen and still deduplicates', async () => {
    const before = (await db.query('select id from filings')).rows.length;
    await db.close();
    db = new PGlite(directory);
    expect((await db.query('select id from filings')).rows).toHaveLength(before);
    expect(await insert([filing])).toHaveLength(0);
  });

  it('routes the production Store RPC through the tested SQL and counts real inserts', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url)).toBe('https://example.supabase.co/rest/v1/rpc/ingest_filings');
      expect(options?.redirect).toBe('error');
      const body = JSON.parse(String(options?.body)) as { p_events: unknown[] };
      const rows = (await db.query('select * from ingest_filings($1::jsonb)', [JSON.stringify(body.p_events)])).rows;
      return Response.json(rows);
    });
    const store = new Store('https://example.supabase.co', 'test-only-service-key', fetcher);
    const raw = { ...filing, holder_name: 'Store Boundary Holder' };
    expect(await store.ingest([raw, raw])).toEqual({ inserted: 1, duplicates: 1 });
    expect(await store.ingest([raw])).toEqual({ inserted: 0, duplicates: 1 });
    expect(await store.ingest([])).toEqual({ inserted: 0, duplicates: 0 });
  });
});

describe('database transport safety', () => {
  it('sanitizes HTTP and network failures and does not blindly retry writes', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('test-only-service-key', { status: 500 }));
    const store = new Store('https://example.supabase.co', 'test-only-service-key', fetcher);
    await expect(store.ingest([filing])).rejects.toThrow('DATABASE_HTTP_500');
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockRejectedValue(new Error('test-only-service-key'));
    await expect(store.ingest([filing])).rejects.toThrow('DATABASE_REQUEST_FAILED');
  });

  it('rejects unsafe connection URLs', () => {
    for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=secret']) {
      expect(() => new Store(url, 'test-only-key')).toThrow('INVALID_SUPABASE_URL');
    }
  });

  it('writes run-linked audit data and confirms final run updates', async () => {
    const id = randomUUID();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'PATCH' ? Response.json([{ id }]) : new Response(null, { status: 201 }));
    const store = new Store('https://example.supabase.co', 'test-only-key', fetcher);
    await store.startRun(id);
    const log = { endpoint: '/v2/filings/', requested_at: new Date().toISOString(), status_code: 429,
      latency_ms: 3, estimated_credit_cost: 1, cache_hit: false, error: 'HTTP_429' };
    await store.logApiCall(id, log);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toEqual({ run_id: id, ...log });
    await store.finishRun(id, { status: 'PARTIAL', pages_fetched: 3, records_scanned: 90, new_events: 0,
      estimated_credits: 3, api_latency_ms_total: 9, error_summary: 'MAX_FILINGS_PAGES_REACHED' });
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]!.body)).status).toBe('PARTIAL');
    fetcher.mockResolvedValue(Response.json([]));
    await expect(store.finishRun(id, { status: 'FAILED', pages_fetched: 0, records_scanned: 0, new_events: 0,
      estimated_credits: 0, api_latency_ms_total: 0, error_summary: 'TEST' })).rejects.toThrow('RUN_UPDATE_NOT_CONFIRMED');
  });
});
