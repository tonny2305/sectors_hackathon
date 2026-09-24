import 'server-only';
import type {
  DecisionReasonCode,
  EvaluatedFeatures,
  MaterialityDimension,
  MaterialityEvaluation,
  MaterialityState,
  SuppressionReasonCode,
} from './types.ts';
import {
  computeDailyLiquidityProxy,
  computeNewPosition,
  computeNearExit,
  computeOwnershipDelta,
  computeRelativePositionChange,
  computeTransactionToLiquidityProxy,
} from './features.ts';
import { computeHolderHistory, type HolderHistoryInput } from './holder-history.ts';
import type { DailyRecord } from '../sectors/schemas.ts';
import type { OwnershipEvent } from '../sectors/normalize.ts';

export const ENGINE_VERSION = 'v2.0.0-materiality-sentinel';

export interface EvaluateEventInput {
  event: OwnershipEvent;
  priorHolderEvents?: HolderHistoryInput['priorEvents'];
  dailyRecords?: DailyRecord[];
  enrichmentSkipped?: boolean;
}

export function evaluateEvent(input: EvaluateEventInput): MaterialityEvaluation {
  const { event, priorHolderEvents = [], dailyRecords = [], enrichmentSkipped = false } = input;

  // 1. Base Feature Calculation
  const { deltaPp, absDeltaPp } = computeOwnershipDelta(
    event.ownership_before_pct,
    event.ownership_after_pct,
  );

  const relativePositionChange = computeRelativePositionChange(
    event.shares_transacted,
    event.holding_before,
  );

  const newPosition = computeNewPosition(
    event.holding_before,
    event.holding_after,
    event.ownership_before_pct,
    event.ownership_after_pct,
  );

  const nearExit = computeNearExit(
    event.holding_before,
    event.holding_after,
    event.ownership_before_pct,
    event.ownership_after_pct,
  );

  // 2. Holder History & Repetition
  const history = computeHolderHistory({
    currentTimestamp: event.source_timestamp,
    currentTransactionType: (event.transaction_type as 'buy' | 'sell' | 'others') || 'others',
    currentOwnershipDeltaPp: deltaPp,
    priorEvents: priorHolderEvents,
  });

  // 3. Liquidity Context
  let medianLiquidity: number | null = null;
  let contextUnavailable = true;

  if (dailyRecords.length > 0) {
    const liquidityRes = computeDailyLiquidityProxy(dailyRecords);
    medianLiquidity = liquidityRes.medianDailyLiquidityProxy20d;
    contextUnavailable = liquidityRes.contextUnavailable;
  }

  const transactionToLiquidity = computeTransactionToLiquidityProxy(
    event.transaction_value_idr,
    medianLiquidity,
  );

  // 4. Dimension Evaluation
  const structuralReasons: DecisionReasonCode[] = [];
  const materialReasons: DecisionReasonCode[] = [];
  const watchReasons: DecisionReasonCode[] = [];
  const activeWatchDimensions = new Set<MaterialityDimension>();

  // Dimension 1: Stake Move Magnitude
  if (absDeltaPp !== null) {
    if (absDeltaPp >= 5.0) {
      structuralReasons.push('STRUCTURAL_STAKE_SHIFT_GE_5PP');
    } else if (absDeltaPp >= 1.0) {
      materialReasons.push('LARGE_STAKE_MOVE_GE_1PP');
    } else if (absDeltaPp >= 0.25) {
      watchReasons.push('MODERATE_STAKE_MOVE_GE_0_25PP');
      activeWatchDimensions.add('STAKE_MAGNITUDE');
    }
  }

  // Dimension 2: Relative Position Change
  if (relativePositionChange !== null) {
    if (relativePositionChange >= 0.10) {
      materialReasons.push('RELATIVE_POSITION_CHANGE_GE_10PCT');
    } else if (relativePositionChange >= 0.05) {
      watchReasons.push('RELATIVE_POSITION_CHANGE_GE_5PCT');
      activeWatchDimensions.add('RELATIVE_CHANGE');
    }
  }

  // Dimension 3: Position Lifecycle
  if (nearExit) {
    structuralReasons.push('NEAR_EXIT_POSITION');
  } else if (newPosition && (event.ownership_after_pct !== null ? event.ownership_after_pct > 0 : true)) {
    materialReasons.push('NEW_NOTABLE_POSITION');
  }

  // Dimension 4: Repetition / Holder Memory
  if (history.repeatCount180d >= 3) {
    materialReasons.push('REPEATED_SAME_DIRECTION_GE_3');
  } else if (history.repeatCount180d >= 2) {
    watchReasons.push('REPEATED_SAME_DIRECTION_GE_2');
    activeWatchDimensions.add('HOLDER_REPETITION');
  }

  // Dimension 5: Liquidity Impact
  if (transactionToLiquidity !== null) {
    if (transactionToLiquidity >= 0.50) {
      materialReasons.push('TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY');
    } else if (transactionToLiquidity >= 0.20) {
      watchReasons.push('TRANSACTION_VALUE_GE_20PCT_MEDIAN_DAILY_PROXY');
      activeWatchDimensions.add('LIQUIDITY_IMPACT');
    }
  }

  // 5. Final State Classification
  let state: MaterialityState = 'SILENT';
  const finalReasons: DecisionReasonCode[] = [];
  const suppressionReasons: SuppressionReasonCode[] = [];
  let escalatedFromPriorState = false;

  if (structuralReasons.length > 0) {
    state = 'STRUCTURAL';
    finalReasons.push(...structuralReasons, ...materialReasons, ...watchReasons);
  } else if (
    materialReasons.length > 0 ||
    activeWatchDimensions.size >= 2
  ) {
    state = 'MATERIAL';
    if (materialReasons.length > 0) {
      finalReasons.push(...materialReasons);
    }
    // Include watch reasons that contributed
    for (const wr of watchReasons) {
      if (!finalReasons.includes(wr)) {
        finalReasons.push(wr);
      }
    }

    // Check if escalated from history
    if (
      history.repeatCount180d >= 3 ||
      (activeWatchDimensions.size >= 2 && activeWatchDimensions.has('HOLDER_REPETITION'))
    ) {
      if (!finalReasons.includes('ESCALATED_BY_HOLDER_HISTORY')) {
        finalReasons.push('ESCALATED_BY_HOLDER_HISTORY');
      }
      escalatedFromPriorState = true;
    }
  } else if (activeWatchDimensions.size === 1) {
    state = 'WATCH';
    finalReasons.push(...watchReasons);
  } else {
    state = 'SILENT';
  }

  // 6. Suppression Reasons (for Explainable Silence)
  if (state === 'SILENT' || state === 'WATCH') {
    suppressionReasons.push('BELOW_PUSH_THRESHOLD');

    if (absDeltaPp === null || absDeltaPp < 0.25) {
      suppressionReasons.push('SMALL_ABSOLUTE_CHANGE');
    }
    if (history.repeatCount180d < 2) {
      suppressionReasons.push('NO_REPEAT_PATTERN');
    }
    if (!newPosition && !nearExit) {
      suppressionReasons.push('NO_NEW_OR_EXIT_POSITION');
    }
    if (transactionToLiquidity === null || transactionToLiquidity < 0.20) {
      suppressionReasons.push('NO_MATERIAL_LIQUIDITY_CONTEXT');
    }
    if (history.repeatCount180d < 2 && history.previousHolderEventTimestamp === null) {
      suppressionReasons.push('INSUFFICIENT_CONTEXT_FOR_ESCALATION');
    }
  }

  const features: EvaluatedFeatures = {
    ownershipDeltaPp: deltaPp,
    absOwnershipDeltaPp: absDeltaPp,
    relativePositionChange,
    newPosition,
    nearExit,
    repeatCount30d: history.repeatCount30d,
    repeatCount90d: history.repeatCount90d,
    repeatCount180d: history.repeatCount180d,
    cumulativeSameDirectionDeltaPp180d: history.cumulativeSameDirectionDeltaPp180d,
    previousHolderEventTimestamp: history.previousHolderEventTimestamp,
    previousMaterialityStateForHolder: history.previousMaterialityStateForHolder,
    escalatedFromPriorState,
    medianDailyLiquidityProxy20d: medianLiquidity,
    transactionToLiquidityProxy: transactionToLiquidity,
    contextUnavailable,
    enrichmentSkipped,
  };

  return {
    materialityState: state,
    reasonCodes: finalReasons,
    suppressionReasonCodes: suppressionReasons,
    features,
    engineVersion: ENGINE_VERSION,
  };
}
