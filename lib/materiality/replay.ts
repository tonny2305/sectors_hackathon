import 'server-only';
import { evaluateEvent } from './engine.ts';
import { normalizeFiling, type OwnershipEvent } from '../sectors/normalize.ts';
import type { MaterialityEvaluation, PriorHolderEvent } from './types.ts';

export interface ReplayStep {
  filingRaw: unknown;
  evaluation: MaterialityEvaluation;
}

export function replayFilingSequence(filingsRaw: unknown[]): ReplayStep[] {
  const historyMap = new Map<string, PriorHolderEvent[]>();
  const results: ReplayStep[] = [];

  for (const raw of filingsRaw) {
    const event = normalizeFiling(raw);
    const key = `${event.symbol}:${event.normalized_holder_name}`;
    const priorEvents = historyMap.get(key) || [];

    const evaluation = evaluateEvent({
      event,
      priorHolderEvents: priorEvents,
      enrichmentSkipped: true,
    });

    results.push({
      filingRaw: raw,
      evaluation,
    });

    // Update history for next events
    priorEvents.push({
      id: event.fingerprint,
      source_timestamp: event.source_timestamp,
      source_date: event.source_date,
      transaction_type: (event.transaction_type as 'buy' | 'sell' | 'others') || 'others',
      ownership_delta_pp: evaluation.features.ownershipDeltaPp,
      materiality_state: evaluation.materialityState,
    });
    historyMap.set(key, priorEvents);
  }

  return results;
}
