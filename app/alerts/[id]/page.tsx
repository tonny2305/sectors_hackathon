import Link from 'next/link';
import { notFound } from 'next/navigation';
import HolderTimeline from '../../../components/HolderTimeline';
import { z } from 'zod';
import { ReadError, Reasons, State } from '../../../components/Evidence';
import { delta, magnitude, number, percent, rate, timestamp } from '../../../lib/presentation.ts';

async function getAlertDetail(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error('Evidence unavailable');

    const [filingRes, evalRes] = await Promise.all([
      fetch(`${url}/rest/v1/filings?id=eq.${id}&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
      fetch(`${url}/rest/v1/event_evaluations?filing_id=eq.${id}&order=created_at.desc&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
    ]);

    if (!filingRes.ok || !evalRes.ok) throw new Error('Evidence unavailable');
    const filings = await filingRes.json();
    const evals = await evalRes.json();

    if (!Array.isArray(filings) || filings.length === 0) {
      notFound();
    }

    const filing = filings[0];
    if (!Array.isArray(evals)) throw new Error('Evidence unavailable');
    const evaluation = evals[0];
    if (!evaluation) notFound();

    // Get prior events for timeline
    const startDate = new Date(Date.parse(filing.source_date) - 180 * 86_400_000).toISOString().slice(0, 10);
    const priorRes = await fetch(
      `${url}/rest/v1/filings?symbol=eq.${encodeURIComponent(filing.symbol)}&normalized_holder_name=eq.${encodeURIComponent(filing.normalized_holder_name)}&source_date=gte.${startDate}&source_timestamp=lt.${encodeURIComponent(filing.source_timestamp)}&select=id,source_timestamp,source_date,transaction_type,ownership_delta_pp,event_evaluations(materiality_state,created_at)&order=source_timestamp.desc&limit=100`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      },
    );
    const priorPayload = priorRes.ok ? await priorRes.json() : [];
    const rows = Array.isArray(priorPayload) ? priorPayload : [];
    const priorEvents = rows.map((row: any) => {
      const { event_evaluations, ...event } = row;
      return { ...event, materiality_state: event_evaluations?.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]?.materiality_state };
    });

    return {
      filing,
      evaluation,
      priorEvents,
      historyError: priorRes.ok ? null : 'Prior-holder evidence could not be loaded. The sequence below is incomplete.',
    };
}

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { filing, evaluation, priorEvents, historyError } = await getAlertDetail(id);
  const state = evaluation.materiality_state;
  const quiet = state === 'SILENT' || state === 'WATCH';

  return <main id="main-content" className="container">
    <Link className="text-link breadcrumb" href={quiet ? '/suppressed' : '/alerts'}>&lt;- {quiet ? 'Attention Log' : 'Priority alerts'}</Link>
    <header className={`event-header detail-${state.toLowerCase()}`}>
      <div className="detail-identity"><p className="eyebrow">Ownership evidence / {filing.source_date}</p><div className="detail-title"><h1>{filing.symbol}</h1><State state={state} /></div><p className="holder-name">{filing.holder_name ?? 'Holder not recorded'}</p><p className="muted">{filing.holder_type ?? 'Holder type not recorded'} / {filing.transaction_type?.toUpperCase() ?? 'Action not recorded'}</p></div>
      <div className="ownership-move"><p className="eyebrow">Ownership before -&gt; after</p><div><span>{percent(filing.ownership_before_pct)}</span><span className="ownership-arrow" aria-hidden="true">-&gt;</span><strong>{percent(filing.ownership_after_pct)}</strong></div><p className="ownership-delta">{delta(filing.ownership_delta_pp)} <span>percentage-point change</span></p></div>
    </header>

    <div className="detail-columns">
      <section aria-labelledby="decision-heading"><p className="eyebrow">The decision</p><h2 id="decision-heading">{quiet ? 'Why this stayed quiet.' : 'Why this deserves attention.'}</h2>
        <Reasons codes={evaluation.reason_codes_json ?? []} />
        {quiet && <div className="suppression-decision"><h3>Withheld from external push</h3><Reasons codes={evaluation.suppression_reason_codes_json ?? []} /></div>}
        <p className="context-note">Enrichment {evaluation.enrichment_skipped ? 'skipped' : 'attempted'} / Liquidity context {evaluation.context_unavailable ? 'unavailable' : 'available'}.</p>
      </section>
      <section aria-labelledby="position-heading"><p className="eyebrow">Quantitative record</p><h2 id="position-heading">The position, in numbers.</h2><dl className="facts">
        <div><dt>Shares transacted</dt><dd>{number(filing.shares_transacted)}</dd></div>
        <div><dt>Transaction value / IDR</dt><dd>{number(filing.transaction_value_idr)}</dd></div>
        <div><dt>Holding before / shares</dt><dd>{number(filing.holding_before)}</dd></div>
        <div><dt>Holding after / shares</dt><dd>{number(filing.holding_after)}</dd></div>
        <div><dt>Relative position change</dt><dd>{rate(evaluation.relative_position_change)}</dd></div>
        <div><dt>Same-direction events / 30 / 90 / 180 days</dt><dd>{number(evaluation.repeat_count_30d)} / {number(evaluation.repeat_count_90d)} / {number(evaluation.repeat_count_180d)}</dd></div>
        <div><dt>Cumulative absolute same-direction change / 180 days</dt><dd>{magnitude(evaluation.cumulative_same_direction_delta_pp_180d)}</dd></div>
      </dl></section>
    </div>

    <ReadError message={historyError} />
    <HolderTimeline symbol={filing.symbol} holderName={filing.holder_name ?? 'Holder not recorded'} events={priorEvents}
      currentEvent={{ source_timestamp: filing.source_timestamp, source_date: filing.source_date, transaction_type: filing.transaction_type, ownership_delta_pp: filing.ownership_delta_pp, materiality_state: state }}
      escalatedFromPriorState={evaluation.escalated_from_prior_state === true} />

    <section className="provenance section-block" aria-labelledby="source-heading">
      <div><p className="eyebrow">Source & provenance</p><h2 id="source-heading">Trace it to the record.</h2><p>Ownership filing sourced through Sectors. Source timestamps are preserved below; display times elsewhere use WIB.</p>{filing.source_url && <a className="text-link" href={filing.source_url} target="_blank" rel="noreferrer">Open original source document -&gt;</a>}</div>
      <dl className="facts"><div><dt>Source timestamp / original</dt><dd>{filing.source_timestamp}</dd></div><div><dt>Evaluated / WIB</dt><dd>{timestamp(evaluation.created_at)}</dd></div><div><dt>Engine version</dt><dd>{evaluation.engine_version ?? 'Not recorded'}</dd></div><div><dt>Filing ID</dt><dd>{filing.id}</dd></div><div><dt>Fingerprint</dt><dd>{filing.fingerprint}</dd></div></dl>
    </section>
  </main>;
}
