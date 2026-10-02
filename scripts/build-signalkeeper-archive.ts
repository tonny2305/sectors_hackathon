import 'server-only';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeHolder } from '../lib/sectors/normalize.ts';
import type { ArchiveArtifact, ArchiveSignalEvent, ArchiveTimeline, SignalBadge } from '../lib/archive/signalkeeper.ts';

export const SOURCE_REF = 'sectors-archive-20260930';
export const SOURCE_PATH = 'research/sectors-archive/ownership-unique.jsonl';
export const OUTPUT_PATH = 'public/data/signalkeeper-archive.v1.json';
const APPROVED_TAGS = ['repurchase-agreement', 'takeover', 'capital-restructuring', 'free_float_compliance', 'placement', 'share-transfer', 'mesop'];
const APPROVED_PHRASES = ['share borrowing', 'securities borrowing', 'securities lending', 'return of borrowed shares', 'repo', 'collateral', 'voluntary tender offer', 'controlling'];
const SIGNAL_BADGES = ['Crossed 5%', 'Large Shift', 'New Position', 'Full Exit', 'Near Exit', 'Repeated Activity', 'Special Context'] as const;

interface RawEvent {
  title: string;
  body: string;
  source: string | null;
  timestamp: string;
  sector: string;
  sub_sector: string;
  tags: string[];
  symbol: string;
  transaction_type: 'buy' | 'sell' | 'others';
  holder_type: string;
  holder_name: string;
  holding_before: number;
  holding_after: number;
  amount_transaction: number;
  price: number | null;
  transaction_value: number | null;
  price_transaction: Array<{ date: string; type: string; price: number | null; amount_transacted: number }>;
  share_percentage_before: number;
  share_percentage_after: number;
}

export function readFrozenArchive(): string {
  return execFileSync('git', ['show', `${SOURCE_REF}:${SOURCE_PATH}`], { encoding: 'utf8', maxBuffer: 5_000_000 });
}

