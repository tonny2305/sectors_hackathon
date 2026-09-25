import Link from 'next/link';
import { readEvidence } from './read-evidence';
import { Empty, EventList, ReadError, RunTable, State } from '../components/Evidence';
import { number, timestamp, type EvaluationView, type RunView } from '../lib/presentation.ts';

export default async function DashboardPage() {
  const [runs, alerts, suppressed, scheduled] = await Promise.all([
    readEvidence<RunView>('automation_runs?order=started_at.desc&limit=5'),
    readEvidence<EvaluationView>('event_evaluations?materiality_state=in.(MATERIAL,STRUCTURAL)&select=*,filings(*)&order=created_at.desc&limit=5'),
    readEvidence<EvaluationView>('event_evaluations?materiality_state=in.(SILENT,WATCH)&select=*,filings(*)&order=created_at.desc&limit=5'),
    readEvidence<RunView>('automation_runs?trigger_type=eq.SCHEDULED_CRON&order=started_at.desc&limit=1'),
  ]);
  const latest = runs.rows[0];
  const autonomous = scheduled.rows[0];

  return <main id="main-content" className="container">
    <header className="page-heading dashboard-heading">
      <div><p className="eyebrow">01 / Attention desk · IDX ownership</p><h1>What deserves<br className="desktop-break" /> attention now?</h1><p>Ownership changes, weighed against the holder’s history.</p></div>
      <aside className="autonomy-note" aria-label="Autonomous system evidence">
        <p className="eyebrow">Last autonomous check</p><ReadError message={scheduled.error} />
        {autonomous ? <><State state={autonomous.status} /><time dateTime={autonomous.started_at}>{timestamp(autonomous.started_at)}</time><p>Scheduled execution recorded. {number(autonomous.records_scanned)} filings scanned.</p></> : !scheduled.error && <p>No scheduled execution recorded.</p>}
        <Link className="text-link" href="/runs">Inspect execution evidence ↗</Link>
      </aside>
    </header>
    <div className="desk-layout">
      <section className="priority-section" aria-labelledby="priority-heading">
        <div className="section-heading"><div><p className="eyebrow">For your attention</p><h2 id="priority-heading">The priority queue</h2></div><Link className="text-link" href="/alerts">All alerts ↗</Link></div>
        <p className="section-caption">Latest {Math.min(alerts.rows.length, 3) || ''} material & structural decisions · newest evaluations first</p><ReadError message={alerts.error} />
        {alerts.rows.length ? <EventList events={alerts.rows.slice(0, 3)} preview /> : !alerts.error && <Empty title="No ownership change requires interruption.">No MATERIAL or STRUCTURAL evaluations are recorded in this view. Check the run log for scan coverage.</Empty>}
      </section>
      <aside className="attention-aside" aria-labelledby="silence-heading">
        <p className="eyebrow">The other side of attention</p><h2 id="silence-heading">Silence has<br /> its reasons.</h2><p>Below the interruption threshold.<br />Still part of the record.</p><ReadError message={suppressed.error} />
        {suppressed.rows.length ? <ol className="silence-preview">{suppressed.rows.slice(0, 3).map(item => <li key={item.id}>
          <div><Link className="ticker" href={`/alerts/${item.filings?.id || item.filing_id}`}>{item.filings?.symbol ?? 'Unknown symbol'} ↗</Link><State state={item.materiality_state} /></div>
          <p>{item.filings?.holder_name ?? 'Holder not recorded'}</p><p className="silence-reason">{item.suppression_reason_codes_json?.includes('BELOW_PUSH_THRESHOLD') ? 'Stayed below the interruption threshold.' : 'Inspect the recorded suppression reasons.'}</p>
        </li>)}</ol> : !suppressed.error && <Empty title="No quiet decisions recorded yet.">SILENT and WATCH evaluations will appear here with their reasons.</Empty>}
        <Link className="text-link" href="/suppressed">Open the Attention Log ↗</Link>
      </aside>
    </div>
    <section className="attention-account" aria-labelledby="account-heading">
      <div className="account-intro"><p className="eyebrow">Attention accounting</p><h2 id="account-heading">Checked. Considered.<br />Interrupted only if warranted.</h2><p>{latest ? <>Latest run · <time dateTime={latest.started_at}>{timestamp(latest.started_at)}</time> · {latest.status}</> : 'No run available to measure.'}</p></div>
      <div className="account-evidence"><ReadError message={runs.error} />
        <dl className="attention-flow">
          <div><dt>Filings scanned</dt><dd>{latest ? number(latest.records_scanned) : '—'}</dd></div>
          <div><dt>Eligible new filings</dt><dd>{latest ? number(latest.eligible_new_filings) : '—'}</dd></div>
          <div><dt>Withheld from push</dt><dd>{latest ? number(latest.suppressed_from_push_count) : '—'}</dd></div>
          <div className="flow-delivered"><dt>Pushes delivered</dt><dd>{latest ? number(latest.alerts_sent) : '—'}</dd></div>
        </dl><p className="account-footnote">Withheld = SILENT + WATCH. A priority decision is not proof of delivery. Counts describe this run only; unmeasured values stay unmeasured.</p>
      </div>
    </section>
    <section className="section-block" aria-labelledby="runs-heading">
      <div className="section-heading"><div><p className="eyebrow">Execution record</p><h2 id="runs-heading">Recent checks</h2></div><Link className="text-link" href="/runs">Run logbook ↗</Link></div>
      {runs.rows.length ? <RunTable runs={runs.rows} /> : !runs.error && <Empty title="No monitoring runs recorded.">Scan counts and decisions will appear after a persisted run.</Empty>}
    </section>
  </main>;
}
