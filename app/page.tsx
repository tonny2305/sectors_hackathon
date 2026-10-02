import Link from 'next/link';
import { ARCHIVE_LABEL, SIGNAL_BADGES, companyLabel, listSignalFeed } from '../lib/archive/signalkeeper.ts';
import { delta, percent } from '../lib/presentation.ts';

function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function href(page: number, badge?: string, symbol?: string): string {
  const query = new URLSearchParams({ page: String(page) });
  if (badge) query.set('badge', badge);
  if (symbol) query.set('symbol', symbol);
  return `/?${query}`;
}

export default async function DashboardPage({ searchParams }: PageProps<'/'>) {
  const query = await searchParams;
  const feed = listSignalFeed({ badge: first(query.badge), symbol: first(query.symbol), page: first(query.page) });
  return <main id="main-content" className="container">
    <header className="page-heading"><p className="eyebrow">Ownership signals feed</p><h1>Understand who is gaining or losing ownership influence.</h1><p>What actually changed in the disclosed stake — with holder history and source context.</p></header>
    <p className="archive-banner">{ARCHIVE_LABEL}</p>
    <form className="archive-filters" method="get"><label>Badge<select name="badge" defaultValue={feed.badge ?? ''}><option value="">All factual badges</option>{SIGNAL_BADGES.map(badge => <option key={badge}>{badge}</option>)}</select></label><label>Symbol<input name="symbol" defaultValue={feed.symbol ?? ''} placeholder="e.g. TCID.JK" /></label><button className="btn btn-primary">Filter</button></form>
    <p className="section-caption">{feed.total} of 900 observed disclosures carry at least one defined signal{feed.badge || feed.symbol ? ' after filters' : ''}. Newest first.</p>
    <ol className="event-list archive-event-list">{feed.events.map(event => <li className="event-row archive-event" key={event.id}>
      <div className="event-identity"><Link className="ticker" href={`/signals/${encodeURIComponent(event.id)}`}>{event.symbol} <span aria-hidden="true">→</span></Link><strong>{companyLabel(event)}</strong><span>{event.holderName}</span><small>{event.sourceDate}</small></div>
      <div className="event-change"><strong>{delta(event.signedDeltaPp)}</strong><span>{percent(event.ownershipBeforePct)} → {percent(event.ownershipAfterPct)}</span><small>disclosed ownership</small></div>
      <div><div className="signal-badges">{event.badges.map(badge => <span key={badge}>{badge}</span>)}</div>{event.specialContextMatches.map(match => <p className="context-preview" key={match}>{event.tags.includes(match) ? `Sectors tag: ${match}` : `The disclosure states: ${match}`}</p>)}</div>
    </li>)}</ol>
    <nav className="pagination" aria-label="Feed pages">{feed.page > 1 && <Link className="text-link" href={href(feed.page - 1, feed.badge, feed.symbol)}>Previous</Link>}<span>Page {feed.page} of {feed.totalPages}</span>{feed.page < feed.totalPages && <Link className="text-link" href={href(feed.page + 1, feed.badge, feed.symbol)}>Next</Link>}</nav>
  </main>;
}
