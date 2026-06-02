import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Wheel } from 'react-custom-roulette';
import './index.css';

interface CharacterData {
  name: string;
  color: string;
}

interface ExtractionResponse {
  characters: CharacterData[];
}

function App() {
  const [input, setInput] = useState('');
  const [characters, setCharacters] = useState<CharacterData[]>([]);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  // New states for multiple spins
  const [spinCount, setSpinCount] = useState(1);
  const [winners, setWinners] = useState<{ name: string; index: number; color: string }[]>([]);
  const [showModal, setShowModal] = useState(false);

  // Load saved input from localStorage on mount
  useEffect(() => {
    const savedInput = localStorage.getItem('dmuyot_party_input');
    if (savedInput) {
      setInput(savedInput);
    }
  }, []);

  // Save input to localStorage whenever it changes
  const handleInputChange = (value: string) => {
    setInput(value);
    localStorage.setItem('dmuyot_party_input', value);
  };

  const handleExtract = async () => {
    setLoading(true);
    setSelectedIndex(null);
    setWinners([]);
    try {
      const isUrl = input.trim().startsWith('http');
      const payload = isUrl ? { url: input.trim() } : { text: input };
      
      // Use environment variable for API URL in production, fallback to localhost
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post<ExtractionResponse>(`${apiUrl}/api/extract`, payload);
      
      if (response.data.characters.length > 0) {
        setCharacters(response.data.characters);
      } else {
        alert('No characters found! Make sure they follow the "1. Name" format.');
      }
    } catch (error) {
      console.error('Extraction failed', error);
      alert('Failed to extract characters. Check the URL or text format.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpinClick = () => {
    if (!mustSpin && characters.length > 0) {
      if (spinCount > 1) {
        // Instant multiple spins logic
        const newWinners: { name: string; index: number; color: string }[] = [];
        for (let i = 0; i < spinCount; i++) {
          const idx = Math.floor(Math.random() * characters.length);
          newWinners.push({ 
            name: characters[idx].name, 
            index: idx, 
            color: characters[idx].color 
          });
        }
        setWinners(newWinners);
        setShowModal(true);
      } else {
        // Single visual spin logic
        const newPrizeNumber = Math.floor(Math.random() * characters.length);
        setPrizeNumber(newPrizeNumber);
        setMustSpin(true);
        setSelectedIndex(null);
        setWinners([]);
      }
    }
  };

  // Color palette for the wheel (default backgrounds)
  const backgroundColors = ['#1e1e1e', '#2c2c2c'];

  const data = useMemo(() => {
    const isTooLarge = characters.length > 50;
    return characters.map((char, idx) => ({ 
      option: isTooLarge ? (idx + 1).toString() : char.name,
      style: { backgroundColor: '#1e1e1e', textColor: char.color !== '#ffffff' ? char.color : '#ffffff' }
    }));
  }, [characters]);

  return (
    <div className="app-container">
      <header>
        <h1>Dmuyot Party</h1>
        <p className="subtitle">Random character selector for your next big adventure</p>
      </header>

      <section className="input-section">
        <textarea
          placeholder="Paste Google Doc Link or raw text (e.g. 1. Orion \n 2. Lyra)"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
        />
        <button onClick={handleExtract} disabled={loading || !input.trim()}>
          {loading ? 'Processing...' : 'Load Characters'}
        </button>
      </section>

      {characters.length > 0 && (
        <main className="main-content">
          <div className="wheel-section">
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {characters.length > 50 && (
                <p className="large-list-warning">
                  Large list detected ({characters.length} items). Wheel labels show numbers for clarity.
                </p>
              )}
              <Wheel
                mustStartSpinning={mustSpin}
                prizeNumber={prizeNumber}
                data={data}
                backgroundColors={backgroundColors}
                outerBorderColor="#333"
                outerBorderWidth={10}
                innerBorderColor="#333"
                innerBorderWidth={20}
                innerRadius={0}
                radiusLineColor="#444"
                radiusLineWidth={1}
                fontSize={characters.length > 100 ? 10 : 16}
                perpendicularText={true}
                spinDuration={0.4} // Faster spin (default is usually ~0.8 or 1.0)
                onStopSpinning={() => {
                  setMustSpin(false);
                  setSelectedIndex(prizeNumber);
                  setWinners([{ 
                    name: characters[prizeNumber].name, 
                    index: prizeNumber, 
                    color: characters[prizeNumber].color 
                  }]);
                  setShowModal(true);
                }}
              />
              
              <div className="spin-controls">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#888' }}>Spins</label>
                  <input 
                    type="number" 
                    className="spin-input" 
                    value={spinCount} 
                    min={1} 
                    max={100}
                    onChange={(e) => setSpinCount(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <button 
                  onClick={handleSpinClick} 
                  style={{ 
                    fontSize: '1.2rem',
                    padding: '1rem 2.5rem',
                    background: 'linear-gradient(45deg, #646cff, #ff64f2)',
                    height: 'fit-content',
                    marginTop: '1.2rem'
                  }}
                  disabled={mustSpin}
                >
                  {spinCount > 1 ? `SPIN ${spinCount} TIMES` : 'SPIN'}
                </button>
              </div>
            </div>
          </div>

          <div className="list-section">
            <h3>Characters ({characters.length})</h3>
            {characters.map((char, index) => (
              <div 
                key={index} 
                className={`character-item ${selectedIndex === index ? 'highlight' : ''}`}
                id={`char-${index}`}
                style={{ color: char.color !== '#ffffff' ? char.color : 'inherit' }}
              >
                {index + 1}. {char.name}
              </div>
            ))}
          </div>
        </main>
      )}

      {showModal && (
        <div className="results-overlay" onClick={() => setShowModal(false)}>
          <div 
            className="results-modal" 
            onClick={e => e.stopPropagation()}
            style={{
              borderColor: winners[0]?.color || '#646cff',
              boxShadow: `0 0 30px ${winners[0]?.color || '#646cff'}66`,
              backgroundColor: winners[0]?.color ? `${winners[0].color}1a` : '#1e1e1e', // 10% opacity
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
            <button 
              onClick={() => setShowModal(false)}
              style={{
                background: '#646cff', // Standard theme purple
                color: '#fff',
                fontWeight: 'bold',
                marginTop: '1.5rem',
                padding: '0.8rem 2rem'
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