export function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseCompanyName(title: string): string | null {
  const shares = title.match(/^.+ (?:buys|sells) shares of (.+)$/u);
  if (shares?.[1]) return shares[1];
  const position = title.match(/^Change in .+'s position in (.+)$/u);
  return position?.[1] ?? null;
}

export function specialContextMatches(event: Pick<RawEvent, 'tags' | 'title' | 'body'>): string[] {
  const text = `${event.title}\n${event.body}`.toLowerCase();
  return [...APPROVED_TAGS.filter(tag => event.tags.includes(tag)), ...APPROVED_PHRASES.filter(phrase => text.includes(phrase))];
}

export function badgesFor(event: Pick<ArchiveSignalEvent, 'holdingBefore' | 'holdingAfter' | 'ownershipBeforePct' | 'ownershipAfterPct' | 'pairEventCount' | 'specialContextMatches'>): SignalBadge[] {
  const delta = event.ownershipAfterPct - event.ownershipBeforePct;
  const badges: SignalBadge[] = [];
  if ((event.ownershipBeforePct < 5 && event.ownershipAfterPct >= 5) || (event.ownershipBeforePct >= 5 && event.ownershipAfterPct < 5)) badges.push('Crossed 5%');
  if (Math.abs(delta) >= 5) badges.push('Large Shift');
  if (event.holdingBefore === 0 && event.holdingAfter > 0) badges.push('New Position');
  if (event.holdingBefore > 0 && event.holdingAfter === 0) badges.push('Full Exit');
  if (event.holdingBefore > event.holdingAfter && event.holdingAfter > 0 && event.ownershipAfterPct < 1) badges.push('Near Exit');
  if (event.pairEventCount >= 2) badges.push('Repeated Activity');
  if (event.specialContextMatches.length > 0) badges.push('Special Context');
  return badges;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseRawEvents(raw: string): RawEvent[] {
  return raw.trim().split(/\r?\n/u).map(line => JSON.parse(line) as RawEvent);
}

export function buildArchiveArtifact(raw: string): ArchiveArtifact {
  const rawEvents = parseRawEvents(raw);
  if (rawEvents.length !== 900) throw new Error(`EXPECTED_900_SOURCE_EVENTS_GOT_${rawEvents.length}`);

  const pairCounts = new Map<string, number>();
  const pairDetails = new Map<string, { symbol: string; normalizedHolder: string; holderName: string }>();
  for (const event of rawEvents) {
    const normalizedHolder = normalizeHolder(event.holder_name);
    if (!normalizedHolder) throw new Error('MISSING_NORMALIZED_HOLDER');
    const pairKey = JSON.stringify([event.symbol, normalizedHolder]);
    const pairId = `pair:v1:${sha256(pairKey)}`;
    pairCounts.set(pairId, (pairCounts.get(pairId) ?? 0) + 1);
    pairDetails.set(pairId, { symbol: event.symbol, normalizedHolder, holderName: event.holder_name });
  }

  const events = rawEvents.map(event => {
    const normalizedHolder = normalizeHolder(event.holder_name);
    if (!normalizedHolder) throw new Error('MISSING_NORMALIZED_HOLDER');
    const pairId = `pair:v1:${sha256(JSON.stringify([event.symbol, normalizedHolder]))}`;
    const specialMatches = specialContextMatches(event);
    const derived: ArchiveSignalEvent = {
      id: `archive:v1:${sha256(JSON.stringify(event))}`,
      pairId,
      companyName: parseCompanyName(event.title),
      title: event.title,
      body: event.body,
      sourceUrl: safeSourceUrl(event.source),
      timestamp: event.timestamp,
      sourceDate: event.timestamp.slice(0, 10),
      symbol: event.symbol,
      holderName: event.holder_name,
      holderType: event.holder_type,
      transactionType: event.transaction_type,
      holdingBefore: event.holding_before,
      holdingAfter: event.holding_after,
      ownershipBeforePct: event.share_percentage_before,
      ownershipAfterPct: event.share_percentage_after,
      signedDeltaPp: event.share_percentage_after - event.share_percentage_before,
      sharesTransacted: event.amount_transaction,
      price: event.price,
      transactionValueIdr: event.transaction_value,
      priceTransactions: event.price_transaction.map(transaction => ({ date: transaction.date, type: transaction.type, price: transaction.price, amountTransacted: transaction.amount_transacted })),
      tags: event.tags,
      sector: event.sector,
      subSector: event.sub_sector,
      badges: [],
      specialContextMatches: specialMatches,
      pairEventCount: pairCounts.get(pairId) ?? 0,
    };
    derived.badges = badgesFor(derived);
    return derived;
  });

  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('NON_UNIQUE_EVENT_IDS');
  const timelines: Record<string, ArchiveTimeline> = {};
  for (const [pairId, detail] of pairDetails) {
    timelines[pairId] = {
      pairId,
      ...detail,
      eventIds: events.filter(event => event.pairId === pairId).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)).map(event => event.id),
    };
  }
  const dates = events.map(event => event.sourceDate).sort();
  return {
    schemaVersion: 'signalkeeper-archive.v1',
    provenance: {
      corpusClass: 'POST_FREEZE_ARCHIVAL_HOLDOUT',
      sourceRef: SOURCE_REF,
      sourcePath: SOURCE_PATH,
      rawSha256: sha256(raw),
      observedStart: dates[0]!,
      observedEnd: dates.at(-1)!,
      eventCount: 900,
      live: false,
    },
    events,
    timelines,
  };
}

export function serializeArchiveArtifact(artifact: ArchiveArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function compileArchive(outputPath = OUTPUT_PATH): ArchiveArtifact {
  const artifact = buildArchiveArtifact(readFrozenArchive());
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serializeArchiveArtifact(artifact));
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifact = compileArchive();
  const counts = Object.fromEntries(SIGNAL_BADGES.map(badge => [badge, artifact.events.filter(event => event.badges.includes(badge)).length]));
  console.log(JSON.stringify({ rawSha256: artifact.provenance.rawSha256, eventCount: artifact.events.length, timelines: Object.keys(artifact.timelines).length, badges: counts }, null, 2));
}
