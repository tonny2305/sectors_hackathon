'use client';

import { useState } from 'react';

export default function WatchlistClient({ initialSymbols }: { initialSymbols: string[] }) {
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [newTicker, setNewTicker] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTicker.trim().toUpperCase();
    if (!clean) return;

    setIsAdding(true);
    setMessage(null);

    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: clean }),
      });

      if (res.ok) {
        const data = await res.json();
        const formatted = data.symbol || `${clean.replace(/\.JK$/, '')}.JK`;
        if (!symbols.includes(formatted)) {
          setSymbols([...symbols, formatted].sort());
        }
        setNewTicker('');
        setMessage(`Added ${formatted} to watchlist`);
      } else {
        const formatted = `${clean.replace(/\.JK$/, '')}.JK`;
        if (!symbols.includes(formatted)) {
          setSymbols([...symbols, formatted].sort());
        }
        setNewTicker('');
        setMessage(`Locally added ${formatted}`);
      }
    } catch {
      const formatted = `${clean.replace(/\.JK$/, '')}.JK`;
      if (!symbols.includes(formatted)) {
        setSymbols([...symbols, formatted].sort());
      }
      setNewTicker('');
      setMessage(`Locally added ${formatted}`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
      {/* Add Symbol Card */}
      <div className="glass-panel">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Add Monitored Ticker</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Enter a 4-letter IDX stock symbol (e.g. <code>BBCA</code>, <code>ASII</code>, <code>GOTO</code>, <code>NSSS</code>).
        </p>

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
            placeholder="e.g. BBCA or BBCA.JK"
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#fff',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
            }}
          />
          <button type="submit" disabled={isAdding || !newTicker.trim()} className="btn btn-primary">
            {isAdding ? 'Adding...' : 'Add Ticker'}
          </button>
        </form>

        {message && (
          <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>
            ✓ {message}
          </div>
        )}
      </div>

      {/* Active Symbols List */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Monitored IDX Symbols</h3>
          <span className="badge badge-active">{symbols.length} ACTIVE</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {symbols.map(sym => (
            <div
              key={sym}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div className="pulse-dot" />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem' }}>
                {sym}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
