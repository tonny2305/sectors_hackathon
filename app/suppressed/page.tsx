import { Empty, EventList, ReadError, State } from '../../components/Evidence';
import { readEvidence } from '../read-evidence';
import type { EvaluationView } from '../../lib/presentation.ts';

export default async function SuppressedLogPage() {
  const { rows, error } = await readEvidence<EvaluationView>('event_evaluations?materiality_state=in.(SILENT,WATCH)&select=*,filings(*)&order=created_at.desc&limit=100');
  return <main id="main-content" className="container">
    <header className="page-heading"><p className="eyebrow">03 / Attention Log</p><h1>A decision to stay quiet.</h1><p>These ownership changes were evaluated and withheld from push. Here is why the system chose not to interrupt you.</p></header>
    <div className="silence-key"><div><State state="SILENT" /><p>Recorded without interruption.</p></div><div><State state="WATCH" /><p>Worth following. Still below the push threshold.</p></div><p>Silence is a decision, not a missing record. Open any event to inspect its evidence and prior-holder context.</p></div>
    <ReadError message={error} />
    {!error && <><div className="list-guide"><span>{rows.length} quiet decisions · latest 100 · newest first</span><span>Stayed silent because…</span></div>
      {rows.length ? <EventList events={rows} quiet /> : <Empty title="No quiet decisions recorded yet.">SILENT and WATCH evaluations will appear with the reasons for withholding an interruption.</Empty>}</>}
  </main>;
}
