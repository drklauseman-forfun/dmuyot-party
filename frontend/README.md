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
| `src/components/`    | Presentation only: the results, settings, history and help modals, and the character list. |
| `src/characters/`    | The built-in animations — triggers, modal styling, which VFX modules to play. |
| `src/animations/`    | The animation builder: people's own animations, where they are kept, and how one is matched to a winner. |
| `src/vfx/`           | The 3D layer. `modules.tsx` maps a module config onto its component, `schema.ts` describes each one for the builder, and `EffectCanvas` draws them: light effects through the bloom, solid ones (`UNLIT_MODULES`) after it. |
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

**All spin sounds are recordings**, loaded from `public/sounds/` at runtime
rather than bundled. Three rounds of synthesised packs were built and rejected
before this; they are in the git history, but no code calls them. A pack with
no files stays silent and says so in Settings.

Several tick recordings per pack matters: the engine picks between them and
varies rate and level per click, which is what stops a 200-click spin sounding
like a loop. `tools/slice-ticks.py` cuts a single recording into that set.

**The ticks are derived from the wheel's easing curve.** `src/spinCurve.ts`
owns the cubic-bezier the CSS transition uses *and* the inverse the scheduler
needs to ask "when does the wheel reach this much rotation?". They have to stay
the same curve or the clicks drift out of step with the wheel. A whole spin is
scheduled up front on the AudioContext clock, never from setTimeout.

**Three.js loads on demand.** `EffectCanvas` is a lazy import, so three.js and
postprocessing — about a megabyte — are a chunk of their own rather than part
of first paint. `App` fetches it ahead of time when animations are switched on,
so the first effect does not wait for it. Import anything from
`src/vfx/components/` statically outside `src/vfx/` and three.js is back in the
main bundle. The builder only reaches `vfx/schema.ts`, `vfx/params.ts` and
`vfx/types.ts`, which import none of it.
