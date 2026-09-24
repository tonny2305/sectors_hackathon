import 'server-only';
import type { DailyRecord } from '../sectors/schemas.ts';

export interface ComputeBaseFeaturesInput {
  holding_before: number | null;
  holding_after: number | null;
  shares_transacted: number | null;
  ownership_before_pct: number | null;
  ownership_after_pct: number | null;
  ownership_delta_pp?: number | null;
  transaction_value_idr: number | null;
}

export function computeOwnershipDelta(before: number | null, after: number | null): {
  deltaPp: number | null;
  absDeltaPp: number | null;
} {
  if (before === null || after === null || typeof before !== 'number' || typeof after !== 'number') {
    return { deltaPp: null, absDeltaPp: null };
  }
  const delta = Number((after - before).toFixed(4));
  return {
    deltaPp: delta,
    absDeltaPp: Math.abs(delta),
  };
}

export function computeRelativePositionChange(
  sharesTransacted: number | null,
  holdingBefore: number | null,
): number | null {
  if (sharesTransacted !== null && holdingBefore !== null && holdingBefore > 0) {
    return Number((Math.abs(sharesTransacted) / holdingBefore).toFixed(6));
  }
  return null;
}

export function computeNewPosition(
  holdingBefore: number | null,
  holdingAfter: number | null,
  ownershipBeforePct: number | null,
  ownershipAfterPct: number | null,
): boolean {
  // before must be explicitly 0 (not null/unknown) and after must be > 0
  const isExplicitZeroBefore =
    holdingBefore === 0 ||
    (holdingBefore === null && ownershipBeforePct === 0);

  const isAfterPositive =
    (holdingAfter !== null && holdingAfter > 0) ||
    (ownershipAfterPct !== null && ownershipAfterPct > 0);

  if (holdingBefore !== null && holdingBefore > 0) return false;
  if (ownershipBeforePct !== null && ownershipBeforePct > 0) return false;

  return isExplicitZeroBefore && isAfterPositive;
}

export function computeNearExit(
  holdingBefore: number | null,
  holdingAfter: number | null,
  ownershipBeforePct: number | null,
  ownershipAfterPct: number | null,
): boolean {
  if (holdingBefore !== null && holdingBefore > 0 && holdingAfter !== null && holdingAfter >= 0) {
    return holdingAfter / holdingBefore <= 0.20;
  }
  if (
    ownershipBeforePct !== null &&
    ownershipBeforePct > 0 &&
    ownershipAfterPct !== null &&
    ownershipAfterPct >= 0
  ) {
    return ownershipAfterPct / ownershipBeforePct <= 0.20;
  }
  return false;
}

export function computeDailyLiquidityProxy(dailyRecords: DailyRecord[]): {
  medianDailyLiquidityProxy20d: number | null;
  contextUnavailable: boolean;
} {
  const validProxies: number[] = [];
  for (const record of dailyRecords) {
    if (
      record.close !== null &&
      record.volume !== null &&
      typeof record.close === 'number' &&
      typeof record.volume === 'number' &&
      record.close > 0 &&
      record.volume >= 0
    ) {
      validProxies.push(record.close * record.volume);
    }
  }

  if (validProxies.length === 0) {
    return {
      medianDailyLiquidityProxy20d: null,
      contextUnavailable: true,
    };
  }

  // Take up to 20 most recent valid records
  const subset = validProxies.slice(0, 20).sort((a, b) => a - b);
  const mid = Math.floor(subset.length / 2);
  const median =
    subset.length % 2 !== 0
      ? subset[mid]!
      : (subset[mid - 1]! + subset[mid]!) / 2;

  return {
    medianDailyLiquidityProxy20d: Math.round(median),
    contextUnavailable: false,
  };
}

export function computeTransactionToLiquidityProxy(
  transactionValue: number | null,
  medianLiquidityProxy: number | null,
): number | null {
  if (
    transactionValue === null ||
    medianLiquidityProxy === null ||
    medianLiquidityProxy <= 0 ||
    transactionValue < 0
  ) {
    return null;
  }
  return Number((transactionValue / medianLiquidityProxy).toFixed(6));
}
