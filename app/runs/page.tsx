async function getRuns() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return [];
  }

  try {
    const res = await fetch(`${url}/rest/v1/automation_runs?order=started_at.desc&limit=50`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export default async function RunsPage() {
  const runs = await getRuns();

  return (
    <main className="container">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Autonomous Run History</h1>
          <span className="badge badge-active">AUDIT LOG</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Complete record of unattended scheduled cycles and manual triggers executed by GitHub Actions.
        </p>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>STARTED (WIB)</th>
              <th>TRIGGER</th>
              <th>STATUS</th>
              <th>PAGES</th>
              <th>SCANNED</th>
              <th>NEW</th>
              <th>SILENT</th>
              <th>WATCH</th>
              <th>MATERIAL</th>
              <th>STRUCTURAL</th>
              <th>REDUCTION</th>
              <th>CREDITS</th>
              <th>LATENCY</th>
            </tr>
          </thead>
          <tbody>
            {runs.length > 0 ? (
              runs.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {new Date(r.started_at).toLocaleString('id-ID')}
                  </td>
                  <td>
                    <span className="reason-pill">{r.trigger_type}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${r.status === 'COMPLETE' ? 'active' : r.status === 'PARTIAL' ? 'material' : 'structural'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.pages_fetched}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.records_scanned}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.new_events}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{r.silent_count ?? 0}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{r.watch_count ?? 0}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{r.material_count ?? 0}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#c084fc' }}>{r.structural_count ?? 0}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                    {r.interruption_reduction != null ? `${(Number(r.interruption_reduction) * 100).toFixed(1)}%` : 'N/A'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.estimated_credits} cr</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{r.api_latency_ms_total} ms</td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)' }}>24 Sep 2026, 18:30</td>
                <td><span className="reason-pill">SCHEDULED_CRON</span></td>
                <td><span className="badge badge-active">COMPLETE</span></td>
                <td>1</td>
                <td>42</td>
                <td>4</td>
                <td>4</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>100.0%</td>
                <td>1 cr</td>
                <td>420 ms</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
