# Working notes

Context that is not obvious from reading the code, written after a long session
of hardening, adding sound, and building the character effects. The
[README](README.md) says what the app is and how to run it; this says what will
catch you out.

## Checks

```bash
cd frontend && npm run build   # tsc -b && vite build — the same command Vercel runs
cd frontend && npx eslint .    # expected to be silent; it was 14 errors before, so nobody ran it
cd backend  && python -m pytest   # or py -m pytest — in Git Bash on Windows, python can be the Store stub
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
`components/HelpModal.tsx`, behind the information button, in English and in
Hebrew. It is prose, so nothing catches it drifting out of date — change a rule
above and that file is wrong until someone edits it, in **both** languages. The
content is data rather than markup so the two stay the same shape.

## The three registries

Adding to any of these is data, not code.

| What | Where | To add one |
| --- | --- | --- |
| Character effect | `frontend/src/characters/registry.ts` | Append an entry |
| VFX module | `frontend/src/vfx/modules.tsx` | Component + params in `VFXModuleConfig` + one line + a schema in `vfx/schema.ts` |
| Sound pack | `frontend/src/sound/samples.ts` | Files in `public/sounds/<id>/` + a spec |

`VFXModuleConfig` is a discriminated union, so `{ type: 'glow', gravity: 5 }` is
a compile error rather than a line that silently does nothing, and an editor
offers exactly the parameters that module understands. Each component's props
extend the same declarations, so the two cannot drift apart.

`vfx/schema.ts` describes every effect for the animation builder — label, guide,
default and bounds for each parameter. Its type is derived from the same
interfaces, so a new effect with no schema, a parameter left undescribed, or a
colour field on a number fails the build. The bounds are what make saved
animations safe to play: `sanitizeModule` runs anything untrusted through them,
clamping numbers and dropping unknown keys, so a saved animation cannot ask for
ten million sparks. The defaults copy each component's own; a saved animation
stores every parameter explicitly, so drift cannot change what it renders, but
it would make the builder's starting values wrong.

Modules today: `glow`, `edgeGlow`, `sparkles`, `fire`, `beams`, `blackHole`,
`clock`, `fireworks`.
`fire` and `beams` have no built-in animation using them but are kept — they
are building blocks the builder offers, and the developer sandbox in
`testEffects.ts` uses them. That sandbox exists only under `npm run dev`:
`registry.ts` leaves it out of production builds, because its one-word triggers
ignore case and a hand-typed list could contain one.

The seven הנרץ' effects share a shape, so `registry.ts` has two builders,
`wraithModules` and `wraithPresentation`. Seven near-identical copies is the
point at which that stopped being premature. An effect that wants something
different simply does not use them.

## Custom animations

People build their own in `animations/AnimationBuilder.tsx`, behind the 🎬
button. The vocabulary changed with it: an **effect** is one building block (a
VFX module) and an **animation** is what plays when a particular character
wins. Internal names still say effect and module — only the interface changed,
and `STORAGE_KEYS.effects` keeps its old name because people have a saved
setting under it.

- **Kept in this browser**, under `dmuyot_party_animations`: one object holding
  every username's animations. `dmuyot_party_username` is the name typed in.
  Syncing to a server is planned and not built; `loadLibrary` and `saveLibrary`
  in `animations/store.ts` are the only functions that know where it lives.
- **A username is not an account.** No password, not unique, case-insensitive.
  Anyone who types "jack" sees and can change jack's animations. That was
  chosen deliberately for a group of friends.
- **Matching is exact**, on a name picked from the loaded list — not a prefix.
  That sidesteps both the prefix-collision and the apostrophe traps below. A
  custom animation beats a built-in one, but only for the username it was
  saved under (`resolveWinnerAnimation`).
- **One animation per character per username.** The replace dialog asks, and
  `withAnimation` enforces it whatever the caller did.
- **Loading repairs entry by entry.** Not through `usePersistedJSON`, whose
  validation throws away the whole stored value on any failure — one bad
  animation would have taken everyone's with it. The library is a
  prototype-less object because usernames like `__proto__` are typed by people.
- **Previews bypass the animations setting.** `previewAnimation` in `App.tsx`
  hands modules straight to the canvas, which sits above every modal.
- **"Clear saved data" on the error screen deletes animations too** — they
  share the `dmuyot_party_` prefix. Until there is a server, export is the only
  backup.

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

**Start an effect's timeline on its first frame, not on mount.** The effect
canvas is usually created fresh for each effect, and mounting stalls for as
long as creating the WebGL context and compiling the shaders takes. A GSAP
timeline started on mount spends its fade-in inside that stall, so the first
frame anyone sees is already at full strength — the effect pops in, while its
fade-out, running later on a warm canvas, looks fine. Every module builds its
timeline paused and plays it from its first `useFrame`. A new module must too,
or the fade-in times people set in the builder quietly stop meaning anything.
A second, smaller cause of the same symptom: with additive blending, intensity
belongs in alpha alone. In colour as well it ramps as its square, and the fade
stops reading as one.

**`center` runs bottom-up.** The black hole and the clock both take `center` as
fractions of the frame, but the second number is measured from the **bottom**:
three.js gives a plane's top edge `v = 1` (see `PlaneGeometry.js`). The comment
in `types.ts` said "from the top left" for a while, and advice built on it moved
the hole the wrong way — a smaller second number moves it *down*.

**Touch targets, and iOS zooming in.** Measured at phone width, the animation
builder's small controls first came out 22 to 29px tall — the remove button on
a clock hand was 26 by 22 — against the roughly 44 a finger needs. Layout checks
all passed; only measuring sizes caught it. `animations/builder.css` enlarges
them under `@media (pointer: coarse)`, so a mouse keeps the compact layout. The
same block sets text inputs to 16px: below that, iOS Safari zooms the whole page
in when a field is focused and does not zoom back out. Any new control on a
screen people use from a phone wants the same treatment.

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

`main` deploys to Vercel automatically. The site people actually use is
**https://dmuyot-party-6gjy.vercel.app**. A second Vercel project,
`dmuyot-party`, is connected to the same repository and builds every push to
https://dmuyot-party.vercel.app — a leftover nobody uses, so if it is still
there it can be deleted from the Vercel dashboard. Both post a status on each
commit, and nothing in the repository refers to either address.

**`feat/pwa-and-deploy` is unmerged** and holds two things:

- `d93f88a` — PWA: manifest, icon set, service worker
- `a3199b3` — `render.yaml`, deploy configuration for the backend

Do not cherry-pick `d93f88a` blindly. It also contains the `box-sizing` and
media-query fixes, which `main` already has via `4ed2c81`, so it will conflict.

The `sounds-done` tag is part of `main`'s history now; it marks the point where
recorded sound worked, before the PWA work. The other branches —
`feat/black-hole-effect`, `feat/spin-sounds` and
`refactor/character-effect-registry` — are merged and hold nothing `main` lacks.

## Open questions

**The backend is deployed, and `VITE_API_URL` is set.** It runs at
`https://dmuyot-party.onrender.com`, and the Vercel build has that URL compiled
into it. This sat here as an open question for several sessions, phrased as
though the opposite were likely. It is not: production loads lists fine. Settle
it from the built bundle rather than by asking:

