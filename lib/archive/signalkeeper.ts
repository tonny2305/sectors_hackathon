import 'server-only';
import artifact from '../../public/data/signalkeeper-archive.v1.json' with { type: 'json' };

export const SIGNAL_BADGES = [
  'Crossed 5%', 'Large Shift', 'New Position', 'Full Exit', 'Near Exit', 'Repeated Activity', 'Special Context',
] as const;

export type SignalBadge = typeof SIGNAL_BADGES[number];

export const ARCHIVE_LABEL = 'Historical Sectors archive · 900 observed disclosures · 3 Jul–30 Sep 2026 · Not live monitoring coverage';
export const ARCHIVE_COVERAGE = 'This timeline shows only events observed in the archived Sectors slice from 3 Jul to 30 Sep 2026. It does not claim complete earlier history.';

const badgeExplanations: Record<SignalBadge, string> = {
  'Crossed 5%': 'The disclosed stake crossed the 5% ownership line.',
  'Large Shift': 'The disclosed ownership percentage changed by at least 5 percentage points.',
  'New Position': 'The disclosure records a move from zero to a positive holding.',
  'Full Exit': 'The disclosure records a move from a positive holding to zero.',
  'Near Exit': 'The holding declined and the disclosed post-event ownership is below 1%.',
  'Repeated Activity': '',
  'Special Context': 'The disclosure includes the shown raw context label; it is not an inference about intent or legality.',
};

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

export interface SignalFeedQuery { badge?: string; symbol?: string; page?: string; }
export interface SignalFeed { events: ArchiveSignalEvent[]; total: number; page: number; totalPages: number; badge?: SignalBadge; symbol?: string; }

export function listSignals(): readonly ArchiveSignalEvent[] {
  return archive.events;
}

export function listSignalFeed(query: SignalFeedQuery = {}): SignalFeed {
  const badge = SIGNAL_BADGES.find(item => item === query.badge);
  const symbol = query.symbol?.trim().toUpperCase();
  const validSymbol = symbol && archive.events.some(event => event.symbol === symbol) ? symbol : undefined;
  const filtered = archive.events
    .filter(event => event.badges.length > 0)
    .filter(event => !badge || event.badges.includes(badge))
    .filter(event => !validSymbol || event.symbol === validSymbol)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 50));
  const parsedPage = Number(query.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, totalPages) : 1;
  return { events: filtered.slice((page - 1) * 50, page * 50), total: filtered.length, page, totalPages, badge, symbol: validSymbol };
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

export function companyLabel(event: ArchiveSignalEvent): string { return event.companyName ?? event.title; }

export function badgeExplanation(event: ArchiveSignalEvent, badge: SignalBadge): string {
  return badge === 'Repeated Activity' ? `This holder-company pair has ${event.pairEventCount} observed archive disclosures.` : badgeExplanations[badge];
}

export function factualExplanation(event: ArchiveSignalEvent): string[] {
  return [
    `The disclosed holding moved from ${event.ownershipBeforePct}% to ${event.ownershipAfterPct}% (${event.signedDeltaPp >= 0 ? '+' : ''}${event.signedDeltaPp} pp).`,
    ...event.badges.map(badge => badgeExplanation(event, badge)),
    ...event.specialContextMatches.map(match => event.tags.includes(match) ? `Sectors tag: ${match}` : `The disclosure states: ${match}`),
  ];
}

export function sourceLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
