import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import { evaluateEvent } from '../lib/materiality/engine.ts';
import type { PriorHolderEvent } from '../lib/materiality/types.ts';
import {
  crossing, csv, defaults, eventOnly, evaluateAnnotations, factualAnnotationRows, IE, ingestAnnotations, loadDatasets, parseCsv, replay, reviewerTemplateRows, summarize, timestampMs,
  type Input,
} from '../research/attention-benchmark/benchmark.ts';
import { buildHumanEvaluation, cohenKappa, fleissKappa, weightedCohenKappa } from '../research/attention-benchmark/human-evaluation.ts';

// Every event authored here is SYNTHETIC. None enter reported empirical benchmark results.
function input(date: string, before = 10, after = 10.1, extra: Record<string, unknown> = {}): Input {
  return {
    event: normalizeFiling({ symbol: 'TEST', holder_name: 'Synthetic Holder', timestamp: date,
      transaction_type: after >= before ? 'buy' : 'sell', holding_before: Math.round(before * 1000000),
      holding_after: Math.round(after * 1000000), amount_transaction: Math.round(Math.abs(after - before) * 1000000),
      share_percentage_before: before, share_percentage_after: after, source: 'https://example.org/synthetic', ...extra }),
    inputId: date, persistedAt: null, provenance: 'synthetic_test_only', timestampPrecision: 'second',
  };
}
const system = (data: Input[], name: string, config = defaults) => replay(data, config).filter(r => r.system === name);
const sequence = () => [1, 2, 3, 4].map((n, i) => input(`2026-09-0${n}T10:00:00`, 10 + i * 0.1, 10 + n * 0.1));

