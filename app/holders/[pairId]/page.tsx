import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARCHIVE_COVERAGE, ARCHIVE_LABEL, companyLabel, getTimeline } from '../../../lib/archive/signalkeeper.ts';
import { delta, percent } from '../../../lib/presentation.ts';

export default async function HolderPage({ params }: { params: Promise<{ pairId: string }> }) {
  const { pairId } = await params;
  const result = getTimeline(pairId);
  if (!result) notFound();
  const { timeline, events } = result;
  const first = events[0]!;
  return <main id="main-content" className="container">
    <Link className="text-link breadcrumb" href="/">← All ownership signals</Link>
    <p className="archive-banner">{ARCHIVE_LABEL}</p>
    <header className="page-heading"><p className="eyebrow">Holder timeline</p><h1>{timeline.holderName}</h1><p>{first.symbol} · {companyLabel(first)} · {events.length} observed archive disclosures for this exact pair.</p></header>
    <p className="coverage-note">{ARCHIVE_COVERAGE}</p>
    <ol className="holder-sequence">{events.map((event, index) => <li className="history-event archive-history-event" key={event.id}>
      <span className="sequence-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div className="history-time"><time dateTime={event.timestamp}>{event.sourceDate}</time><Link href={`/signals/${encodeURIComponent(event.id)}`}>View disclosure →</Link></div><div className="history-change"><span>{event.transactionType}</span><strong>{percent(event.ownershipBeforePct)} → {percent(event.ownershipAfterPct)}</strong><small>{delta(event.signedDeltaPp)}</small></div><div className="history-state"><div className="signal-badges">{event.badges.map(badge => <span key={badge}>{badge}</span>)}</div>{event.specialContextMatches.map(match => <small className="context-preview" key={match}>{event.tags.includes(match) ? `Sectors tag: ${match}` : `The disclosure states: ${match}`}</small>)}</div>
    </li>)}</ol>
  </main>;
}
