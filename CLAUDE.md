# Working notes

Context that is not obvious from reading the code, written after a long session
of hardening, adding sound, and building the character effects. The
[README](README.md) says what the app is and how to run it; this says what will
catch you out.

## Checks

```bash
cd frontend && npm run build   # tsc -b && vite build — the same command Vercel runs
cd frontend && npx eslint .    # expected to be silent; it was 14 errors before, so nobody ran it
cd backend  && python -m pytest
```

`npm run build` failing means a broken deploy, not just a broken build. The
backend's 47 tests pin the extraction rules and are fast; run them after any
change to `main.py`.

There is **no frontend test runner**. Frontend changes are verified by driving
the running app in a browser. That is slower but it is what caught most of the
real bugs in this repo — several things typechecked, linted, and were still
wrong.

## Rules that must not break

Product decisions, not accidents. Changing one is a regression.

- Only numbered lines are characters: a line starts with a digit, or is an
  `<ol><li>`. Anything inside a `<ul>` never is.
- `Name (Source): description` keeps only the part before the colon. The
  `(Source)` stays, so **every stored name has it** — this matters for triggers.
- Stripping the leading number must not mangle decimals. `1.5` and `10-20 Squad`
  survive whole; `12. 1.5` becomes `1.5`. Whitespace is the discriminator, and
  the tests pin every case.
- Black document text becomes white for the dark theme.
- `originalIndex` — a character's position in the document — is identity.
  Weights, ranges and history all key off it. The UI shows it 1-based; the range
  input reads 1-based; internally everything is 0-based.
- Weight 0 removes a character from the wheel but keeps it in the sidebar.
- Zero total weight gives a `VOID` winner rather than a crash.
- More than one spin, or a duration under 0.2s, skips the wheel and resolves
  instantly. Multi-spin samples **with replacement** — the same character can
  win twice, deliberately.
- Loading a list **resets all weights to 1** (a failed load does not). Weights
  are positional, so carrying them over silently applied one document's tuning
  to the next document's characters.
- `localStorage` keys are `dmuyot_party_*`. Real users have data under them.
  They are spelled out literally in `storage.ts` so they are greppable; renaming
  one without a migration loses user data.

Every one of these rules is also **explained to the user** in
`components/HelpModal.tsx`, behind the information button. It is prose, so
nothing catches it drifting out of date — change a rule above and that file is
wrong until someone edits it too.

## The three registries

Adding to any of these is data, not code.

| What | Where | To add one |
| --- | --- | --- |
| Character effect | `frontend/src/characters/registry.ts` | Append an entry |
| VFX module | `frontend/src/vfx/modules.tsx` | Component + params in `VFXModuleConfig` + one line |
| Sound pack | `frontend/src/sound/samples.ts` | Files in `public/sounds/<id>/` + a spec |

`VFXModuleConfig` is a discriminated union, so `{ type: 'glow', gravity: 5 }` is
a compile error rather than a line that silently does nothing, and an editor
offers exactly the parameters that module understands. Each component's props
extend the same declarations, so the two cannot drift apart.

Modules today: `glow`, `edgeGlow`, `sparkles`, `fire`, `beams`, `blackHole`,
`clock`.
`fire` and `beams` have no game effect using them but are kept — the developer
sandbox in `testEffects.ts` uses them and they are building blocks.

The eight הנרץ' effects share a shape, so `registry.ts` has two builders,
`wraithModules` and `wraithPresentation`. Seven near-identical copies is the
point at which that stopped being premature. An effect that wants something
different simply does not use them.

## Traps

Each of these cost real time. None are visible from reading the code.

**Additive blending cannot draw black.** Both `edgeGlow` and `sparkles` take
`blend: 'add' | 'normal'`. `add` brightens whatever is behind it and is the
default; adding black to a frame changes nothing at all, so anything meant to
read as dark must use `normal`, which paints over instead. This is why the black
wraith is the only one whose glows darken the frame.

**Particle size is unbounded.** `gl_PointSize` scales with nearness to the
camera, so a particle drifting close becomes hundreds of pixels wide. Added to
the frame that is the soft bloom the bright effects rely on. Painted over it, it
is a disc that swallows the picture. `maxPixelSize` caps it, uncapped by default.

**The black hole looks different depending on how long it has been running.**
Its strands are specks that the swirl stretches into long arcs over about
twenty seconds. An effect that lives for six never gets there on its own, which
is what `windUp` is for — it starts the field part-way in. This cost a whole
round of "it looks worse on my phone": the verification screenshots had been
taken with `duration` temporarily stretched to 30s so the capture could catch
them, so they showed a wound-up state the shipped five-second effect could not
reach. **Never judge it from a capture taken with a stretched duration.**

