import { describe, expect, it, vi } from 'vitest';
import { GET as getRuns } from '../app/api/runs/route.ts';
import { GET as getAlerts } from '../app/api/alerts/route.ts';
import { GET as getSuppressed } from '../app/api/suppressed/route.ts';
import { GET as getWatchlist, POST as postWatchlist, DELETE as deleteWatchlist } from '../app/api/watchlist/route.ts';
import { POST as runMonitor } from '../app/api/monitor/run/route.ts';

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

  it('does not present fallback watchlist symbols as configured', async () => {
    const res = await getWatchlist();
    const data = await res.json();
    expect(Array.isArray(data.symbols)).toBe(true);
    expect(data.symbols).toEqual([]);
  });

  it('rejects unauthenticated watchlist writes before reaching Supabase', async () => {
    const original = process.env.WATCHLIST_ADMIN_TOKEN;
    process.env.WATCHLIST_ADMIN_TOKEN = 'a'.repeat(48);
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const req = new Request('http://localhost:3000/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'goto' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const deletion = new Request('http://localhost:3000/api/watchlist', {
      method: 'DELETE',
      body: JSON.stringify({ symbol: 'GOTO.JK' }),
      headers: { 'Content-Type': 'application/json' },
    });
    try {
      expect((await postWatchlist(req)).status).toBe(401);
      expect((await deleteWatchlist(deletion)).status).toBe(401);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
      if (original === undefined) delete process.env.WATCHLIST_ADMIN_TOKEN;
      else process.env.WATCHLIST_ADMIN_TOKEN = original;
    }
  });

  it('rejects unauthenticated monitor calls before any Sectors credit is spent', async () => {
    const original = process.env.MONITOR_TRIGGER_TOKEN;
    process.env.MONITOR_TRIGGER_TOKEN = 'b'.repeat(48);
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      const request = new Request('http://localhost:3000/api/monitor/run', { method: 'POST', body: '{}' });
      expect((await runMonitor(request)).status).toBe(401);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
      if (original === undefined) delete process.env.MONITOR_TRIGGER_TOKEN;
      else process.env.MONITOR_TRIGGER_TOKEN = original;
    }
  });
});
