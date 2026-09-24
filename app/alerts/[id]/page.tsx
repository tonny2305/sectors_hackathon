import Link from 'next/link';
import { notFound } from 'next/navigation';
import HolderTimeline from '../../../components/HolderTimeline';
import { z } from 'zod';
import type { PriorHolderEvent, MaterialityState } from '../../../lib/materiality/types.ts';

async function getAlertDetail(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) notFound();

  try {
    const [filingRes, evalRes] = await Promise.all([
      fetch(`${url}/rest/v1/filings?id=eq.${id}&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
      fetch(`${url}/rest/v1/event_evaluations?filing_id=eq.${id}&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
    ]);

    const filings = await filingRes.json();
    const evals = await evalRes.json();

    if (!Array.isArray(filings) || filings.length === 0) {
      notFound();
    }

    const filing = filings[0];
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
    const rows = priorRes.ok ? await priorRes.json() : [];
    const priorEvents = rows.map((row: any) => {
      const { event_evaluations, ...event } = row;
      return { ...event, materiality_state: event_evaluations?.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]?.materiality_state };
    });

    return {
      filing,
      evaluation,
      priorEvents,
    };
  } catch {
    notFound();
  }
}

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { filing, evaluation, priorEvents } = await getAlertDetail(id);

  const state = evaluation.materiality_state;
  const deltaPp = filing.ownership_delta_pp;
  const deltaSign = (deltaPp ?? 0) >= 0 ? '+' : '';

  return (
    <main className="container">
      {/* Breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
        <Link href="/alerts" style={{ color: '#38bdf8' }}>&larr; Back to Alerts Feed</Link>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span style={{ color: 'var(--text-muted)' }}>{filing.symbol}</span>
      </div>

      {/* Main Header Card */}
      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                {filing.symbol}
              </h1>
              <span className={`badge badge-${state.toLowerCase()}`}>{state}</span>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {filing.holder_name}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Holder Type: <strong style={{ color: 'var(--text-secondary)' }}>{filing.holder_type ?? 'Unknown'}</strong>
              {' '}• Source Date: <strong style={{ color: 'var(--text-secondary)' }}>{filing.source_date}</strong>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>OWNERSHIP DELTA</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: (deltaPp ?? 0) >= 0 ? 'var(--accent-emerald)' : '#f87171' }}>
              {deltaSign}{deltaPp} pp
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {filing.ownership_before_pct}% ➔ {filing.ownership_after_pct}%
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Quantitative Evidence & Provenance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Stake & Position Evidence */}
        <div className="glass-panel">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>Position Evidence</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Transaction Action</span>
              <span style={{ fontWeight: 700, textTransform: 'uppercase', color: filing.transaction_type === 'buy' ? 'var(--accent-emerald)' : '#f87171' }}>
                {filing.transaction_type}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Shares Transacted</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {filing.shares_transacted != null ? Number(filing.shares_transacted).toLocaleString('en-US') : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Transaction Value</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {filing.transaction_value_idr != null ? `IDR ${Number(filing.transaction_value_idr).toLocaleString('id-ID')}` : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Holding Before / After</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                {filing.holding_before != null ? Number(filing.holding_before).toLocaleString('en-US') : 'N/A'} ➔ {filing.holding_after != null ? Number(filing.holding_after).toLocaleString('en-US') : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Relative Position Shift</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#38bdf8' }}>
                {evaluation.relative_position_change ? `${(Number(evaluation.relative_position_change) * 100).toFixed(2)}%` : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Decision Reasons & Provenance */}
        <div className="glass-panel">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>Decision & Sectors Provenance</h3>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>EVALUATION REASON CODES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {(evaluation.reason_codes_json || []).map((rc: string) => (
                <span key={rc} className="reason-pill">{rc}</span>
              ))}
            </div>
            {(state === 'SILENT' || state === 'WATCH') && (
              <div style={{ marginTop: '16px' }}>
                <strong>No external alert: {state}</strong>
                <p>Enrichment {evaluation.enrichment_skipped ? 'skipped' : 'attempted'}; context {evaluation.context_unavailable ? 'unavailable' : 'available'}.</p>
                {(evaluation.suppression_reason_codes_json || []).map((code: string) => <span key={code} className="suppression-pill">{code}</span>)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Sectors Source Timestamp: </span>
              <code style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{filing.source_timestamp}</code>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Fingerprint: </span>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{filing.fingerprint}</code>
            </div>
            {filing.source_url && (
              <div style={{ marginTop: '6px' }}>
                <a href={filing.source_url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>
                  Open Raw IDX Source Document &rarr;
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historical Holder Behavior Timeline Component */}
      <HolderTimeline
        symbol={filing.symbol}
        holderName={filing.holder_name}
        events={priorEvents}
        currentEvent={{
          source_timestamp: filing.source_timestamp,
          source_date: filing.source_date,
          transaction_type: filing.transaction_type,
          ownership_delta_pp: filing.ownership_delta_pp,
          materiality_state: state,
        }}
        escalatedFromPriorState={evaluation.escalated_from_prior_state === true}
      />
    </main>
  );
}
