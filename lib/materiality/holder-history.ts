import 'server-only';
import type { PriorHolderEvent, MaterialityState } from './types.ts';

export interface HolderHistoryInput {
  currentTimestamp: string;
  currentTransactionType: 'buy' | 'sell' | 'others';
  currentOwnershipDeltaPp: number | null;
  priorEvents: PriorHolderEvent[];
}

export interface HolderHistoryResult {
  repeatCount30d: number;
  repeatCount90d: number;
  repeatCount180d: number;
  cumulativeSameDirectionDeltaPp180d: number;
  previousHolderEventTimestamp: string | null;
  previousMaterialityStateForHolder: MaterialityState | null;
}

export function computeHolderHistory(input: HolderHistoryInput): HolderHistoryResult {
  const { currentTimestamp, currentTransactionType, currentOwnershipDeltaPp, priorEvents } = input;
  
  const currentDateMs = Date.parse(currentTimestamp.slice(0, 10));
  
  // Source timestamps are locally formatted by Sectors; compare the full source string.
  const sorted = priorEvents.filter(event => event.source_timestamp < currentTimestamp)
    .sort((a, b) => b.source_timestamp.localeCompare(a.source_timestamp));

  const mostRecent = sorted[0];
  const previousHolderEventTimestamp = mostRecent?.source_timestamp ?? null;
  const previousMaterialityStateForHolder = mostRecent?.materiality_state ?? null;

  // Filter only same-direction events that occurred strictly BEFORE or on the current date within 180 days
  let count30d = 1; // Current event counts as 1st occurrence
  let count90d = 1;
  let count180d = 1;
  let cumulativeDelta180d = Math.abs(currentOwnershipDeltaPp ?? 0);

  // If current transaction is 'others', do not accumulate same-direction streaks
  if (currentTransactionType === 'buy' || currentTransactionType === 'sell') {
    for (const event of sorted) {
      if (event.transaction_type !== currentTransactionType) {
        // Different direction: do not count in same-direction streak
        continue;
      }

      const eventDateMs = Date.parse(event.source_timestamp.slice(0, 10));
      const diffDays = (currentDateMs - eventDateMs) / (1000 * 60 * 60 * 24);

      // Full-timestamp filtering above also excludes later filings on the same day.
      if (diffDays >= 0 && diffDays <= 180) {
        count180d += 1;
        if (event.ownership_delta_pp !== null) {
          cumulativeDelta180d += Math.abs(event.ownership_delta_pp);
        }

        if (diffDays <= 90) {
          count90d += 1;
        }
        if (diffDays <= 30) {
          count30d += 1;
        }
      }
    }
  }

  return {
    repeatCount30d: count30d,
    repeatCount90d: count90d,
    repeatCount180d: count180d,
    cumulativeSameDirectionDeltaPp180d: Number(cumulativeDelta180d.toFixed(4)),
    previousHolderEventTimestamp,
    previousMaterialityStateForHolder,
  };
}
