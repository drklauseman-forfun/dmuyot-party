import { useState } from 'react';
import { sanitizeValue } from '../vfx/params';
import type {
  ColorListSpec,
  ColorSpec,
  HandListSpec,
  NumberSpec,
  ParamSpec,
  PointSpec,
  ScaleSpec,
  SelectSpec,
  TextSpec,
  Vec3Spec,
} from '../vfx/params';
import type { ClockHand } from '../vfx/types';

/**
 * One adjustable value in the animation builder: its label, a control suited
 * to its kind, and the guide explaining it.
 *
 * Controls report raw values while being edited and leave final checking to
 * the builder, which sanitises the whole effect before playing or adding it.
 * Text boxes hold what is typed until they lose focus, so clearing a field to
 * type a new number does not snap it back to a default mid-keystroke.
 */

interface ParamFieldProps {
  /** Unique within the form, to pair labels with inputs. */
  id: string;
  spec: ParamSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}

function decimalsFor(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Enough decimals for the step and no trailing zeros — 0.28, not 0.2800000001. */
function formatNumber(n: number, step: number): string {
  return String(Number(n.toFixed(Math.min(decimalsFor(step), 4))));
}

/** For the sub-values of composite fields, which have bounds but no spec of their own. */
function numberSpec(label: string, min: number, max: number, step: number, fallback: number): NumberSpec {
  return { kind: 'number', label, guide: '', default: fallback, min, max, step };
}

/** The native colour picker only accepts six digits: '#abc' becomes '#aabbcc'. */
function toSixDigit(hex: string): string {
  const digits = hex.replace('#', '');
  if (digits.length === 3 || digits.length === 4) {
    return `#${digits.slice(0, 3).split('').map((c) => c + c).join('')}`;
  }
  return `#${digits.slice(0, 6)}`;
}

function alphaOf(hex: string): number {
  const digits = hex.replace('#', '');
  if (digits.length === 4) return parseInt(digits[3] + digits[3], 16) / 255;
  if (digits.length === 8) return parseInt(digits.slice(6, 8), 16) / 255;
  return 1;
}

function withAlpha(sixDigit: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${sixDigit}${byte.toString(16).padStart(2, '0')}`;
}

function NumberInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: NumberSpec;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="param-number">
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Math.min(spec.max, Math.max(spec.min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={spec.label}
      />
      <input
        id={id}
        type="text"
        className="param-number-text"
        // A decimal keypad on Android has no minus key, so fields that go
        // negative get the full keyboard instead.
        inputMode={spec.min < 0 ? 'text' : 'decimal'}
        value={text ?? formatNumber(value, spec.step)}
        onFocus={() => setText(formatNumber(value, spec.step))}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          // Not a number: keep the last good value rather than resetting it.
          if (text !== null && text.trim() !== '' && Number.isFinite(Number(text))) {
            onChange(sanitizeValue(spec, Number(text)) as number);
          }
          setText(null);
        }}
      />
      {spec.unit && <span className="param-unit">{spec.unit}</span>}
    </div>
  );
}

function ColorInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: ColorSpec;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const six = toSixDigit(value);
  const alpha = spec.alpha ? alphaOf(value) : 1;
  return (
    <div className="param-color">
      <input
        type="color"
        value={six}
        aria-label={spec.label}
        onChange={(e) => onChange(spec.alpha ? withAlpha(e.target.value, alpha) : e.target.value)}
      />
      <input
        id={id}
        type="text"
        className="param-color-hex"
        spellCheck={false}
        autoCapitalize="off"
        value={text ?? value}
        onFocus={() => setText(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            const cleaned = sanitizeValue(spec, text) as string;
            // The sanitiser answers an invalid colour with the default. Only
            // accept that if the default is what was actually typed.
            const typedTheDefault = text.trim().toLowerCase() === spec.default;
            onChange(cleaned === spec.default && !typedTheDefault ? value : cleaned);
          }
          setText(null);
        }}
      />
      {spec.alpha && (
        <label className="param-opacity">
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onChange={(e) => onChange(withAlpha(six, Number(e.target.value)))}
          />
        </label>
      )}
    </div>
  );
}

function SelectInput({
  spec,
  value,
  onChange,
}: {
  spec: SelectSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="param-options" role="radiogroup" aria-label={spec.label}>
      {spec.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'is-selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TextInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: TextSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      id={id}
      type="text"
      className="param-text"
      value={value}
      // The attribute counts UTF-16 units, so it is set generously and the
      // sanitiser, which counts whole characters, has the final say.
      maxLength={spec.maxLength * 2}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function PointInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: PointSpec;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  return (
    <div className="param-subgroup">
      <span className="param-axis-label">Left (0) to right (1)</span>
      <NumberInput
        id={`${id}-x`}
        spec={numberSpec('Left to right', 0, 1, 0.01, spec.default[0])}
        value={value[0]}
        onChange={(n) => onChange([n, value[1]])}
      />
      <span className="param-axis-label">Bottom (0) to top (1)</span>
      <NumberInput
        id={`${id}-y`}
        spec={numberSpec('Bottom to top', 0, 1, 0.01, spec.default[1])}
        value={value[1]}
        onChange={(n) => onChange([value[0], n])}
      />
    </div>
  );
}

function ScaleInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: ScaleSpec;
  value: number | [number, number, number];
  onChange: (v: number | [number, number, number]) => void;
}) {
  const uniform = typeof value === 'number';
  const single = typeof value === 'number' ? value : value[0];
  const triple: [number, number, number] = Array.isArray(value) ? value : [value, value, value];
  const axis = (label: string) => numberSpec(label, spec.min, spec.max, 0.1, single);
  return (
    <div className="param-subgroup">
      <label className="param-toggle">
        <input
          type="checkbox"
          checked={uniform}
          onChange={(e) => onChange(e.target.checked ? single : [single, single, single])}
        />
        Same on every axis
      </label>
      {uniform ? (
        <NumberInput id={id} spec={axis(spec.label)} value={single} onChange={onChange} />
      ) : (
        (['Width', 'Height', 'Depth'] as const).map((label, i) => (
          <div key={label}>
            <span className="param-axis-label">{label}</span>
            <NumberInput
              id={`${id}-${i}`}
              spec={axis(label)}
              value={triple[i]}
              onChange={(n) => {
                const next: [number, number, number] = [...triple];
                next[i] = n;
                onChange(next);
              }}
            />
          </div>
        ))
      )}
    </div>
  );
}

function Vec3Input({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: Vec3Spec;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  const labels = ['Left and right', 'Down and up', 'Towards you'] as const;
  return (
    <div className="param-subgroup">
      {labels.map((label, i) => (
        <div key={label}>
          <span className="param-axis-label">{label}</span>
          <NumberInput
            id={`${id}-${i}`}
            spec={numberSpec(label, spec.min, spec.max, 0.1, spec.default[i])}
            value={value[i]}
            onChange={(n) => {
              const next: [number, number, number] = [...value];
              next[i] = n;
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ColorListInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: ColorListSpec;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="param-subgroup">
      <div className="param-swatches">
        {value.map((color, i) => (
          <div key={i} className="param-swatch">
            <input
              type="color"
              aria-label={`Colour ${i + 1}`}
              value={toSixDigit(color)}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            {value.length > 1 && (
              <button
                type="button"
                className="param-remove"
                aria-label={`Remove colour ${i + 1}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {value.length < spec.maxItems && (
        <button
          id={id}
          type="button"
          className="param-add"
          onClick={() => onChange([...value, value[value.length - 1] ?? '#ffffff'])}
        >
          + Add colour
        </button>
      )}
    </div>
  );
}

