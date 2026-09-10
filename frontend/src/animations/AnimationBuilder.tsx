import { useEffect, useRef, useState } from 'react';
import { matchCharacterEffect, resolvePresentation } from '../characters/registry';
import type { CharacterEffect } from '../characters/types';
import type { ParamSpec } from '../vfx/params';
import { EFFECT_SCHEMAS, EFFECT_TYPES, defaultModule, sanitizeModule } from '../vfx/schema';
import type { VFXModuleConfig, VFXModuleType } from '../vfx/types';
import ParamField from './ParamField';
import {
  PRESENTATION_SCHEMA,
  defaultPresentation,
  sanitizePresentation,
  toEffectPresentation,
} from './presentation';
import type { PresentationInput } from './presentation';
import {
  MAX_EFFECTS_PER_ANIMATION,
  exportAnimations,
  findCustomAnimation,
  getUserAnimations,
  importAnimations,
  newAnimationId,
  normalizeUsername,
  withAnimation,
  withoutAnimation,
} from './store';
import {
  TIMING_FIELDS,
  defaultTiming,
  sanitizeTiming,
  timingOf,
  totalSeconds,
  withTiming,
} from './timing';
import type { AnimationLibrary, AnimationTiming, CustomAnimation } from './types';
import './builder.css';

/**
 * Where people build their own animations.
 *
 * One modal that moves between screens rather than stacking dialogs, because
 * a phone has no room for a dialog on top of a dialog. The screens:
 *
 *   home      — your name, your animations, export and import
 *   animation — the one being built: its character, effects, timing, results style
 *   effects   — every effect, to pick one to add
 *   effect    — one effect's settings, with Animate, Cancel and Add
 *   conflict  — saving would replace an animation: View, Replace, Cancel
 *
 * Nothing is saved until Save, and everything saved passes through the
 * sanitisers first, so what this screen allows is never the last word on what
 * reaches someone's phone.
 */

interface AnimationBuilderProps {
  username: string;
  onUsernameChange: (name: string) => void;
  library: AnimationLibrary;
  onLibraryChange: (next: AnimationLibrary) => void;
  /** Names from the loaded list — the characters an animation can be made for. */
  characterNames: string[];
  /** Play these effects on the real effect canvas, above this modal. */
  onPreview: (modules: VFXModuleConfig[], label: string) => void;
  onClose: () => void;
}

type ExistingAnimation =
  | { source: 'custom'; animation: CustomAnimation }
  | { source: 'builtin'; effect: CharacterEffect };

interface Draft {
  /** Null until the animation has been saved once. */
  id: string | null;
  character: string;
  modules: VFXModuleConfig[];
  /** Raw while being edited; sanitised on save. */
  presentation: PresentationInput;
  /**
   * One timing for every effect, or null for each keeping its own. Raw while
   * being edited, like the presentation.
   */
  timing: AnimationTiming | null;
}

type Screen =
  | { kind: 'home' }
  | { kind: 'animation' }
  | { kind: 'effects' }
  | { kind: 'effect'; type: VFXModuleType; index: number | null; values: Record<string, unknown> }
  | { kind: 'conflict'; existing: ExistingAnimation };

type EffectScreen = Extract<Screen, { kind: 'effect' }>;
type ConflictScreen = Extract<Screen, { kind: 'conflict' }>;

const TIMING_KEYS = new Set<string>(TIMING_FIELDS.map(([key]) => key));

const PRESENTATION_FIELDS = Object.entries(PRESENTATION_SCHEMA) as [keyof PresentationInput, ParamSpec][];

function paramsOf(type: VFXModuleType): [string, ParamSpec][] {
  return Object.entries(EFFECT_SCHEMAS[type].params as Record<string, ParamSpec>);
}

function describeModules(modules: VFXModuleConfig[]): string {
  return modules.map((module) => EFFECT_SCHEMAS[module.type].label).join(' · ');
}

