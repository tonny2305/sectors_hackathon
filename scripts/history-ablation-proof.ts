import assert from 'node:assert/strict';
import frozen from '../tests/production-b2-sealed.json' with { type: 'json' };
import { evaluateEvent } from '../lib/materiality/engine.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import type { MaterialityState } from '../lib/materiality/types.ts';

const rowsByFingerprint = new Map(frozen.events.map(row => [row.event.fingerprint, row]));
const currentFeatureKeys = [
  'ownershipDeltaPp', 'absOwnershipDeltaPp', 'relativePositionChange', 'newPosition', 'nearExit',
  'medianDailyLiquidityProxy20d', 'transactionToLiquidityProxy', 'contextUnavailable', 'enrichmentSkipped',
] as const;

function replayArms(inputId: string) {
  const row = frozen.events.find(candidate => candidate.input_id === inputId);
  assert.ok(row, `Frozen input not found: ${inputId}`);
  const eventOnlyRaw = structuredClone(row.event.raw_payload_json);
  const historyRaw = structuredClone(row.event.raw_payload_json);
  const eventOnlyEvent = normalizeFiling(eventOnlyRaw);
  const historyEvent = normalizeFiling(historyRaw);
  const priorHolderEvents = row.prior_event_ids.map(fingerprint => {
    const prior = rowsByFingerprint.get(fingerprint);
    assert.ok(prior, `Frozen prior event not found: ${fingerprint}`);
    const event = normalizeFiling(prior.event.raw_payload_json);
    return {
      id: prior.input_id,
      source_timestamp: event.source_timestamp,
      source_date: event.source_date,
      transaction_type: event.transaction_type ?? 'others',
      ownership_delta_pp: event.ownership_delta_pp,
      materiality_state: prior.expected.state as MaterialityState,
    };
  });
  const eventOnly = evaluateEvent({ event: eventOnlyEvent, enrichmentSkipped: true });
  const withHistory = evaluateEvent({ event: historyEvent, priorHolderEvents, enrichmentSkipped: true });
  return { row, eventOnlyRaw, historyRaw, eventOnlyEvent, historyEvent, eventOnly, withHistory };
}

function currentFeatures(evaluation: ReturnType<typeof evaluateEvent>) {
  return Object.fromEntries(currentFeatureKeys.map(key => [key, evaluation.features[key]]));
}

const primary = replayArms('6fac06d9-1aca-4d59-8e02-a89de00dfaaf');
assert.deepEqual(primary.eventOnlyEvent, primary.historyEvent, 'current event changed between arms');
assert.equal(JSON.stringify(primary.eventOnlyRaw), JSON.stringify(primary.historyRaw), 'current raw payload changed between arms');
assert.deepEqual(currentFeatures(primary.eventOnly), currentFeatures(primary.withHistory), 'current features changed between arms');
assert.deepEqual(primary.eventOnlyEvent, {
  ...primary.eventOnlyEvent,
  symbol: 'NSSS.JK',
  holder_name: 'Samuel Sekuritas Indonesia',
  ownership_before_pct: 21.64,
  ownership_after_pct: 22.51,
});
assert.equal(primary.eventOnly.materialityState, 'WATCH');
assert.deepEqual(primary.eventOnly.reasonCodes, ['MODERATE_STAKE_MOVE_GE_0_25PP']);
assert.equal(primary.withHistory.materialityState, 'MATERIAL');
assert.deepEqual(primary.withHistory.reasonCodes, primary.row.expected.reason_codes);
assert.deepEqual(primary.withHistory.suppressionReasonCodes, primary.row.expected.suppression_reason_codes);
assert.equal(primary.withHistory.features.repeatCount180d, primary.row.expected.repeat_count_180d);
assert.equal(frozen.events.some(row => {
  const event = normalizeFiling(row.event.raw_payload_json);
  return event.symbol === 'NSSS.JK' && event.holder_name === 'Samuel Tumbuh Bersama' && event.ownership_delta_pp === 0.87;
}), false, 'the +0.87pp event was incorrectly attributed to Samuel Tumbuh Bersama');

const stateChanges = frozen.events.filter(row => {
  const { eventOnly, withHistory } = replayArms(row.input_id);
  return eventOnly.materialityState !== withHistory.materialityState;
});
assert.equal(stateChanges.length, 17, 'unexpected number of frozen state changes');
for (const inputId of ['9beeb763-ea48-4787-8958-d82200b24893', '67d85a40-1431-48ef-9413-ab664cf74241']) {
  const { eventOnlyEvent, historyEvent, eventOnly, withHistory } = replayArms(inputId);
  assert.deepEqual(eventOnlyEvent, historyEvent, `${inputId}: current event changed between arms`);
  assert.notEqual(eventOnly.materialityState, withHistory.materialityState, `${inputId}: decision did not change`);
}

const addedReasonCodes = primary.withHistory.reasonCodes.filter(code => !primary.eventOnly.reasonCodes.includes(code));
console.log([
  `HISTORY ABLATION: ${primary.eventOnlyEvent.symbol} / ${primary.eventOnlyEvent.holder_name} / ${primary.eventOnlyEvent.source_timestamp}`,
  `decisions: ${primary.eventOnly.materialityState} -> ${primary.withHistory.materialityState}`,
  `historical variables: repeatCount180d ${primary.eventOnly.features.repeatCount180d} -> ${primary.withHistory.features.repeatCount180d}; cumulativeSameDirectionDeltaPp180d ${primary.eventOnly.features.cumulativeSameDirectionDeltaPp180d} -> ${primary.withHistory.features.cumulativeSameDirectionDeltaPp180d}; previousHolderEventTimestamp null -> ${primary.withHistory.features.previousHolderEventTimestamp}; previousMaterialityStateForHolder null -> ${primary.withHistory.features.previousMaterialityStateForHolder}; escalatedFromPriorState false -> ${primary.withHistory.features.escalatedFromPriorState}`,
  `changed reason codes: +${addedReasonCodes.join(', ')}`,
  `additional frozen state changes: ${stateChanges.length}; reported examples: 9beeb763-ea48-4787-8958-d82200b24893, 67d85a40-1431-48ef-9413-ab664cf74241`,
  'ABLATION RESULT: PASS',
].join('\n'));
