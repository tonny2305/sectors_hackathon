import Link from 'next/link';
import type { PriorHolderEvent, MaterialityState } from '../lib/materiality/types.ts';
import { delta, timestamp } from '../lib/presentation.ts';
import { State } from './Evidence';

export default function HolderTimeline({ symbol, holderName, events, currentEvent, escalatedFromPriorState }: {
  symbol: string;
  holderName: string;
  events: PriorHolderEvent[];
  currentEvent: Omit<PriorHolderEvent, 'id'> & { materiality_state: MaterialityState };
  escalatedFromPriorState: boolean;
}) {
  // Display order only; the engine's holder-history calculations are unchanged.
  const allEvents = [
    ...events.map(event => ({ ...event, isCurrent: false })),
    { ...currentEvent, id: 'current-event', isCurrent: true },
  ].sort((a, b) => Date.parse(a.source_timestamp) - Date.parse(b.source_timestamp));

  return <section className="holder-history" aria-labelledby="history-heading">
    <div className="section-heading"><div><p className="eyebrow">Holder memory / preceding 180 days</p><h2 id="history-heading">One filing is a moment.<br />A holder’s history is context.</h2></div></div>
    <p className="section-caption">{holderName} · {symbol} · {events.length} prior records shown (up to 100), oldest first. This is the recorded sequence, not a predicted path.</p>
    {escalatedFromPriorState && <p className="escalation-note"><strong>Escalated by holder history.</strong> Repeated same-direction changes altered the interpretation of this event. Read the recorded reasons alongside the sequence.</p>}
    {!events.length && <p className="history-empty">No prior holder events are available in this view. Only the current event is shown; no earlier state is inferred.</p>}
    <ol className="holder-sequence">{allEvents.map((item, index) => <li key={item.id} className={`history-event history-${(item.materiality_state ?? 'unverified').toLowerCase()} ${item.isCurrent ? 'history-current' : ''}`}>
      <span className="sequence-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div className="history-time"><time dateTime={item.source_timestamp}>{timestamp(item.source_timestamp)}</time>{item.isCurrent ? <strong>Current event</strong> : <Link href={`/alerts/${item.id}`}>Inspect filing ↗</Link>}</div>
      <div className="history-change"><span>{item.transaction_type?.toUpperCase() ?? 'ACTION NOT RECORDED'}</span><strong>{delta(item.ownership_delta_pp)}</strong></div>
      <div className="history-state"><span className="sr-only">Classified as </span><State state={item.materiality_state ?? 'UNVERIFIED'} />{item.isCurrent && escalatedFromPriorState && <small>↑ Escalated</small>}</div>
    </li>)}</ol>
  </section>;
}
