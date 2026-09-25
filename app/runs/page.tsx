import { Empty, ReadError, RunFacts, RunTable, State } from '../../components/Evidence';
import { timestamp, type RunView } from '../../lib/presentation.ts';
import { readEvidence } from '../read-evidence';

export default async function RunsPage() {
  const { rows, error } = await readEvidence<RunView>('automation_runs?order=started_at.desc&limit=50');
  return <main id="main-content" className="container">
    <header className="page-heading"><p className="eyebrow">04 / Execution evidence</p><h1>The run logbook.</h1><p>Recorded checks, actual coverage, and delivery counts. Scheduled, manual, and verification runs remain distinguishable.</p></header>
    <div className="logbook-note"><strong>A schedule is a plan. A run is evidence.</strong><p>Read the trigger and outcome together. PARTIAL means limited coverage; zero delivered pushes does not mean zero priority decisions. All times are WIB (UTC+7).</p></div>
    <ReadError message={error} />
    {rows.length ? <><p className="section-caption">Latest {rows.length} runs · up to 50 · newest first</p><RunTable runs={rows} />
      <section className="section-block" aria-labelledby="run-details-heading"><div className="section-heading"><div><p className="eyebrow">Behind each check</p><h2 id="run-details-heading">Execution details</h2></div></div>
        <p className="section-caption">Classification counts, resources, and measured delivery rates. Expand a run to inspect.</p>
        {rows.map(run => <details className="run-detail" key={run.id}><summary><time dateTime={run.started_at}>{timestamp(run.started_at)}</time><span>{run.trigger_type}</span><State state={run.status} /></summary><RunFacts run={run} /></details>)}
      </section></> : !error && <Empty title="No execution evidence yet.">The first persisted run will show its trigger, scan coverage, and outcome here.</Empty>}
  </main>;
}
