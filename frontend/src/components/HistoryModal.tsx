import type { HistoryEntry } from '../types';

interface HistoryModalProps {
  /** The most recent spin's winners — this is a last-result view, not a log. */
  history: HistoryEntry[];
  onClear: () => void;
  onClose: () => void;
}

function HistoryModal({ history, onClear, onClose }: HistoryModalProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>📜 Last Result</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
        <div className="results-list" style={{ maxHeight: '400px' }}>
          {history.map((item, i) => (
            <div key={i} className="history-item" style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', marginBottom: '5px', borderRadius: '8px' }}>
              <span>
                <span style={{ color: '#666', marginRight: '0.5rem' }}>[{item.index + 1}]</span>
                <strong>{item.name}</strong>
              </span>
              <span className="history-time">{item.timestamp}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
          <button onClick={onClear} style={{ flex: 1, background: '#333' }}>Clear</button>
          <button onClick={onClose} style={{ flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default HistoryModal;
