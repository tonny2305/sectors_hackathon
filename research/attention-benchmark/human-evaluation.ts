import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { csv, parseCsv, systems } from './benchmark.ts';

type Label = 0 | 1 | 2;
type System = typeof systems[number];
type Row = Record<string, string>;

const output = 'research/attention-benchmark/results';
const reviewers = ['reviewer_1_label', 'reviewer_2_label', 'reviewer_3_label'] as const;
const frozenEvidenceBlob = '13c42b8573054ffa5ae1f26d4f68a57cf10f836f';
const round = (value: number) => Number(value.toFixed(6));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const gitBlob = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

function label(value: string | undefined): Label {
  assert(value === '0' || value === '1' || value === '2', value === '' || value === undefined ? 'MISSING_REVIEWER_LABEL' : 'INVALID_REVIEWER_LABEL');
  return Number(value) as Label;
}

function kappa(left: Label[], right: Label[], disagreement: (a: Label, b: Label) => number) {
  assert(left.length === right.length && left.length > 0, 'INVALID_KAPPA_INPUT');
  const observed = left.reduce<number>((sum, value, index) => sum + disagreement(value, right[index]!), 0) / left.length;
  const values: Label[] = [0, 1, 2];
  const expected = values.reduce<number>((sum, a) => sum + values.reduce<number>((inner, b) =>
    inner + left.filter(value => value === a).length / left.length * right.filter(value => value === b).length / right.length * disagreement(a, b), 0), 0);
  return expected === 0 ? null : round(1 - observed / expected);
}

export const cohenKappa = (left: Label[], right: Label[]) => kappa(left, right, (a, b) => a === b ? 0 : 1);
export const weightedCohenKappa = (left: Label[], right: Label[], quadratic = true) =>
  kappa(left, right, (a, b) => quadratic ? ((a - b) / 2) ** 2 : Math.abs(a - b) / 2);

export function fleissKappa(allLabels: Label[][]) {
  assert(allLabels.length > 0 && allLabels.every(labels => labels.length === 3), 'INVALID_FLEISS_INPUT');
  const agreement = allLabels.reduce((sum, labels) => {
    const counts = [0, 1, 2].map(value => labels.filter(labelValue => labelValue === value).length);
    return sum + counts.reduce((inner, count) => inner + count * count, 0) / 6 - 0.5;
  }, 0) / allLabels.length;
  const proportions = [0, 1, 2].map(value => allLabels.flat().filter(labelValue => labelValue === value).length / (allLabels.length * 3));
  const expected = proportions.reduce((sum, value) => sum + value * value, 0);
  return expected === 1 ? null : round((agreement - expected) / (1 - expected));
}

function majority(labels: Label[]): Label | null {
  for (const value of [0, 1, 2] as const) if (labels.filter(labelValue => labelValue === value).length >= 2) return value;
  return null;
}

function bool(value: string) {
  assert(value === 'true' || value === 'false', 'INVALID_FROZEN_BOOLEAN');
  return value === 'true';
}

function rate(count: number, total: number) {
  return total ? round(count / total) : null;
}

