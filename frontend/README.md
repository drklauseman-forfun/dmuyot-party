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

## Installing it on a phone

The app is a PWA: `public/manifest.webmanifest`, an icon set generated from
`public/icon.svg`, and `public/sw.js`. On a phone, "Add to Home Screen" gives
an icon that opens it fullscreen with no browser chrome.

The service worker caches the shell and the static assets so the app opens
instantly and survives a bad connection. It does **not** make the app work
offline — loading a list needs the backend. Offline you get the interface and
the "couldn't reach the server" message. It never caches API responses: only
same-origin GETs are touched.

It is registered in production builds only. In dev it would sit in front of
Vite's module server and hand back stale modules during HMR.

The icons are PNGs rasterised from `icon.svg`. To change the icon, edit the
SVG and re-render at 192, 512, 180 (apple-touch) and a padded 512 maskable —
maskable icons get cropped to a circle, so their artwork needs the extra
margin.

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

**Three.js is in the initial bundle.** `EffectCanvas` is imported statically,
so roughly 900 kB of three.js and postprocessing load on first paint even
though effects fire rarely.
