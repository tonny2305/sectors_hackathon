import 'server-only';
import type { AttentionMetrics, MaterialityEvaluation } from './types.ts';
import type { OwnershipEvent } from '../sectors/normalize.ts';

export function computeAttentionMetrics(input: {
  eligibleNewFilings: number;
  evaluations: Array<{
    event: OwnershipEvent;
    evaluation: MaterialityEvaluation;
    isDuplicatePush?: boolean;
  }>;
}): AttentionMetrics {
  const { eligibleNewFilings, evaluations } = input;

  let silentCount = 0;
  let watchCount = 0;
  let materialCount = 0;
  let structuralCount = 0;
  let duplicatePushes = 0;
  let explainablePushes = 0;

  for (const item of evaluations) {
    const { event, evaluation, isDuplicatePush } = item;
    const state = evaluation.materialityState;

    if (state === 'SILENT') silentCount++;
    else if (state === 'WATCH') watchCount++;
    else if (state === 'MATERIAL') materialCount++;
    else if (state === 'STRUCTURAL') structuralCount++;

    if (state === 'MATERIAL' || state === 'STRUCTURAL') {
      if (isDuplicatePush) {
        duplicatePushes++;
      }

      // Check explainability: provenance, timestamp, quantitative feature, deterministic reason code
      const hasProvenance = Boolean(event.source_url || event.source_timestamp);
      const hasTimestamp = Boolean(event.source_timestamp);
      const hasQuantitativeEvidence =
        evaluation.features.ownershipDeltaPp !== null ||
        evaluation.features.relativePositionChange !== null ||
        evaluation.features.repeatCount180d > 1 ||
        evaluation.features.transactionToLiquidityProxy !== null;
      const hasReasonCodes = evaluation.reasonCodes.length > 0;

      if (hasProvenance && hasTimestamp && hasQuantitativeEvidence && hasReasonCodes) {
        explainablePushes++;
      }
    }
  }

  const totalPushAlerts = materialCount + structuralCount;
  const uniquePushAlertsSent = totalPushAlerts - duplicatePushes;
  const suppressedCount = silentCount + watchCount;

  const interruptionReduction =
    eligibleNewFilings > 0
      ? Number((1 - uniquePushAlertsSent / eligibleNewFilings).toFixed(4))
      : null;

  const duplicateAlertRate =
    totalPushAlerts > 0
      ? Number((duplicatePushes / totalPushAlerts).toFixed(4))
      : null;

  const explainabilityCoverage =
    totalPushAlerts > 0
      ? Number((explainablePushes / totalPushAlerts).toFixed(4))
      : null;

  return {
    eligibleNewFilings,
    pushAlertsSent: uniquePushAlertsSent,
    interruptionReduction,
    totalPushAlerts,
    duplicatePushAlerts: duplicatePushes,
    duplicateAlertRate,
    explainablePushAlerts: explainablePushes,
    explainabilityCoverage,
    silentCount,
    watchCount,
    materialCount,
    structuralCount,
    suppressedCount,
  };
}
