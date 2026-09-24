'use client';

import { useState } from 'react';

const PRESET_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'NSSS', 'GOTO', 'UNTR', 'AMRT'];

export default function WatchlistClient({ initialSymbols }: { initialSymbols: string[] }) {
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [newTicker, setNewTicker] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [adminToken, setAdminToken] = useState('');

  const addSymbol = async (ticker: string) => {
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;

    setIsProcessing(true);
    setMessage(null);

    const formatted = clean.includes('.') ? clean : `${clean}.JK`;

    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ symbol: clean }),
      });

      if (res.ok) {
        if (!symbols.includes(formatted)) {
          setSymbols(prev => [...prev, formatted].sort());
        }
        setNewTicker('');
        setMessage({ text: `Successfully added ${formatted} to active watchlist`, type: 'success' });
      } else {
        setMessage({ text: 'Save failed. Check the admin token and server connection.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Save failed. Check the server connection.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const removeSymbol = async (symbolToRemove: string) => {
    setIsProcessing(true);
    setMessage(null);

    try {
      const res = await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ symbol: symbolToRemove }),
      });

      if (res.ok) {
        setSymbols(prev => prev.filter(s => s !== symbolToRemove));
        setMessage({ text: `Removed ${symbolToRemove} from watchlist`, type: 'success' });
      } else {
        setMessage({ text: 'Remove failed. Check the admin token and server connection.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Remove failed. Check the server connection.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
      {/* Add Symbol Card */}
      <div className="glass-panel">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Add Monitored Ticker</h3>
        <label htmlFor="watchlist-admin-token">Watchlist admin token</label>
        <input id="watchlist-admin-token" type="password" autoComplete="off" value={adminToken}
          onChange={e => setAdminToken(e.target.value)} placeholder="Required to change the watchlist"
          style={{ width: '100%', marginBottom: '16px' }} />
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Enter a 4-letter IDX stock symbol (e.g. <code>BBCA</code>, <code>ASII</code>, <code>NSSS</code>).
        </p>

        <form onSubmit={e => { e.preventDefault(); addSymbol(newTicker); }} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="text"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
            placeholder="e.g. BBCA or BBCA.JK"
            disabled={isProcessing}
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
          <button type="submit" disabled={isProcessing || !newTicker.trim() || !adminToken} className="btn btn-primary">
            {isProcessing ? 'Saving...' : 'Add Ticker'}
          </button>
        </form>

        {/* Quick Add Presets */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
            QUICK PRESETS (POPULAR IDX TICKERS):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {PRESET_TICKERS.map(preset => {
              const sym = `${preset}.JK`;
              const isMonitored = symbols.includes(sym);
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => !isMonitored && addSymbol(preset)}
                  disabled={isMonitored || isProcessing || !adminToken}
                  style={{
                    background: isMonitored ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                    border: isMonitored ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                    color: isMonitored ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    cursor: isMonitored ? 'default' : 'pointer',
                  }}
                >
                  {preset} {isMonitored ? '✓' : '+'}
                </button>
              );
            })}
          </div>
        </div>

        {message && (
          <div style={{
            marginTop: '16px',
            fontSize: '0.82rem',
            color: message.type === 'success' ? 'var(--accent-emerald)' : '#f87171',
            padding: '8px 12px',
            borderRadius: '6px',
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          }}>
            {message.type === 'success' ? '✓' : '⚠'} {message.text}
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
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div className="pulse-dot" />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem' }}>
                {sym}
              </span>
              <button
                type="button"
                onClick={() => removeSymbol(sym)}
                disabled={isProcessing || !adminToken}
                title={`Remove ${sym}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
