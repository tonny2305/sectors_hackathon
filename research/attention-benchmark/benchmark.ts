import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { evaluateEvent, ENGINE_VERSION } from '../../lib/materiality/engine.ts';
import { normalizeFiling, normalizeHolder, normalizeSymbol, type OwnershipEvent } from '../../lib/sectors/normalize.ts';
import { filingSchema } from '../../lib/sectors/schemas.ts';
import type { EvaluatedFeatures, MaterialityState, PriorHolderEvent } from '../../lib/materiality/types.ts';

export const IE = 'INSUFFICIENT EVIDENCE';
export const systems = ['B0', 'B1', 'B2', 'B3', 'B3C'] as const;
type System = typeof systems[number];
type Clock = 'source_time_assumption' | 'first_persisted';
const states: MaterialityState[] = ['SILENT', 'WATCH', 'MATERIAL', 'STRUCTURAL'];
const rank = (state: MaterialityState) => states.indexOf(state);
const higher = (...values: MaterialityState[]) => states[Math.max(...values.map(rank))]!;
const day = 86400000;
export const configSchema = z.object({
  watchPp: z.number().positive(), materialPp: z.number().positive(), structuralPp: z.number().positive(),
  episodeGapDays: z.number().positive(), continuityTolerancePp: z.number().nonnegative(),
  interruptFrom: z.enum(['WATCH', 'MATERIAL']),
  regulatory: z.object({ enabled: z.boolean(), boundaryPct: z.number().min(0).max(100), jurisdiction: z.string().min(1) }).strict(),
}).strict().refine(c => c.watchPp < c.materialPp && c.materialPp < c.structuralPp, 'Thresholds must increase');
export type Config = z.infer<typeof configSchema>;
export const defaults: Config = {
  watchPp: 0.25, materialPp: 1, structuralPp: 5,
  episodeGapDays: 30, continuityTolerancePp: 0.01, interruptFrom: 'WATCH',
  regulatory: { enabled: true, boundaryPct: 5, jurisdiction: 'Indonesia / POJK 4/2024 research flag' },
};
export interface Input {
  event: OwnershipEvent;
  provenance: string;
  inputId: string;
  persistedAt: string | null;
  timestampPrecision: 'second' | 'day';
}
export interface Evidence {
  dataset: string; clock: Clock; config: string; system: System;
  event_id: string; input_id: string; source_timestamp: string; evaluated_at: string;
  symbol: string; holder: string | null; direction: string | null; source_url: string | null;
  timestamp_precision: string; episode_id: string; episode_reset: string;
  before_pct: number | null; after_pct: number | null; delta_pp: number | null;
  holding_before: number | null; holding_after: number | null; shares_transacted: number | null;
  transaction_value_idr: number | null; new_position: boolean; near_exit: boolean;
  relative_position_change: number | null; episode_count: number; cumulative_pp: number | null;
  prior_event_ids: string[]; prior_max_timestamp: string | null;
  state_before: MaterialityState; candidate_state: MaterialityState; state_after: MaterialityState;
  interrupt: boolean; escalation: boolean; duplicate_interruption: boolean;
  small_move_opportunity: boolean; regulatory_crossing: string | null;
  crossing_5pct: string | null; reasons: string[]; explainable: boolean;
  liquidity_context: string; b2_repeat_count_180d: number; data_quality_flags: string[];
}
export interface Annotation {
  input_id: string;
  label: 0 | 1 | 2;
}
export interface AnnotationReview {
  input_id: string;
  reviewer_1: 0 | 1 | 2 | null;
  reviewer_2: 0 | 1 | 2 | null;
  reviewer_3: 0 | 1 | 2 | null;
}
interface History {
  input: Input; sourceMs: number; knownMs: number;
  episode: string; episodeCount: number; cumulative: number | null; allSmall: boolean;
  decision: Record<System, MaterialityState>;
}

