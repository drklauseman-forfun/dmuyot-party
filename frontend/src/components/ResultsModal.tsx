import type { ResolvedPresentation } from '../characters/types';
import type { Winner } from '../types';

interface ResultsModalProps {
  winners: Winner[];
  /** Already flattened by resolvePresentation — every fallback applied. */
  presentation: ResolvedPresentation;
  onClose: () => void;
}

function ResultsModal({ winners, presentation, onClose }: ResultsModalProps) {
  return (
    <div className="results-overlay" onClick={onClose}>
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
          onClick={onClose}
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
  );
}

export default ResultsModal;