export function buildHumanEvaluation(annotationsText: string, factualText: string, evidenceText: string) {
  assert(gitBlob(evidenceText) === frozenEvidenceBlob, 'FROZEN_EVIDENCE_CHECKPOINT_MISMATCH');
  const annotations = parseCsv(annotationsText);
  const factual = parseCsv(factualText);
  assert(annotations.length === 117, 'ANNOTATION_ROW_COUNT');
  assert(factual.length === 117, 'FACTUAL_ROW_COUNT');
  assert(new Set(annotations.map(row => row.input_id)).size === 117, 'ANNOTATION_INPUT_ID_DUPLICATE');
  assert(annotations.every((row, index) => row.input_id === factual[index]?.input_id), 'ANNOTATION_INPUT_IDENTITY_MISMATCH');

  const labeled = annotations.map(row => ({ row, labels: reviewers.map(reviewer => label(row[reviewer])) }));
  const evidence = parseCsv(evidenceText).filter(row => row.dataset === 'sectors_persisted' && row.clock === 'first_persisted' && row.config === 'default');
  const bySystem = Object.fromEntries(systems.map(system => {
    const rows = evidence.filter(row => row.system === system);
    assert(rows.length === 117, `FROZEN_${system}_ROW_COUNT`);
    assert(new Set(rows.map(row => row.input_id)).size === 117, `FROZEN_${system}_INPUT_ID_DUPLICATE`);
    assert(annotations.every(annotation => rows.some(row => row.input_id === annotation.input_id)), `FROZEN_${system}_INPUT_IDENTITY_MISMATCH`);
    return [system, new Map(rows.map(row => [row.input_id, row]))];
  })) as Record<System, Map<string, Row>>;

  const internalEvents = labeled.map(({ row, labels }, index) => {
    const fact = factual[index]!;
    const consensus = majority(labels);
    return {
      input_id: row.input_id!, event_id: bySystem.B0.get(row.input_id!)!.event_id!, source_timestamp: fact.source_timestamp!,
      symbol: fact.symbol!, current_factual_event: fact.source_title! || fact.source_body!, labels, consensus,
      decisions: Object.fromEntries(systems.map(system => [system, bool(bySystem[system].get(row.input_id!)!.interrupt!)])) as Record<System, boolean>,
    };
  });

  const distribution = Object.fromEntries(reviewers.map((reviewer, reviewerIndex) => [reviewer.replace('_label', ''),
    Object.fromEntries([0, 1, 2].map(value => {
      const count = labeled.filter(item => item.labels[reviewerIndex] === value).length;
      return [value, { count, rate: rate(count, labeled.length) }];
    }))]));
  const pairwise = reviewers.slice(0, 2).flatMap((leftReviewer, leftIndex) => reviewers.slice(leftIndex + 1).map((rightReviewer, offset) => {
    const rightIndex = leftIndex + offset + 1;
    const left = labeled.map(item => item.labels[leftIndex]!);
    const right = labeled.map(item => item.labels[rightIndex]!);
    const exact = left.filter((value, index) => value === right[index]).length;
    return {
      reviewers: `${leftReviewer.replace('_label', '')}-${rightReviewer.replace('_label', '')}`,
      events: left.length, raw_agreement_count: exact, raw_agreement: rate(exact, left.length),
      cohen_kappa: cohenKappa(left, right),
      ordinal_weighted_cohen_kappa_quadratic: weightedCohenKappa(left, right),
      ordinal_weighted_cohen_kappa_linear: weightedCohenKappa(left, right, false),
      zero_two_disagreements: left.filter((value, index) => (value === 0 && right[index] === 2) || (value === 2 && right[index] === 0)).length,
    };
  }));
  const threeWay = labeled.filter(item => new Set(item.labels).size === 1).length;
  const zeroTwo = labeled.filter(item => item.labels.includes(0) && item.labels.includes(2));
  const ties = internalEvents.filter(event => event.consensus === null);
  const consensusDistribution = Object.fromEntries([0, 1, 2].map(value => [value, internalEvents.filter(event => event.consensus === value).length]));

  const systemResults = systems.map(system => {
    const rows = bySystem[system];
    const resolved = internalEvents.filter(event => event.consensus !== null);
    const tp = resolved.filter(event => event.consensus === 2 && event.decisions[system]).length;
    const fp = resolved.filter(event => event.consensus !== 2 && event.decisions[system]).length;
    const fn = resolved.filter(event => event.consensus === 2 && !event.decisions[system]).length;
    const tn = resolved.filter(event => event.consensus !== 2 && !event.decisions[system]).length;
    const totalInterruptions = internalEvents.filter(event => event.decisions[system]).length;
    const duplicates = internalEvents.flatMap(event => {
      const row = rows.get(event.input_id)!;
      return event.decisions[system] && bool(row.duplicate_interruption!) ? [{ input_id: event.input_id, symbol: event.symbol,
        state_before: row.state_before!, state_after: row.state_after! }] : [];
    });
    const precision = tp + fp ? rate(tp, tp + fp) : null;
    const recall = tp + fn ? rate(tp, tp + fn) : null;
    return {
      system, total_interruptions: totalInterruptions, evaluated_consensus_events: resolved.length,
      tp, fp, fn, tn, immediate_attention_recall: recall, interruption_precision: precision,
      f1: precision !== null && recall !== null && precision + recall ? round(2 * precision * recall / (precision + recall)) : null,
      interruption_reduction_vs_b0: round(1 - totalInterruptions / internalEvents.length),
      consensus_0_interruptions: resolved.filter(event => event.consensus === 0 && event.decisions[system]).length,
      consensus_1_interruptions: resolved.filter(event => event.consensus === 1 && event.decisions[system]).length,
      unresolved_tie_interruptions: ties.filter(event => event.decisions[system]).length,
      duplicate_episode_alerts: {
        total: duplicates.length,
        legitimate_material_to_structural_escalations: duplicates.filter(event => event.state_before === 'MATERIAL' && event.state_after === 'STRUCTURAL').length,
        repeated_same_state_duplicates: duplicates.filter(event => event.state_before === event.state_after).length,
        other_same_episode_realerts: duplicates.filter(event => event.state_before !== event.state_after && !(event.state_before === 'MATERIAL' && event.state_after === 'STRUCTURAL')).length,
        events: duplicates,
      },
    };
  });

  const pairedDifferences = internalEvents.filter(event => event.decisions.B1 !== event.decisions.B3C).map(event => ({
    input_id: event.input_id, symbol: event.symbol, current_factual_event: event.current_factual_event,
    reviewer_labels: event.labels, consensus: event.consensus, B1_decision: event.decisions.B1 ? 'INTERRUPT' : 'SUPPRESS',
    B3C_decision: event.decisions.B3C ? 'INTERRUPT' : 'SUPPRESS',
  }));
  const disposition = Object.fromEntries(systemResults.filter(result => result.system !== 'B0').map(result => [result.system,
    result.immediate_attention_recall === 1 && result.interruption_reduction_vs_b0 > 0 ? 'KEEP'
      : result.immediate_attention_recall === 0 || result.interruption_reduction_vs_b0 <= 0 ? 'KILL' : 'MODIFY'])) as Record<'B1' | 'B2' | 'B3' | 'B3C', 'KEEP' | 'MODIFY' | 'KILL'>;

  const results = {
    metadata: {
      evaluation: 'SEALED', algorithm_checkpoint: '925465b', annotation_commit: 'bf2cc11',
      dataset: 'sectors_persisted', clock: 'first_persisted', config: 'default',
      positive_target: 'consensus label 2 only', label_1_semantics: 'review later/watch; not a push-alert positive',
      annotations_sha256: sha256(annotationsText), frozen_evidence_sha256: sha256(evidenceText),
      frozen_evidence_git_blob: frozenEvidenceBlob,
      generated_at: '2026-09-30',
    },
    validation: { rows: annotations.length, unique_input_ids: new Set(annotations.map(row => row.input_id)).size,
      labels: labeled.length * 3, missing_labels: 0, invalid_labels: 0, input_id_identity_preserved: true,
      frozen_evidence_matches_checkpoint: true },
    annotation_reliability: {
      reviewer_distribution: distribution,
      exact_three_way_agreement: { count: threeWay, rate: rate(threeWay, labeled.length) },
      pairwise, fleiss_kappa: fleissKappa(labeled.map(item => item.labels)),
      zero_two_span_disagreements: { event_count: zeroTwo.length, input_ids: zeroTwo.map(item => item.row.input_id),
        pairwise_occurrences: pairwise.reduce((sum, pair) => sum + pair.zero_two_disagreements, 0) },
    },
    consensus: {
      method: 'simple majority of three independent labels', distribution: consensusDistribution,
      resolved_events: internalEvents.length - ties.length, unresolved_zero_one_two_ties: ties.map(event => ({ input_id: event.input_id,
        symbol: event.symbol, current_factual_event: event.current_factual_event, reviewer_labels: event.labels })),
    },
    primary_disposition_criterion: {
      order: ['immediate-attention recall for consensus class 2', 'interruption reduction versus B0'],
      KEEP: '100% class-2 recall and fewer interruptions than B0',
      MODIFY: 'non-zero but below-100% class-2 recall while reducing interruptions',
      KILL: 'zero class-2 recall or no interruption reduction versus B0',
      note: 'Applied identically to B1/B2/B3/B3C; precision and duplicate diagnostics do not override the primary criterion.',
    },
    systems: systemResults,
    paired_B1_vs_B3C: { differing_events: pairedDifferences.length, events: pairedDifferences },
    dispositions: disposition,
  };

  const eventRows = internalEvents.map(event => ({
    input_id: event.input_id, event_id: event.event_id, source_timestamp: event.source_timestamp, symbol: event.symbol,
    current_factual_event: event.current_factual_event, reviewer_1_label: event.labels[0], reviewer_2_label: event.labels[1],
    reviewer_3_label: event.labels[2], consensus_label: event.consensus ?? '',
    consensus_status: event.consensus === null ? 'UNRESOLVED_0_1_2_TIE' : 'MAJORITY',
    B0_decision: event.decisions.B0 ? 'INTERRUPT' : 'SUPPRESS', B1_decision: event.decisions.B1 ? 'INTERRUPT' : 'SUPPRESS',
    B2_decision: event.decisions.B2 ? 'INTERRUPT' : 'SUPPRESS', B3_decision: event.decisions.B3 ? 'INTERRUPT' : 'SUPPRESS',
    B3C_decision: event.decisions.B3C ? 'INTERRUPT' : 'SUPPRESS',
  }));
  return { results, eventRows, markdown: markdown(results) };
}

