import WatchlistClient from './WatchlistClient';

async function getWatchlist() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'NSSS.JK', 'ASII.JK'];
  }

  try {
    const res = await fetch(`${url}/rest/v1/watchlist_symbols?order=symbol.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!res.ok) return ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'NSSS.JK', 'ASII.JK'];
    const rows = await res.json();
    return rows.map((r: { symbol: string }) => r.symbol);
  } catch {
    return ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'NSSS.JK', 'ASII.JK'];
  }
}

export default async function WatchlistPage() {
  const initialSymbols = await getWatchlist();

  return (
    <main className="container">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Watchlist Configuration</h1>
          <span className="badge badge-active">MONITORING SCOPE</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Specify Indonesian listed companies (IDX) covered by the autonomous materiality monitoring sentinel.
        </p>
      </div>

      <WatchlistClient initialSymbols={initialSymbols} />
    </main>
  );
}
