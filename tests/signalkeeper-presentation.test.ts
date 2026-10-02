import { expect, it } from 'vitest';
import { badgeExplanation, factualExplanation, getSignal, getTimeline, listSignalFeed, listSignals, sourceLink } from '../lib/archive/signalkeeper.ts';
import { safeSourceUrl } from '../scripts/build-signalkeeper-archive.ts';

it('lists only factual-badge events, newest first, in deterministic pages of at most 50', () => {
  const feed = listSignalFeed();
  expect(feed.total).toBe(791);
  expect(feed.events).toHaveLength(50);
  expect(feed.events.every(event => event.badges.length > 0)).toBe(true);
  expect(feed.events.map(event => `${event.timestamp}\0${event.id}`)).toEqual([...feed.events].map(event => `${event.timestamp}\0${event.id}`).sort((a, b) => b.localeCompare(a)));
  const next = listSignalFeed({ page: '2' });
  expect(next.events).toHaveLength(50);
  expect(new Set([...feed.events, ...next.events].map(event => event.id)).size).toBe(100);
});

it('filters by known factual badge and symbol, while invalid query values safely use the default view', () => {
  const badge = listSignalFeed({ badge: 'Crossed 5%' });
  expect(badge.events.every(event => event.badges.includes('Crossed 5%'))).toBe(true);
  const symbol = listSignalFeed({ symbol: 'tcid.jk' });
  expect(symbol.events.every(event => event.symbol === 'TCID.JK')).toBe(true);
  expect(listSignalFeed({ badge: 'invented', symbol: 'not-a-symbol', page: '-3' })).toMatchObject({ page: 1, total: listSignalFeed().total });
});

it('renders the TCID acceptance facts from the artifact, without inventing context', () => {
  const event = listSignals().find(item => item.symbol === 'TCID.JK' && item.holderName === 'Kalon Midco Holdings' && item.ownershipBeforePct === 0 && item.ownershipAfterPct === 66.48);
  expect(event).toBeDefined();
  expect(getSignal(event!.id)?.badges).toEqual(expect.arrayContaining(['New Position', 'Large Shift']));
  expect(event!.specialContextMatches.length).toBeGreaterThan(0);
  expect(event!.specialContextMatches.some(match => /takeover|restructuring/i.test(match))).toBe(true);
});

it('renders the NSSS borrowed-shares context exactly from the artifact', () => {
  const event = listSignals().find(item => item.symbol === 'NSSS.JK' && item.holderName === 'Samuel Tumbuh Bersama' && item.ownershipBeforePct === 4.11 && item.ownershipAfterPct === 8.86);
  expect(event).toBeDefined();
  expect(event!.badges).toContain('Crossed 5%');
  expect(event!.specialContextMatches).toContain('return of borrowed shares');
  expect(factualExplanation(event!)).toContain('The disclosure states: return of borrowed shares');
});

it('keeps an observed repeated holder timeline complete and chronological', () => {
  const repeated = listSignals().find(event => event.pairEventCount >= 5)!;
  const timeline = getTimeline(repeated.pairId)!;
  expect(timeline.events).toHaveLength(repeated.pairEventCount);
  expect(timeline.events.map(event => `${event.timestamp}\0${event.id}`)).toEqual([...timeline.events].sort((a, b) => `${a.timestamp}\0${a.id}`.localeCompare(`${b.timestamp}\0${b.id}`)).map(event => `${event.timestamp}\0${event.id}`));
});

it('returns undefined for missing records, never generates B2 language, and never validates an unsafe source link', () => {
  expect(getSignal('archive:v1:not-real')).toBeUndefined();
  expect(getTimeline('pair:v1:not-real')).toBeUndefined();
  const generated = listSignals().flatMap(event => event.badges.map(badge => badgeExplanation(event, badge))).join(' ') + factualExplanation(listSignals()[0]!)[0];
  expect(generated).not.toMatch(/\b(SILENT|WATCH|MATERIAL|STRUCTURAL|priority|prediction|recommendation|suspicious|manipulation|violation|late|learned)\b/i);
  expect(safeSourceUrl('javascript:alert(1)')).toBeNull();
  expect(safeSourceUrl('data:text/html,no')).toBeNull();
  expect(sourceLink('javascript:alert(1)')).toBeUndefined();
  expect(sourceLink('https://example.test/source')).toBe('https://example.test/source');
});
