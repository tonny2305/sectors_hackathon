import { NextResponse } from 'next/server';
import { normalizeSymbol } from '../../../lib/sectors/normalize.ts';
import { symbolSchema } from '../../../lib/sectors/schemas.ts';
import { hasBearerToken } from '../../../lib/auth/bearer.ts';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ symbols: [], error: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const response = await fetch(`${url}/rest/v1/watchlist_symbols?order=symbol.asc`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ symbols: [], error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
    }

    const rows = await response.json();
    return NextResponse.json({ symbols: rows.map((r: { symbol: string }) => r.symbol) });
  } catch {
    return NextResponse.json({ symbols: [], error: 'DATABASE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!process.env.WATCHLIST_ADMIN_TOKEN || process.env.WATCHLIST_ADMIN_TOKEN.length < 32) {
    return NextResponse.json({ error: 'WATCHLIST_WRITES_DISABLED' }, { status: 503 });
  }
  if (!hasBearerToken(request, process.env.WATCHLIST_ADMIN_TOKEN)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'DATABASE_NOT_CONFIGURED' }, { status: 500 });
  }

  try {
    const body = await request.json();
    if (!body?.symbol) {
      return NextResponse.json({ error: 'MISSING_SYMBOL' }, { status: 400 });
    }

    const parsed = symbolSchema.safeParse(body.symbol);
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_SYMBOL' }, { status: 400 });
    const symbol = normalizeSymbol(parsed.data);

    // Get or create default watchlist
    let watchlistId = '';
    const wlRes = await fetch(`${url}/rest/v1/watchlists?limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const watchlists = await wlRes.json();
    if (Array.isArray(watchlists) && watchlists.length > 0) {
      watchlistId = watchlists[0].id;
    } else {
      const createWl = await fetch(`${url}/rest/v1/watchlists`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ name: 'Default Watchlist' }),
      });
      const created = await createWl.json();
      watchlistId = created[0]?.id;
    }

    const insertRes = await fetch(`${url}/rest/v1/watchlist_symbols`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ watchlist_id: watchlistId, symbol, enabled: true }),
    });

    if (!insertRes.ok && insertRes.status !== 409) {
      return NextResponse.json({ error: 'FAILED_TO_INSERT' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, symbol });
  } catch {
    return NextResponse.json({ error: 'WATCHLIST_WRITE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!process.env.WATCHLIST_ADMIN_TOKEN || process.env.WATCHLIST_ADMIN_TOKEN.length < 32) {
    return NextResponse.json({ error: 'WATCHLIST_WRITES_DISABLED' }, { status: 503 });
  }
  if (!hasBearerToken(request, process.env.WATCHLIST_ADMIN_TOKEN)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'DATABASE_NOT_CONFIGURED' }, { status: 500 });
  }

  try {
    const body = await request.json();
    if (!body?.symbol) {
      return NextResponse.json({ error: 'MISSING_SYMBOL' }, { status: 400 });
    }

    const parsed = symbolSchema.safeParse(body.symbol);
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_SYMBOL' }, { status: 400 });
    const symbol = normalizeSymbol(parsed.data);

    const deleteRes = await fetch(`${url}/rest/v1/watchlist_symbols?symbol=eq.${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    if (!deleteRes.ok) {
      return NextResponse.json({ error: 'FAILED_TO_DELETE' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, symbol });
  } catch {
    return NextResponse.json({ error: 'WATCHLIST_WRITE_FAILED' }, { status: 500 });
  }
}
