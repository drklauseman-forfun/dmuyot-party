import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Wheel } from 'react-custom-roulette';
import './index.css';

interface CharacterData {
  name: string;
  color: string;
  originalIndex: number; // Keep track for range filtering
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
  
  // Phase 1/2 states
  const [spinCount, setSpinCount] = useState<number | string>(1);
  const [winners, setWinners] = useState<{ name: string; index: number; color: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [spinDuration, setSpinDuration] = useState(0.4);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Phase 3 states
  const [rangeInput, setRangeInput] = useState('');
  const [weights, setWeights] = useState<Record<number, number>>({});

  // Load saved settings from localStorage
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
  }, []);

  const handleInputChange = (value: string) => {
    setInput(value);
    localStorage.setItem('dmuyot_party_input', value);
  };

  const handleRangeChange = (value: string) => {
    setRangeInput(value);
    localStorage.setItem('dmuyot_party_ranges', value);
  };

  const updateWeight = (originalIndex: number, delta: number) => {
    const newWeights = { ...weights };
    const current = newWeights[originalIndex] || 1;
    const next = Math.max(1, Math.min(10, current + delta));
    newWeights[originalIndex] = next;
    setWeights(newWeights);
    localStorage.setItem('dmuyot_party_weights', JSON.stringify(newWeights));
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

  // Logic to parse ranges like "1-10, 20, 30-40"
  const includedIndices = useMemo(() => {
    if (!rangeInput.trim()) return null;
    const indices = new Set<number>();
    const parts = rangeInput.split(',');
    for (const part of parts) {
      const range = part.trim().split('-');
      if (range.length === 2) {
        const start = parseInt(range[0]);
        const end = parseInt(range[1]);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            indices.add(i - 1); // convert to 0-based
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

  // Weighted random picker
  const pickRandomIndex = (list: CharacterData[]) => {
    const totalWeight = list.reduce((acc, c) => acc + (weights[c.originalIndex] || 1), 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < list.length; i++) {
      const weight = weights[list[i].originalIndex] || 1;
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
        if (finalCount === 1) setSelectedIndex(newWinners[0].index);
        setWinners(newWinners);
        setShowModal(true);
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

  const wheelData = useMemo(() => {
    const isTooLarge = filteredCharacters.length > 50;
    return filteredCharacters.map((char) => ({ 
      option: isTooLarge ? (char.originalIndex + 1).toString() : char.name,
      style: { backgroundColor: '#1e1e1e', textColor: char.color !== '#ffffff' ? char.color : '#ffffff' },
      optionSize: weights[char.originalIndex] || 1 // Visually larger slices
    }));
  }, [filteredCharacters, weights]);

  return (
    <div className="app-container">
      <header>
        <h1>Dmuyot Party</h1>
        <p className="subtitle">Random character selector for your next big adventure</p>
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="Settings">⚙️</button>
      </header>

      <section className="input-section">
        <textarea
          placeholder="Paste Google Doc Link or raw text..."
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
        />
        <div className="filter-section">
          <label style={{ fontSize: '0.8rem', color: '#888' }}>Include Ranges (e.g. 1-10, 25, 40-50)</label>
          <input 
            className="filter-input" 
            placeholder="All" 
            value={rangeInput} 
            onChange={(e) => handleRangeChange(e.target.value)}
          />
        </div>
        <button onClick={handleExtract} disabled={loading || !input.trim()}>
          {loading ? 'Processing...' : 'Load Characters'}
        </button>
      </section>

      {filteredCharacters.length > 0 && (
        <main className="main-content">
          <div className="wheel-section">
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Wheel
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
                  setWinners([{ name: winner.name, index: winner.originalIndex, color: winner.color }]);
                  setShowModal(true);
                }}
              />
              
              <div className="spin-controls">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#888' }}>Spins</label>
                  <input type="number" className="spin-input" value={spinCount} min={1} max={1000} onChange={(e) => setSpinCount(e.target.value)} />
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
            <h3>Characters ({filteredCharacters.length})</h3>
            {filteredCharacters.map((char) => (
              <div 
                key={char.originalIndex} 
                className={`character-item ${selectedIndex === char.originalIndex ? 'highlight' : ''}`}
                style={{ color: char.color !== '#ffffff' ? char.color : 'inherit' }}
              >
                <span>{char.originalIndex + 1}. {char.name}</span>
                <div className="weight-control">
                  <button onClick={() => updateWeight(char.originalIndex, -1)} style={{ background: 'none', padding: '0 5px' }}>-</button>
                  <span className="weight-input">{weights[char.originalIndex] || 1}x</span>
                  <button onClick={() => updateWeight(char.originalIndex, 1)} style={{ background: 'none', padding: '0 5px' }}>+</button>
                </div>
              </div>
            ))}
          </div>
        </main>
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
