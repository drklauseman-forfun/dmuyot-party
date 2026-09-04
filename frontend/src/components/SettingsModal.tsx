interface SettingsModalProps {
  spinDuration: number;
  soundEnabled: boolean;
  /** Persisting the change is the caller's job; this only reports it. */
  onSpinDurationChange: (seconds: number) => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onClose: () => void;
}

const DURATION_PRESETS = [0, 1, 2, 5, 10];

function SettingsModal({
  spinDuration,
  soundEnabled,
  onSpinDurationChange,
  onSoundEnabledChange,
  onClose,
}: SettingsModalProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
        <div className="settings-row">
          <label>Spin Duration (Seconds)</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {DURATION_PRESETS.map(s => (
              <button
                key={s}
                onClick={() => onSpinDurationChange(s)}
                style={{ flex: '1 0 30%', fontSize: '0.8rem', background: spinDuration === s ? '#646cff' : '#333', padding: '0.5rem' }}
              >
                {s === 0 ? '0s (Instant)' : `${s}s`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              className="spin-input"
              style={{ width: '100px' }}
              value={spinDuration}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onSpinDurationChange(isNaN(val) ? 0 : Math.min(10, Math.max(0, val)));
              }}
            />
            <span style={{ color: '#666', fontSize: '0.8rem' }}>Custom (Max 10s)</span>
          </div>
        </div>
        <div className="settings-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#888' }}>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => onSoundEnabledChange(e.target.checked)}
            />
            Enable Spin Sound
          </label>
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: '1rem' }}>Close</button>
      </div>
    </div>
  );
}

export default SettingsModal;
