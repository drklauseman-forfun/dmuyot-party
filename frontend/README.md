# Frontend

Vite + React 19 + TypeScript. See the [root README](../README.md) for what the
app does, how to run both services, and the parsing rules the backend follows.

```bash
npm install
npm run dev      # http://localhost:5173, expects the backend on :8000
npm run build    # tsc -b && vite build — what Vercel runs
npm run lint     # expected to pass with zero problems
```

## Where things live

| Path                 | What it holds                                                       |
| -------------------- | ------------------------------------------------------------------- |
| `src/App.tsx`        | Extraction, filtering, weighting, spin selection and effect matching. State lives here on purpose — these are one interdependent thing. |
| `src/CustomWheel.tsx`| The hand-rolled SVG wheel. Owns slice geometry *and* how a label is worded, truncated and sized. |
| `src/components/`    | Presentation only: the three modals and the character list.          |
| `src/characters/`    | The effect registry — triggers, modal styling, which VFX modules to play. |
| `src/vfx/`           | The 3D layer. `EffectCanvas` maps a module config onto a component.  |
| `src/storage.ts`     | Guarded `localStorage` access and the canonical key names.           |
| `src/usePersistedState.ts` | `useState` that reads and writes through those guards.         |

## Things that will bite you

**`originalIndex` is identity, and it is positional.** Weights, ranges and
history all key off a character's position in the document, not its name. A
successful load therefore resets every weight to 1 — otherwise setting
character 5 to weight 0 in one document would silently keep character 5 of the
*next* document off the wheel.

The include-range is left alone on purpose: it stays visible in its own input,
so a stale one is obvious in a way a stale weight is not. Anything else keyed
by position needs the same consideration.

**The wheel's label thresholds are tuned together.** `CROWDED_SLICE_COUNT`,
`MIN_SHARE_FOR_FULL_NAME` and `MAX_LABEL_LENGTH` in `CustomWheel.tsx` decide
between a full name and a bare number, and then pick a font size from that
decision. Change one and check a crowded list, not just a short one.

**The VFX lifecycle comments are load-bearing.** Each module tracks its own
elapsed time rather than reading the canvas clock, and every module's React key
includes the effect's run id. Both exist because the canvas outlives any single
effect; removing either brings back a bug that has already been fixed once.

**Two sets of sound packs are shipping side by side** while it is decided
which to keep: the hand-written ones in `src/sound/packs.ts` and Gemini's in
`src/sound/geminiPacks.ts`, kept verbatim so the comparison stays honest.
Settings renders them from `SOUND_PACK_GROUPS`; dropping a set is deleting one
entry there and its file. Note Gemini's peak quieter (0.26-0.47 against
0.41-0.76), which is its own level choice, not a bug.

**The spin sounds are synthesised, not sampled.** `src/sound/` builds them
from oscillators and filtered noise at runtime — there are no audio files. Add
a sound by appending to `SOUND_PACKS` in `src/sound/packs.ts`; Settings builds
its picker from that list.

**The ticks are derived from the wheel's easing curve.** `src/spinCurve.ts`
owns the cubic-bezier the CSS transition uses *and* the inverse the scheduler
needs to ask "when does the wheel reach this much rotation?". They have to stay
the same curve or the clicks drift out of step with the wheel. A whole spin is
scheduled up front on the AudioContext clock, never from setTimeout.

**Three.js is in the initial bundle.** `EffectCanvas` is imported statically,
so roughly 900 kB of three.js and postprocessing load on first paint even
though effects fire rarely.