```bash
site=https://dmuyot-party-6gjy.vercel.app
curl -s "$site/$(curl -s "$site/" | grep -o 'assets/index-[^"]*\.js')" | grep -o 'https://[^"]*api/extract'
```

**But Render is not running `main`.** Checked on 2026-09-10: the live API has
no `/health` route (FastAPI answers it with its own 404), turns `10 - Frodo`
into `- Frodo`, still sends `access-control-allow-credentials: true`, and its
OpenAPI schema has no `Character` model. All of those changed in `main`'s
backend commits of 2026-09-04 and 2026-09-09, so the service is serving the
June code and nothing pushed since has reached it. Whether auto-deploy is off,
the service points at another repository or branch, or its builds fail, only
the Render dashboard can say. Until it is redeployed, a backend fix on `main`
is not live — check rather than assume:

```bash
curl -s https://dmuyot-party.onrender.com/openapi.json | grep -o '"/[^"]*":'   # no /health listed: still the June build
```

**Waking that backend takes about half a minute.** Render's free tier spins an
idle instance down. A measured cold request took 32.4s; the next was instant. So
the first list-load after a quiet spell is very slow, and anything calling the
API on demand — a widget, a script — cannot assume it is awake. Moving the one
endpoint onto Vercel's Python runtime beside the frontend would cut that
sharply and remove the second host entirely. The keep-awake workflow is the
cheap version, limited to sixteen hours a day to stay inside Render's 750 free
instance-hours — but GitHub runs frequent schedules late or not at all. In its
first twenty hours it ran 4 times against about 70 scheduled slots, and not
once in the first five hours of its first morning. Treat it as best-effort. Any
request wakes the instance, so its 404 from the stale build still counts.

**Home-screen widgets need a native app and can never show the wheel.**
Researched properly rather than assumed:

- Android widgets are `RemoteViews`, which supports a fixed set of view types.
  `WebView` is not among them and cannot be — the tree is serialised and drawn
  by the launcher's process. No web page can appear in an Android widget.
- iOS widgets are WidgetKit/SwiftUI, rendered as static snapshots on a
  timeline. No WebView, and no animation loop even inside a native app.
- The `widgets` member of the web app manifest is Microsoft's and targets the
  Windows 11 Widgets Board. It does nothing on either phone.
- Both platforms do allow an interactive button — an `AppIntent` on iOS 17+, a
  `PendingIntent` on Android — so a widget can spin and show a name.

Distribution is lopsided: an Android APK can be sideloaded to friends for free,
while every iOS route needs the $99/year membership.

The design settled on, for whoever picks this up: configure once with the
document link, fetch the list through `/api/extract` and keep it in
`SharedPreferences`, pick locally so the cold start never bites, and let tapping
the widget open the app for the real thing. Screenshotting the page into the
widget was considered and rejected — WebGL generally will not render in an
offscreen `WebView`, so the effects are precisely what would come out blank.

**The sound picker has one entry.** The machinery takes several; adding a pack
is files plus a spec. The Settings toggle and the preference both work.
