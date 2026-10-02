import 'server-only';
import artifact from '../../public/data/signalkeeper-archive.v1.json' with { type: 'json' };

export const SIGNAL_BADGES = [
  'Crossed 5%', 'Large Shift', 'New Position', 'Full Exit', 'Near Exit', 'Repeated Activity', 'Special Context',
] as const;

export type SignalBadge = typeof SIGNAL_BADGES[number];

export interface ArchiveSignalEvent {
  id: string;
  pairId: string;
  companyName: string | null;
  title: string;
  body: string;
  sourceUrl: string | null;
  timestamp: string;
  sourceDate: string;
  symbol: string;
  holderName: string;
  holderType: string;
  transactionType: 'buy' | 'sell' | 'others';
  holdingBefore: number;
  holdingAfter: number;
  ownershipBeforePct: number;
  ownershipAfterPct: number;
  signedDeltaPp: number;
  sharesTransacted: number;
  price: number | null;
  transactionValueIdr: number | null;
  priceTransactions: Array<{ date: string; type: string; price: number | null; amountTransacted: number }>;
  tags: string[];
  sector: string;
  subSector: string;
  badges: SignalBadge[];
  specialContextMatches: string[];
  pairEventCount: number;
}

export interface ArchiveTimeline {
  pairId: string;
  symbol: string;
  normalizedHolder: string;
  holderName: string;
  eventIds: string[];
}

export interface ArchiveArtifact {
  schemaVersion: 'signalkeeper-archive.v1';
  provenance: {
    corpusClass: 'POST_FREEZE_ARCHIVAL_HOLDOUT';
    sourceRef: 'sectors-archive-20260930';
    sourcePath: 'research/sectors-archive/ownership-unique.jsonl';
    rawSha256: string;
    observedStart: string;
    observedEnd: string;
    eventCount: 900;
    live: false;
  };
  events: ArchiveSignalEvent[];
  timelines: Record<string, ArchiveTimeline>;
}

const archive = artifact as ArchiveArtifact;
const eventsById = new Map(archive.events.map(event => [event.id, event]));

export function listSignals(): readonly ArchiveSignalEvent[] {
  return archive.events;
}

export function getSignal(id: string): ArchiveSignalEvent | undefined {
  return eventsById.get(id);
}

export function getTimeline(pairId: string): { timeline: ArchiveTimeline; events: ArchiveSignalEvent[] } | undefined {
  const timeline = archive.timelines[pairId];
  if (!timeline) return undefined;
  return { timeline, events: timeline.eventIds.map(id => eventsById.get(id)).filter((event): event is ArchiveSignalEvent => Boolean(event)) };
}

export function getArchiveProvenance(): ArchiveArtifact['provenance'] {
  return archive.provenance;
}