describe('Offline attention benchmark: synthetic chronology and failure checks', () => {
  it('is invariant to input order and to appending any later source events, at every prefix', () => {
    const data = sequence();
    const full = replay(data);
    expect(replay([...data].reverse())).toEqual(full);
    for (let n = 1; n <= data.length; n++) {
      expect(full.filter(r => data.slice(0, n).some(i => i.event.fingerprint === r.event_id))).toEqual(replay(data.slice(0, n)));
    }
    expect(full.every(r => r.prior_max_timestamp === null || timestampMs(r.prior_max_timestamp) < timestampMs(r.source_timestamp))).toBe(true);
  });

  it('does not leak late-arriving backfills, persisted evaluations, prose counts or current holder state', () => {
    const current = input('2026-09-03T10:00:00', 10.2, 10.3);
    current.persistedAt = '2026-09-03T04:00:00Z';
    const old = [input('2026-09-01T10:00:00'), input('2026-09-02T10:00:00', 10.1, 10.2)];
    old.forEach(i => { i.persistedAt = '2026-09-04T04:00:00Z'; });
    const alone = replay([current], defaults, 'first_persisted');
    const expanded = replay([...old, current], defaults, 'first_persisted');
    expect(expanded.filter(r => r.event_id === current.event.fingerprint)).toEqual(alone);
    expect(alone.find(r => r.system === 'B2')!.b2_repeat_count_180d).toBe(1);
    const poisoned = structuredClone(current);
    Object.assign(poisoned.event.raw_payload_json, { body: '99th purchase in 180 days', latest_materiality_state: 'STRUCTURAL', event_evaluations: [{ materiality_state: 'STRUCTURAL' }] });
    expect(replay([poisoned], defaults, 'first_persisted')).toEqual(alone);
  });

  it('preserves every real first-persisted prefix and never uses an unavailable or later-source input', () => {
    const data = loadDatasets().datasets[0]!;
    const full = replay(data, defaults, 'first_persisted');
    const byId = new Map(data.map(i => [i.event.fingerprint, i]));
    for (const asOf of new Set(full.map(r => r.evaluated_at))) {
      const prefix = data.filter(i => Math.max(timestampMs(i.persistedAt!), timestampMs(i.event.source_timestamp)) <= Date.parse(asOf));
      expect(replay(prefix, defaults, 'first_persisted')).toEqual(full.filter(r => r.evaluated_at <= asOf));
    }
    for (const row of full) for (const id of row.prior_event_ids) {
      const prior = byId.get(id)!;
      expect(timestampMs(prior.persistedAt!)).toBeLessThanOrEqual(Date.parse(row.evaluated_at));
      expect(timestampMs(prior.event.source_timestamp)).toBeLessThan(timestampMs(row.source_timestamp));
    }
  });

  it('canonicalizes offsets, excludes future same-day events and treats equal timestamps simultaneously', () => {
    const data = [input('2026-09-01T10:00:00'), input('2026-09-01T10:00:00+07:00', 10.1, 10.2), input('2026-09-01T03:00:00Z', 10.2, 10.3)];
    const rows = system(data, 'B2');
    expect(rows.every(r => r.b2_repeat_count_180d === 1 && r.prior_event_ids.length === 0)).toBe(true);
    expect(replay([...data].reverse())).toEqual(replay(data));
    const later = input('2026-09-01T11:00:00', 10.3, 10.4);
    expect(system([...data, later], 'B3').at(-1)!.episode_reset).toBe('AMBIGUOUS_PRIOR_TIMESTAMP');
    expect(system([later, data[0]!], 'B2')[0]!.b2_repeat_count_180d).toBe(1);
  });

  it('matches B2 production engine directly and B1 memoryless ablation for every persisted row', () => {
    const data = loadDatasets().datasets[0]!;
    const rows = replay(data);
    const histories = new Map<string, PriorHolderEvent[]>();
    for (const { event } of [...data].sort((a, b) => a.event.source_timestamp.localeCompare(b.event.source_timestamp) || a.event.fingerprint.localeCompare(b.event.fingerprint))) {
      const key = JSON.stringify([event.symbol, event.normalized_holder_name]);
      const prior = histories.get(key) ?? [];
      const evaluation = evaluateEvent({ event, priorHolderEvents: prior, enrichmentSkipped: true });
      const b2 = rows.find(r => r.event_id === event.fingerprint && r.system === 'B2')!;
      expect(b2.state_after).toBe(evaluation.materialityState);
      expect(b2.b2_repeat_count_180d).toBe(evaluation.features.repeatCount180d);
      expect(b2.reasons).toEqual([...evaluation.reasonCodes, ...evaluation.suppressionReasonCodes,
        b2.interrupt ? 'CURRENT_ENGINE_PUSH' : 'CURRENT_ENGINE_SUPPRESSION']);
      const noMemory = evaluateEvent({ event, enrichmentSkipped: true });
      expect(eventOnly(noMemory.features, defaults, event.ownership_after_pct).state).toBe(noMemory.materialityState);
      prior.push({ id: event.fingerprint, source_timestamp: event.source_timestamp, source_date: event.source_date,
        transaction_type: event.transaction_type!, ownership_delta_pp: evaluation.features.ownershipDeltaPp, materiality_state: evaluation.materialityState });
      histories.set(key, prior);
    }
  });

  it('respects 180-day history edges and isolates companies and holders', () => {
    const past = input('2026-01-01T10:00:00');
    const at180 = input('2026-06-30T10:00:00', 10.1, 10.2);
    const at181 = input('2026-07-01T10:00:00', 10.1, 10.2);
    expect(system([past, at180], 'B2').at(-1)!.b2_repeat_count_180d).toBe(2);
    expect(system([past, at181], 'B2').at(-1)!.b2_repeat_count_180d).toBe(1);
    const other = input('2026-01-02T10:00:00', 10.1, 10.2, { holder_name: 'Other Holder' });
    const company = input('2026-01-03T10:00:00', 10.1, 10.2, { symbol: 'OTHR' });
    expect(system([past, other, company], 'B2').every(r => r.b2_repeat_count_180d === 1)).toBe(true);
  });

  it('defines deterministic episode resets for gaps, reversals, exits and missing continuity', () => {
    const start = input('2026-01-01T10:00:00');
    for (const [next, reason] of [
      [input('2026-02-01T10:00:00', 10.1, 10.2), 'GAP'],
      [input('2026-01-02T10:00:00', 10.1, 10), 'DIRECTION'],
      [input('2026-01-02T10:00:00', 12, 12.1), 'DISCONTINUITY'],
    ] as const) expect(system([start, next], 'B3').at(-1)!.episode_reset).toBe(reason);
    const exit = input('2026-01-01T10:00:00', 1, 0);
    const again = input('2026-01-02T10:00:00', 1, 0.9);
    expect(system([exit, again], 'B3').at(-1)!.episode_reset).toBe('PRIOR_EXIT');
    expect(system([start, input('2026-01-31T10:00:00', 10.1, 10.2)], 'B3').at(-1)!.episode_reset).toBe('CONTINUE');
  });

  it('recovers the third small move but suppresses a fourth MATERIAL event', () => {
    const data = sequence();
    expect(system(data, 'B1').map(r => r.interrupt)).toEqual([false, false, false, false]);
    expect(system(data, 'B2').map(r => r.interrupt)).toEqual([false, false, true, true]);
    expect(system(data, 'B3').map(r => r.interrupt)).toEqual([false, true, true, false]);
    expect(summarize(system(data, 'B3')).repeated_small_move_escalations_recovered).toBe(1);
    expect(summarize(system(data, 'B1')).repeated_small_move_escalations_recovered).toBe(0);
  });

  it('applies B3C only on conservative state transitions', () => {
    const data = [
      input('2026-09-01T10:00:00', 10, 10.3),
      input('2026-09-02T10:00:00', 10.3, 11.4),
      input('2026-09-03T10:00:00', 11.4, 12.5),
      input('2026-09-04T10:00:00', 12.5, 17.6),
      input('2026-09-05T10:00:00', 17.6, 17.9),
    ];
    const rows = system(data, 'B3C');
    expect(rows.map(row => [row.state_before, row.state_after, row.interrupt])).toEqual([
      ['SILENT', 'WATCH', false], ['WATCH', 'MATERIAL', true], ['MATERIAL', 'MATERIAL', false],
      ['MATERIAL', 'STRUCTURAL', true], ['STRUCTURAL', 'STRUCTURAL', false],
    ]);
  });

  it('keeps annotation evidence blind and validates later labels', () => {
    const persistedSample = loadDatasets().datasets[0]!.slice(0, 1);
    const rows = factualAnnotationRows(persistedSample);
    expect(Object.keys(rows[0]!)).not.toContain('interrupt');
    expect(Object.keys(rows[0]!)).not.toContain('state_after');
    expect(Object.keys(reviewerTemplateRows(persistedSample)[0]!)).toEqual(expect.arrayContaining(['reviewer_1_label', 'reviewer_2_label', 'reviewer_3_label']));
    const reviews = ingestAnnotations(csv([{ input_id: 'a', reviewer_1_label: '2', reviewer_2_label: '1', reviewer_3_label: '' }]));
    expect(reviews).toEqual([{ input_id: 'a', reviewer_1: 2, reviewer_2: 1, reviewer_3: null }]);
    expect(() => ingestAnnotations(csv([{ input_id: 'a', reviewer_1_label: '3', reviewer_2_label: '', reviewer_3_label: '' }]))).toThrow('INVALID_ANNOTATION_LABEL');
    const evidence = replay(sequence()).filter(row => row.system === 'B3C');
    expect(evaluateAnnotations(evidence, [{ input_id: evidence[0]!.input_id, reviewer_1: 2, reviewer_2: 2, reviewer_3: null }]).metrics[0]!.recall_class_2).toBe(0);
  });

  it('exposes a worse case: suppression of a fresh material move that remains in the same state', () => {
    const data = [input('2026-09-01T10:00:00', 10, 11), input('2026-09-02T10:00:00', 11, 12)];
    expect(system(data, 'B1').map(r => r.interrupt)).toEqual([true, true]);
    expect(system(data, 'B3').map(r => r.interrupt)).toEqual([true, false]);
  });

  it('captures equality at 5%, down-crossings and configurable boundaries without promoting materiality', () => {
    expect(crossing(4.99, 5, 5)).toBe('UP_TO_OR_ABOVE');
    expect(crossing(5, 4.99, 5)).toBe('DOWN_BELOW');
    expect(crossing(5, 5.01, 5)).toBeNull();
    expect(crossing(null, 5, 5)).toBeNull();
    const data = [input('2026-09-01T10:00:00', 4.99, 5)];
    expect(system(data, 'B3')[0]).toMatchObject({ interrupt: true, state_after: 'SILENT', escalation: false });
    expect(system(data, 'B3', { ...defaults, regulatory: { ...defaults.regulatory, enabled: false } })[0]!.interrupt).toBe(false);
    expect(system(data, 'B3', { ...defaults, regulatory: { ...defaults.regulatory, boundaryPct: 10 } })[0]!.interrupt).toBe(false);
  });

  it('keeps missing values unknown and does not fabricate shares for proxy rows', () => {
    const data = loadDatasets().datasets[1]!;
    expect(data.every(i => i.event.holding_before === null && i.event.shares_transacted === null)).toBe(true);
    const missing = input('2026-09-01T10:00:00', 10, 10.1, { share_percentage_before: null, share_percentage_after: null });
    const row = system([missing], 'B3')[0]!;
    expect(row.cumulative_pp).toBeNull();
    expect(row.regulatory_crossing).toBeNull();
    expect(summarize([row]).regulatory_5pct_crossings_captured).toBe(IE);
    expect(summarize([]).attention_compression_ratio).toBe(IE);
    expect(() => replay([missing, missing])).toThrow('DUPLICATE_INPUT_IDENTITY');
    expect(() => replay([missing], { ...defaults, watchPp: 2 })).toThrow();
    expect(() => replay([missing], defaults, 'first_persisted')).toThrow('MISSING_FIRST_PERSISTED_TIME');
    expect(() => replay([missing, { ...sequence()[1]!, provenance: 'sectors_persisted' }])).toThrow('DO_NOT_POOL_PROVENANCE');
  });

  it('handles CSV escaping/BOM and reconciles every emitted aggregate to CSV evidence', () => {
    expect(parseCsv('\uFEFF' + csv([{ text: 'comma, quote"\nand newline', empty: '' }]))).toEqual([{ text: 'comma, quote"\nand newline', empty: '' }]);
    expect(() => parseCsv('a,b\n1')).toThrow('INVALID_CSV_WIDTH');
    expect(() => parseCsv('a\n"bad')).toThrow('UNTERMINATED_CSV_QUOTE');
    const results = JSON.parse(readFileSync('research/attention-benchmark/results/results.json', 'utf8'));
    for (const [table, filename] of [['benchmark', 'events'], ['sensitivity', 'sensitivity-events']] as const) {
      const text = filename === 'events' ? readFileSync(`research/attention-benchmark/results/${filename}.csv`, 'utf8')
        : gunzipSync(readFileSync(`research/attention-benchmark/results/${filename}.csv.gz`)).toString('utf8');
      const evidence = parseCsv(text);
      for (const aggregate of results[table]) {
        const rows = evidence.filter(r => ['dataset', 'clock', 'config', 'system'].every(k => r[k] === aggregate[k]));
        expect(rows.length).toBe(aggregate.events_evaluated);
        expect(rows.filter(r => r.interrupt === 'true').length).toBe(aggregate.human_interruptions);
        expect(rows.filter(r => r.duplicate_interruption === 'true').length).toBe(aggregate.duplicate_interruptions);
        expect(rows.filter(r => r.small_move_opportunity === 'true').length).toBe(aggregate.repeated_small_move_opportunities);
        expect(rows.filter(r => r.crossing_5pct !== '').length).toBe(aggregate.regulatory_5pct_crossing_opportunities);
        const n = rows.length, alerts = rows.filter(r => r.interrupt === 'true');
        const round = (v: number) => Number(v.toFixed(6));
        expect(aggregate.interruption_reduction_vs_alert_all).toBe(n ? round(1 - alerts.length / n) : IE);
        expect(aggregate.duplicate_interruption_rate).toBe(alerts.length ? round(alerts.filter(r => r.duplicate_interruption === 'true').length / alerts.length) : IE);
        expect(aggregate.attention_compression_ratio).toBe(alerts.length ? round(n / alerts.length) : IE);
        expect(aggregate.state_escalations).toBe(rows.filter(r => r.escalation === 'true').length);
        expect(aggregate.repeated_small_move_escalations_recovered).toBe(aggregate.repeated_small_move_opportunities ? alerts.filter(r => r.small_move_opportunity === 'true').length : IE);
        expect(aggregate.regulatory_5pct_crossings_captured).toBe(aggregate.regulatory_5pct_crossing_opportunities ? alerts.filter(r => r.crossing_5pct !== '').length : IE);
        expect(aggregate.explainability_coverage).toBe(alerts.length ? round(alerts.filter(r => r.explainable === 'true').length / alerts.length) : IE);
        expect(aggregate.decision_explanation_coverage).toBe(n ? round(rows.filter(r => JSON.parse(r.reasons!).length > 0).length / n) : IE);
        expect(rows.every(r => r.dataset !== 'synthetic_test_only')).toBe(true);
      }
    }
  });

  it('validates and reproduces the sealed human evaluation without replaying decisions', () => {
    const base = 'research/attention-benchmark/results/';
    const annotations = readFileSync(base + 'human-annotations-labeled.csv', 'utf8');
    const factual = readFileSync(base + 'human-annotation.csv', 'utf8');
    const evidence = readFileSync(base + 'events.csv', 'utf8');
    const evaluation = buildHumanEvaluation(annotations, factual, evidence);
    expect(evaluation.results.validation).toEqual({ rows: 117, unique_input_ids: 117, labels: 351,
      missing_labels: 0, invalid_labels: 0, input_id_identity_preserved: true, frozen_evidence_matches_checkpoint: true });
    expect(evaluation.eventRows).toHaveLength(117);
    expect(evaluation.results.systems.map(result => result.system)).toEqual(['B0', 'B1', 'B2', 'B3', 'B3C']);
    expect(JSON.parse(readFileSync(base + 'human-evaluation-results.json', 'utf8'))).toEqual(evaluation.results);
    expect(parseCsv(readFileSync(base + 'human-evaluation-events.csv', 'utf8'))).toEqual(parseCsv(csv(evaluation.eventRows)));
    expect(cohenKappa([0, 1, 2], [0, 1, 2])).toBe(1);
    expect(weightedCohenKappa([0, 1, 2], [0, 1, 2])).toBe(1);
    expect(fleissKappa([[0, 0, 0], [1, 1, 1], [2, 2, 2]])).toBe(1);
    const rows = parseCsv(annotations); rows[0]!.reviewer_1_label = '';
    expect(() => buildHumanEvaluation(csv(rows), factual, evidence)).toThrow('MISSING_REVIEWER_LABEL');
  });
});
