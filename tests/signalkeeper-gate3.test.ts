import { expect, it } from 'vitest';
import frozen from './production-b2-sealed.json';
import { evaluateEvent } from '../lib/materiality/engine.ts';
import { listSignals } from '../lib/archive/signalkeeper.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import type { MaterialityState, PriorHolderEvent } from '../lib/materiality/types.ts';

type FrozenRow = { input_id: string; prior_event_ids: string[]; expected: { state: MaterialityState }; event: {
  fingerprint: string; symbol: string; ownership_before_pct: number; ownership_after_pct: number;
  raw_payload_json: Parameters<typeof normalizeFiling>[0]; source_timestamp: string; source_date: string;
  transaction_type: PriorHolderEvent['transaction_type']; ownership_delta_pp: number;
} };
const rows = frozen.events as unknown as FrozenRow[];

it('grounds the homepage archive evidence and NSSS context in the frozen artifact', () => {
  const events = listSignals();
  expect(events).toHaveLength(900);
  expect(new Set(events.map(event => event.symbol)).size).toBe(179);
  expect(events.filter(event => event.badges.includes('Crossed 5%'))).toHaveLength(85);
  expect(events.filter(event => event.badges.includes('Large Shift'))).toHaveLength(90);
  const nsss = events.find(event => event.symbol === 'NSSS.JK' && event.holderName === 'Samuel Tumbuh Bersama' && event.ownershipBeforePct === 4.11 && event.ownershipAfterPct === 8.86);
  expect(nsss?.specialContextMatches).toContain('return of borrowed shares');
});

it('proves the frozen NSSS ablation changes only with legitimate holder history', () => {
  const currentRow = rows.find(row => row.event.symbol === 'NSSS.JK' && row.event.ownership_before_pct === 21.64 && row.event.ownership_after_pct === 22.51)!;
  const current = normalizeFiling(currentRow.event.raw_payload_json);
  const prior: PriorHolderEvent[] = rows.filter(row => currentRow.prior_event_ids.includes(row.event.fingerprint)).map(row => ({
    id: row.input_id, source_timestamp: row.event.source_timestamp, source_date: row.event.source_date,
    transaction_type: row.event.transaction_type, ownership_delta_pp: row.event.ownership_delta_pp, materiality_state: row.expected.state,
  }));
  expect(evaluateEvent({ event: current, priorHolderEvents: [], enrichmentSkipped: true }).materialityState).toBe('WATCH');
  const withHistory = evaluateEvent({ event: current, priorHolderEvents: prior, enrichmentSkipped: true });
  expect(withHistory.materialityState).toBe('MATERIAL');
  expect(withHistory.reasonCodes).toContain('REPEATED_SAME_DIRECTION_GE_3');
});
