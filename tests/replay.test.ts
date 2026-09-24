import { describe, expect, it } from 'vitest';
import filingDocumented from '../fixtures/filings.documented.json';
import { replayFilingSequence } from '../lib/materiality/replay.ts';

describe('Historical Replay Validation (Section 20)', () => {
  it('correctly evaluates the documented NSSS.JK / Samuel Sekuritas Indonesia case', () => {
    const rawFiling = filingDocumented.results[0]!;
    const sequence = [
      // 4 simulated prior purchases within 6 months
      {
        ...rawFiling,
        timestamp: '2026-02-15T10:00:00',
        share_percentage_before: 30.0,
        share_percentage_after: 32.5,
        holding_before: 7000000000,
        holding_after: 7580000000,
        amount_transaction: 580000000,
      },
      {
        ...rawFiling,
        timestamp: '2026-03-20T10:00:00',
        share_percentage_before: 32.5,
        share_percentage_after: 35.0,
        holding_before: 7580000000,
        holding_after: 8160000000,
        amount_transaction: 580000000,
      },
      {
        ...rawFiling,
        timestamp: '2026-04-25T10:00:00',
        share_percentage_before: 35.0,
        share_percentage_after: 37.5,
        holding_before: 8160000000,
        holding_after: 8740000000,
        amount_transaction: 580000000,
      },
      {
        ...rawFiling,
        timestamp: '2026-06-05T10:00:00',
        share_percentage_before: 37.5,
        share_percentage_after: 40.17,
        holding_before: 8740000000,
        holding_after: 9559919000,
        amount_transaction: 819919000,
      },
      // 5th purchase: exactly as in the documented filing (9 Jul 2026)
      rawFiling,
    ];

    const replaySteps = replayFilingSequence(sequence);
    expect(replaySteps).toHaveLength(5);

    const fifthEvent = replaySteps[4]!;
    expect(fifthEvent.evaluation.materialityState).toBe('MATERIAL');
    expect(fifthEvent.evaluation.features.repeatCount180d).toBe(5);
    expect(fifthEvent.evaluation.features.ownershipDeltaPp).toBe(2.56);
    expect(fifthEvent.evaluation.reasonCodes).toContain('LARGE_STAKE_MOVE_GE_1PP');
    expect(fifthEvent.evaluation.reasonCodes).toContain('REPEATED_SAME_DIRECTION_GE_3');
    expect(fifthEvent.evaluation.reasonCodes).toContain('ESCALATED_BY_HOLDER_HISTORY');
  });
});