// Sectors documents local source timestamps. Explicit WIB interpretation is research configuration,
// not a claim that an unzoned string was UTC. Canonicalize offsets before engine string comparisons.
export function timestampMs(value: string): number {
  z.iso.datetime({ local: true, offset: true }).parse(value);
  const result = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+07:00`);
  if (!Number.isFinite(result)) throw Error('INVALID_TIMESTAMP');
  return result;
}
function engineTimestamp(ms: number) {
  return new Date(ms + 7 * 3600000).toISOString().slice(0, -1);
}
export function crossing(before: number | null, after: number | null, boundary: number): string | null {
  if (before === null || after === null) return null;
  if (before < boundary && after >= boundary) return 'UP_TO_OR_ABOVE';
  if (before >= boundary && after < boundary) return 'DOWN_BELOW';
  return null;
}
function magnitude(value: number | null, c: Config): MaterialityState {
  return value === null ? 'SILENT' : value >= c.structuralPp ? 'STRUCTURAL' : value >= c.materialPp ? 'MATERIAL' : value >= c.watchPp ? 'WATCH' : 'SILENT';
}

// Event-only ablation of the current engine. No ownership-percentage substitute for missing shares.
export function eventOnly(f: EvaluatedFeatures, c: Config, ownershipAfterPct: number | null = null): { state: MaterialityState; reasons: string[] } {
  let state = magnitude(f.absOwnershipDeltaPp, c);
  const reasons = [`STAKE_${state}`, `MAGNITUDE_THRESHOLDS_PP=${c.watchPp}/${c.materialPp}/${c.structuralPp}`];
  let watches = state === 'WATCH' ? 1 : 0;
  if (f.relativePositionChange !== null && f.relativePositionChange >= 0.10) {
    state = higher(state, 'MATERIAL'); reasons.push('RELATIVE_POSITION_CHANGE_GE_10PCT');
  } else if (f.relativePositionChange !== null && f.relativePositionChange >= 0.05) {
    watches++; reasons.push('RELATIVE_POSITION_CHANGE_GE_5PCT');
  }
  if (f.nearExit) { state = 'STRUCTURAL'; reasons.push('NEAR_EXIT_POSITION'); }
  else if (f.newPosition && (ownershipAfterPct === null || ownershipAfterPct > 0)) { state = higher(state, 'MATERIAL'); reasons.push('NEW_NOTABLE_POSITION'); }
  if (watches >= 2) { state = higher(state, 'MATERIAL'); reasons.push('TWO_WATCH_DIMENSIONS'); }
  else if (watches) state = higher(state, 'WATCH');
  return { state, reasons };
}

export function replay(inputs: Input[], config: Config = defaults, clock: Clock = 'source_time_assumption', configId = 'default'): Evidence[] {
  const c = configSchema.parse(config);
  if (new Set(inputs.map(i => i.provenance)).size > 1) throw Error('DO_NOT_POOL_PROVENANCE');
  const seen = new Set<string>();
  const ordered = inputs.map(input => {
    const sourceMs = timestampMs(input.event.source_timestamp);
    if (clock === 'first_persisted' && !input.persistedAt) throw Error('MISSING_FIRST_PERSISTED_TIME');
    const knownMs = clock === 'first_persisted' ? Math.max(sourceMs, timestampMs(input.persistedAt!)) : sourceMs;
    return { input, sourceMs, knownMs };
  }).sort((a, b) => a.knownMs - b.knownMs || a.sourceMs - b.sourceMs || a.input.event.fingerprint.localeCompare(b.input.event.fingerprint));
  const history = new Map<string, History[]>();
  const episodeAlerts = new Set<string>();
  const rows: Evidence[] = [];
  for (const { input, sourceMs, knownMs } of ordered) {
    const original = input.event;
    if (seen.has(original.fingerprint)) throw Error('DUPLICATE_INPUT_IDENTITY');
    seen.add(original.fingerprint);
    if (!original.normalized_holder_name) throw Error('MISSING_HOLDER_IDENTITY');
    const key = JSON.stringify([original.symbol, original.normalized_holder_name]);
    const allHistory = history.get(key) ?? [];
    // ponytail: O(n^2) within a holder is fine for this 117-row snapshot; index by time for large feeds.
    // Equal source timestamps cannot establish intra-batch history, regardless of input ordering.
    const prior = allHistory.filter(p => p.sourceMs < sourceMs && p.knownMs <= knownMs)
      .sort((a, b) => a.sourceMs - b.sourceMs || a.input.event.fingerprint.localeCompare(b.input.event.fingerprint));
    const latest = prior.at(-1);
    const latestTied = latest && prior.filter(p => p.sourceMs === latest.sourceMs).length > 1;
    const event = { ...original, source_timestamp: engineTimestamp(sourceMs), source_date: engineTimestamp(sourceMs).slice(0, 10) };
    const cutoff = Date.parse(event.source_date) - 180 * day;
    const b2Prior: PriorHolderEvent[] = prior.filter(p => Date.parse(engineTimestamp(p.sourceMs).slice(0, 10)) >= cutoff).map(p => ({
      id: p.input.event.fingerprint, source_timestamp: engineTimestamp(p.sourceMs), source_date: engineTimestamp(p.sourceMs).slice(0, 10),
      transaction_type: p.input.event.transaction_type ?? 'others', ownership_delta_pp: p.input.event.ownership_delta_pp,
      materiality_state: p.decision.B2,
    }));
    if (b2Prior.length >= 1000) throw Error('HOLDER_HISTORY_INCOMPLETE'); // Match Store's fail-closed limit.
    const evaluated = evaluateEvent({ event, priorHolderEvents: b2Prior, enrichmentSkipped: true });
    const f = evaluated.features;
    const staticResult = eventOnly(f, c, event.ownership_after_pct);
    const before = original.ownership_before_pct;
    const after = original.ownership_after_pct;
    let reset = !latest ? 'FIRST_OBSERVED' : latestTied ? 'AMBIGUOUS_PRIOR_TIMESTAMP' : '';
    if (!reset && latest) {
      const last = latest.input.event;
      if (sourceMs - latest.sourceMs > c.episodeGapDays * day) reset = 'GAP';
      else if (last.transaction_type !== event.transaction_type || event.transaction_type === 'others') reset = 'DIRECTION';
      else if (last.holding_after === 0 || last.ownership_after_pct === 0) reset = 'PRIOR_EXIT';
      else if (before !== null && last.ownership_after_pct !== null && Math.abs(before - last.ownership_after_pct) > c.continuityTolerancePp + 1e-8) reset = 'DISCONTINUITY';
    }
    const previous = reset ? undefined : latest;
    const episode = previous?.episode ?? original.fingerprint;
    const episodeCount = (previous?.episodeCount ?? 0) + 1;
    const cumulative = f.absOwnershipDeltaPp === null || previous?.cumulative === null ? null : Number(((previous?.cumulative ?? 0) + f.absOwnershipDeltaPp).toFixed(4));
    // Fixed diagnostic reference across magnitude sweeps; do not move the recovery denominator to favor a variant.
    const small = f.absOwnershipDeltaPp !== null && f.absOwnershipDeltaPp > 0 && f.absOwnershipDeltaPp < defaults.watchPp &&
      rank(eventOnly(f, defaults, event.ownership_after_pct).state) < 2;
    const allSmall = small && (previous?.allSmall ?? true);
    const opportunity = episodeCount === 3 && allSmall && (event.transaction_type === 'buy' || event.transaction_type === 'sell');
    let candidate = higher(staticResult.state, magnitude(cumulative, c));
    const experimentalReasons = [...staticResult.reasons, `EPISODE_COUNT=${episodeCount}`, `EPISODE_CUMULATIVE_PP=${cumulative ?? 'UNKNOWN'}`];
    if (event.transaction_type === 'buy' || event.transaction_type === 'sell') {
      if (episodeCount >= 3) { candidate = higher(candidate, 'MATERIAL'); experimentalReasons.push('EPISODE_REPEAT_GE_3'); }
      else if (episodeCount >= 2) { candidate = higher(candidate, 'WATCH'); experimentalReasons.push('EPISODE_REPEAT_GE_2'); }
    }
    const stateBefore = previous?.decision.B3 ?? 'SILENT';
    const attention = higher(stateBefore, candidate);
    const regCross = crossing(before, after, c.regulatory.boundaryPct);
    const decisions: Record<System, MaterialityState> = { B0: 'SILENT', B1: staticResult.state, B2: evaluated.materialityState, B3: attention, B3C: candidate };
    for (const system of systems) {
      const state = decisions[system];
      const priorState = previous?.decision[system] ?? 'SILENT';
      const escalation = system !== 'B0' && rank(state) > rank(priorState);
      const conservativeTransition = ((priorState === 'SILENT' || priorState === 'WATCH') && rank(state) >= rank('MATERIAL')) ||
        priorState === 'MATERIAL' && state === 'STRUCTURAL';
      const interrupt = system === 'B0' || (system === 'B3'
        ? (escalation && rank(state) >= rank(c.interruptFrom)) || (c.regulatory.enabled && regCross !== null)
        : system === 'B3C' ? conservativeTransition : rank(state) >= 2);
      const reasons = system === 'B0' ? ['ELIGIBLE_UNIQUE_OWNERSHIP_FILING']
        : system === 'B1' ? [...staticResult.reasons, interrupt ? 'EVENT_PUSH_THRESHOLD_MET' : 'BELOW_EVENT_PUSH_THRESHOLD']
        : system === 'B2' ? [...evaluated.reasonCodes, ...evaluated.suppressionReasonCodes, interrupt ? 'CURRENT_ENGINE_PUSH' : 'CURRENT_ENGINE_SUPPRESSION']
        : system === 'B3C' ? [...experimentalReasons, conservativeTransition ? 'CONSERVATIVE_STATE_TRANSITION' : 'NO_CONSERVATIVE_STATE_TRANSITION', 'WATCH_MACHINE_ONLY', 'REGULATORY_CROSSING_DOES_NOT_BYPASS_TRANSITION', interrupt ? 'INTERRUPT' : 'SUPPRESS']
        : [...experimentalReasons, escalation ? 'ATTENTION_ESCALATED' : 'NO_ATTENTION_ESCALATION', `PUSH_FROM=${c.interruptFrom}`,
          ...(c.regulatory.enabled && regCross ? [`REGULATORY_TRANSITION_${regCross}_${c.regulatory.boundaryPct}PCT`] : []), interrupt ? 'INTERRUPT' : 'SUPPRESS'];
      const alertKey = JSON.stringify([episode, system]);
      const duplicate = interrupt && episodeAlerts.has(alertKey);
      if (interrupt) episodeAlerts.add(alertKey);
      rows.push({
        dataset: input.provenance, clock, config: configId, system,
        event_id: original.fingerprint, input_id: input.inputId, source_timestamp: original.source_timestamp,
        evaluated_at: new Date(knownMs).toISOString(), symbol: original.symbol, holder: original.holder_name,
        direction: original.transaction_type, source_url: original.source_url, timestamp_precision: input.timestampPrecision,
        episode_id: episode, episode_reset: reset || 'CONTINUE', before_pct: before, after_pct: after,
        delta_pp: f.ownershipDeltaPp, relative_position_change: f.relativePositionChange, episode_count: episodeCount, cumulative_pp: cumulative,
        holding_before: event.holding_before, holding_after: event.holding_after, shares_transacted: event.shares_transacted,
        transaction_value_idr: event.transaction_value_idr, new_position: f.newPosition, near_exit: f.nearExit,
        prior_event_ids: b2Prior.map(p => p.id), prior_max_timestamp: b2Prior.at(-1)?.source_timestamp ?? null,
        state_before: priorState, candidate_state: system === 'B3' || system === 'B3C' ? candidate : state, state_after: state,
        interrupt, escalation, duplicate_interruption: duplicate, small_move_opportunity: opportunity,
        regulatory_crossing: regCross, crossing_5pct: crossing(before, after, 5), reasons,
        explainable: Boolean(original.source_url && original.source_timestamp && reasons.length &&
          (f.ownershipDeltaPp !== null || f.relativePositionChange !== null || f.repeatCount180d > 1)),
        liquidity_context: 'UNAVAILABLE_NO_ARCHIVED_AS_OF_OBSERVATIONS', b2_repeat_count_180d: f.repeatCount180d,
        data_quality_flags: [
          ...(f.ownershipDeltaPp === null ? ['MISSING_OWNERSHIP_DELTA'] : []),
          ...(f.relativePositionChange === null ? ['MISSING_SHARE_RELATIVE_CHANGE'] : []),
          ...((event.transaction_type === 'buy' && (f.ownershipDeltaPp ?? 0) < 0) ||
            (event.transaction_type === 'sell' && (f.ownershipDeltaPp ?? 0) > 0) ? ['SOURCE_DIRECTION_CONTRADICTS_PERCENTAGES'] : []),
        ],
      });
    }
    allHistory.push({ input, sourceMs, knownMs, episode, episodeCount, cumulative, allSmall, decision: decisions });
    history.set(key, allHistory);
  }
  return rows;
}

function rawSourceFacts(input: Input) {
  const raw = input.event.raw_payload_json;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { source_title: null, source_body: null, transaction_type: input.event.transaction_type };
  const record = raw as Record<string, unknown>;
  return { source_title: typeof record.title === 'string' ? record.title : null,
    source_body: typeof record.body === 'string' ? record.body : null,
    transaction_type: typeof record.transaction_type === 'string' ? record.transaction_type : null };
}

function annotationNumber(value: number | null, percentage = false): string | number | null {
  if (value === null) return null;
  if (!percentage || value === 0) return Number.isInteger(value) ? value : String(value);
  const decimals = Math.max(0, Math.min(15, 6 - Math.floor(Math.log10(Math.abs(value))) - 1));
  const formatted = value.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9]*)0+$/, '');
  return formatted === '0' && value !== 0 ? String(value) : formatted;
}

interface AnnotationTimelineRow { input: Input; sourceMs: number; knownMs: number }
function annotationTimeline(inputs: Input[]): AnnotationTimelineRow[] {
  return inputs.map(input => {
    if (!input.persistedAt) throw Error('MISSING_FIRST_PERSISTED_TIME');
    const sourceMs = timestampMs(input.event.source_timestamp);
    return { input, sourceMs, knownMs: Math.max(sourceMs, timestampMs(input.persistedAt)) };
  });
}

export function factualAnnotationRows(inputs: Input[]) {
  const timeline = annotationTimeline(inputs);
  return timeline.map(({ input, sourceMs, knownMs }) => {
    const { event, inputId, timestampPrecision } = input;
    const source = rawSourceFacts(input);
    const prior = timeline.filter(row => row.input.event.symbol === event.symbol &&
      row.input.event.normalized_holder_name === event.normalized_holder_name && row.sourceMs < sourceMs && row.knownMs <= knownMs &&
      row.input.event.fingerprint !== event.fingerprint)
      .sort((a, b) => b.sourceMs - a.sourceMs || b.input.event.fingerprint.localeCompare(a.input.event.fingerprint)).slice(0, 3);
    const priorFields: Record<string, unknown> = {};
    for (let i = 0; i < 3; i++) {
      const row = prior[i];
      const facts = row && rawSourceFacts(row.input);
      const prefix = `prior_${i + 1}_`;
      priorFields[`${prefix}source_timestamp`] = row?.input.event.source_timestamp ?? null;
      priorFields[`${prefix}transaction_type`] = facts?.transaction_type ?? null;
      priorFields[`${prefix}ownership_before_pct`] = annotationNumber(row?.input.event.ownership_before_pct ?? null, true);
      priorFields[`${prefix}ownership_after_pct`] = annotationNumber(row?.input.event.ownership_after_pct ?? null, true);
      priorFields[`${prefix}ownership_delta_pp`] = annotationNumber(row?.input.event.ownership_delta_pp ?? null, true);
      priorFields[`${prefix}source_title`] = facts?.source_title ?? null;
      priorFields[`${prefix}source_body`] = facts?.source_body ?? null;
    }
    return { input_id: inputId, source_timestamp: event.source_timestamp, timestamp_precision: timestampPrecision,
      symbol: event.symbol, holder: event.holder_name, transaction_type: source.transaction_type,
      source_title: source.source_title, source_body: source.source_body,
      ownership_before_pct: annotationNumber(event.ownership_before_pct, true),
      ownership_after_pct: annotationNumber(event.ownership_after_pct, true),
      ownership_delta_pp: annotationNumber(event.ownership_delta_pp, true),
      holding_before: annotationNumber(event.holding_before), holding_after: annotationNumber(event.holding_after),
      shares_transacted: annotationNumber(event.shares_transacted), transaction_value_idr: annotationNumber(event.transaction_value_idr),
      source_url: event.source_url, ...priorFields };
  });
}

export function reviewerTemplateRows(inputs: Input[]) {
  return factualAnnotationRows(inputs).map(row => ({ ...row, reviewer_1_label: '', reviewer_2_label: '', reviewer_3_label: '' }));
}

function label(value: string, allowBlank = false): 0 | 1 | 2 | null {
  if (allowBlank && value === '') return null;
  if (!['0', '1', '2'].includes(value)) throw Error('INVALID_ANNOTATION_LABEL');
  return Number(value) as 0 | 1 | 2;
}
export function ingestAnnotations(text: string): AnnotationReview[] {
  return parseCsv(text).map(row => ({ input_id: row.input_id!,
    reviewer_1: label(row.reviewer_1_label ?? '', true), reviewer_2: label(row.reviewer_2_label ?? '', true), reviewer_3: label(row.reviewer_3_label ?? '', true) }));
}

export function evaluateAnnotations(rows: Evidence[], reviews: AnnotationReview[], system: System = 'B3C') {
  const predictions = new Map(rows.filter(r => r.system === system).map(r => [r.input_id, r]));
  const reviewers = ['reviewer_1', 'reviewer_2', 'reviewer_3'] as const;
  const metrics = reviewers.map(reviewer => {
    const labeled = reviews.flatMap(review => { const value = review[reviewer]; const prediction = predictions.get(review.input_id); return value === null || !prediction ? [] : [{ value, interrupt: prediction.interrupt, duplicate: prediction.duplicate_interruption }]; });
    const immediate = labeled.filter(row => row.value === 2), alerted = labeled.filter(row => row.interrupt);
    const urgencyWeight = (value: 0 | 1 | 2) => value / 2;
    const weightedTotal = labeled.reduce((sum, row) => sum + urgencyWeight(row.value), 0);
    return { reviewer, labeled_events: labeled.length, interruptions: alerted.length,
      duplicate_episode_alerts: alerted.filter(row => row.duplicate).length,
      precision: alerted.length ? Number((alerted.filter(row => row.value === 2).length / alerted.length).toFixed(6)) : IE,
      recall_class_2: immediate.length ? Number((immediate.filter(row => row.interrupt).length / immediate.length).toFixed(6)) : IE,
      weighted_recall_class_2: weightedTotal ? Number((labeled.filter(row => row.interrupt).reduce((sum, row) => sum + urgencyWeight(row.value), 0) / weightedTotal).toFixed(6)) : IE,
    };
  });
  const agreements = reviewers.slice(0, 2).flatMap(a => reviewers.slice(reviewers.indexOf(a) + 1).map(b => {
    const paired = reviews.flatMap(row => row[a] === null || row[b] === null ? [] : [[row[a]!, row[b]!] as const]);
    const observed = paired.length ? paired.filter(([left, right]) => left === right).length / paired.length : 0;
    const marginals = [0, 1, 2].map(value => paired.filter(([left]) => left === value).length / (paired.length || 1) * paired.filter(([, right]) => right === value).length / (paired.length || 1)).reduce((sum, value) => sum + value, 0);
    return { reviewers: `${a}-${b}`, paired_events: paired.length, cohen_kappa: paired.length && marginals < 1 ? Number(((observed - marginals) / (1 - marginals)).toFixed(6)) : IE };
  }));
  return { system, metrics, inter_rater_agreement: agreements };
}

export function summarize(rows: Evidence[]) {
  const count = (f: (r: Evidence) => boolean) => rows.filter(f).length;
  const n = rows.length, alerts = count(r => r.interrupt);
  const duplicates = count(r => r.duplicate_interruption);
  const opportunities = count(r => r.small_move_opportunity);
  const boundaries = count(r => r.crossing_5pct !== null);
  const number = (v: number) => Number(v.toFixed(6));
  return {
    events_evaluated: n, human_interruptions: alerts,
    interruption_reduction_vs_alert_all: n ? number(1 - alerts / n) : IE,
    duplicate_interruptions: duplicates, duplicate_interruption_rate: alerts ? number(duplicates / alerts) : IE,
    attention_compression_ratio: alerts ? number(n / alerts) : IE,
    state_escalations: count(r => r.escalation),
    repeated_small_move_opportunities: opportunities,
    repeated_small_move_escalations_recovered: opportunities ? count(r => r.small_move_opportunity && r.interrupt) : IE,
    regulatory_5pct_crossing_opportunities: boundaries,
    regulatory_5pct_crossings_captured: boundaries ? count(r => r.crossing_5pct !== null && r.interrupt) : IE,
    explainability_coverage: alerts ? number(count(r => r.interrupt && r.explainable) / alerts) : IE,
    decision_explanation_coverage: n ? number(count(r => r.reasons.length > 0) / n) : IE,
    investment_significance_recall: IE, human_attention_value: IE, market_outcomes: IE,
  };
}

// RFC 4180 quoting, including multiline fields; reject malformed input instead of silently shifting columns.
export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, '');
  const records: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
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
  if (quoted) throw Error('UNTERMINATED_CSV_QUOTE');
  if (row.length || field || closed) records.push([...row, field]);
  const header = records.shift();
  if (!header || new Set(header).size !== header.length) throw Error('INVALID_CSV_HEADER');
  return records.map(values => {
    if (values.length !== header.length) throw Error('INVALID_CSV_WIDTH');
    return Object.fromEntries(header.map((name, i) => [name, values[i]!]));
  });
}
export function csv(rows: object[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]!);
  const escape = (v: unknown) => `"${(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')).replaceAll('"', '""')}"`;
  return [keys.map(escape).join(','), ...rows.map(row => keys.map(k => escape((row as Record<string, unknown>)[k])).join(','))].join('\n') + '\n';
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const read = (path: string) => readFileSync(path, 'utf8');
export function loadDatasets() {
  const root = 'research/attention-benchmark';
  const snapshotPath = `${root}/inputs/sectors-persisted.json`;
  const snapshot = JSON.parse(read(snapshotPath));
  if (snapshot.provenance !== 'sectors_persisted' || snapshot.count !== snapshot.filings.length) throw Error('INVALID_SNAPSHOT');
  const persisted: Input[] = snapshot.filings.map((row: { raw_payload_json: unknown; fingerprint: string; id: string; created_at: string }) => {
    const event = normalizeFiling(row.raw_payload_json);
    if (event.fingerprint !== row.fingerprint) throw Error('SNAPSHOT_FINGERPRINT_MISMATCH');
    timestampMs(row.created_at);
    return { event, provenance: 'sectors_persisted', inputId: row.id, persistedAt: row.created_at, timestampPrecision: 'second' };
  });
  const proxyPath = 'historical_proxy_ownership_events_2026.csv';
  const proxy = parseCsv(read(proxyPath)).map((row, i): Input => {
    const n = (value: string | undefined) => value?.trim() ? z.number().finite().parse(Number(value)) : null;
    const raw = filingSchema.parse({ symbol: row.symbol, timestamp: `${row.event_date}T00:00:00`, holder_name: row.actor,
      transaction_type: row.direction, share_percentage_before: n(row.before_pct), share_percentage_after: n(row.after_pct),
      transaction_value: n(row.transaction_value_idr), source: row.source_url, holder_type: row.holder_type_proxy });
    const before = raw.share_percentage_before ?? null, after = raw.share_percentage_after ?? null;
    // No fake share counts just to satisfy production identity validation; proxy identity is explicitly separate.
    const event: OwnershipEvent = {
      fingerprint: `proxy:${sha256(JSON.stringify(row))}`, symbol: normalizeSymbol(raw.symbol), source_url: raw.source ?? null,
      source_timestamp: raw.timestamp, source_date: row.event_date!, holder_name: raw.holder_name ?? null,
      normalized_holder_name: normalizeHolder(raw.holder_name), holder_type: raw.holder_type ?? null,
      transaction_type: raw.transaction_type ?? null, holding_before: null, holding_after: null, shares_transacted: null,
      ownership_before_pct: before, ownership_after_pct: after, ownership_delta_pp: before !== null && after !== null ? Number((after - before).toFixed(4)) : null,
      reported_ownership_change_pp: n(row.delta_pp), transaction_value_idr: raw.transaction_value ?? null, raw_payload_json: raw,
    };
    return { event, provenance: 'publication_proxy', inputId: `${proxyPath}:${i + 2}`, persistedAt: null, timestampPrecision: 'day' };
  });
  const docPath = 'fixtures/filings.documented.json';
  const documented: Input[] = JSON.parse(read(docPath)).results.map((raw: unknown, i: number) => ({
    event: normalizeFiling(raw), provenance: 'documentation_example', inputId: `${docPath}:${i}`, persistedAt: null, timestampPrecision: 'second',
  }));
  return { datasets: [persisted, proxy, documented], snapshot,
    sourceHashes: Object.fromEntries([snapshotPath, proxyPath, docPath, 'lib/materiality/engine.ts', 'lib/materiality/holder-history.ts', 'lib/materiality/features.ts'].map(p => [p, sha256(read(p))])) };
}

export function run() {
  const config = process.argv[2] ? configSchema.parse(JSON.parse(read(process.argv[2]))) : defaults;
  const { datasets, snapshot, sourceHashes } = loadDatasets();
  const variants = [{ id: 'default', config }];
  for (const watchPp of [0.1, 0.25, 0.5]) for (const materialPp of [0.5, 1, 2]) for (const structuralPp of [2.5, 5, 10]) {
    if (watchPp >= materialPp || (watchPp === config.watchPp && materialPp === config.materialPp && structuralPp === config.structuralPp)) continue;
    variants.push({ id: `magnitude_${watchPp}_${materialPp}_${structuralPp}`, config: { ...config, watchPp, materialPp, structuralPp } });
  }
  variants.push({ id: 'b3_push_from_material', config: { ...config, interruptFrom: 'MATERIAL' } },
    { id: 'regulatory_disabled', config: { ...config, regulatory: { ...config.regulatory, enabled: false } } },
    ...[7, 90].map(episodeGapDays => ({ id: `episode_gap_${episodeGapDays}`, config: { ...config, episodeGapDays } })));
  const evidence: Evidence[] = [], sensitivityEvidence: Evidence[] = [];
  const tables = [], sensitivity = [], counts = [];
  for (const data of datasets) {
    const dataset = data[0]!.provenance;
    const clocks: Clock[] = dataset === 'sectors_persisted' ? ['first_persisted', 'source_time_assumption'] : ['source_time_assumption'];
    for (const clock of clocks) for (const variant of variants) {
      const rows = replay(data, variant.config, clock, variant.id);
      if (variant.id === 'default') evidence.push(...rows);
      else sensitivityEvidence.push(...rows.filter(r => r.system === 'B1' || r.system === 'B3' || r.system === 'B3C'));
      for (const system of systems) {
        const result = { dataset, clock, config: variant.id, system, ...summarize(rows.filter(r => r.system === system)) };
        if (variant.id === 'default') tables.push(result);
        else if (system === 'B1' || system === 'B3' || system === 'B3C') sensitivity.push(result);
      }
      if (variant.id === 'default') {
        const events = rows.filter(r => r.system === 'B0');
        counts.push({ dataset, clock, input_rows: data.length, unique_events: events.length,
          holder_company_pairs: new Set(data.map(i => JSON.stringify([i.event.symbol, i.event.normalized_holder_name]))).size,
          episodes: new Set(events.map(r => r.episode_id)).size,
          repeated_episodes: new Set(events.filter(r => r.episode_count > 1).map(r => r.episode_id)).size,
          source_start: [...data].sort((a, b) => timestampMs(a.event.source_timestamp) - timestampMs(b.event.source_timestamp))[0]!.event.source_timestamp,
          source_end: [...data].sort((a, b) => timestampMs(b.event.source_timestamp) - timestampMs(a.event.source_timestamp))[0]!.event.source_timestamp,
          missing_before_after: events.filter(r => r.before_pct === null || r.after_pct === null).length,
          missing_share_relative_change: events.filter(r => r.relative_position_change === null).length,
          archived_daily_observations: 0,
          direction_conflicts: events.filter(r => r.data_quality_flags.includes('SOURCE_DIRECTION_CONTRADICTS_PERCENTAGES')).length,
          repeated_small_opportunities: events.filter(r => r.small_move_opportunity).length,
          crossing_5pct_opportunities: events.filter(r => r.crossing_5pct !== null).length,
        });
      }
    }
  }
  const out = 'research/attention-benchmark/results'; mkdirSync(out, { recursive: true });
  const results = {
    engine_version: ENGINE_VERSION, source_hashes: sourceHashes, snapshot_captured_at: snapshot.captured_at,
    no_labels_or_market_outcomes: true, configs: variants, datasets: counts, benchmark: tables, sensitivity,
    annotation: { factual_file: 'human-annotation.csv', reviewer_template: 'human-annotations-template.csv', labels_present: false,
      target: '0=no immediate interruption, 1=review later, 2=immediate attention' },
    conservative_method: { system: 'B3C', watch_is_machine_only: true,
      interrupt_transitions: ['SILENT->MATERIAL', 'SILENT->STRUCTURAL', 'WATCH->MATERIAL', 'WATCH->STRUCTURAL', 'MATERIAL->STRUCTURAL'],
      repeated_same_state_interrupts: false, regulatory_crossing_override: false,
      episode_reset_rules: ['FIRST_OBSERVED', 'AMBIGUOUS_PRIOR_TIMESTAMP', 'GAP', 'DIRECTION', 'PRIOR_EXIT', 'DISCONTINUITY'] },
    limitations: ['Source-time replay assumes payload availability at its source timestamp; first-persisted replay uses observed local availability.',
      'Partial history, no payload revision history and no as-of daily liquidity observations.',
      'Regulatory boundary flags are not investment labels or a complete legal reporting engine.',
      'Synthetic checks are tests only and are never included in benchmark tables.'],
  };
  const persistedRows = evidence.filter(row => row.dataset === 'sectors_persisted' && row.clock === 'first_persisted' && row.config === 'default');
  const byEvent = (system: System) => new Map(persistedRows.filter(row => row.system === system).map(row => [row.event_id, row]));
  const b3c = byEvent('B3C');
  (results as typeof results & { conservative_comparison?: unknown }).conservative_comparison = {
    b3c_worse_than_b1: persistedRows.filter(row => row.system === 'B1' && row.interrupt && !b3c.get(row.event_id)?.interrupt).map(row => row.event_id),
    b3c_worse_than_b3: persistedRows.filter(row => row.system === 'B3' && row.interrupt && !b3c.get(row.event_id)?.interrupt).map(row => row.event_id),
    b3c_better_than_b1: persistedRows.filter(row => row.system === 'B1' && !row.interrupt && b3c.get(row.event_id)?.interrupt).map(row => row.event_id),
    b3c_better_than_b3: persistedRows.filter(row => row.system === 'B3' && !row.interrupt && b3c.get(row.event_id)?.interrupt).map(row => row.event_id),
    note: 'These are empirical decision differences, not human-label errors; labels are intentionally absent.',
  };
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2) + '\n');
  for (const [name, rows] of Object.entries({ benchmark: tables, sensitivity, datasets: counts, events: evidence })) writeFileSync(`${out}/${name}.csv`, csv(rows));
  writeFileSync(`${out}/sensitivity-events.csv.gz`, gzipSync(csv(sensitivityEvidence)));
  const persisted = datasets.find(data => data[0]?.provenance === 'sectors_persisted') ?? [];
  writeFileSync(`${out}/human-annotation.csv`, csv(factualAnnotationRows(persisted)));
  writeFileSync(`${out}/human-annotations-template.csv`, csv(reviewerTemplateRows(persisted)));
  writeFileSync(`${out}/METHODOLOGY.md`, [
    '# Attention benchmark methodology', '',
    'This branch preserves the existing B1, B2, and B3 replay results. B3C (B3 Conservative Attention-State Transition) is an offline benchmark-only variant; it does not change production behavior.', '',
    '## B3C rule', '',
    `WATCH is machine-only memory and never interrupts. B3C interrupts only on these deterministic transitions: SILENT to MATERIAL or STRUCTURAL, WATCH to MATERIAL or STRUCTURAL, and MATERIAL to STRUCTURAL. It does not interrupt repeatedly while the state is unchanged. A regulatory 5% crossing is measured but cannot bypass the state-transition rule. Episodes reset on first observation, ambiguous same-source timestamps, a gap over ${defaults.episodeGapDays} days, direction change or an others transaction, prior exit, or discontinuous ownership.`, '',
    '## Sensitivity', '',
    'The existing magnitude, episode-gap, regulatory, and push-origin variants are retained. They are descriptive sensitivity checks, not threshold tuning against B1. No threshold was selected because it minimized or beat B1 interruptions.', '',
    '## Human annotation', '',
    'human-annotation.csv contains 117 persisted filings and only contemporaneously available filing facts. human-annotations-template.csv adds blank columns for three independent reviewers. No baseline decisions, engine states, reasons, episode identifiers, or future information are included. Labels must be entered later as 0 (no immediate interruption), 1 (review later), or 2 (immediate attention).', '',
    'ingestAnnotations() validates reviewer labels; evaluateAnnotations() reports precision, class-2 recall, urgency-weighted recall, interruptions, duplicate episode alerts, and pairwise Cohen kappa. Until labels are supplied, all human-performance metrics remain unavailable.', '',
    '## Weaknesses', '',
    'The persisted snapshot is small and selected by availability, holder history is partial, payload revisions are unavailable, and archived daily liquidity observations are absent. Source-time replay assumes availability at source time; first-persisted replay is the stricter contemporaneous clock. There are no human labels, market outcomes, or adjudicated ground truth, so the results support comparison of decision behavior, not claims of investment significance.',
  ].join('\n') + '\n');
  console.log(JSON.stringify({ datasets: counts, benchmark: tables, sensitivity_configurations: variants.length, evidence_rows: evidence.length, sensitivity_evidence_rows: sensitivityEvidence.length }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
