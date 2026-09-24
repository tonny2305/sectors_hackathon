import Link from 'next/link';
import { notFound } from 'next/navigation';
import HolderTimeline from '../../../components/HolderTimeline';
import type { PriorHolderEvent, MaterialityState } from '../../../lib/materiality/types.ts';

async function getAlertDetail(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Documented NSSS case study fallback
  if (id === 'documented-nsss' || !url || !key) {
    return {
      filing: {
        id: 'documented-nsss',
        symbol: 'NSSS.JK',
        source_url: 'https://idx.co.id/filing/sample-nsss',
        source_timestamp: '2026-07-09T14:29:39',
        source_date: '2026-07-09',
        holder_name: 'Samuel Sekuritas Indonesia',
        normalized_holder_name: 'samuel sekuritas indonesia',
        holder_type: 'institution',
        transaction_type: 'buy' as const,
        holding_before: 9559919000,
        holding_after: 10169179100,
        shares_transacted: 609260100,
        ownership_before_pct: 40.17,
        ownership_after_pct: 42.73,
        ownership_delta_pp: 2.56,
        transaction_value_idr: 351225097500,
        raw_payload_json: {
          symbol: 'NSSS.JK',
          timestamp: '2026-07-09T14:29:39',
          holder_name: 'Samuel Sekuritas Indonesia',
          share_percentage_before: 40.17,
          share_percentage_after: 42.73,
          transaction_value: 351225097500,
          shares_transacted: 609260100,
        },
      },
      evaluation: {
        materiality_state: 'MATERIAL' as MaterialityState,
        reason_codes_json: ['LARGE_STAKE_MOVE_GE_1PP', 'REPEATED_SAME_DIRECTION_GE_3', 'ESCALATED_BY_HOLDER_HISTORY'],
        suppression_reason_codes_json: [],
        relative_position_change: 0.063731,
        repeat_count_180d: 5,
        cumulative_same_direction_delta_pp_180d: 12.73,
        escalated_from_prior_state: true,
        engine_version: 'v2.0.0-materiality-sentinel',
      },
      priorEvents: [
        {
          id: 'p-1',
          source_timestamp: '2026-02-15T10:00:00',
          source_date: '2026-02-15',
          transaction_type: 'buy' as const,
          ownership_delta_pp: 2.50,
          materiality_state: 'MATERIAL' as MaterialityState,
        },
        {
          id: 'p-2',
          source_timestamp: '2026-03-20T10:00:00',
          source_date: '2026-03-20',
          transaction_type: 'buy' as const,
          ownership_delta_pp: 2.50,
          materiality_state: 'MATERIAL' as MaterialityState,
        },
        {
          id: 'p-3',
          source_timestamp: '2026-04-25T10:00:00',
          source_date: '2026-04-25',
          transaction_type: 'buy' as const,
          ownership_delta_pp: 2.50,
          materiality_state: 'MATERIAL' as MaterialityState,
        },
        {
          id: 'p-4',
          source_timestamp: '2026-06-05T10:00:00',
          source_date: '2026-06-05',
          transaction_type: 'buy' as const,
          ownership_delta_pp: 2.67,
          materiality_state: 'MATERIAL' as MaterialityState,
        },
      ] as PriorHolderEvent[],
    };
  }

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
    const evaluation = evals[0] || {};

    // Get prior events for timeline
    const priorRes = await fetch(
      `${url}/rest/v1/filings?symbol=eq.${encodeURIComponent(filing.symbol)}&normalized_holder_name=eq.${encodeURIComponent(filing.normalized_holder_name)}&source_date=lt.${filing.source_date}&select=id,source_timestamp,source_date,transaction_type,ownership_delta_pp&order=source_date.desc&limit=20`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      },
    );
    const priorEvents = priorRes.ok ? await priorRes.json() : [];

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

  const state = evaluation.materiality_state || 'MATERIAL';
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
              Holder Type: <strong style={{ color: 'var(--text-secondary)' }}>{filing.holder_type || 'Institution'}</strong>
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
                {filing.shares_transacted ? Number(filing.shares_transacted).toLocaleString('en-US') : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Transaction Value</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {filing.transaction_value_idr ? `IDR ${Number(filing.transaction_value_idr).toLocaleString('id-ID')}` : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Holding Before / After</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                {filing.holding_before ? Number(filing.holding_before).toLocaleString('en-US') : '0'} ➔ {filing.holding_after ? Number(filing.holding_after).toLocaleString('en-US') : '0'}
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
      />
    </main>
  );
}
