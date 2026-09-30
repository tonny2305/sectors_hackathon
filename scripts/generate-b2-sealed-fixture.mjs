import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { normalizeFiling } from '../lib/sectors/normalize.ts';

const show = path => execFileSync('git', ['show', `925465b:${path}`], { encoding: 'utf8', maxBuffer: 20_000_000 });
const parseCsv = text => {
  const records = []; let row = []; let field = ''; let quoted = false; let closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(field); field = ''; closed = false;
      if (ch !== ',') { records.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (closed || ch === '"') throw Error('INVALID_CSV_QUOTE');
    else field += ch;
  }
  if (row.length || field || closed) records.push([...row, field]);
  const header = records.shift();
  return records.map(values => Object.fromEntries(header.map((name, index) => [name, values[index]])));
};

const snapshot = JSON.parse(show('research/attention-benchmark/inputs/sectors-persisted.json'));
const evidence = parseCsv(show('research/attention-benchmark/results/events.csv')).filter(row =>
  row.dataset === 'sectors_persisted' && row.clock === 'first_persisted' && row.config === 'default' && row.system === 'B2');
if (snapshot.filings.length !== 117 || evidence.length !== 117) throw Error('INVALID_FROZEN_EVENT_COUNT');
const filings = new Map(snapshot.filings.map(row => [row.id, row]));
const suppression = new Set(['SMALL_ABSOLUTE_CHANGE', 'NO_REPEAT_PATTERN', 'NO_NEW_OR_EXIT_POSITION',
  'NO_MATERIAL_LIQUIDITY_CONTEXT', 'BELOW_PUSH_THRESHOLD', 'INSUFFICIENT_CONTEXT_FOR_ESCALATION']);
const rows = evidence.map(row => {
  const filing = filings.get(row.input_id);
  if (!filing) throw Error(`MISSING_FROZEN_INPUT:${row.input_id}`);
  const event = normalizeFiling(filing.raw_payload_json);
  if (event.fingerprint !== row.event_id) throw Error(`FROZEN_IDENTITY_MISMATCH:${row.input_id}`);
  const reasons = JSON.parse(row.reasons).filter(reason => !reason.startsWith('CURRENT_ENGINE_'));
  return {
    input_id: row.input_id,
    event,
    prior_event_ids: JSON.parse(row.prior_event_ids),
    expected: {
      state: row.state_after,
      interrupt: row.interrupt === 'true',
      reason_codes: reasons.filter(reason => !suppression.has(reason)),
      suppression_reason_codes: reasons.filter(reason => suppression.has(reason)),
      repeat_count_180d: Number(row.b2_repeat_count_180d),
    },
  };
});
writeFileSync('tests/production-b2-sealed.json', JSON.stringify({
  checkpoint: '925465b',
  frozen_events_git_blob: execFileSync('git', ['rev-parse', '925465b:research/attention-benchmark/results/events.csv'], { encoding: 'utf8' }).trim(),
  event_count: rows.length,
  events: rows,
}, null, 2) + '\n');
