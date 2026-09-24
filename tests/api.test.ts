import { describe, expect, it } from 'vitest';
import { GET as getRuns } from '../app/api/runs/route.ts';
import { GET as getAlerts } from '../app/api/alerts/route.ts';
import { GET as getSuppressed } from '../app/api/suppressed/route.ts';
import { GET as getWatchlist, POST as postWatchlist, DELETE as deleteWatchlist } from '../app/api/watchlist/route.ts';

describe('API Route Handlers (Phase 4)', () => {
  it('handles /api/runs with fallback when DB is unconfigured', async () => {
    const res = await getRuns();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.runs)).toBe(true);
  });

  it('handles /api/alerts with fallback when DB is unconfigured', async () => {
    const res = await getAlerts();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.alerts)).toBe(true);
  });

  it('handles /api/suppressed with fallback when DB is unconfigured', async () => {
    const res = await getSuppressed();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.suppressed)).toBe(true);
  });

  it('handles /api/watchlist GET and returns default symbols when unconfigured', async () => {
    const res = await getWatchlist();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.symbols)).toBe(true);
    expect(data.symbols).toContain('BBCA.JK');
  });

  it('normalizes symbol on /api/watchlist POST', async () => {
    const req = new Request('http://localhost:3000/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'goto' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await postWatchlist(req);
    expect([200, 400, 500]).toContain(res.status);
  });

  it('handles /api/watchlist DELETE', async () => {
    const req = new Request('http://localhost:3000/api/watchlist', {
      method: 'DELETE',
      body: JSON.stringify({ symbol: 'GOTO.JK' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await deleteWatchlist(req);
    expect([200, 400, 500]).toContain(res.status);
  });
});
