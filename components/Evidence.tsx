import Link from 'next/link';
import { delta, number, percent, rate, reasonText, timestamp, type EvaluationView, type RunView } from '../lib/presentation.ts';

export function State({ state }: { state: string }) {
  return <span className={`state state-${state.toLowerCase()}`}>{state}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function ReadError({ message }: { message: string | null }) {
  return message ? <p className="read-error" role="status">{message}</p> : null;
}

export function Reasons({ codes, compact = false }: { codes: string[]; compact?: boolean }) {
  if (!codes.length) return <p className="muted">No reason codes recorded.</p>;
  return <ul className={`reasons ${compact ? 'reasons-compact' : ''}`}>{codes.map(code =>
    <li key={code}><span>{reasonText(code)}</span><code>{code}</code></li>,
  )}</ul>;
}

export function EventList({ events, quiet = false, preview = false }: { events: EvaluationView[]; quiet?: boolean; preview?: boolean }) {
  return <ol className={`event-list ${quiet ? 'event-list-quiet' : ''}`}>{events.map(item => {
    const filing = item.filings;
    const codes = (quiet ? item.suppression_reason_codes_json : item.reason_codes_json) ?? [];
    return <li key={item.id} className={`event-row event-${item.materiality_state.toLowerCase()}`}>
      <div className="event-identity">
        <Link className="ticker" href={`/alerts/${filing?.id || item.filing_id}`}>{filing?.symbol ?? 'Unknown symbol'} <span aria-hidden="true">↗</span></Link>
        <span>{filing?.holder_name ?? 'Holder not recorded'}</span>
        <small>{filing?.transaction_type?.toUpperCase() ?? 'Action not recorded'} · {filing?.source_date ?? 'Date not recorded'}</small>
      </div>
      <div className="event-change"><strong>{delta(filing?.ownership_delta_pp)}</strong><span>{percent(filing?.ownership_before_pct)} → {percent(filing?.ownership_after_pct)}</span><small>ownership</small></div>
      <div className="event-decision"><State state={item.materiality_state} /><Reasons codes={preview ? codes.slice(0, 1) : codes} compact />{preview && codes.length > 1 && <Link className="more-reasons" href={`/alerts/${filing?.id || item.filing_id}`}>+{codes.length - 1} more reason{codes.length > 2 ? 's' : ''} ↗</Link>}</div>
    </li>;
  })}</ol>;
}

export function RunTable({ runs }: { runs: RunView[] }) {
  return <div className="table-wrapper"><table className="run-table">
    <caption className="sr-only">Recorded monitoring runs, newest first. All times in Jakarta (WIB).</caption>
    <thead><tr><th scope="col">Run / WIB</th><th scope="col">Outcome</th><th scope="col" className="numeric">Scanned</th><th scope="col" className="numeric">Eligible</th><th scope="col" className="numeric">Withheld</th><th scope="col" className="numeric">Delivered</th></tr></thead>
    <tbody>{runs.map(run => <tr key={run.id}>
      <td data-label="Run / WIB"><time dateTime={run.started_at}>{timestamp(run.started_at)}</time><small>{run.trigger_type}</small></td>
      <td data-label="Outcome"><State state={run.status} /></td>
      <td data-label="Scanned" className="numeric">{number(run.records_scanned)}</td>
      <td data-label="Eligible" className="numeric">{number(run.eligible_new_filings)}</td>
      <td data-label="Withheld" className="numeric">{number(run.suppressed_from_push_count)}</td>
      <td data-label="Delivered" className="numeric">{number(run.alerts_sent)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function RunFacts({ run }: { run: RunView }) {
  return <dl className="facts run-facts">
    <div><dt>Finished / WIB</dt><dd>{timestamp(run.finished_at)}</dd></div>
    <div><dt>New events ingested</dt><dd>{number(run.new_events)}</dd></div>
    <div><dt>Eligible for evaluation</dt><dd>{number(run.eligible_new_filings)}</dd></div>
    <div><dt>SILENT / WATCH</dt><dd>{number(run.silent_count)} / {number(run.watch_count)}</dd></div>
    <div><dt>MATERIAL / STRUCTURAL</dt><dd>{number(run.material_count)} / {number(run.structural_count)}</dd></div>
    <div><dt>Pages fetched</dt><dd>{number(run.pages_fetched)}</dd></div>
    <div><dt>Estimated credits</dt><dd>{number(run.estimated_credits)}</dd></div>
    <div><dt>Total API latency</dt><dd>{number(run.api_latency_ms_total)} ms</dd></div>
    <div><dt>Interruption reduction</dt><dd>{rate(run.interruption_reduction)}</dd></div>
    <div><dt>Duplicate delivery rate</dt><dd>{rate(run.duplicate_alert_rate)}</dd></div>
    <div><dt>Explainability coverage</dt><dd>{rate(run.explainability_coverage)}</dd></div>
    <div><dt>Run ID</dt><dd>{run.id}</dd></div>
  </dl>;
}
