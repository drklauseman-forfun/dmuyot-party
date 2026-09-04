import { useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import CustomWheel from './CustomWheel';
import type { WheelSlice } from './CustomWheel';
import './index.css';
import EffectCanvas from './vfx/EffectCanvas';
import type { EffectConfig } from './vfx/types';
import { matchCharacterEffect, resolvePresentation } from './characters/registry';
import {
  STORAGE_KEYS,
  readString,
  readNumber,
  readJSON,
  writeString,
  writeJSON,
  remove as removeStored,
} from './storage';
import type { CharacterEffect } from './characters/types';

interface CharacterData {
  name: string;
  color: string;
  originalIndex: number;
}

interface ExtractionResponse {
  characters: { name: string; color: string }[];
}

interface HistoryEntry {
  name: string;
  index: number;
  timestamp: string;
}

/** Keyed by originalIndex. A string value is an in-progress edit of the field. */
type WeightMap = Record<number, number | string>;

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
  const [input, setInput] = useState(() => readString(STORAGE_KEYS.input) ?? '');
  const [characters, setCharacters] = useState<CharacterData[]>([]);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Settings & Core Logic
  const [spinCount, setSpinCount] = useState<number | string>(1);
  const [winners, setWinners] = useState<{ name: string; index: number; color: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [spinDuration, setSpinDuration] = useState(
    () => readNumber(STORAGE_KEYS.duration, 0.4),
  );
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = readString(STORAGE_KEYS.sound);
    return saved === null ? true : saved === 'true';
  });

  // Filter, Weight & History States
  const [rangeInput, setRangeInput] = useState(
    () => readString(STORAGE_KEYS.ranges) ?? '',
  );
  const [listSearch, setListSearch] = useState('');
  const [weights, setWeights] = useState<WeightMap>(
    () => readJSON(STORAGE_KEYS.weights, {}, isWeightMap),
  );
  const [history, setHistory] = useState<HistoryEntry[]>(
    () => readJSON(STORAGE_KEYS.history, [], isHistory),
  );
  
  // Special Visuals State. Effect definitions live in characters/registry.ts.
  const [activeEffect, setActiveEffect] = useState<CharacterEffect | null>(null);
  const [vfxConfig, setVfxConfig] = useState<EffectConfig | null>(null);

  const handleInputChange = (value: string) => {
    setInput(value);
    writeString(STORAGE_KEYS.input, value);
  };

  const handleRangeChange = (value: string) => {
    setRangeInput(value);
    writeString(STORAGE_KEYS.ranges, value);
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
    writeJSON(STORAGE_KEYS.weights, newWeights);
  };

  const addToHistory = (newWinners: { name: string; index: number }[]) => {
    const timestamp = new Date().toLocaleTimeString();
    const historyEntries = newWinners.map(w => ({ ...w, timestamp }));
    setHistory(historyEntries);
    writeJSON(STORAGE_KEYS.history, historyEntries);
  };

  /** Fires the registry effect for the first winner, if one matches. */
  const checkEffect = (winnersList: { name: string }[]) => {
    const firstWinner = winnersList[0];
    console.log("🎯 [EFFECT] Checking effects for:", firstWinner?.name);

    const effect =
      firstWinner && firstWinner.name !== VOID_NAME
        ? matchCharacterEffect(firstWinner.name)
        : null;

    if (!effect) {
      console.log("⚪ [EFFECT] No special trigger matched.");
      setActiveEffect(null);
      setVfxConfig(null);
      return;
    }

    console.log("🔥 [EFFECT] Matched effect:", effect.id);
    setActiveEffect(effect);
    setVfxConfig({
      effectId: effect.id,
      modules: effect.modules,
      timestamp: Date.now()
    });
  };

  const clearHistory = () => {
    if (window.confirm('Clear last result?')) {
      setHistory([]);
      removeStored(STORAGE_KEYS.history);
      setShowHistoryModal(false);
    }
  };

  const getNumericSpinCount = () => {
    const val = parseInt(spinCount.toString());
    return isNaN(val) ? 1 : Math.min(1000, Math.max(1, val));
  };

  const playSpinSound = (duration: number) => {
    if (!soundEnabled) return;
    console.log(`🔊 [SOUND] Playing spin sound for ${duration}s`);
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
          return;
        }
        setPrizeNumber(newPrizeNumber);
        setMustSpin(true);
        setSelectedIndex(null);
        setWinners([]);
        playSpinSound(spinDuration);
      }
    }
  };

  const resetWeights = () => {
    if (window.confirm('Reset all weights to 1?')) {
      setWeights({});
      removeStored(STORAGE_KEYS.weights);
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
      <EffectCanvas config={vfxConfig} onComplete={() => setVfxConfig(null)} />
      <header>
        <h1>Dmuyot Party</h1>
        <p className="subtitle">Random character selector for your next big adventure</p>
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
          onChange={(e) => handleInputChange(e.target.value)}
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

          <div className="list-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>Characters ({filteredCharacters.length})</h3>
                <button 
                  onClick={resetWeights}
                  style={{ padding: '2px 8px', fontSize: '0.7rem', background: '#333', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer' }}
                  title="Reset all weights to 1"
                >
                  Reset
                </button>
              </div>
              <input 
                placeholder="Search..." 
                value={listSearch} 
                onChange={(e) => setListSearch(e.target.value)}
                style={{ padding: '5px 10px', background: '#2c2c2c', border: '1px solid #444', color: 'white', borderRadius: '4px', width: '100px' }}
              />
            </div>
            {visibleInSidebar.map((char) => (
              <div 
                key={char.originalIndex} 
                id={`char-${char.originalIndex}`}
                className={`character-item ${selectedIndex === char.originalIndex ? 'highlight' : ''}`}
                style={{ color: char.color !== '#ffffff' ? char.color : 'inherit' }}
              >
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '10px' }}>
                  {char.originalIndex + 1}. {char.name}
                </span>
                <div className="weight-control">
                  <button onClick={() => setManualWeight(char.originalIndex, getWeight(char.originalIndex) - 1)} disabled={mustSpin}>-</button>
                  <input 
                    type="number" 
                    className="weight-input" 
                    value={weights[char.originalIndex] ?? 1} 
                    onChange={(e) => setManualWeight(char.originalIndex, e.target.value)}
                    onBlur={(e) => { if (!e.target.value) setManualWeight(char.originalIndex, 1); }}
                    disabled={mustSpin}
                  />
                  <button onClick={() => setManualWeight(char.originalIndex, getWeight(char.originalIndex) + 1)} disabled={mustSpin}>+</button>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {showHistoryModal && (
        <div className="settings-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>📜 Last Result</h2>
              <button onClick={() => setShowHistoryModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
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
              <button onClick={clearHistory} style={{ flex: 1, background: '#333' }}>Clear</button>
              <button onClick={() => setShowHistoryModal(false)} style={{ flex: 1 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ margin: 0 }}>Settings</h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
            <div className="settings-row">
              <label>Spin Duration (Seconds)</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {[0, 1, 2, 5, 10].map(s => (
                  <button key={s} onClick={() => { setSpinDuration(s); writeString(STORAGE_KEYS.duration, s.toString()); }} style={{ flex: '1 0 30%', fontSize: '0.8rem', background: spinDuration === s ? '#646cff' : '#333', padding: '0.5rem' }}>
                    {s === 0 ? '0s (Instant)' : `${s}s`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="number" min="0" max="10" step="0.1" className="spin-input" style={{ width: '100px' }} value={spinDuration} onChange={(e) => { const val = parseFloat(e.target.value); const safeVal = isNaN(val) ? 0 : Math.min(10, Math.max(0, val)); setSpinDuration(safeVal); writeString(STORAGE_KEYS.duration, safeVal.toString()); }} />
                <span style={{ color: '#666', fontSize: '0.8rem' }}>Custom (Max 10s)</span>
              </div>
            </div>
            <div className="settings-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#888' }}>
                <input type="checkbox" checked={soundEnabled} onChange={(e) => { setSoundEnabled(e.target.checked); writeString(STORAGE_KEYS.sound, e.target.checked.toString()); }} />
                Enable Spin Sound
              </label>
            </div>
            <button onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '1rem' }}>Close</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="results-overlay" onClick={() => setShowModal(false)}>
          {presentation.glitch && <div className="glitch-overlay" />}
          <div
            className={`results-modal ${presentation.shake ? 'shake-effect' : ''}`}
            onClick={e => e.stopPropagation()}
            style={{
              borderColor: presentation.borderColor,
              boxShadow: presentation.boxShadow,
              backgroundColor: presentation.backgroundColor,
              backdropFilter: 'blur(10px)'
            }}
          >
            <h2
              className={presentation.glitch ? 'glitch-effect' : ''}
              style={{
                color: presentation.winnerColor,
                fontFamily: presentation.fontFamily,
                letterSpacing: presentation.letterSpacing,
                textShadow: presentation.textShadow
              }}
            >
              {presentation.title}
            </h2>
            <div className="results-list" style={{ position: 'relative', zIndex: 2 }}>
              {winners.map((winner, i) => (
                <div
                  key={i}
                  className="result-winner"
                  style={{
                    // No effect: each winner keeps its own colour from the document.
                    color: presentation.winnerColor ?? winner.color,
                    fontFamily: presentation.fontFamily,
                    letterSpacing: presentation.letterSpacing,
                    textShadow: presentation.textShadow
                  }}
                >
                  {winners.length > 1 && <span style={{ fontSize: '0.9rem', color: '#888', marginRight: '0.5rem' }}>#{i + 1}</span>}
                  <span style={{ color: '#888', marginRight: '0.5rem' }}>[{winner.index + 1}]</span>
                  {winner.name}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowModal(false)}
              style={{
                background: presentation.buttonColor,
                color: presentation.buttonTextColor,
                fontWeight: 'bold',
                marginTop: '1.5rem',
                padding: '0.8rem 2rem',
                position: 'relative',
                zIndex: 2
              }}
            >
              Awesome!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
