import { describe, expect, it, vi } from 'vitest';
import filingExample from '../fixtures/filings.documented.json';
import dailyExample from '../fixtures/daily.documented.json';
import { SectorsClient, type ApiCallLog } from '../lib/sectors/client.ts';
import { dailyResponseSchema, filingSchema, filingsResponseSchema } from '../lib/sectors/schemas.ts';
import { filingFingerprint, normalizeFiling, normalizeHolder } from '../lib/sectors/normalize.ts';

const filing = filingExample.results[0]!;
const range = { start: '2026-07-01', end: '2026-07-10' };
const lastPage = { ...filingExample, pagination: { ...filingExample.pagination, has_next: false, next_offset: null } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(responses: Array<Response | Error>, options: { timeoutMs?: number; maxAttempts?: number } = {}) {
  const logs: ApiCallLog[] = [];
  const fetcher = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('Unexpected extra request');
    return next;
  });
  const wait = vi.fn(async (_ms: number) => {});
  const client = new SectorsClient({ apiKey: 'test-only-secret-canary', fetch: fetcher,
    sleep: wait, onApiCall: async log => { logs.push(log); }, ...options });
  return { client, logs, fetcher, wait };
}

describe('documented contracts and normalization', () => {
  it('parses filing and daily examples without discarding raw fields', () => {
    expect(filingsResponseSchema.parse(filingExample)).toEqual(filingExample);
    expect(dailyResponseSchema.parse(dailyExample)).toEqual(dailyExample);
    const raw = { ...filing, future_field: { evidence: true } };
    expect(normalizeFiling(raw).raw_payload_json).toEqual(raw);
  });

  it('preserves null and absent optional data rather than coercing it to zero', () => {
    const raw = { symbol: 'NSSS.JK', timestamp: filing.timestamp, source: null,
      holder_name: filing.holder_name, transaction_type: 'others', holding_after: 1,
      holding_before: null, amount_transaction: null, share_percentage_before: null,
      share_percentage_after: null, share_percentage_transaction: null, transaction_value: null };
    const event = normalizeFiling(raw);
    expect(event.holding_before).toBeNull();
    expect(event.shares_transacted).toBeNull();
    expect(event.ownership_delta_pp).toBeNull();
    expect(event.transaction_value_idr).toBeNull();
    expect(event.raw_payload_json).not.toHaveProperty('tags');
  });

  it.each([
    {}, { ...filingExample, results: 'bad' },
    { ...filingExample, pagination: {} },
    { ...filingExample, results: [{ ...filing, holding_after: '100' }] },
    { ...filingExample, results: [{ ...filing, amount_transaction: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...filingExample, results: [{ ...filing, timestamp: '2026-02-30T14:00:00' }] },
    { ...filingExample, results: [{ ...filing, source: 'javascript:alert(1)' }] },
  ])('rejects malformed contract %#', value => {
    expect(filingsResponseSchema.safeParse(value).success).toBe(false);
  });

  it('accepts null optional metadata and rejects unusable identity explicitly', () => {
    expect(filingSchema.parse({ ...filing, holder_type: null, price_transaction: null, tags: null }).tags).toBeNull();
    expect(() => normalizeFiling({ ...filing, holder_name: null })).toThrow('INSUFFICIENT_FILING_IDENTITY');
  });

  it('matches conservative holder identities without merging legal aliases', () => {
    expect(normalizeHolder('  PT\u00a0Example   TBK ')).toBe('pt example tbk');
    expect(normalizeHolder('PT. Example')).not.toBe(normalizeHolder('PT Example'));
    expect(normalizeHolder(null)).toBeNull();
  });

  it('fingerprints ignore prose changes and symbol/name formatting but distinguish shared sources', () => {
    const original = filingSchema.parse(filing);
    const key = filingFingerprint(original);
    expect(filingFingerprint({ ...original, title: 'Updated title', symbol: 'nsss', holder_name: ' SAMUEL  SEKURITAS INDONESIA ' })).toBe(key);
    expect(filingFingerprint({ ...original, holder_name: 'A different holder' })).not.toBe(key);
    expect(filingFingerprint({ ...original, transaction_type: 'sell' })).not.toBe(key);
  });
});

describe('requests, pagination and failure semantics', () => {
  it('follows next_offset, records each attempt, and never sends the key in the URL', async () => {
    const second = { ...lastPage, pagination: { ...lastPage.pagination, offset: 2 } };
    const { client, fetcher, logs } = setup([json(filingExample), json(second)]);
    const result = await client.filings(range);
    expect(result).toMatchObject({ status: 'COMPLETE', pagesFetched: 2 });
    expect(result.records).toHaveLength(2);
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get('offset')).toBe('2');
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('limit')).toBe('30');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ status_code: 200, estimated_credit_cost: 1, cache_hit: false, error: null });
    expect(logs[0]!.latency_ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(Date.parse(logs[0]!.requested_at))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('test-only-secret-canary');
    expect(String(fetcher.mock.calls[0]![0])).not.toContain('test-only-secret-canary');
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe('error');
  });

  it('returns explicit PARTIAL when the cap prevents completion', async () => {
    const { client, fetcher } = setup([json(filingExample)]);
    expect(await client.filings({ ...range, maxPages: 1 })).toMatchObject({ status: 'PARTIAL', warning: 'MAX_FILINGS_PAGES_REACHED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts a truly empty final page', async () => {
    const { client } = setup([json({ ...lastPage, results: [] })]);
    expect(await client.filings(range)).toMatchObject({ records: [], status: 'COMPLETE' });
  });

  it.each([
    { ...filingExample, results: [] },
    { ...filingExample, pagination: { ...filingExample.pagination, next_offset: 0 } },
    { ...lastPage, pagination: { ...lastPage.pagination, offset: 30 } },
  ])('rejects broken pagination %# rather than declaring success', async payload => {
    const { client, fetcher } = setup([json(payload)]);
    await expect(client.filings(range)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 503])('retries %i then succeeds', async status => {
    const { client, logs, wait } = setup([json({}, status), json(lastPage)]);
    expect((await client.filings(range)).status).toBe('COMPLETE');
    expect(wait).toHaveBeenCalledWith(1000);
    expect(logs.map(log => log.status_code)).toEqual([status, 200]);
  });

  it('honors bounded Retry-After and never exceeds three attempts', async () => {
    const limited = () => new Response('', { status: 429, headers: { 'Retry-After': '9999' } });
    const { client, fetcher, wait, logs } = setup([limited(), limited(), limited()]);
    await expect(client.filings(range)).rejects.toThrow('HTTP_429');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[30000], [30000]]);
    expect(logs).toHaveLength(3);
  });

  it('enforces the total request budget across retries and pages', async () => {
    const { client, fetcher, logs } = setup([json({}, 429), json(filingExample)], { maxAttempts: 1 });
    await expect(client.filings(range)).rejects.toThrow('API_BUDGET_EXHAUSTED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(1);
  });

  it.each([400, 401, 403, 404])('does not retry permanent HTTP %i', async status => {
    const { client, fetcher } = setup([json({ error: 'test-only-secret-canary' }, status)]);
    await expect(client.filings(range)).rejects.toThrow(`HTTP_${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sanitizes network errors and accounts for retries', async () => {
    const { client, logs, wait } = setup(Array.from({ length: 3 }, () => new Error('test-only-secret-canary')));
    await expect(client.filings(range)).rejects.toThrow('NETWORK_ERROR');
    expect(wait.mock.calls).toEqual([[1000], [2000]]);
    expect(logs.every(log => log.status_code === null)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('test-only-secret-canary');
  });

  it('aborts hung requests and retries only three times', async () => {
    const logs: ApiCallLog[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const client = new SectorsClient({ apiKey: 'test-key', fetch: fetcher, timeoutMs: 5,
      sleep: async () => {}, onApiCall: async log => { logs.push(log); } });
    await expect(client.filings(range)).rejects.toThrow('TIMEOUT');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(logs.every(log => log.error === 'TIMEOUT')).toBe(true);
  });

  it.each([new Response('bad json'), json({ secret: 'test-only-secret-canary' })])('logs malformed successful responses without raw content', async response => {
    const { client, logs, fetcher } = setup([response]);
    await expect(client.filings(range)).rejects.toThrow(/INVALID_JSON|INVALID_PAYLOAD/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logs)).not.toContain('test-only-secret-canary');
  });

  it('does not retry Sectors if storing the audit log fails', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(lastPage));
    const client = new SectorsClient({ apiKey: 'test-key', fetch: fetcher,
      onApiCall: async () => { throw new Error('database-secret'); } });
    await expect(client.filings(range)).rejects.toThrow('API_LOG_PERSISTENCE_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('validates inputs before spending a credit', async () => {
    const { client, fetcher } = setup([]);
    await expect(client.filings({ ...range, maxPages: 0 })).rejects.toThrow();
    await expect(client.filings({ ...range, start: '2026-02-30' })).rejects.toThrow();
    await expect(client.filings({ ...range, symbol: '../secret' })).rejects.toThrow();
    await expect(client.daily('BBCA', '2025-01-01', '2025-05-02')).rejects.toThrow('DAILY_RANGE_EXCEEDS_90_DAYS');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('parses daily data and rejects mismatched symbols', async () => {
    const { client } = setup([json(dailyExample), json(dailyExample)]);
    expect(await client.daily('bbca', '2025-05-01', '2025-05-02')).toMatchObject({ records: dailyExample, contextUnavailable: false });
    await expect(client.daily('NSSS', '2025-05-01', '2025-05-02')).rejects.toThrow('DAILY_CONTEXT_MISMATCH');
  });

  it.each([json([], 200), json({}, 404)])('reports absent daily context without inventing zeros', async response => {
    const { client } = setup([response]);
    expect(await client.daily('BBCA', '2025-05-01', '2025-05-02')).toMatchObject({ records: [], contextUnavailable: true });
  });

  it('retains daily rows with missing quantities but marks their context unavailable', async () => {
    const rows = [{ ...dailyExample[0], close: null, volume: null }];
    const { client } = setup([json(rows)]);
    expect(await client.daily('BBCA', '2025-05-01', '2025-05-02')).toMatchObject({ records: rows, contextUnavailable: true });
  });
});
