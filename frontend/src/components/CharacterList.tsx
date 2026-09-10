import type { CharacterData, WeightMap } from '../types';

interface CharacterListProps {
  /** Everything the include-range allows, used only for the header count. */
  totalCount: number;
  /** What the search box has narrowed the list down to. */
  visible: CharacterData[];
  weights: WeightMap;
  /** The effective weight, with the default and in-progress edits resolved. */
  getWeight: (originalIndex: number) => number;
  selectedIndex: number | null;
  search: string;
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onWeightChange: (originalIndex: number, value: number | string) => void;
  onResetWeights: () => void;
}

function CharacterList({
  totalCount,
  visible,
  weights,
  getWeight,
  selectedIndex,
  search,
  disabled,
  onSearchChange,
  onWeightChange,
  onResetWeights,
}: CharacterListProps) {
  return (
    <div className="list-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ margin: 0 }}>Characters ({totalCount})</h3>
          <button
            onClick={onResetWeights}
            // Off during a spin, like the steppers. Resetting reshapes the wheel
            // under a spin already aimed at one slice, so the pointer could stop
            // on someone other than the winner announced.
            disabled={disabled}
            style={{ padding: '2px 8px', fontSize: '0.7rem', background: '#333', border: '1px solid #444', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
            title="Reset all weights to 1"
          >
            Reset
          </button>
        </div>
        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ padding: '5px 10px', background: '#2c2c2c', border: '1px solid #444', color: 'white', borderRadius: '4px', width: '100px' }}
        />
      </div>
      {visible.map((char) => (
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
            <button onClick={() => onWeightChange(char.originalIndex, getWeight(char.originalIndex) - 1)} disabled={disabled}>-</button>
            <input
              type="number"
              className="weight-input"
              value={weights[char.originalIndex] ?? 1}
              onChange={(e) => onWeightChange(char.originalIndex, e.target.value)}
              onBlur={(e) => { if (!e.target.value) onWeightChange(char.originalIndex, 1); }}
              disabled={disabled}
            />
            <button onClick={() => onWeightChange(char.originalIndex, getWeight(char.originalIndex) + 1)} disabled={disabled}>+</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default CharacterList;
