import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import axios from 'axios';
import CustomWheel from './CustomWheel';
import type { WheelSlice } from './CustomWheel';
import './index.css';
/**
 * three.js, postprocessing and the effect components come to about 900 kB, and
 * most spins never fire an effect at all. Split out so first paint doesn't wait
 * on them; the prefetch below then warms the chunk long before any spin, so the
 * first effect isn't the one that pays for it.
 */
const EffectCanvas = lazy(() => import('./vfx/EffectCanvas'));
import type { EffectConfig } from './vfx/types';
import { matchCharacterEffect, resolvePresentation } from './characters/registry';
import { STORAGE_KEYS } from './storage';
import { devLog } from './log';
import { DEFAULT_SOUND_PACK_ID, isKnownSoundPackId } from './sound/packs';
import { playLanding, playSpin, preloadSamples } from './sound/engine';
import {
  usePersistedBoolean,
  usePersistedJSON,
  usePersistedNumber,
  usePersistedString,
} from './usePersistedState';
import type { CharacterEffect } from './characters/types';
import type { CharacterData, HistoryEntry, WeightMap, Winner } from './types';
import CharacterList from './components/CharacterList';
import HistoryModal from './components/HistoryModal';
import ResultsModal from './components/ResultsModal';
import SettingsModal from './components/SettingsModal';

interface ExtractionResponse {
  characters: { name: string; color: string }[];
}

/** Placeholder winner used when every candidate has been weighted to zero. */
const VOID_NAME = 'VOID';

function isWeightMap(value: unknown): value is WeightMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (v) => typeof v === 'number' || typeof v === 'string',
  );
}

function isHistory(value: unknown): value is HistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.name === 'string' &&
        typeof entry.index === 'number',
    )
  );
}

/**
 * Turn a failed extraction into something the user can act on.
 *
 * Google answers 404 for a document that is private *and* for one that does
 * not exist, so the actionable advice for both is the same: check the link and
 * check the sharing.
 */
function describeExtractionFailure(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ERR_NETWORK') {
      return "Couldn't reach the server. If you're running this locally, check that the backend is up.";
    }

    const detail: unknown = error.response?.data?.detail;
    if (typeof detail === 'string') {
      if (detail.includes('404')) {
        return `Couldn't open that document. Check the link, and make sure it is shared as "Anyone with the link".`;
      }
      if (detail.includes('Invalid Google Docs URL')) {
        return "That doesn't look like a Google Docs link. Paste the document URL, or paste your list in as plain text.";
      }
      if (detail.includes('timed out') || detail.includes('Timeout')) {
        return 'Google took too long to answer. Try again in a moment.';
      }
      return detail;
    }
  }
  return 'Something went wrong loading that list. Please try again.';
}