**Screenshots of an effect are usually mistimed.** A capture takes several
seconds and the effects last about six, so most land after the thing has gone
and show an empty frame. Do not conclude it is broken. Two techniques work:
stretch `duration` temporarily (and put it back), or — better — pull the
fragment shader out of the built bundle, compile it in a scratch WebGL canvas
at a chosen size, and either read pixels back for a measurement or draw it into
the page as a still, which screenshots reliably. That is how the phone-versus-
desktop sizing was settled.

**`edgeGlow` renders at `renderOrder={-1}`.** It is a backdrop. Drawn after the
particles it adds light back over them, which additive particles do not notice
and a dark one disappears under.

**`\s` in a TypeScript string is just `s`.** A regex written into a trigger
pattern silently became something else entirely, matched the wrong names, and
looked correct. eslint flags it as a useless escape. Keep regexes in code, not
in data strings.

**Triggers are prefix matches and must be unique.** The pattern carries that
burden: a shorter pattern matches more, and a collision fails silently. Check
new triggers against the real document before trusting them — of its 941
characters, each current trigger matches exactly one. The apostrophe in `הנרץ'`
is **U+0027**, the plain ASCII one, not the visually identical Hebrew geresh.

**Sound ticks are derived from the wheel's easing curve.** `spinCurve.ts` owns
the cubic-bezier that the CSS transition uses *and* the inverse the scheduler
needs. They must stay the same curve or the clicks drift out of step with the
wheel. A whole spin is scheduled up front on the AudioContext clock — never from
`setTimeout`, which during a spin competes with React and three.js.

**Sample packs preload on mount.** Decoding takes long enough that a spin
starting alongside it schedules nothing, which made the first spin of every
session silent. Creating the AudioContext before a gesture leaves it suspended,
which is fine — decoding does not need a running context.

**Audio is CC0 and that is load-bearing.** `public/sounds/wheel/` is cut from
[freesound.org/s/398235](https://freesound.org/s/398235/), CC0, which is why it
can live in the repo at all. Anything added there ships to every user — check
the licence, and record it in that folder's README. Soundsnap and most paid
libraries forbid redistributing the raw files, which serving them from
`public/` is.

**`tools/slice-ticks.py`** turns one recording of repeated clicks into the
several short tick files a pack needs. Standard library only. It reads 16- and
24-bit wav; reading 24-bit as 16-bit does not fail, it silently produces
nonsense.

## Verifying in the browser

The embedded browser has limits worth knowing before you conclude something is
broken:

- **Service workers cannot register.** Even a one-line one fails. This is the
  environment, not the code.
- **Cross-origin fetch to arbitrary ports is blocked**, so a page served from a
  LAN address cannot reach the backend there even when `curl` can.
- **VFX components are invisible to a DOM fiber walk** — react-three-fiber runs
  its own reconciler. Verify effects by what they render, not by finding the
  components.
- **Screenshots are unreliable** during heavy WebGL use: mistimed, cropped, or
  showing a white frame the code cannot produce. Confirm anything surprising on
  a clean reload before acting on it, and prefer measuring the DOM.
- **Vite's HMR cache can serve stale modules** after a file is deleted, giving a
  blank page and a bogus `does not provide an export named …` for an export that
  plainly exists. `rm -rf frontend/node_modules/.vite` and restart.

## Repository state

`main` is deployed to Vercel automatically. It carries everything from this
session: the hardening pass, the recorded sound, the mobile layout fixes, and
the eight character effects.

**`feat/pwa-and-deploy` is unmerged** and holds two things:

- `d93f88a` — PWA: manifest, icon set, service worker
- `a3199b3` — `render.yaml`, deploy configuration for the backend

Do not cherry-pick `d93f88a` blindly. It also contains the `box-sizing` and
media-query fixes, which `main` already has via `4ed2c81`, so it will conflict.

The `sounds-done` tag is part of `main`'s history now; it marks the point where
recorded sound worked, before the PWA work.

## Open questions

**The backend is not deployed anywhere.** There is no hosting configuration on
`main`, and the frontend falls back to `http://localhost:8000`. Whether
`VITE_API_URL` is set in the Vercel project was asked several times and never
confirmed — if it is not, the deployed site cannot load a list at all. Establish
this before assuming a production problem is new.

**Home-screen widgets are deferred.** They need a native app, and no widget on
either platform can animate — iOS renders static snapshots, Android uses
RemoteViews. So a widget could only ever show a result as text, never the wheel.
A Scriptable script is the only route to a real widget without a native app.

**The sound picker has one entry.** The machinery takes several; adding a pack
is files plus a spec. The Settings toggle and the preference both work.
