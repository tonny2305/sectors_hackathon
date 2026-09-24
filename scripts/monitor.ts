import 'server-only';
import { Store, StoreError } from '../lib/db/store.ts';
import { runMonitoringCycle } from '../lib/automation/monitor.ts';
import { dateRangeSchema, dateSchema } from '../lib/sectors/schemas.ts';

async function main() {
  const [argStart, argEnd] = process.argv.slice(2);

  let startDate: string | undefined;
  let endDate: string | undefined;

  if (argStart && argEnd) {
    const range = dateRangeSchema.safeParse({ start: argStart, end: argEnd });
    if (!range.success) {
      throw new Error('USAGE: npm run monitor -- [YYYY-MM-DD YYYY-MM-DD]');
    }
    startDate = range.data.start;
    endDate = range.data.end;
  } else if (argStart) {
    const singleDate = dateSchema.safeParse(argStart);
    if (!singleDate.success) {
      throw new Error('USAGE: npm run monitor -- [YYYY-MM-DD [YYYY-MM-DD]]');
    }
    startDate = singleDate.data;
    endDate = singleDate.data;
  }

  const maxPages = Number(process.env.MAX_FILINGS_PAGES_PER_RUN || 3);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error('INVALID_MAX_PAGES');
  }

  const key = process.env.SECTORS_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key || !url || !serviceKey) {
    throw new Error('MISSING_SERVER_CREDENTIALS');
  }

  const triggerType = process.env.GITHUB_EVENT_NAME === 'schedule' ? 'SCHEDULED_CRON'
    : process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'MANUAL_DISPATCH' : 'MANUAL_CLI';
  const store = new Store(url, serviceKey);

  console.log(`Starting autonomous monitoring cycle (${triggerType})...`);
  const result = await runMonitoringCycle(store, key, {
    startDate,
    endDate,
    maxPages,
    triggerType,
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        status: result.status,
        warning: result.warning,
        pagesFetched: result.pagesFetched,
        recordsScanned: result.recordsScanned,
        newEvents: result.newEvents,
        eligibleNewFilings: result.eligibleNewFilings,
        attentionMetrics: {
          interruptionReduction: result.attentionMetrics.interruptionReduction,
          duplicateAlertRate: result.attentionMetrics.duplicateAlertRate,
          explainabilityCoverage: result.attentionMetrics.explainabilityCoverage,
          silentCount: result.attentionMetrics.silentCount,
          watchCount: result.attentionMetrics.watchCount,
          materialCount: result.attentionMetrics.materialCount,
          structuralCount: result.attentionMetrics.structuralCount,
          suppressedCount: result.attentionMetrics.suppressedCount,
          pushAlertsSent: result.attentionMetrics.pushAlertsSent,
        },
        estimatedCredits: result.estimatedCredits,
        apiLatencyMsTotal: result.apiLatencyMsTotal,
      },
      null,
      2,
    ),
  );

  if (result.status === 'PARTIAL') {
    process.exitCode = 2;
  }
}

main().catch(error => {
  console.error('Autonomous monitoring cycle failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
