import { describe, expect, it } from 'vitest';
import { evaluateEvent, ENGINE_VERSION } from '../lib/materiality/engine.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import type { DailyRecord } from '../lib/sectors/schemas.ts';

function createMockFiling(overrides: Record<string, unknown> = {}) {
  return normalizeFiling({
    symbol: 'BBCA',
    timestamp: '2026-09-24T10:00:00',
    holder_name: 'Test Holder Corp',
    holder_type: 'institution',
    transaction_type: 'buy',
    holding_before: 1000000,
    holding_after: 1050000,
    amount_transaction: 50000,
    share_percentage_before: 10.0,
    share_percentage_after: 10.5,
    transaction_value: 500000000,
    source: 'https://idx.co.id/filing/12345',
    ...overrides,
  });
}

describe('Mandatory Materiality Engine Rules (Section 23)', () => {
  it('1. 0.01 pp isolated move evaluates to SILENT with explainable suppression reasons', () => {
    const event = createMockFiling({
      share_percentage_before: 10.0,
      share_percentage_after: 10.01,
      holding_before: 10000000,
      holding_after: 10010000,
      amount_transaction: 10000,
      transaction_value: 1000000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('SILENT');
    expect(result.reasonCodes).toHaveLength(0);
    expect(result.suppressionReasonCodes).toContain('SMALL_ABSOLUTE_CHANGE');
    expect(result.suppressionReasonCodes).toContain('NO_REPEAT_PATTERN');
    expect(result.suppressionReasonCodes).toContain('BELOW_PUSH_THRESHOLD');
  });

  it('2. 0.30 pp single move evaluates to WATCH', () => {
    const event = createMockFiling({
      share_percentage_before: 5.0,
      share_percentage_after: 5.30,
      holding_before: 20000000,
      holding_after: 20600000,
      amount_transaction: 600000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('WATCH');
    expect(result.reasonCodes).toContain('MODERATE_STAKE_MOVE_GE_0_25PP');
    expect(result.suppressionReasonCodes).toContain('BELOW_PUSH_THRESHOLD');
  });

  it('3. 1.00 pp move evaluates to MATERIAL', () => {
    const event = createMockFiling({
      share_percentage_before: 5.0,
      share_percentage_after: 6.0,
      holding_before: 50000000,
      holding_after: 60000000,
      amount_transaction: 10000000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('MATERIAL');
    expect(result.reasonCodes).toContain('LARGE_STAKE_MOVE_GE_1PP');
    expect(result.suppressionReasonCodes).toHaveLength(0);
  });

  it('4. 5.00 pp move evaluates to STRUCTURAL', () => {
    const event = createMockFiling({
      share_percentage_before: 10.0,
      share_percentage_after: 15.0,
      holding_before: 100000000,
      holding_after: 150000000,
      amount_transaction: 50000000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('STRUCTURAL');
    expect(result.reasonCodes).toContain('STRUCTURAL_STAKE_SHIFT_GE_5PP');
  });

  it('5. 0 -> 0.33% new notable position evaluates to MATERIAL', () => {
    const event = createMockFiling({
      holding_before: 0,
      holding_after: 3300000,
      share_percentage_before: 0,
      share_percentage_after: 0.33,
      amount_transaction: 3300000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('MATERIAL');
    expect(result.reasonCodes).toContain('NEW_NOTABLE_POSITION');
  });

  it('6. 1.37 -> 0.93% evaluates to MATERIAL due to >10% relative reduction', () => {
    const event = createMockFiling({
      transaction_type: 'sell',
      share_percentage_before: 1.37,
      share_percentage_after: 0.93,
      holding_before: 1370000,
      holding_after: 930000,
      amount_transaction: 440000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('MATERIAL');
    expect(result.reasonCodes).toContain('RELATIVE_POSITION_CHANGE_GE_10PCT');
    expect(result.features.relativePositionChange).toBeCloseTo(0.321168, 4);
  });

  it('7. repeat 2 + moderate stake change evaluates to MATERIAL (2 independent WATCH dimensions)', () => {
    const event = createMockFiling({
      share_percentage_before: 5.0,
      share_percentage_after: 5.30, // 0.30 pp -> MODERATE_STAKE_MOVE_GE_0_25PP
      holding_before: 10000000,
      holding_after: 10600000,
      amount_transaction: 600000,
    });

    const priorEvents = [
      {
        id: 'prior-1',
        source_timestamp: '2026-09-01T10:00:00',
        source_date: '2026-09-01',
        transaction_type: 'buy' as const,
        ownership_delta_pp: 0.20,
        materiality_state: 'SILENT' as const,
      },
    ];

    const result = evaluateEvent({ event, priorHolderEvents: priorEvents, enrichmentSkipped: true });
    expect(result.materialityState).toBe('MATERIAL');
    expect(result.reasonCodes).toContain('MODERATE_STAKE_MOVE_GE_0_25PP');
    expect(result.reasonCodes).toContain('REPEATED_SAME_DIRECTION_GE_2');
    expect(result.reasonCodes).toContain('ESCALATED_BY_HOLDER_HISTORY');
    expect(result.features.escalatedFromPriorState).toBe(true);
  });

  it('8. repeat 3 same-direction evaluates to MATERIAL directly', () => {
    const event = createMockFiling({
      share_percentage_before: 5.0,
      share_percentage_after: 5.15, // 0.15 pp isolated is silent
      holding_before: 10000000,
      holding_after: 10300000,
      amount_transaction: 300000,
    });

    const priorEvents = [
      {
        id: 'prior-1',
        source_timestamp: '2026-08-01T10:00:00',
        source_date: '2026-08-01',
        transaction_type: 'buy' as const,
        ownership_delta_pp: 0.10,
        materiality_state: 'SILENT' as const,
      },
      {
        id: 'prior-2',
        source_timestamp: '2026-09-01T10:00:00',
        source_date: '2026-09-01',
        transaction_type: 'buy' as const,
        ownership_delta_pp: 0.12,
        materiality_state: 'WATCH' as const,
      },
    ];

    const result = evaluateEvent({ event, priorHolderEvents: priorEvents, enrichmentSkipped: true });
    expect(result.materialityState).toBe('MATERIAL');
    expect(result.reasonCodes).toContain('REPEATED_SAME_DIRECTION_GE_3');
    expect(result.reasonCodes).toContain('ESCALATED_BY_HOLDER_HISTORY');
    expect(result.features.repeatCount180d).toBe(3);
  });

  it('9. near exit (holding_after <= 20% of holding_before) evaluates to STRUCTURAL', () => {
    const event = createMockFiling({
      transaction_type: 'sell',
      holding_before: 10000000,
      holding_after: 1500000, // 15% remaining
      share_percentage_before: 5.0,
      share_percentage_after: 0.75,
      amount_transaction: 8500000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('STRUCTURAL');
    expect(result.reasonCodes).toContain('NEAR_EXIT_POSITION');
    expect(result.features.nearExit).toBe(true);
  });

  it('10. missing fields do not fabricate values or crash the evaluation', () => {
    const event = normalizeFiling({
      symbol: 'BBCA',
      timestamp: '2026-09-24T10:00:00',
      holder_name: 'Incomplete Record Holder',
      transaction_type: 'others',
      holding_after: 50000,
      holding_before: null,
      share_percentage_before: null,
      share_percentage_after: null,
      amount_transaction: null,
      transaction_value: null,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('SILENT');
    expect(result.features.ownershipDeltaPp).toBeNull();
    expect(result.features.relativePositionChange).toBeNull();
    expect(result.features.transactionToLiquidityProxy).toBeNull();
    expect(result.features.contextUnavailable).toBe(true);
  });

  it('17. every SILENT event has persisted suppression reasons', () => {
    const event = createMockFiling({
      share_percentage_before: 2.0,
      share_percentage_after: 2.02,
      holding_before: 2000000,
      holding_after: 2020000,
      amount_transaction: 20000,
      transaction_value: 2000000,
    });

    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.materialityState).toBe('SILENT');
    expect(result.suppressionReasonCodes.length).toBeGreaterThan(0);
    expect(result.suppressionReasonCodes).toContain('SMALL_ABSOLUTE_CHANGE');
    expect(result.suppressionReasonCodes).toContain('NO_REPEAT_PATTERN');
    expect(result.suppressionReasonCodes).toContain('BELOW_PUSH_THRESHOLD');
  });

  it('19. skipped enrichment is explicitly marked, not interpreted as zero context', () => {
    const event = createMockFiling();
    const result = evaluateEvent({ event, enrichmentSkipped: true });
    expect(result.features.enrichmentSkipped).toBe(true);
    expect(result.features.contextUnavailable).toBe(true);
    expect(result.features.medianDailyLiquidityProxy20d).toBeNull();
  });

  it('evaluates liquidity context properly when daily records are provided', () => {
    const event = createMockFiling({
      transaction_value: 600000000, // 600M
    });

    // 20 daily records with close=1000, volume=1000 -> daily liquidity = 1,000,000 (1M)
    // 600M / 1M = 600 >= 0.50 -> TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY
    const dailyRecords: DailyRecord[] = Array.from({ length: 20 }, (_, i) => ({
      symbol: 'BBCA.JK',
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      close: 1000,
      open: 1000,
      high: 1050,
      low: 990,
      volume: 1000,
      market_cap: 10000000000,
    }));

    const result = evaluateEvent({ event, dailyRecords, enrichmentSkipped: false });
    expect(result.features.contextUnavailable).toBe(false);
    expect(result.features.medianDailyLiquidityProxy20d).toBe(1000000);
    expect(result.features.transactionToLiquidityProxy).toBe(600);
    expect(result.reasonCodes).toContain('TRANSACTION_VALUE_GE_50PCT_MEDIAN_DAILY_PROXY');
    expect(result.engineVersion).toBe(ENGINE_VERSION);
  });
});
