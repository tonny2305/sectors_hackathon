import { Empty, EventList, ReadError } from '../../components/Evidence';
import { readEvidence } from '../read-evidence';
import type { EvaluationView } from '../../lib/presentation.ts';

export default async function AlertsPage() {
  const { rows, error } = await readEvidence<EvaluationView>('event_evaluations?materiality_state=in.(MATERIAL,STRUCTURAL)&select=*,filings(*)&order=created_at.desc&limit=50');
  return <main id="main-content" className="container">
    <header className="page-heading"><p className="eyebrow">02 / Priority alerts</p><h1>Changes worth your attention.</h1><p>Material ownership moves and exceptional structural changes. Each decision links to its filing, reasons, and holder history.</p></header>
    <ReadError message={error} />
    {!error && <><div className="list-guide"><span>{rows.length} recorded decisions · latest 50 · newest first</span><span>Holder / ownership change / why it matters</span></div>
      {rows.length ? <EventList events={rows} /> : <Empty title="No ownership change requires interruption.">No MATERIAL or STRUCTURAL evaluations are recorded. The run logbook shows what has been scanned.</Empty>}</>}
  </main>;
}
