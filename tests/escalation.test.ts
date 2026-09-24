import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '../lib/materiality/engine.ts';
import { normalizeFiling } from '../lib/sectors/normalize.ts';
import type { PriorHolderEvent } from '../lib/materiality/types.ts';

function createHolderEvent(opts: {
  holder: string;
  timestamp: string;
  deltaPp: number;
  type: 'buy' | 'sell' | 'others';
  beforePct: number;
  holdingBefore?: number;
}) {
  const afterPct = opts.beforePct + opts.deltaPp;
  return normalizeFiling({
    symbol: 'BBCA',
    timestamp: opts.timestamp,
    holder_name: opts.holder,
    holder_type: 'institution',
    transaction_type: opts.type,
    holding_before: opts.holdingBefore ?? 10000000,
    holding_after: opts.holdingBefore ? opts.holdingBefore + 100000 : 10100000,
    amount_transaction: 100000,
    share_percentage_before: opts.beforePct,
    share_percentage_after: Number(afterPct.toFixed(2)),
    transaction_value: 100000000,
    source: 'https://idx.co.id/filing/sample',
  });
}

describe('Stateful Escalation & Holder Memory (Section 23)', () => {
  it('11. Event 1: +0.18 pp first occurrence evaluates to SILENT', () => {
    const event1 = createHolderEvent({
      holder: 'Accumulator Capital',
      timestamp: '2026-06-01T10:00:00',
      deltaPp: 0.18,
      type: 'buy',
      beforePct: 5.0,
    });

    const result1 = evaluateEvent({ event: event1, priorHolderEvents: [], enrichmentSkipped: true });
    expect(result1.materialityState).toBe('SILENT');
    expect(result1.features.repeatCount180d).toBe(1);
    expect(result1.features.escalatedFromPriorState).toBe(false);
  });

  it('12. Event 2: same holder +0.21 pp second occurrence within 180d escalates to WATCH', () => {
    const event2 = createHolderEvent({
      holder: 'Accumulator Capital',
      timestamp: '2026-07-15T10:00:00',
      deltaPp: 0.21,
      type: 'buy',
      beforePct: 5.18,
    });

    const priorEvents: PriorHolderEvent[] = [
      {
        id: 'event-1-fp',
        source_timestamp: '2026-06-01T10:00:00',
        source_date: '2026-06-01',
        transaction_type: 'buy',
        ownership_delta_pp: 0.18,
        materiality_state: 'SILENT',
      },
    ];

    const result2 = evaluateEvent({ event: event2, priorHolderEvents: priorEvents, enrichmentSkipped: true });
    expect(result2.materialityState).toBe('WATCH');
    expect(result2.reasonCodes).toContain('REPEATED_SAME_DIRECTION_GE_2');
    expect(result2.features.repeatCount180d).toBe(2);
    expect(result2.features.previousHolderEventTimestamp).toBe('2026-06-01T10:00:00');
    expect(result2.features.previousMaterialityStateForHolder).toBe('SILENT');
  });

  it('13. Event 3: same holder +0.24 pp third occurrence within 180d escalates to MATERIAL', () => {
    const event3 = createHolderEvent({
      holder: 'Accumulator Capital',
      timestamp: '2026-08-20T10:00:00',
      deltaPp: 0.24,
      type: 'buy',
      beforePct: 5.39,
    });

    const priorEvents: PriorHolderEvent[] = [
      {
        id: 'event-2-fp',
        source_timestamp: '2026-07-15T10:00:00',
        source_date: '2026-07-15',
        transaction_type: 'buy',
        ownership_delta_pp: 0.21,
        materiality_state: 'WATCH',
      },
      {
        id: 'event-1-fp',
        source_timestamp: '2026-06-01T10:00:00',
        source_date: '2026-06-01',
        transaction_type: 'buy',
        ownership_delta_pp: 0.18,
        materiality_state: 'SILENT',
      },
    ];

    const result3 = evaluateEvent({ event: event3, priorHolderEvents: priorEvents, enrichmentSkipped: true });
    expect(result3.materialityState).toBe('MATERIAL');
    expect(result3.reasonCodes).toContain('REPEATED_SAME_DIRECTION_GE_3');
    expect(result3.reasonCodes).toContain('ESCALATED_BY_HOLDER_HISTORY');
    expect(result3.features.repeatCount180d).toBe(3);
    expect(result3.features.escalatedFromPriorState).toBe(true);
    expect(result3.features.cumulativeSameDirectionDeltaPp180d).toBeCloseTo(0.63, 2);
  });

  it('14. different holder must not inherit another holder history', () => {
    const eventDifferentHolder = createHolderEvent({
      holder: 'Different Unrelated Investor',
      timestamp: '2026-08-20T10:00:00',
      deltaPp: 0.20,
      type: 'buy',
      beforePct: 5.0,
    });

    // An empty or separate prior list for this holder
    const result = evaluateEvent({ event: eventDifferentHolder, priorHolderEvents: [], enrichmentSkipped: true });
    expect(result.materialityState).toBe('SILENT');
    expect(result.features.repeatCount180d).toBe(1);
    expect(result.features.escalatedFromPriorState).toBe(false);
  });

  it('15. opposite transaction direction must not increment same-direction streak', () => {
    // Prior event was 'sell'
    const priorEvents: PriorHolderEvent[] = [
      {
        id: 'sell-event-1',
        source_timestamp: '2026-08-01T10:00:00',
        source_date: '2026-08-01',
        transaction_type: 'sell',
        ownership_delta_pp: -0.20,
        materiality_state: 'SILENT',
      },
    ];

    // Current event is 'buy' +0.20 pp
    const currentBuyEvent = createHolderEvent({
      holder: 'Switching Strategy Fund',
      timestamp: '2026-08-20T10:00:00',
      deltaPp: 0.20,
      type: 'buy',
      beforePct: 5.0,
    });

    const result = evaluateEvent({ event: currentBuyEvent, priorHolderEvents: priorEvents, enrichmentSkipped: true });
    expect(result.materialityState).toBe('SILENT');
    expect(result.features.repeatCount180d).toBe(1); // Not 2!
    expect(result.features.escalatedFromPriorState).toBe(false);
  });

  it('16. events outside lookback (> 180 days) must not be counted', () => {
    const priorOldEvents: PriorHolderEvent[] = [
      {
        id: 'old-event-1',
        source_timestamp: '2025-01-01T10:00:00', // > 500 days ago
        source_date: '2025-01-01',
        transaction_type: 'buy',
        ownership_delta_pp: 0.20,
        materiality_state: 'SILENT',
      },
    ];

    const currentEvent = createHolderEvent({
      holder: 'Long Term Investor',
      timestamp: '2026-08-20T10:00:00',
      deltaPp: 0.20,
      type: 'buy',
      beforePct: 5.0,
    });

    const result = evaluateEvent({ event: currentEvent, priorHolderEvents: priorOldEvents, enrichmentSkipped: true });
    expect(result.materialityState).toBe('SILENT');
    expect(result.features.repeatCount180d).toBe(1);
    expect(result.features.escalatedFromPriorState).toBe(false);
  });
});
