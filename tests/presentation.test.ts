import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { delta, number, percent, rate, reasonText, timestamp } from '../lib/presentation.ts';
import HolderTimeline from '../components/HolderTimeline';
import { readEvidence } from '../app/read-evidence';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('preserves missing versus measured zero, direction, small changes, and Jakarta time', () => {
  expect(number(null)).toBe('Not recorded');
  expect(number(0)).toBe('0');
  expect(number('123456789012345')).toBe('123,456,789,012,345');
  expect(number(NaN)).toBe('Not recorded');
  expect(percent(0)).toBe('0%');
  expect(percent(null)).toBe('Not recorded');
  expect(delta(42.73 - 40.17)).toBe('+2.56 pp');
  expect(delta(-0.1)).toBe('-0.1 pp');
  expect(delta(0)).toBe('0 pp');
  expect(delta(0.000000001)).toBe('+0.000000001 pp');
  expect(delta(null)).toBe('Not recorded');
  expect(rate(null)).toBe('Not measured');
  expect(rate(0)).toBe('0%');
  expect(rate(0.1)).toBe('10%');
  expect(timestamp('2026-09-24T18:00:00Z')).toBe('25 Sept 2026, 01:00:00 WIB');
  expect(timestamp('2026-09-24T18:00:00')).toBe('2026-09-24T18:00:00');
  expect(timestamp('invalid')).toBe('Not recorded');
  expect(reasonText('UNRECOGNIZED_CODE')).toBe('UNRECOGNIZED_CODE');
});

it('shows actual chronological history, preserves unverified states, and does not invent a ladder', () => {
  const currentEvent = { source_timestamp: '2026-09-24T12:00:00Z', source_date: '2026-09-24', transaction_type: 'buy' as const, ownership_delta_pp: 0, materiality_state: 'MATERIAL' as const };
  const html = renderToStaticMarkup(createElement(HolderTimeline, {
    symbol: 'TEST.JK', holderName: 'Test holder', currentEvent, escalatedFromPriorState: false,
    events: [
      { ...currentEvent, id: 'later', source_timestamp: '2026-09-24T11:00:00Z', materiality_state: 'WATCH' },
      { ...currentEvent, id: 'earlier', source_timestamp: '2026-09-24T10:00:00Z', materiality_state: undefined },
    ],
  }));
  expect(html.indexOf('UNVERIFIED')).toBeLessThan(html.indexOf('WATCH'));
  expect(html.indexOf('WATCH')).toBeLessThan(html.indexOf('MATERIAL'));
  expect(html).not.toContain('SILENT');
  expect(html).not.toContain('Escalated by holder history.');
  expect(html).toContain('0 pp');
  const empty = renderToStaticMarkup(createElement(HolderTimeline, { symbol: 'TEST.JK', holderName: 'Test holder', currentEvent, escalatedFromPriorState: false, events: [] }));
  expect(empty).toContain('No prior holder events');
  expect(empty).not.toContain('WATCH');
});

it('distinguishes an empty evidence read from unavailable or failed reads', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  expect((await readEvidence('filings')).error).toContain('not configured');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')));
  expect(await readEvidence('filings')).toEqual({ rows: [], error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
  expect((await readEvidence('filings')).error).toContain('could not be loaded');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  expect((await readEvidence('filings')).error).toContain('could not be loaded');
});
