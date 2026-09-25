// Explicit, read-only snapshot step. The offline benchmark never imports this file.
import { mkdir, writeFile } from 'node:fs/promises';

const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw Error('INVALID_DATABASE_URL');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw Error('MISSING_DATABASE_KEY');
const capturedAt = new Date().toISOString();
async function read(path) {
  const response = await fetch(new URL(`/rest/v1/${path}`, origin), {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  if (!response.ok) throw Error(`DATABASE_HTTP_${response.status}`);
  const rows = await response.json();
  const count = Number(response.headers.get('content-range')?.split('/')[1]);
  if (!Array.isArray(rows) || !Number.isSafeInteger(count)) throw Error('INVALID_DATABASE_RESPONSE');
  return { rows, count };
}
const filings = [];
let expected;
do {
  const page = await read(`filings?select=id,fingerprint,created_at,raw_payload_json&created_at=lte.${encodeURIComponent(capturedAt)}&order=created_at.asc,id.asc&limit=500&offset=${filings.length}`);
  expected ??= page.count;
  if (expected !== page.count || (!page.rows.length && filings.length < expected)) throw Error('SNAPSHOT_CHANGED_OR_INCOMPLETE');
  filings.push(...page.rows);
} while (filings.length < expected);
const runs = await read('automation_runs?select=trigger_type,status,pages_fetched,records_scanned,new_events,started_at&order=started_at.asc&limit=1000');
if (runs.rows.length !== runs.count) throw Error('RUN_EVIDENCE_INCOMPLETE');
const snapshot = {
  provenance: 'sectors_persisted', captured_at: capturedAt,
  source: 'Authenticated read-only Supabase filings export; raw Sectors payloads retained by ingest_filings.',
  limitations: 'Sparse backfill, not a complete feed. created_at is local first persistence, not verified first public availability. No historical daily observations or payload revisions archived.',
  count: filings.length, runs: runs.rows, filings,
};
await mkdir('research/attention-benchmark/inputs', { recursive: true });
await writeFile('research/attention-benchmark/inputs/sectors-persisted.json', JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify({ captured_at: capturedAt, filings: filings.length, runs: runs.rows.length }));
