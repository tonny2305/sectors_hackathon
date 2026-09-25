import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { csv, factualAnnotationRows, loadDatasets, reviewerTemplateRows, timestampMs, type Input } from './benchmark.ts';

const output = 'research/attention-benchmark/results';
const prohibited = ['direction', 'interrupt', 'state_before', 'state_after', 'candidate_state', 'reasons',
  'episode_id', 'episode_count', 'cumulative_pp', 'regulatory_crossing', 'crossing_5pct', 'config', 'system',
  'duplicate_interruption', 'escalation', 'b2_repeat_count_180d'];

function audit(inputs: Input[], rows: Record<string, unknown>[]) {
  if (inputs.length !== 117 || rows.length !== 117) throw Error('ANNOTATION_CURRENT_EVENT_COUNT');
  if (new Set(rows.map(row => row.input_id)).size !== 117) throw Error('ANNOTATION_CURRENT_EVENT_ID_DUPLICATE');
  const headers = Object.keys(rows[0]!);
  const prohibitedColumns = prohibited.filter(column => headers.includes(column));
  if (prohibitedColumns.length) throw Error(`ANNOTATION_PROHIBITED_COLUMNS:${prohibitedColumns.join(',')}`);
  const timeline = inputs.map(input => {
    const sourceMs = timestampMs(input.event.source_timestamp);
    const knownMs = Math.max(sourceMs, timestampMs(input.persistedAt!));
    return { input, sourceMs, knownMs };
  });
  let futureLeakage = 0;
  const priorDistribution = [0, 0, 0, 0];
  let nonZeroDeltaCount = 0;
  let displayedNonZeroAsZero = 0;
  for (const [index, row] of rows.entries()) {
    const current = timeline[index]!;
    const priorCount = [1, 2, 3].filter(n => String(row[`prior_${n}_source_timestamp`] ?? '') !== '').length;
    priorDistribution[priorCount] = (priorDistribution[priorCount] ?? 0) + 1;
    for (let n = 1; n <= priorCount; n++) {
      const priorTimestamp = String(row[`prior_${n}_source_timestamp`]);
      const prior = timeline.filter(candidate => candidate.input.event.source_timestamp === priorTimestamp &&
        candidate.input.event.symbol === current.input.event.symbol && candidate.input.event.normalized_holder_name === current.input.event.normalized_holder_name);
      if (!prior.some(candidate => candidate.sourceMs < current.sourceMs && candidate.knownMs <= current.knownMs)) futureLeakage++;
    }
    const currentDelta = current.input.event.ownership_delta_pp;
    if (currentDelta !== null && currentDelta !== 0) {
      nonZeroDeltaCount++;
      if (Number(row.ownership_delta_pp) === 0) displayedNonZeroAsZero++;
    }
    for (let n = 1; n <= priorCount; n++) {
      const prior = timeline.find(candidate => candidate.input.event.source_timestamp === row[`prior_${n}_source_timestamp`] &&
        candidate.input.event.symbol === current.input.event.symbol && candidate.input.event.normalized_holder_name === current.input.event.normalized_holder_name);
      const delta = prior?.input.event.ownership_delta_pp;
      if (delta !== null && delta !== undefined && delta !== 0) {
        nonZeroDeltaCount++;
        if (Number(row[`prior_${n}_ownership_delta_pp`]) === 0) displayedNonZeroAsZero++;
      }
    }
  }
  const othersWithBody = rows.filter(row => row.transaction_type === 'others' && String(row.source_body ?? '') !== '').length;
  return { currentEvents: rows.length, priorDistribution, futureLeakage, prohibitedColumns,
    nonZeroDeltaCount, displayedNonZeroAsZero, othersWithBody };
}

export function runAnnotationExport() {
  const { datasets } = loadDatasets();
  const persisted = datasets.find(data => data[0]?.provenance === 'sectors_persisted');
  if (!persisted || persisted.length !== 117 || persisted.some(input => !input.persistedAt)) throw Error('INVALID_PERSISTED_ANNOTATION_DATASET');
  const rows = factualAnnotationRows(persisted) as Record<string, unknown>[];
  const report = audit(persisted, rows);
  if (report.futureLeakage || report.displayedNonZeroAsZero || report.prohibitedColumns.length) throw Error('ANNOTATION_AUDIT_FAILED');
  writeFileSync(`${output}/human-annotation.csv`, csv(rows));
  writeFileSync(`${output}/human-annotations-template.csv`, csv(reviewerTemplateRows(persisted)));
  writeFileSync(`${output}/ANNOTATION_DATA_AUDIT.md`, `# Annotation data audit

Date: 2026-09-25

- Current persisted events: ${report.currentEvents}
- First-persisted future leakage violations: ${report.futureLeakage}
- Prior-history rows with 0 records: ${report.priorDistribution[0]}
- Prior-history rows with 1 record: ${report.priorDistribution[1]}
- Prior-history rows with 2 records: ${report.priorDistribution[2]}
- Prior-history rows with 3 records: ${report.priorDistribution[3]}
- others events with raw source body/purpose context: ${report.othersWithBody}
- Non-zero deltas checked after display formatting: ${report.nonZeroDeltaCount}
- Non-zero deltas displayed as zero: ${report.displayedNonZeroAsZero}
- Prohibited decision columns: ${report.prohibitedColumns.length ? report.prohibitedColumns.join(', ') : 'none'}

The current-event columns contain persisted filing identity, source timestamp and precision, symbol, holder, raw transaction type, raw source title/body when present, source ownership/holding/transaction facts, and source URL. Prior columns contain the same raw factual fields requested for up to three earlier filings for the same symbol and holder.

Prior context was admitted only when its source timestamp was earlier than the current event and its persisted availability time was no later than the current event's first-persisted evaluation time. Same-source-time events were not treated as prior.

The blind files contain no future filings or market outcomes, engine labels, baseline decisions, materiality states, reason codes, episode or cumulative fields, regulatory classifications, or alert flags. The reviewer template adds only blank reviewer label columns.

Status: READY for independent human annotation.
`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runAnnotationExport();