function HandListInput({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: HandListSpec;
  value: ClockHand[];
  onChange: (v: ClockHand[]) => void;
}) {
  const { bounds } = spec;
  const update = (i: number, patch: Partial<ClockHand>) =>
    onChange(value.map((hand, j) => (j === i ? { ...hand, ...patch } : hand)));
  return (
    <div className="param-subgroup">
      {value.map((hand, i) => (
        <div key={i} className="param-list-item">
          <div className="param-subhead">
            <span>Hand {i + 1}</span>
            {value.length > 1 && (
              <button
                type="button"
                className="param-remove"
                aria-label={`Remove hand ${i + 1}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
          <span className="param-axis-label">Speed — ticks per second, negative runs backwards</span>
          <NumberInput
            id={`${id}-${i}-rate`}
            spec={numberSpec('Speed', bounds.rate.min, bounds.rate.max, 0.1, 1)}
            value={hand.rate}
            onChange={(n) => update(i, { rate: n })}
          />
          <span className="param-axis-label">Length — centre (0) to rim (1)</span>
          <NumberInput
            id={`${id}-${i}-length`}
            spec={numberSpec('Length', bounds.length.min, bounds.length.max, 0.01, 0.6)}
            value={hand.length}
            onChange={(n) => update(i, { length: n })}
          />
          <span className="param-axis-label">Width at the centre</span>
          <NumberInput
            id={`${id}-${i}-width`}
            spec={numberSpec('Width', bounds.width.min, bounds.width.max, 0.005, spec.defaultWidth)}
            value={hand.width ?? spec.defaultWidth}
            onChange={(n) => update(i, { width: n })}
          />
        </div>
      ))}
      {value.length < spec.maxItems && (
        <button
          id={id}
          type="button"
          className="param-add"
          onClick={() => onChange([...value, { rate: 1, length: 0.6, width: spec.defaultWidth }])}
        >
          + Add hand
        </button>
      )}
    </div>
  );
}

function Control({ id, spec, value, onChange }: ParamFieldProps) {
  // Values are passed through the sanitiser for display, so a control never
  // has to cope with a shape it does not expect. Text is the exception:
  // sanitising a cleared title would put the default straight back.
  switch (spec.kind) {
    case 'number':
      return <NumberInput id={id} spec={spec} value={sanitizeValue(spec, value) as number} onChange={onChange} />;
    case 'color':
      return <ColorInput id={id} spec={spec} value={sanitizeValue(spec, value) as string} onChange={onChange} />;
    case 'select':
      return <SelectInput spec={spec} value={sanitizeValue(spec, value) as string} onChange={onChange} />;
    case 'text':
      return (
        <TextInput id={id} spec={spec} value={typeof value === 'string' ? value : spec.default} onChange={onChange} />
      );
    case 'point':
      return (
        <PointInput id={id} spec={spec} value={sanitizeValue(spec, value) as [number, number]} onChange={onChange} />
      );
    case 'scale':
      return (
        <ScaleInput
          id={id}
          spec={spec}
          value={sanitizeValue(spec, value) as number | [number, number, number]}
          onChange={onChange}
        />
      );
    case 'vec3':
      return (
        <Vec3Input
          id={id}
          spec={spec}
          value={sanitizeValue(spec, value) as [number, number, number]}
          onChange={onChange}
        />
      );
    case 'colorList':
      return (
        <ColorListInput id={id} spec={spec} value={sanitizeValue(spec, value) as string[]} onChange={onChange} />
      );
    case 'handList':
      return (
        <HandListInput id={id} spec={spec} value={sanitizeValue(spec, value) as ClockHand[]} onChange={onChange} />
      );
    case 'boolean':
      return null;
  }
}

/** Kinds whose control is a single input a label can point at. */
const LABELLABLE = new Set<ParamSpec['kind']>(['number', 'color', 'text']);

function ParamField({ id, spec, value, onChange }: ParamFieldProps) {
  if (spec.kind === 'boolean') {
    return (
      <div className="param-field">
        <label className="param-head param-toggle">
          <input
            id={id}
            type="checkbox"
            checked={sanitizeValue(spec, value) === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="param-label">{spec.label}</span>
        </label>
        <p className="param-guide">{spec.guide}</p>
      </div>
    );
  }

  return (
    <div className="param-field">
      {LABELLABLE.has(spec.kind) ? (
        <label className="param-head param-label" htmlFor={id}>
          {spec.label}
        </label>
      ) : (
        <span className="param-head param-label">{spec.label}</span>
      )}
      <Control id={id} spec={spec} value={value} onChange={onChange} />
      <p className="param-guide">{spec.guide}</p>
    </div>
  );
}

export default ParamField;
