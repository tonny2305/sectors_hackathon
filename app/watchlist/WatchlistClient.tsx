'use client';

import { useState } from 'react';

const PRESET_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'NSSS', 'GOTO', 'UNTR', 'AMRT'];

export default function WatchlistClient({ initialSymbols, adminEnabled = true }: { initialSymbols: string[]; adminEnabled?: boolean }) {
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

  return <div className="watchlist-layout">
    {adminEnabled ? <section className="watchlist-editor" aria-labelledby="add-heading">
      <p className="eyebrow">Monitoring scope</p><h2 id="add-heading">Add an IDX symbol.</h2>
      <label htmlFor="watchlist-admin-token">Watchlist admin token</label>
      <input id="watchlist-admin-token" type="password" autoComplete="off" value={adminToken} onChange={e => setAdminToken(e.target.value)} placeholder="Required to change the watchlist" />
      <form onSubmit={e => { e.preventDefault(); addSymbol(newTicker); }}>
        <label htmlFor="new-ticker">Stock symbol</label><p className="field-hint" id="ticker-hint">Use a four-letter IDX symbol, with or without .JK.</p>
        <div className="input-row"><input id="new-ticker" aria-describedby="ticker-hint" type="text" value={newTicker} onChange={e => setNewTicker(e.target.value)} placeholder="BBCA or BBCA.JK" disabled={isProcessing} /><button type="submit" disabled={isProcessing || !newTicker.trim() || !adminToken} className="btn btn-primary">{isProcessing ? 'Saving…' : 'Add symbol'}</button></div>
      </form>
      <p className="field-hint">Quick add</p><div className="preset-list">{PRESET_TICKERS.map(preset => {
        const isMonitored = symbols.includes(`${preset}.JK`);
        return <button className="btn btn-secondary" key={preset} type="button" onClick={() => !isMonitored && addSymbol(preset)} disabled={isMonitored || isProcessing || !adminToken}>{preset} {isMonitored ? '✓' : '+'}</button>;
      })}</div>
      {message && <p role="status" className={`form-message ${message.type}`}>{message.text}</p>}
    </section> : <section className="watchlist-editor" aria-labelledby="public-scope-heading">
      <p className="eyebrow">Public monitoring universe</p><h2 id="public-scope-heading">Administration is disabled.</h2>
      <p className="field-hint">This view reports the symbols currently persisted for monitoring. Watchlist changes are restricted to the operator interface.</p>
    </section>}
    <section className="watchlist-symbols" aria-labelledby="symbols-heading"><div className="section-heading"><h2 id="symbols-heading">Monitored symbols</h2><span className="muted">{symbols.length} recorded</span></div>
      {symbols.length ? <ul>{symbols.map(sym => <li key={sym}><span className="ticker">{sym}</span>{adminEnabled && <button type="button" onClick={() => removeSymbol(sym)} disabled={isProcessing || !adminToken} className="btn btn-secondary" aria-label={`Remove ${sym}`}>Remove</button>}</li>)}</ul> : <p className="empty-state">No symbols recorded. The monitoring universe is currently empty.</p>}
    </section>
  </div>;
}