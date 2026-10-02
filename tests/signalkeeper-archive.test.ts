import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArchiveArtifact, compileArchive, readFrozenArchive, safeSourceUrl } from '../scripts/build-signalkeeper-archive.ts';
import { getArchiveProvenance, getSignal, getTimeline, listSignals, SIGNAL_BADGES, type SignalBadge } from '../lib/archive/signalkeeper.ts';
import { normalizeHolder } from '../lib/sectors/normalize.ts';

const raw = readFrozenArchive();
const sourceEvents = raw.trim().split(/\r?\n/u).map(line => JSON.parse(line));
const artifact = buildArchiveArtifact(raw);
const approvedTags = ['repurchase-agreement', 'takeover', 'capital-restructuring', 'free_float_compliance', 'placement', 'share-transfer', 'mesop'];
const approvedPhrases = ['share borrowing', 'securities borrowing', 'securities lending', 'return of borrowed shares', 'repo', 'collateral', 'voluntary tender offer', 'controlling'];

it('compiles the frozen source into the exact archive contract', () => {
  expect(sourceEvents).toHaveLength(900);
  expect(artifact.events).toHaveLength(900);
  expect(artifact.provenance).toMatchObject({ observedStart: '2026-07-03', observedEnd: '2026-09-30', eventCount: 900, live: false });
  expect(artifact.provenance.rawSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(new Set(artifact.events.map(event => event.id)).size).toBe(900);
  expect(artifact.events.every(event => /^archive:v1:[a-f0-9]{64}$/.test(event.id) && /^pair:v1:[a-f0-9]{64}$/.test(event.pairId))).toBe(true);
});

it('derives only the exact factual badge predicates', () => {
  for (const [index, event] of artifact.events.entries()) {
    const source = sourceEvents[index]!;
    const text = `${source.title}\n${source.body}`.toLowerCase();
    const expectedContext = [...approvedTags.filter(tag => source.tags.includes(tag)), ...approvedPhrases.filter(phrase => text.includes(phrase))];
    const companyFromShares = source.title.match(/^.+ (?:buys|sells) shares of (.+)$/u)?.[1];
    const companyFromPosition = source.title.match(/^Change in .+'s position in (.+)$/u)?.[1];
    const expected: SignalBadge[] = [];
    if ((event.ownershipBeforePct < 5 && event.ownershipAfterPct >= 5) || (event.ownershipBeforePct >= 5 && event.ownershipAfterPct < 5)) expected.push('Crossed 5%');
    if (Math.abs(event.ownershipAfterPct - event.ownershipBeforePct) >= 5) expected.push('Large Shift');
    if (event.holdingBefore === 0 && event.holdingAfter > 0) expected.push('New Position');
    if (event.holdingBefore > 0 && event.holdingAfter === 0) expected.push('Full Exit');
    if (event.holdingBefore > event.holdingAfter && event.holdingAfter > 0 && event.ownershipAfterPct < 1) expected.push('Near Exit');
    if (event.pairEventCount >= 2) expected.push('Repeated Activity');
    if (event.specialContextMatches.length > 0) expected.push('Special Context');
    expect(event.signedDeltaPp).toBeCloseTo(event.ownershipAfterPct - event.ownershipBeforePct, 12);
    expect(event.badges).toEqual(expected);
    expect(event.specialContextMatches).toEqual(expectedContext);
    expect(event.companyName).toBe(companyFromShares ?? companyFromPosition ?? null);
    expect(event.sourceUrl).toBe(safeSourceUrl(source.source));
    expect(event.badges.every(badge => SIGNAL_BADGES.includes(badge))).toBe(true);
  }
});

it('builds complete chronological holder timelines', () => {
  const ids = new Set(artifact.events.map(event => event.id));
  for (const timeline of Object.values(artifact.timelines)) {
    expect(timeline.eventIds.length).toBeGreaterThan(0);
    const events = timeline.eventIds.map(id => artifact.events.find(event => event.id === id)!);
    expect(events.every(event => ids.has(event.id) && event.pairId === timeline.pairId && event.symbol === timeline.symbol && normalizeHolder(event.holderName) === timeline.normalizedHolder)).toBe(true);
    expect(events.map(event => `${event.timestamp}\u0000${event.id}`)).toEqual([...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)).map(event => `${event.timestamp}\u0000${event.id}`));
  }
});

it('does not emit unsafe source URL schemes and remains deterministic', () => {
  expect(artifact.events.every(event => event.sourceUrl === null || /^https?:\/\//.test(event.sourceUrl))).toBe(true);
  expect(safeSourceUrl('https://example.test/path')).toBe('https://example.test/path');
  expect(safeSourceUrl('http://example.test/path')).toBe('http://example.test/path');
  expect(safeSourceUrl('data:text/plain,no')).toBeNull();
  expect(safeSourceUrl('ftp://example.test')).toBeNull();
  const directory = mkdtempSync(join(tmpdir(), 'signalkeeper-archive-'));
  try {
    const first = join(directory, 'first.json');
    const second = join(directory, 'second.json');
    compileArchive(first);
    compileArchive(second);
    expect(readFileSync(first, 'utf8')).toBe(readFileSync(second, 'utf8'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('exposes the checked-in artifact through the read-only archive reader', () => {
  expect(listSignals()).toHaveLength(900);
  expect(getArchiveProvenance().live).toBe(false);
  const event = listSignals()[0]!;
  expect(getSignal(event.id)).toEqual(event);
  expect(getTimeline(event.pairId)?.events.map(item => item.id)).toEqual(artifact.timelines[event.pairId]?.eventIds);
});