function markdown(results: any): string {
  const pct = (value: number | null) => value === null ? 'N/A' : `${(value * 100).toFixed(2)}%`;
  const escape = (value: unknown) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const reliability = results.annotation_reliability;
  const lines = [
    '# Sealed human evaluation', '',
    'Evaluation date: 2026-09-30  ',
    'Frozen algorithm checkpoint: `925465b`  ',
    'Annotation commit: `bf2cc11`  ',
    'Dataset/clock/config: `sectors_persisted` / `first_persisted` / `default`', '',
    'This evaluation reads the frozen `events.csv`; it does not replay or alter thresholds, baseline decisions, materiality rules, or production code. Consensus label 2 is the only positive interruption target. Labels 0 and 1 are negative for immediate push, while label 1 remains review-later/watch evidence.', '',
    '## Validation', '',
    `PASS: ${results.validation.rows} rows, ${results.validation.unique_input_ids} unique input IDs, ${results.validation.labels} complete labels restricted to {0,1,2}, exact input identity/order preserved against the blind factual file and every frozen system, and frozen evidence blob \`${results.metadata.frozen_evidence_git_blob}\` matches checkpoint \`925465b\`.`, '',
    '## Annotation reliability', '',
    '| Reviewer | Label 0 | Label 1 | Label 2 |', '| --- | ---: | ---: | ---: |',
    ...Object.entries(reliability.reviewer_distribution).map(([reviewer, values]) => {
      const distribution = values as Record<string, { count: number; rate: number | null }>;
      return `| ${reviewer} | ${distribution['0']!.count} (${pct(distribution['0']!.rate)}) | ${distribution['1']!.count} (${pct(distribution['1']!.rate)}) | ${distribution['2']!.count} (${pct(distribution['2']!.rate)}) |`;
    }), '',
    `Exact 3-way agreement: **${reliability.exact_three_way_agreement.count}/117 (${pct(reliability.exact_three_way_agreement.rate)})**.  `,
    `Fleiss kappa: **${reliability.fleiss_kappa}**.  `,
    `Disagreements spanning 0↔2: **${reliability.zero_two_span_disagreements.event_count} events** and **${reliability.zero_two_span_disagreements.pairwise_occurrences} pairwise occurrences**.`, '',
    '| Reviewer pair | Raw agreement | Cohen κ | Ordinal weighted κ (quadratic) | Weighted κ (linear, supplementary) | 0↔2 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...reliability.pairwise.map((pair: any) => `| ${pair.reviewers} | ${pair.raw_agreement_count}/${pair.events} (${pct(pair.raw_agreement)}) | ${pair.cohen_kappa} | ${pair.ordinal_weighted_cohen_kappa_quadratic} | ${pair.ordinal_weighted_cohen_kappa_linear} | ${pair.zero_two_disagreements} |`), '',
    '## Consensus', '',
    `Simple-majority distribution: label 0 = **${results.consensus.distribution['0']}**, label 1 = **${results.consensus.distribution['1']}**, label 2 = **${results.consensus.distribution['2']}**. Resolved = **${results.consensus.resolved_events}**; unresolved 0/1/2 ties = **${results.consensus.unresolved_zero_one_two_ties.length}**.`, '',
  ];
  if (results.consensus.unresolved_zero_one_two_ties.length) lines.push(
    '| input_id | Symbol | Current factual event | Reviewer labels |', '| --- | --- | --- | --- |',
    ...results.consensus.unresolved_zero_one_two_ties.map((event: any) => `| ${event.input_id} | ${event.symbol} | ${escape(event.current_factual_event)} | ${event.reviewer_labels.join('/')} |`), '');
  lines.push(
    'Unresolved ties are excluded from TP/FP/FN/TN, precision, recall, and F1. They remain included in each frozen system’s total interruption count and are reported separately.', '',
    '## Frozen-system evaluation', '',
    '| System | Interruptions | TP | FP | FN | TN | Recall | Precision | F1 | Reduction vs B0 | Consensus-0 alerts | Consensus-1 alerts | Tie alerts |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.systems.map((system: any) => `| ${system.system} | ${system.total_interruptions} | ${system.tp} | ${system.fp} | ${system.fn} | ${system.tn} | ${pct(system.immediate_attention_recall)} | ${pct(system.interruption_precision)} | ${system.f1 ?? 'N/A'} | ${pct(system.interruption_reduction_vs_b0)} | ${system.consensus_0_interruptions} | ${system.consensus_1_interruptions} | ${system.unresolved_tie_interruptions} |`), '',
    '### Duplicate episode alerts', '',
    '| System | Total | Legitimate MATERIAL→STRUCTURAL | Repeated same-state | Other same-episode re-alert |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...results.systems.map((system: any) => `| ${system.system} | ${system.duplicate_episode_alerts.total} | ${system.duplicate_episode_alerts.legitimate_material_to_structural_escalations} | ${system.duplicate_episode_alerts.repeated_same_state_duplicates} | ${system.duplicate_episode_alerts.other_same_episode_realerts} |`), '',
    'A duplicate is descriptive: another interruption in the same episode. Only `MATERIAL→STRUCTURAL` is classified here as the explicitly legitimate escalation; unchanged-state repeats are reported separately.', '',
    '## Paired B1 vs B3C', '',
    `Decision differences: **${results.paired_B1_vs_B3C.differing_events}**.`, '',
    '| input_id | Symbol | Current factual event | Reviewer labels | Consensus | B1 | B3C |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...results.paired_B1_vs_B3C.events.map((event: any) => `| ${event.input_id} | ${event.symbol} | ${escape(event.current_factual_event)} | ${event.reviewer_labels.join('/')} | ${event.consensus ?? 'UNRESOLVED'} | ${event.B1_decision} | ${event.B3C_decision} |`), '',
    '## Evidence-based dispositions', '',
    'Predefined primary criterion: KEEP requires 100% consensus-class-2 recall and fewer interruptions than B0; MODIFY means non-zero but below-100% recall while reducing interruptions; KILL means zero recall or no interruption reduction. Precision and duplicate diagnostics are reported but do not override that criterion.', '',
    ...(['B1', 'B2', 'B3', 'B3C'] as const).map(system => {
      const metric = results.systems.find((row: any) => row.system === system)!;
      return `- **${system}: ${results.dispositions[system]}** — recall ${pct(metric.immediate_attention_recall)}, ${metric.total_interruptions} interruptions, ${pct(metric.interruption_reduction_vs_b0)} reduction versus B0.`;
    }), '',
    'No thresholds, replay logic, baseline decisions, materiality rules, or production behavior were changed. No B4 was created.', '',
    'Reproduce with `node --conditions=react-server --experimental-strip-types research/attention-benchmark/human-evaluation.ts`.', '');
  return lines.join('\n');
}

export function runHumanEvaluation() {
  const annotations = readFileSync(`${output}/human-annotations-labeled.csv`, 'utf8');
  const factual = readFileSync(`${output}/human-annotation.csv`, 'utf8');
  const evidence = readFileSync(`${output}/events.csv`, 'utf8');
  const evaluation = buildHumanEvaluation(annotations, factual, evidence);
  writeFileSync(`${output}/human-evaluation-results.json`, JSON.stringify(evaluation.results, null, 2) + '\n');
  writeFileSync(`${output}/human-evaluation-events.csv`, csv(evaluation.eventRows));
  writeFileSync(`${output}/SEALED_HUMAN_EVALUATION.md`, evaluation.markdown);
  console.log(JSON.stringify({ validation: evaluation.results.validation, consensus: evaluation.results.consensus,
    systems: evaluation.results.systems, dispositions: evaluation.results.dispositions }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runHumanEvaluation();