/** "Plays for 6 seconds." To a tenth of a second, and singular at exactly one. */
function describeLength(timing: AnimationTiming): string {
  const seconds = Number(totalSeconds(timing).toFixed(1));
  return `Plays for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}

/**
 * The animation's timing: the switch, and while it is on, the three fields
 * every effect follows.
 */
function TimingSection({
  timing,
  onToggle,
  onChange,
}: {
  timing: AnimationTiming | null;
  onToggle: (on: boolean) => void;
  onChange: (key: keyof AnimationTiming, value: unknown) => void;
}) {
  return (
    <div className="builder-section">
      <p className="builder-section-title">Timing</p>
      <label className="param-toggle">
        <input type="checkbox" checked={timing !== null} onChange={(e) => onToggle(e.target.checked)} />
        Same timing for every effect
      </label>
      {timing ? (
        <div className="builder-gap">
          {TIMING_FIELDS.map(([key, spec]) => (
            <ParamField
              key={key}
              id={`timing-${key}`}
              spec={spec}
              value={timing[key]}
              onChange={(value) => onChange(key, value)}
            />
          ))}
          <p className="builder-note">{describeLength(sanitizeTiming(timing))}</p>
        </div>
      ) : (
        <p className="builder-note">Each effect has its own timing, set when you add or edit it.</p>
      )}
    </div>
  );
}

/** The effect's main colour, for a swatch in the list, if it has one. */
function swatchOf(module: VFXModuleConfig): string | null {
  const fields = module as unknown as Record<string, unknown>;
  if (typeof fields.color === 'string') return fields.color;
  if (Array.isArray(fields.colors) && typeof fields.colors[0] === 'string') return fields.colors[0];
  return null;
}

/** An edited copy. Values are raw until the whole thing is sanitised on save. */
function withField<T extends object>(target: T, key: string, value: unknown): T {
  return { ...target, [key]: value } as T;
}

function BuilderHeader({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  return (
    <div className="builder-header">
      {onBack && (
        <button type="button" className="builder-back" onClick={onBack} aria-label="Back">
          ←
        </button>
      )}
      <h2>{title}</h2>
      <button type="button" className="builder-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
    </div>
  );
}

/**
 * A small copy of the results modal wearing the styles being chosen. The real
 * one only appears after a spin, and full control is not much use blind.
 */
function StylePreview({ presentation, character }: { presentation: PresentationInput; character: string }) {
  const resolved = resolvePresentation({
    id: 'preview',
    triggers: [],
    presentation: toEffectPresentation(presentation),
    modules: [],
  });
  const text = {
    fontFamily: resolved.fontFamily,
    letterSpacing: resolved.letterSpacing,
    textShadow: resolved.textShadow,
  };
  return (
    <div className="builder-style-stage">
      <div
        // Keyed on the animated options so turning one on plays it again,
        // rather than doing nothing after the first time.
        key={`${resolved.shake}-${resolved.glitch}`}
        className={`builder-style-preview ${resolved.shake ? 'shake-effect' : ''}`}
        style={{
          borderColor: resolved.borderColor,
          boxShadow: resolved.boxShadow,
          backgroundColor: resolved.backgroundColor,
        }}
      >
        <h2 className={resolved.glitch ? 'glitch-effect' : ''} style={{ color: resolved.winnerColor, ...text }} dir="auto">
          {resolved.title}
        </h2>
        <div className="results-list">
          <div className="result-winner" style={{ color: resolved.winnerColor, ...text }} dir="auto">
            <span style={{ color: '#888', marginInlineEnd: '0.5rem' }}>[1]</span>
            {character || 'The winner'}
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          style={{ background: resolved.buttonColor, color: resolved.buttonTextColor, fontWeight: 'bold' }}
        >
          Awesome!
        </button>
      </div>
    </div>
  );
}

function AnimationBuilder({
  username,
  onUsernameChange,
  library,
  onLibraryChange,
  characterNames,
  onPreview,
  onClose,
}: AnimationBuilderProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [characterFilter, setCharacterFilter] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Each screen starts at its top. The modal scrolls, and without this moving
  // on from a long form would land part way down the next one.
  useEffect(() => {
    modalRef.current?.scrollTo(0, 0);
  }, [screen.kind]);

  const hasName = normalizeUsername(username) !== '';
  const mine = getUserAnimations(library, username);
  // Every screen past home works on a draft. Should one ever be missing, show
  // home rather than a form with nothing behind it.
  const view: Screen = !draft && screen.kind !== 'home' ? { kind: 'home' } : screen;

  const saveBlocker = !hasName
    ? 'Enter your name on the first screen before saving.'
    : !draft
      ? null
      : !draft.character
        ? 'Choose the character this animation is for.'
        : draft.modules.length === 0
          ? 'Add at least one effect.'
          : null;
  const canSave = draft !== null && saveBlocker === null;

  /** Closing with unsaved work asks first. A stray tap should not cost an animation. */
  const requestClose = () => {
    if (draft && draft.modules.length > 0 && !window.confirm('Close the builder? This animation has not been saved.')) {
      return;
    }
    onClose();
  };

  const startNew = () => {
    setNotice(null);
    // Shared timing starts on: most animations want their effects to come and
    // go together, and one set of fields beats the same three on every effect.
    setDraft({
      id: null,
      character: '',
      modules: [],
      presentation: defaultPresentation(),
      timing: defaultTiming(),
    });
    setCharacterFilter('');
    setScreen({ kind: 'animation' });
  };

  const startEdit = (animation: CustomAnimation) => {
    setNotice(null);
    setDraft({
      id: animation.id,
      character: animation.character,
      modules: animation.modules,
      presentation: animation.presentation,
      timing: animation.timing,
    });
    setCharacterFilter('');
    setScreen({ kind: 'animation' });
  };

  const remove = (animation: CustomAnimation) => {
    if (!window.confirm(`Delete the animation for ${animation.character}?`)) return;
    onLibraryChange(withoutAnimation(library, username, animation.id));
    setNotice(`Deleted the animation for ${animation.character}.`);
  };

  const cancelDraft = () => {
    if (draft && draft.modules.length > 0 && !window.confirm('Discard this animation? Anything not saved is lost.')) {
      return;
    }
    setDraft(null);
    setScreen({ kind: 'home' });
  };

  const openEffect = (type: VFXModuleType, index: number | null) => {
    const source = index !== null && draft ? draft.modules[index] : defaultModule(type);
    const values: Record<string, unknown> = { ...source };
    delete values.type;
    setScreen({ kind: 'effect', type, index, values });
  };

  const setEffectValue = (key: string, value: unknown) => {
    setScreen((current) =>
      current.kind === 'effect' ? { ...current, values: withField(current.values, key, value) } : current,
    );
  };

  /** A draft's effects as they will play: on the shared timing, if it has one. */
  const playable = (current: Draft, modules: VFXModuleConfig[] = current.modules) =>
    withTiming(modules, current.timing ? sanitizeTiming(current.timing) : null);

  /** The effect being edited as it will play — sanitised, and on the shared timing. */
  const buildEffect = (current: EffectScreen) => {
    const module = sanitizeModule({ ...current.values, type: current.type });
    return module && draft ? playable(draft, [module])[0] : module;
  };

  const addEffect = (current: EffectScreen) => {
    if (!draft) return;
    const module = buildEffect(current);
    if (!module) return;
    const { index } = current;
    const modules =
      index === null ? [...draft.modules, module] : draft.modules.map((m, i) => (i === index ? module : m));
    setDraft({ ...draft, modules });
    setScreen({ kind: 'animation' });
  };

  const removeEffect = (index: number) => {
    if (!draft) return;
    setDraft({ ...draft, modules: draft.modules.filter((_, i) => i !== index) });
  };

  /**
   * Switching shared timing on starts it from the first effect's timing, so
   * nothing jumps. Switching it off leaves every effect holding the shared
   * values, as the starting point for timing each one on its own.
   */
  const setSharedTiming = (current: Draft, on: boolean) => {
    if (on) {
      const first = current.modules[0];
      setDraft({ ...current, timing: first ? timingOf(first) : defaultTiming() });
    } else {
      setDraft({ ...current, modules: playable(current), timing: null });
    }
  };

  const commit = () => {
    if (!draft) return;
    const timing = draft.timing ? sanitizeTiming(draft.timing) : null;
    onLibraryChange(
      withAnimation(library, username, {
        id: draft.id ?? newAnimationId(),
        character: draft.character,
        modules: withTiming(draft.modules, timing),
        presentation: sanitizePresentation(draft.presentation),
        timing,
        updatedAt: Date.now(),
      }),
    );
    setNotice(`Saved the animation for ${draft.character}.`);
    setDraft(null);
    setScreen({ kind: 'home' });
  };

  /**
   * Saving that would replace something asks first. Two things can be
   * replaced: another of your animations for this character, or — the first
   * time you make one for them — the built-in one. Re-saving an animation you
   * reopened replaces nothing but itself, so it goes straight through.
   */
  const save = () => {
    if (!draft || !canSave) return;
    const existingCustom = findCustomAnimation(library, username, draft.character);
    if (existingCustom && existingCustom.id !== draft.id) {
      setScreen({ kind: 'conflict', existing: { source: 'custom', animation: existingCustom } });
      return;
    }
    const builtin = matchCharacterEffect(draft.character);
    if (builtin && !existingCustom) {
      setScreen({ kind: 'conflict', existing: { source: 'builtin', effect: builtin } });
      return;
    }
    commit();
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportAnimations(library, username));
      setNotice('Copied. Keep it somewhere safe, or send it to yourself.');
    } catch {
      setNotice('Copying was blocked here — select the code and copy it by hand.');
    }
  };

  const runImport = () => {
    const result = importAnimations(library, username, importCode.trim());
    if (result.error) {
      setImportMessage({ ok: false, text: result.error });
      return;
    }
    onLibraryChange(result.library);
    setImportCode('');
    const parts = [
      result.added > 0 && `${result.added} added`,
      result.replaced > 0 && `${result.replaced} replaced`,
      result.skipped > 0 && `${result.skipped} skipped because they could not be read`,
    ].filter(Boolean);
    setImportMessage({
      ok: true,
      text: parts.length > 0 ? `Imported: ${parts.join(', ')}.` : 'That code had no animations in it.',
    });
  };

  const renderHome = () => (
    <>
      <BuilderHeader title="Animations" onClose={requestClose} />
      {notice && (
        <div className="builder-notice" role="status">
          {notice}
        </div>
      )}

      <div className="builder-section">
        <label className="builder-section-title" htmlFor="builder-username">
          Your name
        </label>
        <input
          id="builder-username"
          className="builder-input"
          value={username}
          maxLength={80}
          placeholder="e.g. jack"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          dir="auto"
          onChange={(e) => onUsernameChange(e.target.value)}
        />
        <p className="builder-note">
          Your animations are saved under this name. It isn't a password and doesn't have to be unique — anyone who
          types the same name shares them. Capital letters don't matter.
        </p>
      </div>

      <div className="builder-section">
        <p className="builder-section-title">Your animations</p>
        {!hasName ? (
          <p className="builder-note">Enter a name to see and make animations.</p>
        ) : mine.length === 0 ? (
          <p className="builder-note">None yet under this name.</p>
        ) : (
          <div className="builder-list">
            {mine.map((animation) => (
              <div key={animation.id} className="builder-row">
                <div className="builder-row-main">
                  <span className="builder-row-title" dir="auto">
                    {animation.character}
                  </span>
                  <span className="builder-row-sub">{describeModules(animation.modules)}</span>
                </div>
                <button
                  type="button"
                  className="builder-icon-btn"
                  onClick={() => onPreview(animation.modules, animation.character)}
                  aria-label={`Play the animation for ${animation.character}`}
                >
                  ▶
                </button>
                <button type="button" className="builder-icon-btn" onClick={() => startEdit(animation)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="builder-icon-btn danger"
                  onClick={() => remove(animation)}
                  aria-label={`Delete the animation for ${animation.character}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="builder-actions">
        <button type="button" onClick={startNew} disabled={!hasName || characterNames.length === 0}>
          + New animation
        </button>
      </div>
      {hasName && characterNames.length === 0 && (
        <p className="builder-note">Load your character list first — an animation is made for a character in it.</p>
      )}

      {hasName && (
        <details className="builder-details builder-transfer">
          <summary>Export and import</summary>
          <p className="builder-note">
            For now animations live only in this browser. Export gives you a code to keep somewhere safe or send to
            yourself; import brings one back, under the name above.
          </p>
          <p className="builder-section-title builder-gap">Export</p>
          <textarea
            className="builder-input builder-textarea"
            readOnly
            value={exportAnimations(library, username)}
            onFocus={(e) => e.target.select()}
            aria-label="Export code"
          />
          <div className="builder-actions builder-actions-tight">
            <button type="button" className="builder-secondary" onClick={() => void copyExport()} disabled={mine.length === 0}>
              Copy code
            </button>
          </div>
          <p className="builder-section-title builder-gap">Import</p>
          <textarea
            className="builder-input builder-textarea"
            value={importCode}
            placeholder="Paste a code here"
            aria-label="Import code"
            onChange={(e) => {
              setImportCode(e.target.value);
              setImportMessage(null);
            }}
          />
          {importMessage && (
            <p className={importMessage.ok ? 'builder-note' : 'builder-error'} role="status">
              {importMessage.text}
            </p>
          )}
          <div className="builder-actions builder-actions-tight">
            <button type="button" className="builder-secondary" onClick={runImport} disabled={importCode.trim() === ''}>
              Import
            </button>
          </div>
        </details>
      )}
    </>
  );

  const renderAnimation = (current: Draft) => {
    const query = characterFilter.trim().toLowerCase();
    const matching = query ? characterNames.filter((name) => name.toLowerCase().includes(query)) : characterNames;
    // Keep the chosen character listed when the search would hide it, or when
    // the animation was made for someone not in the list loaded right now.
    const options =
      current.character && !matching.includes(current.character) ? [current.character, ...matching] : matching;
    const full = current.modules.length >= MAX_EFFECTS_PER_ANIMATION;

    return (
      <>
        <BuilderHeader
          title={current.id ? 'Edit animation' : 'New animation'}
          onBack={cancelDraft}
          onClose={requestClose}
        />

        <div className="builder-section">
          <label className="builder-section-title" htmlFor="builder-character">
            Character
          </label>
          {characterNames.length > 12 && (
            <input
              className="builder-input builder-search"
              value={characterFilter}
              placeholder="Search the list"
              aria-label="Search characters"
              dir="auto"
              onChange={(e) => setCharacterFilter(e.target.value)}
            />
          )}
          <select
            id="builder-character"
            className="builder-input"
            value={current.character}
            dir="auto"
            onChange={(e) => setDraft({ ...current, character: e.target.value })}
          >
            <option value="">Choose a character</option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {current.character && !characterNames.includes(current.character) && (
            <p className="builder-note">
              This character isn't in the list you have loaded. The animation still plays for them whenever they win.
            </p>
          )}
        </div>

        <div className="builder-section">
          <p className="builder-section-title">Effects</p>
          {current.modules.length === 0 ? (
            <p className="builder-note">No effects yet. Add one — and add more to layer them.</p>
          ) : (
            <div className="builder-list">
              {current.modules.map((module, index) => {
                const label = EFFECT_SCHEMAS[module.type].label;
                const swatch = swatchOf(module);
                return (
                  <div key={`${module.type}-${index}`} className="builder-row">
                    {swatch && <span className="builder-swatch" style={{ background: swatch }} aria-hidden="true" />}
                    <div className="builder-row-main">
                      <span className="builder-row-title">{label}</span>
                    </div>
                    <button
                      type="button"
                      className="builder-icon-btn"
                      onClick={() => onPreview(playable(current, [module]), label)}
                      aria-label={`Play ${label}`}
                    >
                      ▶
                    </button>
                    <button type="button" className="builder-icon-btn" onClick={() => openEffect(module.type, index)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="builder-icon-btn danger"
                      onClick={() => removeEffect(index)}
                      aria-label={`Remove ${label}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="builder-actions builder-actions-tight">
            <button
              type="button"
              className="builder-secondary"
              onClick={() => setScreen({ kind: 'effects' })}
              disabled={full}
            >
              + Add effect
            </button>
            <button
              type="button"
              className="builder-play"
              onClick={() => onPreview(playable(current), current.character || 'draft')}
              disabled={current.modules.length === 0}
            >
              ▶ Play
            </button>
          </div>
          {full && (
            <p className="builder-note">That's the most one animation can hold ({MAX_EFFECTS_PER_ANIMATION}).</p>
          )}
        </div>

        <TimingSection
          timing={current.timing}
          onToggle={(on) => setSharedTiming(current, on)}
          onChange={(key, value) =>
            setDraft({ ...current, timing: withField(current.timing ?? defaultTiming(), key, value) })
          }
        />

        <details className="builder-details">
          <summary>Results style</summary>
          <p className="builder-note builder-flush">How the results look when this character wins.</p>
          <StylePreview presentation={current.presentation} character={current.character} />
          {PRESENTATION_FIELDS.map(([key, spec]) => (
            <ParamField
              key={key}
              id={`style-${key}`}
              spec={spec}
              value={current.presentation[key]}
              onChange={(value) => setDraft({ ...current, presentation: withField(current.presentation, key, value) })}
            />
          ))}
        </details>

        {saveBlocker && <p className="builder-note">{saveBlocker}</p>}
        <div className="builder-actions">
          <button type="button" className="builder-secondary" onClick={cancelDraft}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!canSave}>
            Save
          </button>
        </div>
      </>
    );
  };

  const renderEffects = () => (
    <>
      <BuilderHeader title="Add an effect" onBack={() => setScreen({ kind: 'animation' })} onClose={requestClose} />
      <p className="builder-note builder-flush">Pick one to set it up. An animation can layer several.</p>
      <div className="builder-effects-grid">
        {EFFECT_TYPES.map((type) => (
          <button key={type} type="button" className="builder-effect-card" onClick={() => openEffect(type, null)}>
            <strong>{EFFECT_SCHEMAS[type].label}</strong>
            <span>{EFFECT_SCHEMAS[type].description}</span>
          </button>
        ))}
      </div>
    </>
  );

  const renderEffect = (current: EffectScreen) => {
    const schema = EFFECT_SCHEMAS[current.type];
    const fields = paramsOf(current.type);
    const field = ([key, spec]: [string, ParamSpec]) => (
      <ParamField
        key={key}
        id={`effect-${key}`}
        spec={spec}
        value={current.values[key]}
        onChange={(value) => setEffectValue(key, value)}
      />
    );
    return (
      <>
        <BuilderHeader title={schema.label} onBack={() => setScreen({ kind: 'animation' })} onClose={requestClose} />
        <p className="builder-note builder-flush">{schema.description}</p>
        {fields.filter(([key]) => !TIMING_KEYS.has(key)).map((entry) => field(entry))}
        <p className="builder-subheading">Timing</p>
        {draft?.timing ? (
          // The form still holds this effect's own values; the shared timing
          // replaces them when it is added or played.
          <p className="builder-note">
            This animation gives every effect the same timing. Change it on the animation screen, or switch that off
            there to time this effect on its own.
          </p>
        ) : (
          fields.filter(([key]) => TIMING_KEYS.has(key)).map((entry) => field(entry))
        )}
        <div className="builder-actions">
          <button
            type="button"
            className="builder-play"
            onClick={() => {
              const module = buildEffect(current);
              if (module) onPreview([module], schema.label);
            }}
          >
            ▶ Animate
          </button>
          <button type="button" className="builder-secondary" onClick={() => setScreen({ kind: 'animation' })}>
            Cancel
          </button>
          <button type="button" onClick={() => addEffect(current)}>
            {current.index === null ? 'Add' : 'Update'}
          </button>
        </div>
      </>
    );
  };

  const renderConflict = (current: ConflictScreen, forDraft: Draft) => {
    const { existing } = current;
    const modules = existing.source === 'custom' ? existing.animation.modules : existing.effect.modules;
    return (
      <>
        <BuilderHeader title="Replace animation?" onBack={() => setScreen({ kind: 'animation' })} onClose={requestClose} />
        <p className="builder-conflict" dir="auto">
          <strong>{forDraft.character}</strong>{' '}
          {existing.source === 'custom' ? 'already has an animation of yours.' : 'already has a built-in animation.'}
        </p>
        <p className="builder-note">
          {existing.source === 'custom'
            ? 'Saving replaces it. Each name gets one animation per character.'
            : 'Saving puts yours in its place — but only for your name. Everyone else still gets the built-in one.'}
        </p>
        <div className="builder-actions">
          <button
            type="button"
            className="builder-play"
            onClick={() => onPreview(modules, 'the animation being replaced')}
            disabled={modules.length === 0}
          >
            ▶ View it
          </button>
        </div>
        <div className="builder-actions">
          <button type="button" className="builder-secondary" onClick={() => setScreen({ kind: 'animation' })}>
            Cancel
          </button>
          <button type="button" onClick={commit}>
            Replace
          </button>
        </div>
      </>
    );
  };

  return (
    // No close on a tap outside: with a half-built animation open, a stray tap
    // is the likeliest way to lose it.
    <div className="settings-overlay">
      <div ref={modalRef} className="settings-modal builder-modal" role="dialog" aria-label="Animations">
        {view.kind === 'home' && renderHome()}
        {view.kind === 'animation' && draft && renderAnimation(draft)}
        {view.kind === 'effects' && renderEffects()}
        {view.kind === 'effect' && renderEffect(view)}
        {view.kind === 'conflict' && draft && renderConflict(view, draft)}
      </div>
    </div>
  );
}

export default AnimationBuilder;
