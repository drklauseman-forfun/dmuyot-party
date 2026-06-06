import { useState, useMemo, useEffect, useRef } from 'react';
import axios from 'axios';
import CustomWheel from './CustomWheel';
import './index.css';

interface CharacterData {
  name: string;
  color: string;
  originalIndex: number; 
}

interface ExtractionResponse {
  characters: { name: string; color: string }[];
}

const FireParticles = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const particles: any[] = [];
    const particleCount = 200; // Increased shootout intensity

    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    class Particle {
      x: number; y: number; size: number; speedY: number; speedX: number; color: string; life: number; fadeSpeed: number;
      constructor() {
        if (!canvas) {
          this.x = 0; this.y = 0; this.size = 0; this.speedY = 0; this.speedX = 0; this.color = ''; this.life = 0; this.fadeSpeed = 0;
          return;
        }
        // Shoot out from the bottom
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + 10;
        this.size = Math.random() * 5 + 1;
        this.speedY = Math.random() * -6 - 2; // Stronger shootout
        this.speedX = Math.random() * 3 - 1.5;
        const colors = [
          '#ff4500', '#ff8c00', '#ffd700', '#ff0000', 
          '#8a2be2', '#ff00ff', '#4b0082', '#ff1493' // Added Purples, Magentas, Pinks
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.life = 1.0;
        this.fadeSpeed = Math.random() * 0.01 + 0.005; // Random fade for natural look
      }
      update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.life -= this.fadeSpeed;
      }
      draw() {
        if (!ctx) return;
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        // If life is out, reset it immediately to keep the 'shootout' constant
        if (particles[i].life <= 0) {
          particles[i] = new Particle();
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        pointerEvents: 'none', 
        zIndex: 1050 
      }} 
    />
  );
};

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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [spinDuration, setSpinDuration] = useState(0.4);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Filter, Weight & History States
  const [rangeInput, setRangeInput] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [weights, setWeights] = useState<Record<number, number | string>>({});
  const [history, setHistory] = useState<{ name: string; index: number; timestamp: string }[]>([]);
  
  // Special Visuals State
  const [activeEffect, setActiveEffect] = useState<string | null>(null);

  const SPECIAL_EFFECTS = [
    { trigger: 'דיבי', effect: 'hellish' },
  ];

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
    setHistory(historyEntries);
    localStorage.setItem('dmuyot_party_history', JSON.stringify(historyEntries));
  };

  const checkEffect = (winnersList: { name: string }[]) => {
    if (winnersList.length === 0) {
      setActiveEffect(null);
      return;
    }
    const firstWinner = winnersList[0];
    const nameWords = firstWinner.name.trim().split(/\s+/);
    for (const rule of SPECIAL_EFFECTS) {
      const triggerWords = rule.trigger.trim().split(/\s+/);
      const nameStart = nameWords.slice(0, triggerWords.length).join(' ');
      if (nameStart === rule.trigger) {
        setActiveEffect(rule.effect);
        return;
      }
    }
    setActiveEffect(null);
  };

  const clearHistory = () => {
    if (window.confirm('Clear last result?')) {
      setHistory([]);
      localStorage.removeItem('dmuyot_party_history');
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
      
      if (finalCount > 1 || spinDuration < 0.2) {
        const actualCount = finalCount;
        const newWinners: { name: string; index: number; color: string }[] = [];
        for (let i = 0; i < actualCount; i++) {
          const idx = pickRandomIndex(filteredCharacters);
          const char = filteredCharacters[idx];
          newWinners.push({ name: char.name, index: char.originalIndex, color: char.color });
        }
        if (actualCount === 1) {
          setSelectedIndex(newWinners[0].index);
          scrollToWinner(newWinners[0].index);
        }
        setWinners(newWinners);
        checkEffect(newWinners);
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
      label: isTooLarge ? (char.originalIndex + 1).toString() : char.name,
      color: char.color,
      weight: Number(weights[char.originalIndex]) || 1
    }));
  }, [filteredCharacters, weights]);

  return (
    <div className="app-container">
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
                key={`wheel-${filteredCharacters.length}-${rangeInput}`} 
                mustSpin={mustSpin}
                prizeIndex={prizeNumber}
                data={wheelData}
                spinDuration={spinDuration}
                onStopSpinning={() => {
                  setMustSpin(false);
                  const winner = filteredCharacters[prizeNumber];
                  setSelectedIndex(winner.originalIndex);
                  const winnerObj = { name: winner.name, index: winner.originalIndex, color: winner.color };
                  setWinners([winnerObj]);
                  checkEffect([winnerObj]);
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
                  <button key={s} onClick={() => { setSpinDuration(s); localStorage.setItem('dmuyot_party_duration', s.toString()); }} style={{ flex: '1 0 30%', fontSize: '0.8rem', background: spinDuration === s ? '#646cff' : '#333', padding: '0.5rem' }}>
                    {s === 0 ? '0s (Instant)' : `${s}s`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="number" min="0" max="10" step="0.1" className="spin-input" style={{ width: '100px' }} value={spinDuration} onChange={(e) => { const val = parseFloat(e.target.value); const safeVal = isNaN(val) ? 0 : Math.min(10, Math.max(0, val)); setSpinDuration(safeVal); localStorage.setItem('dmuyot_party_duration', safeVal.toString()); }} />
                <span style={{ color: '#666', fontSize: '0.8rem' }}>Custom (Max 10s)</span>
              </div>
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
          {activeEffect === 'hellish' && <FireParticles />}
          {activeEffect === 'hellish' && <div className="glitch-overlay" />}
          <div 
            className={`results-modal ${activeEffect === 'hellish' ? 'hellish-modal shake-effect' : ''}`}
            onClick={e => e.stopPropagation()}
            style={{
              borderColor: activeEffect === 'hellish' ? '#ff0000' : (winners[0]?.color || '#646cff'),
              boxShadow: activeEffect === 'hellish' ? '0 0 50px #ff0000' : `0 0 30px ${winners[0]?.color || '#646cff'}66`,
              backgroundColor: activeEffect === 'hellish' ? 'rgba(30, 0, 0, 0.95)' : (winners[0]?.color ? `${winners[0].color}1a` : '#1e1e1e'), 
              backdropFilter: 'blur(10px)'
            }}
          >
            <h2 className={`${activeEffect === 'hellish' ? 'hellish-text glitch-effect' : ''}`}>
              {activeEffect === 'hellish' ? '🔱 SATAN THE ALL POWERFUL 🔱' : '🎊 The Results are In! 🎊'}
            </h2>
            <div className="results-list" style={{ position: 'relative', zIndex: 2 }}>
              {winners.map((winner, i) => (
                <div 
                  key={i} 
                  className={`result-winner ${activeEffect === 'hellish' ? 'hellish-text' : ''}`} 
                  style={{ color: activeEffect === 'hellish' ? '#ff0000' : (winner.color !== '#ffffff' ? winner.color : '#ffffff') }}
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
                background: activeEffect === 'hellish' ? '#ff0000' : '#646cff',
                color: '#fff',
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
