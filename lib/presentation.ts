import type { MaterialityState } from './materiality/types.ts';

// Persisted fields only. These view types do not derive engine decisions.
export interface FilingView {
  id: string;
  symbol: string;
  holder_name: string | null;
  holder_type: string | null;
  source_date: string;
  source_timestamp: string;
  source_url: string | null;
  fingerprint: string;
  transaction_type: string | null;
  ownership_before_pct: number | null;
  ownership_after_pct: number | null;
  ownership_delta_pp: number | null;
  shares_transacted: number | null;
  transaction_value_idr: number | null;
  holding_before: number | null;
  holding_after: number | null;
}

export interface EvaluationView {
  id: string;
  filing_id: string;
  filings: FilingView | null;
  materiality_state: MaterialityState;
  reason_codes_json: string[];
  suppression_reason_codes_json: string[];
  created_at: string;
}

export interface RunView {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger_type: string;
  status: string;
  records_scanned: number;
  new_events: number;
  eligible_new_filings: number | null;
  suppressed_from_push_count: number | null;
  alerts_sent: number | null;
  silent_count: number | null;
  watch_count: number | null;
  material_count: number | null;
  structural_count: number | null;
  interruption_reduction: number | null;
  duplicate_alert_rate: number | null;
  explainability_coverage: number | null;
  pages_fetched: number;
  estimated_credits: number;
  api_latency_ms_total: number;
}

export function number(value: number | string | null | undefined): string {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Not recorded';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 20 }).format(Number(value));
}

export function percent(value: number | null | undefined): string {
  return value == null ? 'Not recorded' : `${number(value)}%`;
}

export function delta(value: number | null | undefined): string {
  return value == null ? 'Not recorded' : `${value > 0 ? '+' : ''}${number(Number(value.toPrecision(12)))} pp`;
}

export function rate(value: number | null | undefined): string {
  return value == null ? 'Not measured' : `${number(Number((value * 100).toPrecision(12)))}%`;
}

export function timestamp(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+07:00`;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(normalized)) + ' WIB';
}

const reasons: Record<string, string> = {
  STRUCTURAL_STAKE_SHIFT_GE_5PP: 'Ownership moved by at least 5 percentage points.',
  NEAR_EXIT_POSITION: 'The holder is close to exiting the position.',
  LARGE_STAKE_MOVE_GE_1PP: 'Ownership moved by at least 1 percentage point.',
  RELATIVE_POSITION_CHANGE_GE_10PCT: 'The position changed by at least 10% relative to its previous size.',
  NEW_NOTABLE_POSITION: 'A new notable ownership position was recorded.',
  REPEATED_SAME_DIRECTION_GE_3: 'At least three same-direction changes were recorded.',
  TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY: 'Transaction value reached at least 50% of the median daily liquidity proxy.',
  ESCALATED_BY_HOLDER_HISTORY: 'Escalated after repeated same-direction changes.',
  MODERATE_STAKE_MOVE_GE_0_25PP: 'Ownership moved by at least 0.25 percentage points.',
  RELATIVE_POSITION_CHANGE_GE_5PCT: 'The position changed by at least 5% relative to its previous size.',
  REPEATED_SAME_DIRECTION_GE_2: 'At least two same-direction changes were recorded.',
  TRANSACTION_VALUE_GE_20PCT_MEDIAN_DAILY_PROXY: 'Transaction value reached at least 20% of the median daily liquidity proxy.',
  SMALL_ABSOLUTE_CHANGE: 'The absolute ownership change was small.',
  NO_REPEAT_PATTERN: 'No qualifying repeated pattern was found.',
  NO_NEW_OR_EXIT_POSITION: 'No new position or near exit was identified.',
  NO_MATERIAL_LIQUIDITY_CONTEXT: 'No material liquidity context was established.',
  BELOW_PUSH_THRESHOLD: 'The decision stayed below the interruption threshold.',
  INSUFFICIENT_CONTEXT_FOR_ESCALATION: 'There was not enough context to justify escalation.',
};

export function reasonText(code: string): string {
  return reasons[code] ?? code;
}
