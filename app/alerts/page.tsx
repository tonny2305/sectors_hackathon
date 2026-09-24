import Link from 'next/link';

async function getAlerts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return [];
  }

  try {
    const query = 'event_evaluations?materiality_state=in.(MATERIAL,STRUCTURAL)&select=*,filings(*)&order=created_at.desc&limit=50';
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <main className="container">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Material Ownership Alerts</h1>
          <span className="badge badge-material">PRIORITY INBOX</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Disclosures that met quantitative stake magnitude, rapid relative positioning changes, or stateful accumulation criteria.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {alerts.length > 0 ? (
          alerts.map((item: any) => {
            const filing = item.filings;
            const state = item.materiality_state;
            const deltaPp = item.features?.ownershipDeltaPp ?? filing?.ownership_delta_pp;
            const deltaSign = (deltaPp ?? 0) >= 0 ? '+' : '';

            return (
              <div key={item.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.2rem', color: '#f8fafc' }}>
                      {filing?.symbol}
                    </span>
                    <span className={`badge badge-${state.toLowerCase()}`}>{state}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {filing?.source_date || filing?.source_timestamp?.slice(0, 10)}
                    </span>
                  </div>

                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {filing?.holder_name}
                  </div>

                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Action: <strong style={{ color: filing?.transaction_type === 'buy' ? 'var(--accent-emerald)' : '#f87171' }}>{filing?.transaction_type?.toUpperCase()}</strong>
                    {' '}• Stake Shift: <strong style={{ color: '#fff' }}>{filing?.ownership_before_pct}% ➔ {filing?.ownership_after_pct}%</strong>
                    {' '}(<strong style={{ color: (deltaPp ?? 0) >= 0 ? 'var(--accent-emerald)' : '#f87171' }}>{deltaSign}{deltaPp} pp</strong>)
                    {filing?.transaction_value_idr && ` • IDR ${(Number(filing.transaction_value_idr)).toLocaleString('id-ID')}`}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {(item.reason_codes_json || []).map((rc: string) => (
                      <span key={rc} className="reason-pill">{rc}</span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                  <Link href={`/alerts/${filing?.id || item.filing_id}`} className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
                    Inspect Evidence & Timeline &rarr;
                  </Link>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Fingerprint: {filing?.fingerprint?.slice(0, 14)}...
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <p>No material events have been evaluated yet.</p>
        )}
      </div>
    </main>
  );
}