function App() {
  const [input, setInput] = usePersistedString(STORAGE_KEYS.input, '');
  const [characters, setCharacters] = useState<CharacterData[]>([]);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Settings & Core Logic
  const [spinCount, setSpinCount] = useState<number | string>(1);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [spinDuration, setSpinDuration] = usePersistedNumber(STORAGE_KEYS.duration, 0.4);
  const [soundEnabled, setSoundEnabled] = usePersistedBoolean(STORAGE_KEYS.sound, true);
  const [soundPack, setSoundPack] = usePersistedString(
    STORAGE_KEYS.soundPack,
    DEFAULT_SOUND_PACK_ID,
  );
  // A pack removed from the registry between visits must not leave the user
  // with a stored id nothing answers to.
  const activeSoundPack = isKnownSoundPackId(soundPack) ? soundPack : DEFAULT_SOUND_PACK_ID;
  // Off means a winner with a character effect looks like any other winner:
  // no 3D layer, and the modal keeps its plain styling.
  const [effectsEnabled, setEffectsEnabled] = usePersistedBoolean(STORAGE_KEYS.effects, true);

  // Filter, Weight & History States
  const [rangeInput, setRangeInput] = usePersistedString(STORAGE_KEYS.ranges, '');
  const [listSearch, setListSearch] = useState('');
  const [weights, setWeights] = usePersistedJSON<WeightMap>(STORAGE_KEYS.weights, {}, isWeightMap);
  const [history, setHistory] = usePersistedJSON<HistoryEntry[]>(STORAGE_KEYS.history, [], isHistory);
  
  // Special Visuals State. Effect definitions live in characters/registry.ts.
  const [activeEffect, setActiveEffect] = useState<CharacterEffect | null>(null);
  const [vfxConfig, setVfxConfig] = useState<EffectConfig | null>(null);

  // Once an effect has played, the canvas stays mounted. It runs its own
  // fade-out after `config` goes null, so unmounting it between effects would
  // cut that short.
  const [vfxEverPlayed, setVfxEverPlayed] = useState(false);

  // Warm the effects chunk ahead of the first spin, but only for someone who
  // has them switched on — it is most of a megabyte, and a user who turned
  // them off never needs it. Switching them back on runs this and fetches it.
  useEffect(() => {
    if (effectsEnabled) void import('./vfx/EffectCanvas');
  }, [effectsEnabled]);

  useEffect(() => {
    // Fetch and decode the spin sounds now rather than on the first spin.
    // Decoding takes long enough that a spin starting alongside it schedules
    // nothing at all, which made the first spin of every session silent.
    // Creating the AudioContext here leaves it suspended until a gesture,
    // which is fine — decoding does not need a running context.
    void preloadSamples();
  }, []);

  const handleRangeChange = (value: string) => {
    setRangeInput(value);
    setSelectedIndex(null);
    setWinners([]);
  };

  const setManualWeight = (originalIndex: number, value: number | string) => {
    const newWeights = { ...weights };
    if (typeof value === 'string' && value === '') {
      newWeights[originalIndex] = '';
    } else {
      const num = parseInt(value.toString());
      newWeights[originalIndex] = isNaN(num) ? 1 : Math.max(0, Math.min(9999, num));
    }
    setWeights(newWeights);
  };

  const addToHistory = (newWinners: { name: string; index: number }[]) => {
    const timestamp = new Date().toLocaleTimeString();
    const historyEntries = newWinners.map(w => ({ ...w, timestamp }));
    setHistory(historyEntries);
  };

  /** Fires the registry effect for the first winner, if one matches. */
  const checkEffect = (winnersList: { name: string }[]) => {
    const firstWinner = winnersList[0];
    devLog("🎯 [EFFECT] Checking effects for:", firstWinner?.name);

    const effect =
      effectsEnabled && firstWinner && firstWinner.name !== VOID_NAME
        ? matchCharacterEffect(firstWinner.name)
        : null;

    if (!effect) {
      devLog(
        effectsEnabled
          ? "⚪ [EFFECT] No special trigger matched."
          : "🚫 [EFFECT] Effects are switched off in Settings.",
      );
      setActiveEffect(null);
      setVfxConfig(null);
      return;
    }

    devLog("🔥 [EFFECT] Matched effect:", effect.id);
    setActiveEffect(effect);
    setVfxEverPlayed(true);
    setVfxConfig({
      effectId: effect.id,
      modules: effect.modules,
      timestamp: Date.now()
    });
  };

  const clearHistory = () => {
    if (window.confirm('Clear last result?')) {
      setHistory([]);
      setShowHistoryModal(false);
    }
  };

  const getNumericSpinCount = () => {
    const val = parseInt(spinCount.toString());
    return isNaN(val) ? 1 : Math.min(1000, Math.max(1, val));
  };

  /** Ticks tracking the wheel's deceleration, then the landing. */
  const playSpinSound = (duration: number, sliceCount: number) => {
    if (!soundEnabled) return;
    // Recorded packs need their files decoded before they can play. Kicking
    // this off here rather than on mount keeps it inside a user gesture, which
    // is what lets the AudioContext start in the first place.
    void preloadSamples();
    devLog(`🔊 [SOUND] ${activeSoundPack} spin, ${duration}s, ${sliceCount} slices`);
    playSpin(activeSoundPack, duration, sliceCount);
  };

  /** For results that resolve with no wheel to tick along with. */
  const playResultSound = () => {
    if (!soundEnabled) return;
    void preloadSamples();
    devLog(`🔊 [SOUND] ${activeSoundPack} landing`);
    playLanding(activeSoundPack);
  };

  const handleExtract = async () => {
    setLoading(true);
    setLoadError(null);
    setSelectedIndex(null);
    setWinners([]);
    try {
      const isUrl = input.trim().startsWith('http');
      const payload = isUrl ? { url: input.trim() } : { text: input };
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post<ExtractionResponse>(`${apiUrl}/api/extract`, payload);
      
      if (response.data.characters.length > 0) {
        setCharacters(response.data.characters.map((c, i) => ({ ...c, originalIndex: i })));
        // Weights are keyed by position, so keeping them across a load would
        // silently apply the old list's tuning to whoever now occupies those
        // positions — including leaving a character off the wheel at weight 0.
        // A load starts fresh.
        setWeights({});
      } else {
        setLoadError(
          'No characters found. Only lines that start with a number — or items in a numbered list — count as characters.',
        );
      }
    } catch (error) {
      console.error('Extraction failed', error);
      setLoadError(describeExtractionFailure(error));
    } finally {
      setLoading(false);
    }
  };

  const includedIndices = useMemo(() => {
    if (!rangeInput.trim()) return null;
    const indices = new Set<number>();
    const parts = rangeInput.split(',');
    const MAX_TOTAL_ITEMS = 5000;
    
    for (const part of parts) {
      if (indices.size >= MAX_TOTAL_ITEMS) break;
      const range = part.trim().split('-');
      if (range.length === 2) {
        const start = parseInt(range[0]);
        const end = parseInt(range[1]);
        if (!isNaN(start) && !isNaN(end)) {
          const s = Math.min(start, end);
          const e = Math.max(start, end);
          if (e - s > 5000) continue; 
          for (let i = s; i <= e; i++) {
            indices.add(i - 1);
            if (indices.size >= MAX_TOTAL_ITEMS) break;
          }
        }
      } else if (range.length === 1) {
        const val = parseInt(range[0]);
        if (!isNaN(val)) indices.add(val - 1);
      }
    }
    return indices;
  }, [rangeInput]);

  const filteredCharacters = useMemo(() => {
    if (!includedIndices) return characters;
    return characters.filter(c => includedIndices.has(c.originalIndex));
  }, [characters, includedIndices]);

  const visibleInSidebar = useMemo(() => {
    if (!listSearch.trim()) return filteredCharacters;
    const query = listSearch.toLowerCase();
    return filteredCharacters.filter(c => 
      c.name.toLowerCase().includes(query) || 
      (c.originalIndex + 1).toString() === query
    );
  }, [filteredCharacters, listSearch]);

  const getWeight = useCallback((originalIndex: number) => {
    const w = weights[originalIndex];
    if (w === undefined || w === '') return 1;
    return Number(w);
  }, [weights]);

  const pickRandomIndex = (list: CharacterData[]) => {
    const totalWeight = list.reduce((acc, c) => acc + getWeight(c.originalIndex), 0);
    if (totalWeight <= 0) return -1; 

    let random = Math.random() * totalWeight;
    for (let i = 0; i < list.length; i++) {
      const weight = getWeight(list[i].originalIndex);
      if (random < weight) return i;
      random -= weight;
    }
    return Math.floor(Math.random() * list.length);
  };

  const wheelCharacters = useMemo(() => {
    return filteredCharacters.filter(char => getWeight(char.originalIndex) > 0);
  }, [filteredCharacters, getWeight]);

  const handleSpinClick = () => {
    if (!mustSpin && filteredCharacters.length > 0) {
      const finalCount = getNumericSpinCount();
      
      if (finalCount > 1 || spinDuration < 0.2) {
        const actualCount = finalCount;
        const newWinners: { name: string; index: number; color: string }[] = [];
        for (let i = 0; i < actualCount; i++) {
          const idx = pickRandomIndex(wheelCharacters);
          if (idx === -1) {
            newWinners.push({ name: VOID_NAME, index: -1, color: '#ff00ff' });
          } else {
            const char = wheelCharacters[idx];
            newWinners.push({ name: char.name, index: char.originalIndex, color: char.color });
          }
        }
        if (actualCount === 1) {
          setSelectedIndex(newWinners[0].index);
        }
        setWinners(newWinners);
        checkEffect(newWinners);
        setShowModal(true);
        addToHistory(newWinners);
        // No wheel to tick along with on this path, so just the landing.
        playResultSound();
      } else {
        const newPrizeNumber = pickRandomIndex(wheelCharacters);
        if (newPrizeNumber === -1) {
          const voidWinner = { name: VOID_NAME, index: -1, color: '#ff00ff' };
          setWinners([voidWinner]);
          setSelectedIndex(-1);
          // Clears any effect left over from the previous winner — without
          // this, VOID inherits that winner's modal styling.
          checkEffect([voidWinner]);
          setShowModal(true);
          addToHistory([voidWinner]);
          playResultSound();
          return;
        }
        setPrizeNumber(newPrizeNumber);
        setMustSpin(true);
        setSelectedIndex(null);
        setWinners([]);
        playSpinSound(spinDuration, wheelCharacters.length);
      }
    }
  };

  const resetWeights = () => {
    if (window.confirm('Reset all weights to 1?')) {
      setWeights({});
    }
  };

  // Raw slices. How a label is worded, truncated and sized is entirely
  // CustomWheel's business, since it is the one that knows how much room a
  // slice actually has.
  const wheelData = useMemo<WheelSlice[]>(
    () =>
      wheelCharacters.map((char) => ({
        number: char.originalIndex + 1,
        name: char.name,
        color: char.color,
        weight: getWeight(char.originalIndex),
      })),
    [wheelCharacters, getWeight],
  );

  // Concrete modal styling for the current winner — either the matched effect's
  // presentation, or a neutral one tinted with the character's own colour.
  const presentation = useMemo(
    () => resolvePresentation(activeEffect, winners[0]?.color),
    [activeEffect, winners]
  );

  return (
    <div className="app-container">
      {vfxEverPlayed && (
        <Suspense fallback={null}>
          <EffectCanvas config={vfxConfig} onComplete={() => setVfxConfig(null)} />
        </Suspense>
      )}
      <header>
        <h1>Dmuyot Party</h1>
        <p className="sound-note">🔊 Spin sounds are on — turn them off in Settings ⚙️</p>
        <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', gap: '5px' }}>
          {history.length > 0 && (
            <button className="settings-btn" style={{ position: 'static' }} onClick={() => setShowHistoryModal(true)} title="Last Result">📜</button>
          )}
          <button className="settings-btn" style={{ position: 'static' }} onClick={() => setShowSettings(true)} disabled={mustSpin} title="Settings">⚙️</button>
        </div>
      </header>

      <section className="input-section">
        <textarea
          placeholder="Paste Google Doc Link or raw text..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={mustSpin}
        />
        <div className="filter-section">
          <label style={{ fontSize: '0.8rem', color: '#888' }}>Include Ranges (e.g. 1-10, 25, 40-50)</label>
          <input 
            className="filter-input" 
            placeholder="All" 
            value={rangeInput} 
            onChange={(e) => handleRangeChange(e.target.value)}
            disabled={mustSpin}
          />
        </div>
        <button onClick={handleExtract} disabled={loading || !input.trim() || mustSpin}>
          {loading ? 'Processing...' : 'Load Characters'}
        </button>
        {loadError && (
          <div className="load-error" role="alert">
            {loadError}
          </div>
        )}
      </section>

      {filteredCharacters.length > 0 && (
        <main className="main-content">
          <div className="wheel-section">
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {history.length > 0 && (
                <button 
                  onClick={() => setShowHistoryModal(true)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid #444',
                    padding: '0.6rem 1.5rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    color: '#888'
                  }}
                  disabled={mustSpin}
                >
                  📜 View Last Results
                </button>
              )}
              <CustomWheel
                mustSpin={mustSpin}
                prizeIndex={prizeNumber}
                data={wheelData}
                spinDuration={spinDuration}
                onStopSpinning={() => {
                  setMustSpin(false);
                  const winner = wheelCharacters[prizeNumber];
                  setSelectedIndex(winner.originalIndex);
                  const winnerObj = { name: winner.name, index: winner.originalIndex, color: winner.color };
                  setWinners([winnerObj]);
                  checkEffect([winnerObj]);
                  setShowModal(true);
                  addToHistory([winnerObj]);
                }}
              />
              
              <div className="spin-controls">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#888' }}>Spins</label>
                  <input type="number" className="spin-input" value={spinCount} min={1} max={1000} onChange={(e) => setSpinCount(e.target.value)} disabled={mustSpin} />
                </div>
                <button 
                  onClick={handleSpinClick} 
                  style={{ fontSize: '1.2rem', padding: '1rem 2.5rem', background: 'linear-gradient(45deg, #646cff, #ff64f2)', height: 'fit-content', marginTop: '1.2rem' }}
                  disabled={mustSpin}
                >
                  {getNumericSpinCount() > 1 ? `SPIN ${getNumericSpinCount()} TIMES` : 'SPIN'}
                </button>
              </div>
            </div>
          </div>

          <CharacterList
            totalCount={filteredCharacters.length}
            visible={visibleInSidebar}
            weights={weights}
            getWeight={getWeight}
            selectedIndex={selectedIndex}
            search={listSearch}
            disabled={mustSpin}
            onSearchChange={setListSearch}
            onWeightChange={setManualWeight}
            onResetWeights={resetWeights}
          />
        </main>
      )}

      {showHistoryModal && (
        <HistoryModal
          history={history}
          onClear={clearHistory}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          spinDuration={spinDuration}
          soundEnabled={soundEnabled}
          soundPack={activeSoundPack}
          onSoundPackChange={setSoundPack}
          onSpinDurationChange={setSpinDuration}
          onSoundEnabledChange={setSoundEnabled}
          effectsEnabled={effectsEnabled}
          onEffectsEnabledChange={setEffectsEnabled}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showModal && (
        <ResultsModal
          winners={winners}
          presentation={presentation}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

export default App;
