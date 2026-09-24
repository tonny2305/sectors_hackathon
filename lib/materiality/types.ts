export type MaterialityState = 'SILENT' | 'WATCH' | 'MATERIAL' | 'STRUCTURAL';

export type StructuralReasonCode =
  | 'STRUCTURAL_STAKE_SHIFT_GE_5PP'
  | 'NEAR_EXIT_POSITION';

export type MaterialReasonCode =
  | 'LARGE_STAKE_MOVE_GE_1PP'
  | 'RELATIVE_POSITION_CHANGE_GE_10PCT'
  | 'NEW_NOTABLE_POSITION'
  | 'REPEATED_SAME_DIRECTION_GE_3'
  | 'TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY'
  | 'ESCALATED_BY_HOLDER_HISTORY';

export type WatchReasonCode =
  | 'MODERATE_STAKE_MOVE_GE_0_25PP'
  | 'RELATIVE_POSITION_CHANGE_GE_5PCT'
  | 'REPEATED_SAME_DIRECTION_GE_2'
  | 'TRANSACTION_VALUE_GE_20PCT_MEDIAN_DAILY_PROXY';

export type SuppressionReasonCode =
  | 'SMALL_ABSOLUTE_CHANGE'
  | 'NO_REPEAT_PATTERN'
  | 'NO_NEW_OR_EXIT_POSITION'
  | 'NO_MATERIAL_LIQUIDITY_CONTEXT'
  | 'BELOW_PUSH_THRESHOLD'
  | 'INSUFFICIENT_CONTEXT_FOR_ESCALATION';

export type DecisionReasonCode = StructuralReasonCode | MaterialReasonCode | WatchReasonCode;

export type MaterialityDimension =
  | 'STAKE_MAGNITUDE'
  | 'RELATIVE_CHANGE'
  | 'POSITION_LIFECYCLE'
  | 'HOLDER_REPETITION'
  | 'LIQUIDITY_IMPACT';

export interface PriorHolderEvent {
  id: string;
  source_timestamp: string;
  source_date: string;
  transaction_type: 'buy' | 'sell' | 'others';
  ownership_delta_pp: number | null;
  materiality_state?: MaterialityState;
}

export interface EvaluatedFeatures {
  ownershipDeltaPp: number | null;
  absOwnershipDeltaPp: number | null;
  relativePositionChange: number | null;
  newPosition: boolean;
  nearExit: boolean;
  repeatCount30d: number;
  repeatCount90d: number;
  repeatCount180d: number;
  cumulativeSameDirectionDeltaPp180d: number;
  previousHolderEventTimestamp: string | null;
  previousMaterialityStateForHolder: MaterialityState | null;
  escalatedFromPriorState: boolean;
  medianDailyLiquidityProxy20d: number | null;
  transactionToLiquidityProxy: number | null;
  contextUnavailable: boolean;
  enrichmentSkipped: boolean;
}

export interface MaterialityEvaluation {
  materialityState: MaterialityState;
  reasonCodes: DecisionReasonCode[];
  suppressionReasonCodes: SuppressionReasonCode[];
  features: EvaluatedFeatures;
  engineVersion: string;
}

export interface AttentionMetrics {
  eligibleNewFilings: number;
  pushAlertsSent: number;
  interruptionReduction: number | null; // null if eligibleNewFilings === 0
  totalPushAlerts: number;
  duplicatePushAlerts: number;
  duplicateAlertRate: number | null; // null if totalPushAlerts === 0
  explainablePushAlerts: number;
  explainabilityCoverage: number | null; // null if totalPushAlerts === 0
  silentCount: number;
  watchCount: number;
  materialCount: number;
  structuralCount: number;
  suppressedCount: number;
}
