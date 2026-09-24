import type { PriorHolderEvent, MaterialityState } from '../lib/materiality/types.ts';

interface TimelineItem {
  id: string;
  source_timestamp: string;
  source_date: string;
  transaction_type: 'buy' | 'sell' | 'others';
  ownership_delta_pp: number | null;
  materiality_state?: MaterialityState;
  isCurrent?: boolean;
}

export default function HolderTimeline({
  symbol,
  holderName,
  events,
  currentEvent,
}: {
  symbol: string;
  holderName: string;
  events: PriorHolderEvent[];
  currentEvent: {
    source_timestamp: string;
    source_date: string;
    transaction_type: 'buy' | 'sell' | 'others';
    ownership_delta_pp: number | null;
    materiality_state: MaterialityState;
  };
}) {
  // Combine past events + current event sorted chronologically (oldest to newest)
  const allEvents: TimelineItem[] = [
    ...events.map(e => ({ ...e, isCurrent: false })),
    {
      id: 'current-event',
      source_timestamp: currentEvent.source_timestamp,
      source_date: currentEvent.source_date,
      transaction_type: currentEvent.transaction_type,
      ownership_delta_pp: currentEvent.ownership_delta_pp,
      materiality_state: currentEvent.materiality_state,
      isCurrent: true,
    },
  ].sort((a, b) => Date.parse(a.source_date) - Date.parse(b.source_date));

  return (
    <div className="glass-panel" style={{ marginTop: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Historical Holder Behavior Timeline
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Prior 180-day activity for <strong style={{ color: 'var(--text-secondary)' }}>{holderName}</strong> in <strong style={{ color: 'var(--text-secondary)' }}>{symbol}</strong>
        </p>
      </div>

      <div className="timeline" style={{ paddingLeft: '24px' }}>
        {allEvents.map((item, index) => {
          const state = item.materiality_state || 'SILENT';
          const dotClass = state === 'MATERIAL' || state === 'STRUCTURAL'
            ? 'material'
            : state === 'WATCH'
            ? 'watch'
            : 'silent';

          const deltaSign = (item.ownership_delta_pp ?? 0) >= 0 ? '+' : '';
          const deltaText = item.ownership_delta_pp !== null
            ? `${deltaSign}${item.ownership_delta_pp} pp`
            : 'Unchanged';

          return (
            <div key={item.id || index} className="timeline-item">
              <div className={`timeline-dot ${dotClass}`} />
              
              <div style={{
                background: item.isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: item.isCurrent ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.source_date}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: item.transaction_type === 'buy' ? 'var(--accent-emerald)' : '#f87171',
                      textTransform: 'uppercase',
                    }}>
                      {item.transaction_type} ({deltaText})
                    </span>
                    {item.isCurrent && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        background: 'rgba(56, 189, 248, 0.2)',
                        color: '#38bdf8',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}>
                        CURRENT EVENT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Event Timestamp: {item.source_timestamp}
                  </div>
                </div>

                <div className={`badge badge-${state.toLowerCase()}`}>
                  {state}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {allEvents.length >= 2 && (
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          borderRadius: '6px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          fontSize: '0.82rem',
          color: 'var(--material-text)',
        }}>
          💡 <strong>Stateful Escalation Proof:</strong> Evaluated {allEvents.length} sequential disclosures within lookback window. Accumulated behavior escalated transaction triage from routine holding adjustment to actionable research priority.
        </div>
      )}
    </div>
  );
}
