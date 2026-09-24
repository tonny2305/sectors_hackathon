import 'server-only';
import { randomUUID } from 'node:crypto';
import { Store, StoreError } from '../lib/db/store.ts';
import { SectorsClient, SectorsError } from '../lib/sectors/client.ts';
import { dateRangeSchema } from '../lib/sectors/schemas.ts';

// Manual Phase 1 verification only. Scheduling/evaluation belong to later phases.
async function main() {
  const [start, end] = process.argv.slice(2);
  const range = dateRangeSchema.safeParse({ start, end });
  if (!range.success) throw new Error('USAGE: npm run ingest -- YYYY-MM-DD YYYY-MM-DD');
  const maxPages = Number(process.env.MAX_FILINGS_PAGES_PER_RUN || 3);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('INVALID_MAX_PAGES');
  const key = process.env.SECTORS_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !url || !serviceKey) throw new Error('MISSING_SERVER_CREDENTIALS');
  const db = new Store(url, serviceKey);
  const runId = randomUUID();
  const summary = { pages_fetched: 0, records_scanned: 0, new_events: 0, estimated_credits: 0, api_latency_ms_total: 0 };
  const client = new SectorsClient({ apiKey: key, onApiCall: async log => {
    summary.estimated_credits += log.estimated_credit_cost;
    summary.api_latency_ms_total += log.latency_ms;
    await db.logApiCall(runId, log);
  } });
  await db.startRun(runId);
  try {
    const result = await client.filings({ ...range.data, maxPages });
    summary.pages_fetched = result.pagesFetched;
    summary.records_scanned = result.records.length;
    const saved = await db.ingest(result.records);
    summary.new_events = saved.inserted;
    await db.finishRun(runId, { ...summary, status: result.status, error_summary: result.warning });
    console.log(JSON.stringify({ runId, status: result.status, warning: result.warning, ...summary, duplicates: saved.duplicates }));
    if (result.status === 'PARTIAL') process.exitCode = 2;
  } catch (error) {
    const code = error instanceof SectorsError || error instanceof StoreError ? error.message : 'INGESTION_FAILED';
    await db.finishRun(runId, { ...summary, status: 'FAILED', error_summary: code });
    throw new Error(code);
  }
}

main().catch(() => {
  console.error('Data-core ingestion failed. Check server configuration and persisted run/API logs.');
  process.exitCode = 1;
});
