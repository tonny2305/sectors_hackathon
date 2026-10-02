import WatchlistClient from './WatchlistClient';
import { readEvidence } from '../read-evidence';
import { ReadError } from '../../components/Evidence';

export default async function WatchlistPage() {
  const { rows, error } = await readEvidence<{ symbol: string }>('watchlist_symbols?order=symbol.asc');
  return <main id="main-content" className="container"><header className="page-heading"><p className="eyebrow">Personal monitoring</p><h1>Your monitored companies</h1><p>Personal monitoring stays active for these symbols. Telegram may deliver the existing B2-triaged alerts; it is a delivery channel, not an ownership recommendation.</p></header><ReadError message={error} />{!error && <WatchlistClient initialSymbols={rows.map(row => row.symbol)} adminEnabled={false} />}</main>;
}
