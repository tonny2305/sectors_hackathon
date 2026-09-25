import WatchlistClient from './WatchlistClient';
import { readEvidence } from '../read-evidence';
import { ReadError } from '../../components/Evidence';

export default async function WatchlistPage() {
  const { rows, error } = await readEvidence<{ symbol: string }>('watchlist_symbols?order=symbol.asc');
  return <main id="main-content" className="container">
    <header className="page-heading"><p className="eyebrow">05 / Monitoring scope</p><h1>Keep the right companies in view.</h1><p>IDX symbols covered by the ownership sentinel. Changes require the watchlist admin token.</p></header>
    <ReadError message={error} />{!error && <WatchlistClient initialSymbols={rows.map(row => row.symbol)} />}
  </main>;
}
