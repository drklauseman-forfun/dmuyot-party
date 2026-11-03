import { isSecretName } from '../secret';
import type { ResolvedPresentation } from '../characters/types';
import type { Winner } from '../types';

interface ResultsModalProps {
  winners: Winner[];
  /** A line under the winners: what knockout mode has to say about the round. */
  note?: string | null;
  /** Already flattened by resolvePresentation — every fallback applied. */
  presentation: ResolvedPresentation;
  /** False while a secret winner is still held back. See secret.ts. */
  revealed: boolean;
  onReveal: () => void;
  onClose: () => void;
}

function ResultsModal({ winners, note, presentation, revealed, onReveal, onClose }: ResultsModalProps) {
  // Anything still to show? While there is, the button reveals rather than
  // closes, so the obvious press is the one that gives the answer.
  const stillHidden = !revealed && winners.some((w) => isSecretName(w.name));
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
          {winners.map((winner, i) => {
            const hidden = !revealed && isSecretName(winner.name);
            return (
              <div
                key={i}
                className="result-winner"
                style={{
                  // No effect: each winner keeps its own colour from the
                  // document — but a held-back one keeps nothing of its own,
                  // since the colour alone can name a character.
                  color: hidden ? '#8a8a93' : presentation.winnerColor ?? winner.color,
                  fontFamily: hidden ? undefined : presentation.fontFamily,
                  letterSpacing: hidden ? undefined : presentation.letterSpacing,
                  textShadow: hidden ? undefined : presentation.textShadow
                }}
              >
                {winners.length > 1 && <span style={{ fontSize: '0.9rem', color: '#888', marginRight: '0.5rem' }}>#{i + 1}</span>}
                {hidden ? (
                  // Not the number either: it is the character's place in the
                  // document, and anyone could look it up in the list.
                  <span className="result-hidden">? ? ?</span>
                ) : (
                  <>
                    <span style={{ color: '#888', marginRight: '0.5rem' }}>[{winner.index + 1}]</span>
                    {winner.name}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {note && <p className="results-note">{note}</p>}
        <button
          onClick={stillHidden ? onReveal : onClose}
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
          {stillHidden ? 'Reveal' : 'Awesome!'}
        </button>
      </div>
    </div>
  );
}

export default ResultsModal;
