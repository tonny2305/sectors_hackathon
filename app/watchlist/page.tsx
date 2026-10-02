import Link from 'next/link';
import WatchlistClient from './WatchlistClient';
import { readEvidence } from '../read-evidence';
import { ReadError } from '../../components/Evidence';

export default async function WatchlistPage() {
  const { rows, error } = await readEvidence<{ symbol: string }>('watchlist_symbols?order=symbol.asc');
  return <main id="main-content" className="container">
    <header className="page-heading">
      <p className="eyebrow">Configured monitoring</p>
      <h1>Companies configured for monitoring</h1>
      <p>This public view shows the configured monitoring set. Watchlist administration is operator-managed and disabled in the public interface.</p>
    </header>
    <section className="workflow-evidence" aria-labelledby="workflow-heading">
      <div>
        <p className="eyebrow">Monitoring workflow</p>
        <h2 id="workflow-heading">From disclosure to delivery</h2>
        <p>Configured symbols can pass through the scheduled Sectors monitoring, deduplication, holder memory, stateful triage, persistence, and Telegram delivery workflow when upstream monitoring is available.</p>
        <small>Operational evidence is historical; this page does not promise current or uninterrupted coverage.</small>
      </div>
      <Link className="text-link" href="/runs">View automation evidence →</Link>
    </section>
    <ReadError message={error} />
    {!error && <WatchlistClient initialSymbols={rows.map(row => row.symbol)} adminEnabled={false} />}
  </main>;
}
