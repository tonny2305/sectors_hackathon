import Link from 'next/link';

async function getSuppressedEvents() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return [];
  }

  try {
    const query = 'event_evaluations?materiality_state=in.(SILENT,WATCH)&select=*,filings(*)&order=created_at.desc&limit=100';
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export default async function SuppressedLogPage() {
  const suppressed = await getSuppressedEvents();

  return (
    <main className="container">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Explainable Silence Log</h1>
          <span className="badge badge-silent">NOISE SUPPRESSION</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Translucent audit of routine disclosures evaluated by the Sentinel and intentionally suppressed from external notifications.
        </p>
      </div>

      <div className="glass-panel" style={{ marginBottom: '24px', background: 'rgba(14, 165, 233, 0.04)', borderColor: 'rgba(14, 165, 233, 0.2)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
          Product Thesis: Silence is an Active Decision
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Every routine disclosure listed below was parsed, deduplicated, and evaluated against 180-day holder history. 
          The system remained silent because no quantitative materiality or repeated-behavior rule was crossed.
        </p>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>SYMBOL</th>
              <th>HOLDER & TRANSACTION</th>
              <th>STAKE SHIFT</th>
              <th>STATE</th>
              <th>EXPLAINABLE SUPPRESSION REASONS</th>
              <th>ENRICHMENT</th>
              <th>SOURCE TIMESTAMP</th>
            </tr>
          </thead>
          <tbody>
            {suppressed.length > 0 ? (
              suppressed.map((item: any) => {
                const filing = item.filings;
                const state = item.materiality_state;
                const delta = item.features?.ownershipDeltaPp ?? filing?.ownership_delta_pp;
                const deltaSign = (delta ?? 0) >= 0 ? '+' : '';

                return (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                      {filing?.symbol}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{filing?.holder_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {filing?.transaction_type}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      {delta != null ? `${deltaSign}${delta} pp` : 'N/A'}
                    </td>
                    <td>
                      <span className={`badge badge-${state.toLowerCase()}`}>{state}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {(item.suppression_reason_codes_json || []).map((sc: string) => (
                          <span key={sc} className="suppression-pill">{sc}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: item.enrichment_skipped ? 'var(--text-muted)' : 'var(--accent-cyan)' }}>
                      {item.enrichment_skipped ? 'SKIPPED (0 cr)' : 'FETCHED'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {filing?.source_timestamp}
                      {filing?.id && <Link href={`/alerts/${filing.id}`}> Inspect evidence</Link>}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={7}>No suppressed events have been evaluated yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
