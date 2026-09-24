import Link from 'next/link';

export default function Footer() {
  return (
    <footer style={{
      marginTop: 'auto',
      borderTop: '1px solid var(--border-subtle)',
      background: 'rgba(7, 9, 14, 0.9)',
      padding: '32px 0 24px',
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
    }}>
      <div className="container" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              Ownership Materiality Sentinel
            </span>
            {' '}— Sectors Hackathon 2026 (Track 2: Automation & Workflows)
          </div>
          <div style={{ display: 'flex', gap: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            <span>ENGINE: v2.0.0</span>
            <span>SCHEDULE: 10:30, 12:30, 15:30, 18:30 WIB</span>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          paddingTop: '16px',
          fontSize: '0.78rem',
          lineHeight: '1.6',
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Disclaimer:</strong> Information and analysis tool only. 
          Does not provide buy/sell/hold investment recommendations, target prices, or portfolio management advice. 
          All ownership evidence is sourced directly from <a href="https://sectors.app" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>Sectors API</a>.
        </div>
      </div>
    </footer>
  );
}
