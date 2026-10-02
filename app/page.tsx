import Link from 'next/link';
import { ARCHIVE_LABEL, SIGNAL_BADGES, companyLabel, listSignalFeed, listSignals } from '../lib/archive/signalkeeper.ts';
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
  const allEvents = listSignals();
  const feed = listSignalFeed({ badge: first(query.badge), symbol: first(query.symbol), page: first(query.page) });
  const nsssContext = allEvents.find(event => event.symbol === 'NSSS.JK' && event.holderName === 'Samuel Tumbuh Bersama' && event.ownershipBeforePct === 4.11 && event.ownershipAfterPct === 8.86)!;
  const historyExample = allEvents.find(event => event.symbol === 'NSSS.JK' && event.holderName === 'Samuel Sekuritas Indonesia' && event.ownershipBeforePct === 21.64 && event.ownershipAfterPct === 22.51)!;
  return <main id="main-content" className="container">
    <header className="page-heading"><p className="eyebrow">Ownership signals</p><h1>Understand who is gaining or losing ownership influence.</h1><p>What actually changed in the disclosed stake — with holder history and source context.</p></header>
    <p className="archive-banner">{ARCHIVE_LABEL}</p>
    <section className="archive-evidence" aria-label="Historical archive statistics"><p className="eyebrow">Historical Sectors archive · 3 Jul–30 Sep 2026</p><dl><div><dt>Observed disclosures</dt><dd>900</dd></div><div><dt>Symbols</dt><dd>179</dd></div><div><dt>Crossed the 5% line</dt><dd>85</dd></div><div><dt>Ownership shifts ≥5 pp</dt><dd>90</dd></div></dl></section>
    <section className="product-evidence" aria-labelledby="context-heading"><div><p className="eyebrow">Disclosure context</p><h2 id="context-heading">A percentage change does not always mean what you think it means.</h2><p>Samuel Tumbuh Bersama moved from 4.11% to 8.86% in NSSS.JK, crossing 5%. The source context says: return of borrowed shares. SIGNALKEEPER surfaces the disclosed context rather than automatically treating this as fresh investment buying.</p></div><Link className="text-link" href={`/signals/${encodeURIComponent(nsssContext.id)}`}>Read the NSSS disclosure →</Link></section>
    <section className="mechanism-evidence" aria-labelledby="history-heading"><div><p className="eyebrow">Triage mechanism evidence · separate from archive badges</p><h2 id="history-heading">Why history matters</h2><p>The current NSSS.JK disclosure is identical in both evaluations. Only legitimate prior holder history changes.</p></div><div className="ablation-flow"><div><span>Without holder history</span><strong>WATCH</strong><small>No immediate interruption</small></div><div aria-hidden="true">→</div><div><span>With actual frozen holder history</span><strong>MATERIAL</strong><small>Interrupt</small></div></div><p>Samuel Sekuritas Indonesia · 21.64% → 22.51% · +0.87 pp · stateful holder memory · causal history code: <code>REPEATED_SAME_DIRECTION_GE_3</code>.</p><Link className="text-link" href={`/signals/${encodeURIComponent(historyExample.id)}`}>Inspect the corresponding archive disclosure →</Link></section>
    <section className="benefit-evidence" aria-labelledby="benefit-heading"><p className="eyebrow">Sealed evaluation evidence</p><h2 id="benefit-heading">117 real persisted filings <span aria-hidden="true">↓</span> 64 interruptions</h2><p>45.3% fewer interruptions than alerting on every filing. 18 / 18 human-consensus immediate-attention cases retained.</p><small>Measured on the sealed 117-filing evaluation; not a claim about all IDX disclosures.</small></section>
    <section className="section-block" aria-labelledby="signals-heading"><div className="section-heading"><div><p className="eyebrow">Archive feed</p><h2 id="signals-heading">Ownership signals</h2></div></div>
      <form className="archive-filters" method="get"><label>Badge<select name="badge" defaultValue={feed.badge ?? ''}><option value="">All factual badges</option>{SIGNAL_BADGES.map(badge => <option key={badge}>{badge}</option>)}</select></label><label>Symbol<input name="symbol" defaultValue={feed.symbol ?? ''} placeholder="e.g. TCID.JK" /></label><button className="btn btn-primary">Filter</button></form>
      <p className="section-caption">{feed.total} of 900 observed disclosures carry at least one defined signal{feed.badge || feed.symbol ? ' after filters' : ''}. Newest first.</p>
      <ol className="event-list archive-event-list">{feed.events.map(event => <li className="event-row archive-event" key={event.id}>
        <div className="event-identity"><Link className="ticker" href={`/signals/${encodeURIComponent(event.id)}`}>{event.symbol} <span aria-hidden="true">→</span></Link><strong>{companyLabel(event)}</strong><span>{event.holderName}</span><small>{event.sourceDate}</small></div>
        <div className="event-change"><strong>{delta(event.signedDeltaPp)}</strong><span>{percent(event.ownershipBeforePct)} → {percent(event.ownershipAfterPct)}</span><small>disclosed ownership</small></div>
        <div><div className="signal-badges">{event.badges.map(badge => <span key={badge}>{badge}</span>)}</div>{event.specialContextMatches.map(match => <p className="context-preview" key={match}>{event.tags.includes(match) ? `Sectors tag: ${match}` : `The disclosure states: ${match}`}</p>)}</div>
      </li>)}</ol>
      <nav className="pagination" aria-label="Feed pages">{feed.page > 1 && <Link className="text-link" href={href(feed.page - 1, feed.badge, feed.symbol)}>Previous</Link>}<span>Page {feed.page} of {feed.totalPages}</span>{feed.page < feed.totalPages && <Link className="text-link" href={href(feed.page + 1, feed.badge, feed.symbol)}>Next</Link>}</nav>
    </section>
  </main>;
}
