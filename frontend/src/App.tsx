import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Wheel } from 'react-custom-roulette';
import './index.css';

interface CharacterData {
  name: string;
  color: string;
  originalIndex: number; 
}

interface ExtractionResponse {
  characters: { name: string; color: string }[];
}

function App() {
  const [input, setInput] = useState('');
  const [characters, setCharacters] = useState<CharacterData[]>([]);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Settings & Core Logic
  const [spinCount, setSpinCount] = useState<number | string>(1);
  const [winners, setWinners] = useState<{ name: string; index: number; color: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [spinDuration, setSpinDuration] = useState(0.4);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Filter, Weight & History States
  const [rangeInput, setRangeInput] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [weights, setWeights] = useState<Record<number, number | string>>({});
  const [history, setHistory] = useState<{ name: string; index: number; timestamp: string }[]>([]);

  useEffect(() => {
    const savedInput = localStorage.getItem('dmuyot_party_input');
    if (savedInput) setInput(savedInput);
    
    const savedDuration = localStorage.getItem('dmuyot_party_duration');
    if (savedDuration) setSpinDuration(parseFloat(savedDuration));
    
    const savedSound = localStorage.getItem('dmuyot_party_sound');
    if (savedSound !== null) setSoundEnabled(savedSound === 'true');

    const savedRanges = localStorage.getItem('dmuyot_party_ranges');
    if (savedRanges) setRangeInput(savedRanges);

    const savedWeights = localStorage.getItem('dmuyot_party_weights');
    if (savedWeights) setWeights(JSON.parse(savedWeights));

    const savedHistory = localStorage.getItem('dmuyot_party_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  const handleInputChange = (value: string) => {
    setInput(value);
    localStorage.setItem('dmuyot_party_input', value);
  };

  const handleRangeChange = (value: string) => {
    setRangeInput(value);
    localStorage.setItem('dmuyot_party_ranges', value);
    setSelectedIndex(null);
    setWinners([]);
  };

  const setManualWeight = (originalIndex: number, value: number | string) => {
    const newWeights = { ...weights };
    if (typeof value === 'string' && value === '') {
      newWeights[originalIndex] = '';
    } else {
      const num = parseInt(value.toString());
      newWeights[originalIndex] = isNaN(num) ? 1 : Math.max(1, Math.min(9999, num));
    }
    setWeights(newWeights);
    localStorage.setItem('dmuyot_party_weights', JSON.stringify(newWeights));
  };

  const addToHistory = (newWinners: { name: string; index: number }[]) => {
    const timestamp = new Date().toLocaleTimeString();
    const historyEntries = newWinners.map(w => ({ ...w, timestamp }));
    // Only keep the results of the last spin
    setHistory(historyEntries);
    localStorage.setItem('dmuyot_party_history', JSON.stringify(historyEntries));
  };

  const clearHistory = () => {
    if (window.confirm('Clear all spin history?')) {
      setHistory([]);
      localStorage.removeItem('dmuyot_party_history');
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
        alert('No characters found!');
      }
    } catch (error) {
      console.error('Extraction failed', error);
      alert('Failed to extract characters.');
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

  const pickRandomIndex = (list: CharacterData[]) => {
    const totalWeight = list.reduce((acc, c) => acc + (Number(weights[c.originalIndex]) || 1), 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < list.length; i++) {
      const weight = Number(weights[list[i].originalIndex]) || 1;
      if (random < weight) return i;
      random -= weight;
    }
    return Math.floor(Math.random() * list.length);
  };

  const handleSpinClick = () => {
    if (!mustSpin && filteredCharacters.length > 0) {
      const finalCount = getNumericSpinCount();
      
      if (finalCount > 1 || spinDuration === 0) {
        const newWinners: { name: string; index: number; color: string }[] = [];
        for (let i = 0; i < finalCount; i++) {
          const idx = pickRandomIndex(filteredCharacters);
          const char = filteredCharacters[idx];
          newWinners.push({ name: char.name, index: char.originalIndex, color: char.color });
        }
        if (finalCount === 1) {
          setSelectedIndex(newWinners[0].index);
          scrollToWinner(newWinners[0].index);
        }
        setWinners(newWinners);
        setShowModal(true);
        addToHistory(newWinners);
      } else {
        const newPrizeNumber = pickRandomIndex(filteredCharacters);
        setPrizeNumber(newPrizeNumber);
        setMustSpin(true);
        setSelectedIndex(null);
        setWinners([]);
        playSpinSound(spinDuration);
      }
    }
  };

  const scrollToWinner = (originalIndex: number) => {
    setTimeout(() => {
      const element = document.getElementById(`char-${originalIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const wheelData = useMemo(() => {
    const isTooLarge = filteredCharacters.length > 25;
    return filteredCharacters.map((char) => ({ 
      option: isTooLarge ? (char.originalIndex + 1).toString() : char.name,
      style: { backgroundColor: '#1e1e1e', textColor: char.color !== '#ffffff' ? char.color : '#ffffff' },
      optionSize: Number(weights[char.originalIndex]) || 1
    }));
  }, [filteredCharacters, weights]);

  return (
    <div className="app-container">
      <header>
        <h1>Dmuyot Party</h1>
        <p className="subtitle">Random character selector for your next big adventure</p>
        <button className="settings-btn" onClick={() => setShowSettings(true)} disabled={mustSpin} title="Settings">⚙️</button>
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
      </section>

      {filteredCharacters.length > 0 && (
        <main className="main-content">
          <div className="wheel-section">
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Wheel
                key={`wheel-${filteredCharacters.length}-${rangeInput}`} 
                mustStartSpinning={mustSpin}
                prizeNumber={prizeNumber}
                data={wheelData}
                backgroundColors={['#1e1e1e', '#2c2c2c']}
                outerBorderColor="#333"
                outerBorderWidth={10}
                innerBorderColor="#333"
                innerBorderWidth={20}
                innerRadius={0}
                radiusLineColor="#444"
                radiusLineWidth={1}
                fontSize={filteredCharacters.length > 100 ? 10 : 16}
                perpendicularText={true}
                spinDuration={spinDuration}
                onStopSpinning={() => {
                  setMustSpin(false);
                  const winner = filteredCharacters[prizeNumber];
                  setSelectedIndex(winner.originalIndex);
                  const winnerObj = { name: winner.name, index: winner.originalIndex, color: winner.color };
                  setWinners([winnerObj]);
                  setShowModal(true);
                  scrollToWinner(winner.originalIndex);
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
              <h3>Characters ({filteredCharacters.length})</h3>
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
                  <button onClick={() => setManualWeight(char.originalIndex, (Number(weights[char.originalIndex]) || 1) - 1)} disabled={mustSpin}>-</button>
                  <input 
                    type="number" 
                    className="weight-input" 
                    value={weights[char.originalIndex] ?? 1} 
                    onChange={(e) => setManualWeight(char.originalIndex, e.target.value)}
                    onBlur={(e) => { if (!e.target.value) setManualWeight(char.originalIndex, 1); }}
                    disabled={mustSpin}
                  />
                  <button onClick={() => setManualWeight(char.originalIndex, (Number(weights[char.originalIndex]) || 1) + 1)} disabled={mustSpin}>+</button>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {history.length > 0 && (
        <section className="history-section">
          <div className="history-header">
            <h3 style={{ margin: 0 }}>📜 Spin History</h3>
            <button onClick={clearHistory} style={{ fontSize: '0.7rem', padding: '0.4rem 1rem', background: '#333' }}>Clear</button>
          </div>
          <div className="history-list">
            {history.map((item, i) => (
              <div key={i} className="history-item">
                <span>
                  <span style={{ color: '#666', marginRight: '0.5rem' }}>[{item.index + 1}]</span>
                  <strong>{item.name}</strong>
                </span>
                <span className="history-time">{item.timestamp}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ margin: 0 }}>Settings</h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
            <div className="settings-row">
              <label>Spin Duration: {spinDuration}s</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => { setSpinDuration(0); localStorage.setItem('dmuyot_party_duration', '0'); }} style={{ flex: 1, fontSize: '0.8rem' }}>Immediate (0s)</button>
                <button onClick={() => { setSpinDuration(2.0); localStorage.setItem('dmuyot_party_duration', '2.0'); }} style={{ flex: 1, fontSize: '0.8rem' }}>Normal (2s)</button>
              </div>
              <input type="range" min="0" max="10" step="0.1" value={spinDuration} onChange={(e) => { const val = parseFloat(e.target.value); setSpinDuration(val); localStorage.setItem('dmuyot_party_duration', val.toString()); }} style={{ width: '100%' }} />
            </div>
            <div className="settings-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#888' }}>
                <input type="checkbox" checked={soundEnabled} onChange={(e) => { setSoundEnabled(e.target.checked); localStorage.setItem('dmuyot_party_sound', e.target.checked.toString()); }} />
                Enable Spin Sound
              </label>
            </div>
            <button onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '1rem' }}>Close</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="results-overlay" onClick={() => setShowModal(false)}>
          <div 
            className="results-modal" 
            onClick={e => e.stopPropagation()}
            style={{
              borderColor: winners[0]?.color || '#646cff',
              boxShadow: `0 0 30px ${winners[0]?.color || '#646cff'}66`,
              backgroundColor: winners[0]?.color ? `${winners[0].color}1a` : '#1e1e1e', 
              backdropFilter: 'blur(10px)'
            }}
          >
            <h2>🎊 The Results are In! 🎊</h2>
            <div className="results-list">
              {winners.map((winner, i) => (
                <div key={i} className="result-winner" style={{ color: winner.color !== '#ffffff' ? winner.color : '#ffffff' }}>
                  {winners.length > 1 && <span style={{ fontSize: '0.9rem', color: '#888', marginRight: '0.5rem' }}>#{i + 1}</span>}
                  <span style={{ color: '#888', marginRight: '0.5rem' }}>[{winner.index + 1}]</span>
                  {winner.name}
                </div>
              ))}
            </div>
            <button onClick={() => setShowModal(false)} style={{ background: '#646cff', color: '#fff', fontWeight: 'bold', marginTop: '1.5rem', padding: '0.8rem 2rem' }}>Awesome!</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
