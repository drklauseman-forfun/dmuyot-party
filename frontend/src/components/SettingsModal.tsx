import { useState } from 'react';
import { SOUND_PACKS } from '../sound/packs';
import { playPreview } from '../sound/engine';
import { isSamplePackLoaded, isSamplePackReady } from '../sound/samples';

interface SettingsModalProps {
  spinDuration: number;
  soundEnabled: boolean;
  soundPack: string;
  /** Persisting the change is the caller's job; this only reports it. */
  onSpinDurationChange: (seconds: number) => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onSoundPackChange: (id: string) => void;
  effectsEnabled: boolean;
  onEffectsEnabledChange: (enabled: boolean) => void;
  onClose: () => void;
}

const DURATION_PRESETS = [0, 1, 2, 5, 10];

function SettingsModal({
  spinDuration,
  soundEnabled,
  soundPack,
  onSpinDurationChange,
  onSoundEnabledChange,
  onSoundPackChange,
  effectsEnabled,
  onEffectsEnabledChange,
  onClose,
}: SettingsModalProps) {
  // A recorded pack whose files are missing. Tracked so the button can say so
  // rather than appearing to work and producing silence.
  const [emptyPacks, setEmptyPacks] = useState<string[]>([]);

  // Choosing a sound plays it. Picking one you cannot hear first would mean
  // spinning the wheel to audition each, which is the slow way round.
  const chooseAndPreview = (id: string) => {
    onSoundPackChange(id);
    void playPreview(id).then(() => {
      if (isSamplePackLoaded(id) && !isSamplePackReady(id)) {
        setEmptyPacks((current) => (current.includes(id) ? current : [...current, id]));
      }
    });
  };

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

          <div className="sound-packs" aria-disabled={!soundEnabled}>
            {SOUND_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className={`sound-pack ${soundPack === pack.id ? 'is-selected' : ''}`}
                onClick={() => chooseAndPreview(pack.id)}
                disabled={!soundEnabled}
              >
                <span className="sound-pack-label">
                  {pack.label}
                  <span className="sound-pack-play" aria-hidden="true">▶</span>
                </span>
                <span className="sound-pack-description">
                  {emptyPacks.includes(pack.id) ? 'No sound files added yet.' : pack.description}
                </span>
              </button>
            ))}
          </div>
          <p className="sound-packs-hint">
            {soundEnabled
              ? 'Tap one to hear it.'
              : 'Turn spin sound on to choose a sound.'}
          </p>
        </div>
        <div className="settings-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#888' }}>
            <input
              type="checkbox"
              checked={effectsEnabled}
              onChange={(e) => onEffectsEnabledChange(e.target.checked)}
            />
            Enable Character Effects
          </label>
          <p className="settings-hint">
            Some characters get their own colours and a 3D effect when they win.
            Off shows every winner the same way.
          </p>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: '1rem' }}>Close</button>
      </div>
    </div>
  );
}

export default SettingsModal;
