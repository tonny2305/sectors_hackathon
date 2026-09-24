import Link from 'next/link';
import { Store } from '../lib/db/store.ts';

async function getDashboardData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      runs: [],
      latestRun: null,
      alerts: [],
      suppressed: [],
    };
  }

  try {
    const [runsRes, alertsRes, suppressedRes] = await Promise.all([
      fetch(`${url}/rest/v1/automation_runs?order=started_at.desc&limit=5`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
      fetch(`${url}/rest/v1/event_evaluations?materiality_state=in.(MATERIAL,STRUCTURAL)&select=*,filings(*)&order=created_at.desc&limit=5`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
      fetch(`${url}/rest/v1/event_evaluations?materiality_state=in.(SILENT,WATCH)&select=*,filings(*)&order=created_at.desc&limit=5`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }),
    ]);

    const runs = runsRes.ok ? await runsRes.json() : [];
    const alerts = alertsRes.ok ? await alertsRes.json() : [];
    const suppressed = suppressedRes.ok ? await suppressedRes.json() : [];

    return {
      runs,
      latestRun: runs[0] || null,
      alerts,
      suppressed,
    };
  } catch {
    return {
      runs: [],
      latestRun: null,
      alerts: [],
      suppressed: [],
    };
  }
}

export default async function DashboardPage() {
  const { runs, latestRun, alerts, suppressed } = await getDashboardData();

  // Find the most recent run with measured attention metrics or use latestRun
  const activeRun = runs.find((r: any) => r.interruption_reduction != null) || latestRun;

  const interruptionReduction = activeRun?.interruption_reduction != null
    ? `${(Number(activeRun.interruption_reduction) * 100).toFixed(1)}%`
    : 'N/A';

  const duplicateAlertRate = activeRun?.duplicate_alert_rate != null
    ? `${(Number(activeRun.duplicate_alert_rate) * 100).toFixed(0)}%`
    : 'N/A';

  const explainabilityCoverage = activeRun?.explainability_coverage != null
    ? `${(Number(activeRun.explainability_coverage) * 100).toFixed(0)}%`
    : 'N/A';

  const totalScanned = activeRun?.records_scanned ?? (runs.length > 0 ? runs[0].records_scanned : 0);
  const suppressedCount = activeRun?.suppressed_from_push_count ?? (runs.length > 0 ? runs[0].suppressed_from_push_count : 0);
  const alertsSent = activeRun?.alerts_sent ?? (runs.length > 0 ? runs[0].alerts_sent : 0);

  return (
    <main className="container">
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '20px',
        marginBottom: '32px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Attention Intelligence Dashboard
            </h1>
            <span className="badge badge-active">{runs.some((r: any) => r.trigger_type === 'SCHEDULED_CRON') ? 'SCHEDULED RUN RECORDED' : 'SCHEDULE UNVERIFIED'}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '680px' }}>
            Autonomous materiality layer filtering noise from Indonesian ownership disclosures. Interrupts equity researchers only when filings cross transparent quantitative & historical thresholds.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>LAST RUN</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {latestRun?.finished_at ? new Date(latestRun.finished_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'No run recorded'}
            </div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }} />
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NEXT EXPECTED RUN</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
              See scheduler configuration
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid-kpi">
        <div className="kpi-card" style={{ borderLeft: '4px solid #38bdf8' }}>
          <div className="kpi-title">Interruption Reduction</div>
          <div className="kpi-value" style={{ color: '#38bdf8' }}>{interruptionReduction}</div>
          <div className="kpi-subtext">
            <strong>{suppressedCount} of {activeRun?.eligible_new_filings ?? 0}</strong> evaluated watchlist events suppressed from push.
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="kpi-title">Duplicate Alert Rate</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{duplicateAlertRate}</div>
          <div className="kpi-subtext">
            Rate from recorded external deliveries; N/A until measured.
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #fbbf24' }}>
          <div className="kpi-title">Explainability Coverage</div>
          <div className="kpi-value" style={{ color: '#fbbf24' }}>{explainabilityCoverage}</div>
          <div className="kpi-subtext">
            Coverage from delivered alerts with source, timestamp, quantitative evidence, and reason codes.
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #a855f7' }}>
          <div className="kpi-title">Actionable Alerts</div>
          <div className="kpi-value" style={{ color: '#c084fc' }}>{alertsSent}</div>
          <div className="kpi-subtext">
            Surfaced material/structural changes prioritized for analyst review.
          </div>
        </div>
      </div>

      {/* Main Grid: Latest Alerts & Explainable Silence Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Priority Alerts Feed */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Actionable Material Alerts</h2>
            <Link href="/alerts" style={{ fontSize: '0.82rem', color: '#38bdf8', fontWeight: 600 }}>
              View All Alerts &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.length > 0 ? (
              alerts.map((item: any) => {
                const filing = item.filings;
                const state = item.materiality_state;
                const deltaPp = item.features?.ownershipDeltaPp ?? filing?.ownership_delta_pp;
                const deltaSign = (deltaPp ?? 0) >= 0 ? '+' : '';

                return (
                  <Link
                    key={item.id}
                    href={`/alerts/${filing?.id || item.filing_id}`}
                    style={{
                      display: 'block',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#f8fafc' }}>
                          {filing?.symbol || 'Unknown symbol'}
                        </span>
                        <span className={`badge badge-${state.toLowerCase()}`}>
                          {state}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: (deltaPp ?? 0) >= 0 ? 'var(--accent-emerald)' : '#f87171' }}>
                        {deltaPp == null ? 'N/A' : `${deltaSign}${deltaPp} pp`}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      {filing?.holder_name || 'Unknown holder'}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {(item.reason_codes_json || []).map((rc: string) => (
                        <span key={rc} className="reason-pill">{rc}</span>
                      ))}
                    </div>
                  </Link>
                );
              })
            ) : (
              <p>No material events have been evaluated yet.</p>
            )}
          </div>
        </div>

        {/* Explainable Silence Feed */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Explainable Silence Log</h2>
            <Link href="/suppressed" style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
              View Suppressed Log &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {suppressed.length > 0 ? (
              suppressed.slice(0, 3).map((item: any) => {
                const filing = item.filings;
                const state = item.materiality_state;
                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem' }}>
                        {filing?.symbol || 'Unknown symbol'}
                      </span>
                      <span className={`badge badge-${state.toLowerCase()}`}>{state}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      {filing?.holder_name || 'Unknown holder'}
                    </div>
                    <div>
                      {(item.suppression_reason_codes_json || []).map((sc: string) => (
                        <span key={sc} className="suppression-pill">{sc}</span>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
<p>No suppressed events have been evaluated yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Autonomous Scheduled Runs Timeline */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Scheduled Execution Timeline</h2>
          <Link href="/runs" style={{ fontSize: '0.82rem', color: '#38bdf8', fontWeight: 600 }}>
            Full Run Audit Logs &rarr;
          </Link>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>TIME</th>
                <th>TRIGGER</th>
                <th>STATUS</th>
                <th>SCANNED</th>
                <th>NEW</th>
                <th>SUPPRESSED</th>
                <th>PUSHED</th>
                <th>REDUCTION</th>
                <th>CREDITS</th>
              </tr>
            </thead>
            <tbody>
              {runs.length > 0 ? (
                runs.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {new Date(r.started_at).toLocaleTimeString('id-ID')}
                    </td>
                    <td><span className="reason-pill">{r.trigger_type}</span></td>
                    <td>
                      <span className={`badge badge-${r.status === 'COMPLETE' ? 'active' : 'material'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.records_scanned}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.new_events}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {r.suppressed_from_push_count ?? 'N/A'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--material-text)' }}>
                      {r.alerts_sent ?? 'N/A'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                      {r.interruption_reduction != null ? `${(Number(r.interruption_reduction) * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {r.estimated_credits} cr
                    </td>
                  </tr>
                ))
              ) : (
<tr><td colSpan={9}>No unattended run evidence has been recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
