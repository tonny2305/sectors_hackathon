import { describe, expect, it } from 'vitest';
import { computeAttentionMetrics } from '../lib/materiality/metrics.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import { evaluateEvent } from '../lib/materiality/engine.ts';

describe('Attention Intelligence Metrics (Section 19A & 23)', () => {
  it('20. Interruption reduction uses real eligible-new-filings denominator', () => {
    // 37 eligible events: 31 SILENT, 4 WATCH, 1 MATERIAL, 1 STRUCTURAL -> 2 pushes sent
    const evaluations = [];

    // 31 Silent
    for (let i = 0; i < 31; i++) {
      const event = normalizeFiling({
        symbol: 'BBCA',
        timestamp: '2026-09-24T10:00:00',
        holder_name: `Silent Holder ${i}`,
        transaction_type: 'buy',
        holding_before: 1000000,
        holding_after: 1000100,
        amount_transaction: 100,
        share_percentage_before: 10.0,
        share_percentage_after: 10.001,
        source: 'https://idx.co.id/filing/1',
      });
      evaluations.push({ event, evaluation: evaluateEvent({ event, enrichmentSkipped: true }) });
    }

    // 4 Watch
    for (let i = 0; i < 4; i++) {
      const event = normalizeFiling({
        symbol: 'BBCA',
        timestamp: '2026-09-24T10:00:00',
        holder_name: `Watch Holder ${i}`,
        transaction_type: 'buy',
        holding_before: 1000000,
        holding_after: 1030000,
        amount_transaction: 30000,
        share_percentage_before: 5.0,
        share_percentage_after: 5.30,
        source: 'https://idx.co.id/filing/1',
      });
      evaluations.push({ event, evaluation: evaluateEvent({ event, enrichmentSkipped: true }) });
    }

    // 1 Material
    const materialEvent = normalizeFiling({
      symbol: 'BBCA',
      timestamp: '2026-09-24T10:00:00',
      holder_name: 'Material Holder',
      transaction_type: 'buy',
      holding_before: 1000000,
      holding_after: 1200000,
      amount_transaction: 200000,
      share_percentage_before: 5.0,
      share_percentage_after: 6.0,
      source: 'https://idx.co.id/filing/1',
    });
    evaluations.push({ event: materialEvent, evaluation: evaluateEvent({ event: materialEvent, enrichmentSkipped: true }) });

    // 1 Structural
    const structuralEvent = normalizeFiling({
      symbol: 'BBCA',
      timestamp: '2026-09-24T10:00:00',
      holder_name: 'Structural Holder',
      transaction_type: 'buy',
      holding_before: 1000000,
      holding_after: 1600000,
      amount_transaction: 600000,
      share_percentage_before: 5.0,
      share_percentage_after: 10.5,
      source: 'https://idx.co.id/filing/1',
    });
    evaluations.push({ event: structuralEvent, evaluation: evaluateEvent({ event: structuralEvent, enrichmentSkipped: true }) });

    const metrics = computeAttentionMetrics({
      eligibleNewFilings: 37,
      evaluations: evaluations.map(item => ({ ...item,
        pushSent: ['MATERIAL', 'STRUCTURAL'].includes(item.evaluation.materialityState) })),
    });

    expect(metrics.eligibleNewFilings).toBe(37);
    expect(metrics.silentCount).toBe(31);
    expect(metrics.watchCount).toBe(4);
    expect(metrics.materialCount).toBe(1);
    expect(metrics.structuralCount).toBe(1);
    expect(metrics.pushAlertsSent).toBe(2);
    expect(metrics.suppressedCount).toBe(35);
    // 1 - (2 / 37) = 1 - 0.054054 = 0.9459 (94.6%)
    expect(metrics.interruptionReduction).toBeCloseTo(0.9459, 3);
  });

  it('21. Zero eligible filings does not divide by zero or display misleading percentage', () => {
    const metrics = computeAttentionMetrics({
      eligibleNewFilings: 0,
      evaluations: [],
    });

    expect(metrics.eligibleNewFilings).toBe(0);
    expect(metrics.pushAlertsSent).toBe(0);
    expect(metrics.interruptionReduction).toBeNull();
    expect(metrics.duplicateAlertRate).toBeNull();
    expect(metrics.explainabilityCoverage).toBeNull();
  });

  it('does not claim attention reduction when delivery is not configured', () => {
    const metrics = computeAttentionMetrics({ eligibleNewFilings: 2, evaluations: [], deliveryHealthy: false });
    expect(metrics.pushAlertsSent).toBe(0);
    expect(metrics.interruptionReduction).toBeNull();
    expect(metrics.duplicateAlertRate).toBeNull();
  });

  it('22. Duplicate alert rate counts duplicate push alerts, not duplicate API records', () => {
    const materialEvent = normalizeFiling({
      symbol: 'BBCA',
      timestamp: '2026-09-24T10:00:00',
      holder_name: 'Material Holder',
      transaction_type: 'buy',
      holding_before: 1000000,
      holding_after: 1200000,
      amount_transaction: 200000,
      share_percentage_before: 5.0,
      share_percentage_after: 6.0,
      source: 'https://idx.co.id/filing/1',
    });
    const eval1 = evaluateEvent({ event: materialEvent, enrichmentSkipped: true });

    // Clean execution: 0 duplicate pushes
    const metricsClean = computeAttentionMetrics({
      eligibleNewFilings: 1,
      evaluations: [{ event: materialEvent, evaluation: eval1, pushSent: true, isDuplicatePush: false }],
    });
    expect(metricsClean.duplicatePushAlerts).toBe(0);
    expect(metricsClean.duplicateAlertRate).toBe(0);

    // Scenario with 1 duplicate push simulated
    const metricsWithDup = computeAttentionMetrics({
      eligibleNewFilings: 1,
      evaluations: [
        { event: materialEvent, evaluation: eval1, pushSent: true, isDuplicatePush: false },
        { event: materialEvent, evaluation: eval1, pushSent: true, isDuplicatePush: true },
      ],
    });
    expect(metricsWithDup.duplicatePushAlerts).toBe(1);
    expect(metricsWithDup.duplicateAlertRate).toBe(0.5);
  });

  it('23. Explainability coverage requires provenance + timestamp + quantitative feature + deterministic reason code', () => {
    const materialEvent = normalizeFiling({
      symbol: 'BBCA',
      timestamp: '2026-09-24T10:00:00',
      holder_name: 'Material Holder',
      transaction_type: 'buy',
      holding_before: 1000000,
      holding_after: 1200000,
      amount_transaction: 200000,
      share_percentage_before: 5.0,
      share_percentage_after: 6.0,
      source: 'https://idx.co.id/filing/1',
    });
    const eval1 = evaluateEvent({ event: materialEvent, enrichmentSkipped: true });

    const metrics = computeAttentionMetrics({
      eligibleNewFilings: 1,
      evaluations: [{ event: materialEvent, evaluation: eval1, pushSent: true }],
    });

    expect(metrics.pushAlertsSent).toBe(1);
    expect(metrics.explainablePushAlerts).toBe(1);
    expect(metrics.explainabilityCoverage).toBe(1.0); // 100%
  });
});
