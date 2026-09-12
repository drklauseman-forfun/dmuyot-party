# Working notes

Context that is not obvious from reading the code, written over several long
sessions: hardening, recorded sound, the character effects, and then the
animation builder and the effects people build with. The
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
| Built-in animation (a "character effect" in the code) | `frontend/src/characters/registry.ts` | Append an entry |
| VFX module (an "effect" in the builder) | `frontend/src/vfx/modules.tsx` | Component + params in `VFXModuleConfig` + one line + a schema in `vfx/schema.ts`; a solid, realistic one also goes in `UNLIT_MODULES` |
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
`clock`, `fireworks`, `wings`, `eyes`, `slashes`.
`beams` has no built-in animation using it but is a building block the builder
offers. `fire` is **retired**: it did not look like flames, so
`RETIRED_EFFECTS` in `vfx/schema.ts` keeps it out of the builder's list. Its
component and schema stay, so any animation already saved with one still loads,
plays and can be edited — deleting the type would make the sanitiser drop those
animations. Retiring any other module works the same way. Both are also used by
the developer sandbox in `testEffects.ts`, which exists only under
`npm run dev`: `registry.ts` leaves it out of production builds, because its
one-word triggers ignore case and a hand-typed list could contain one.

`wings` is built differently from every other module. The first version was a
full-screen shader like the rest and did not read as wings; realism needs real
feather shapes, which cost too much to compute for every pixel. So
`vfx/components/wings/textures.ts` draws a feather, a patch of skin and a bone
once on a canvas, and each style places instanced copies of them along a
skeleton from `wings/pose.ts` every frame. `pose.ts` is plain arithmetic with no
three.js, so a pose can be checked without drawing it. The wings are also the
one module in `UNLIT_MODULES` — see the bloom trap below.

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
- **Shared timing is written into the effects.** An animation's `timing`, when
  set, is copied into every one of its effects by `sanitizeAnimation`, so
  playback never has to know it exists and an export opened by an older build
  plays the same. Null means each effect keeps its own, which is how anything
  saved before shared timing existed loads. New animations start with it on.
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
is a disc that swallows the picture. `maxPixelSize` caps it: `sparkles` leave it
effectively uncapped by default, `fireworks` cap it at 42.

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
and show an empty frame. Do not conclude it is broken. Stretching `duration`
temporarily makes something visible, but judge nothing from it — see the black
hole above. The reliable way is an off-screen render with time set exactly,
described under *Verifying in the browser*; it also covers the wings, which have
no single shader to pull out of the bundle. The phone-versus-desktop sizing was
first settled the older way, by compiling a fragment shader taken from the built
bundle in a scratch WebGL canvas and reading pixels back.

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

**Bloom lights up anything bright, and brightens what it touches.** Every
light effect is drawn through the bloom in `EffectCanvas`, and the first
realistic wings were too: their white feathers lit up the whole screen, and
the bloom's output also lifted their colours. Solid, realistic modules are
listed in `UNLIT_MODULES` (`vfx/modules.tsx`) and drawn in a second scene once
the bloom has finished, so they keep exactly the colours they were drawn in.
That layer always sits on top of the light effects. A new solid module belongs
in that list.

**`center` runs bottom-up.** The black hole, the clock and the wings all take
`center` as fractions of the frame, but the second number is measured from the
**bottom**: three.js gives a plane's top edge `v = 1` (see `PlaneGeometry.js`).
The comment in `types.ts` said "from the top left" for a while, and advice built
on it moved the hole the wrong way — a smaller second number moves it *down*.

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
new triggers against the real document before trusting them. When these notes
were first written the document had 941 characters, and each of the eight
triggers of the time — `דיבי` and the seven הנרץ' — matched exactly one of them.
The four added since, `סאם (מגהברס 1)`, `סאלין (הכל)`, `איש הזיקוקים` and
`אבלין אלדורה`, have been checked against each other but not against the
document. The apostrophe in `הנרץ'` is **U+0027**, the plain ASCII one, not the
visually identical Hebrew geresh.

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
- **`.claude/launch.json` has two servers.** `dmuyot-frontend` is the dev
  server on :5173. `dmuyot-frontend-preview` serves the production build on
  :4173, so run `npm run build` first. Use it for anything that differs between
  the two — the developer sandbox animations, for one, exist only in dev.
- **Vite's HMR cache can serve stale modules** after a file is deleted, giving a
  blank page and a bogus `does not provide an export named …` for an export that
  plainly exists. `rm -rf frontend/node_modules/.vite` and restart.
- **A reloaded page can still hold a stale copy of a module.** After
  `EffectCanvas.tsx` was rewritten, the page kept importing the old one, whose
  exports did not include the new component, and a whole round of off-screen
  renders measured code that no longer existed — every one came back empty
  and looked like a real bug. When importing a module to test it, add a query
  (`?fresh=` plus `Date.now()`) and check its exports before trusting a result.
- **Off-screen renders work while the pane is hidden** and are the reliable way
  to judge an effect. Create an r3f root on a detached canvas with
  `frameloop: 'never'` and `preserveDrawingBuffer`, drive it with
  `advance(seconds)` and `gsap.updateRoot(seconds)` so time is exact rather
  than waited for, then `readPixels`. Timers crawl in a hidden page, so never
  wait on `setTimeout` there; yield with a `MessageChannel` instead. To test
  what the bloom does, render `EffectScene` from `EffectCanvas.tsx`, not a
  single component.

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

**But Render is not running `main`.** Checked on 2026-09-10 and again on
2026-09-11: the live API has no `/health` route (FastAPI answers it with its own
404), turns `10 - Frodo` into `- Frodo`, still sends
`access-control-allow-credentials: true`, and its OpenAPI schema has no
`Character` model. All of those changed in `main`'s backend commits of
2026-09-04 and 2026-09-09, so the service is serving the June code and nothing
pushed since has reached it. On 2026-09-11 the owner looked over the Render
dashboard and found nothing wrong, while the API that same day still served the
June code — so a healthy-looking dashboard does not settle it. The thing to read
there is the newest entry under **Events**: its date, and the commit it built.
Whether auto-deploy is off, the service points at another repository or branch,
or its builds fail, that entry will say. Until it is redeployed, a backend fix
on `main` is not live — check rather than assume:

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
first three days it ran 11 times in all, 3, 5 and 3 a day, against about 96
scheduled slots a day. Treat it as best-effort. Any request wakes the instance,
so its 404 from the stale build still counts. An outside pinger, or moving the
backend to Vercel, was offered and not yet chosen.

**Eyes still glow.** `eyes` are drawn as real eyes but still go through the
bloom, so their whites carry a soft halo — the reason `wings` were moved into
`UNLIT_MODULES`. Whether the eyes should follow was asked and not yet answered;
moving them is one entry in that set.

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
