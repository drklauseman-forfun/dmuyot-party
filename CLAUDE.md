# Working notes

Context that is not obvious from reading the code, written over several long
sessions: hardening, recorded sound, the character effects, the animation
builder and the effects people build with, knockout mode, and sharing
animations by name through a server. The
[README](README.md) says what the app is and how to run it; this says what will
catch you out.

## Checks

```bash
cd frontend && npm run build   # tsc -b, vite build, then the animations API — the same command Vercel runs
cd frontend && npx eslint .    # expected to be silent; it was 14 errors before, so nobody ran it
cd frontend && node server/test-animations.mjs   # the animations API, against the bundle the build wrote
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
  win twice, deliberately. Knockout mode is the one exception.
- **Knockout mode**, switched on beside the spin button: every winner leaves
  the wheel until Restart, and a multi-spin draws that many *different*
  characters, or as many as are left. Once everyone is out the spin button
  becomes Restart; an empty wheel because every weight is 0 still gives `VOID`.
  Loading a list or switching the mode off brings everyone back.
- **Knockout is never saved** — neither the switch nor who is out. Both are
  plain state in `App.tsx`, on purpose and at the owner's request: a round left
  unfinished must not quietly cost someone their turn on another day. Do not
  move them into `storage.ts`.
- **A spin indexes `spinPool`, never `wheelCharacters`.** `spinPool` is what
  the wheel draws — everyone with a weight, less anyone knocked out — and the
  prize number a spin aims at is a position in it. Looking the winner up in any
  other list names the wrong character the moment anyone is out. Nothing can
  change the pool mid-spin, because every control is off until the wheel
  stops, and that is when the winner is knocked out.
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
content is data rather than markup so the two stay the same shape. It also has
a section on the builder's effects — that most draw one thing with a Kind or
Style and are added several times over, Memes' Giphy links, the curtain over
the results, Paint over for dark — and notes that the range box is kept between
visits and that builder previews ignore the animations switch. Its builder
section explains sharing by name and the PIN as well. All of it wants the same
care when the effects, the settings or sharing change.

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
`clock`, `fireworks`, `wings`, `eyes`, `slashes`, `words`, `memes`, `glitch`,
`timepieces`, `hands`, `figure`, `weapons`, `curtain`, `candles`, `creatures`.
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
three.js, so a pose can be checked without drawing it. The wings, the eyes,
the words, the memes, the timepieces, the hands, the figure, the weapons, the
curtain and the candles are the modules in `UNLIT_MODULES` — see the bloom trap
below. The glitch and the creatures are not: they are light, and are meant to
glow.

Where the wings sit was measured against the results box, not guessed. At the
old centre of 0.62 the spread wings covered its top on a phone, title included.
At 0.76, open wings clear the title on every size tried, from 375×667 to
1920×1080, and the box itself on most; a burst's curled-up start and the
feathers it throws still cross the title for a moment. No centre worked on a
wide screen, because wings sized by the shorter side were taller than the space
above the box, so `wingUnit` in `wings/motion.ts` sizes those by 0.62 of the
height and leaves portrait phones as they were. Before moving either number,
re-measure: an off-screen render of the wings against the bounding box of a
rendered `ResultsModal`.

`words` and `memes` are frame-driven too, and share two helpers:
`components/fadeClock.ts` (the fade every such effect goes through, which the
wings now use as well) and `components/scatter.ts`, which finds random spots
clear of the middle where the results sit. A box that cannot fit clear of it at
all is shrunk step by step until it does: on a landscape screen the bands above
and below the results are short, and at first every meme was silently dropped
there — the preview showed words and nothing else. Off-screen checks at phone
size had passed, so check more than one shape.

`memes` plays GIFs from Giphy, and the builder takes Giphy links, so two things
are deliberate. Only ids are stored: `vfx/giphy.ts` reduces any shape of Giphy
link to its id and refuses everything else, and builds the only address ever
requested from it, so a shared animation cannot point phones at another site.
And nothing is copied into this repository — the same reason as the audio
licence rule below. The files are Giphy's 200-pixel MP4 versions, tens of
kilobytes each, played as video textures: WebGL cannot animate a GIF, and
decoding one would need another library. They download when the effect starts
and pop in once loaded. `MEME_GIFS` is the hand-picked list, each checked by
eye. Untested: iPhones in Low Power Mode may refuse to play them, as they do
other videos that start themselves.

Seven of the effects are **drawings** rather than shaders: `timepieces` (a
clock, a digital counter, an hourglass or a metronome), `hands` (an open palm,
a handshake, machine or porcelain), `figure`, `weapons`, `curtain`, `candles`
and `creatures`. They follow the wings' pattern — each picture drawn once on a
canvas in neutral colours and lit from the top left, then placed, turned and
tinted every frame — and they share `components/fadeClock.ts` and, where they
scatter, `scatter.ts`. All but the creatures are solid; the creatures are drawn
as light, so they glow. Moving parts are their own quads hinged where they
belong: a clock's hands turn about the hub, a metronome's arm about its pivot.
Two go further: the curtain is all shader, silk lit from a fold surface, and
the whale is its picture on a strip a shader bends. No fixed picture could
fold like cloth or swim.

Most of them take a `style` or `kind`, and draw **one** of the thing. A wall of
clocks or a battery of mixed weapons is the same effect called over and over
with different kinds, places and sizes, which is how ארה and ג'ול\ייט are
built. That was asked for directly, and it is also what keeps a parameter list
short enough to use.

What the owner has turned down, so it is not tried again: an open palm facing
the viewer, which reads as "stop" or a wave and not as offering a deal (the
Handshake kind is side on, palm out, thumb up, from a cuff and sleeve); a hand
drawn edge on, which read as a paddle with a stick for a thumb; hands whose
thumb ran past the edge of the picture they were drawn on (keep every part
inside the canvas — nothing reports the clip); and a whale that slid across
rigid with a hinged tail. The whale now bends as one strip, the wave growing
from the head to the flukes, up and down, and its flukes are broad blades
seen from a little below — two equal upright blades made it a fish.

Hands, candles, the wings and the whale are sized against the shorter side on
a phone but against 0.62 of the height on a wide screen, where the bands beside
the results are short; a phone-sized hand reached into the box on a laptop, and
a candle stood up into it.

**The curtain is the one effect that looks at the page.** Hung over the
results, it reads the `.results-modal` box with `getBoundingClientRect` every
frame and fits itself to it — exact on every screen, and a shaking box takes
its curtain with it. The canvas covers the whole window, so page pixels are
canvas pixels. With no box on the page, as in a builder preview, it hangs where
the box would be. It took three tries to read as a curtain at all: a dark
full-screen rectangle with faint stripes, then a shorter one, were both turned
down. What made it read was silk shading — folds lit from the slope of a
surface, a sheen down each crest in a lighter shade of the cloth's colour, a
hem that follows the folds — and a brass rod with knobs to hang from. Many
thin folds read as a pleated blind; a few broad ones read as silk.

Titles: newer built-in animations use the plain name. Emoji round the name were
asked off בארי אזומה's, and the five after it followed suit.

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

- **Kept on the server per name, and in this browser.** Each name's
  animations live in Redis behind the Vercel function `api/animations.js` —
  see *Shared animations* below — so the same name brings them to any phone.
  The browser keeps its own copy under `dmuyot_party_animations`, one object
  holding every name's; that copy is what plays and what the builder edits,
  and `animations/sync.ts` keeps it in step with the server.
  `dmuyot_party_username` is the name typed in. `loadLibrary` and
  `saveLibrary` in `animations/store.ts` are the only functions that know
  where the browser's copy lives.
- **A name is not an account, but it has a PIN.** Not unique, not secret,
  case-insensitive, and anyone can read any name's animations — they only
  ever play for the name they were saved under, so that changes nothing for
  anyone else. The first change made with a PIN claims the name, and from
  then on every change needs it. Both chosen deliberately for a group of
  friends.
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
  hands modules straight to the canvas, which sits above every modal. That
  hides a switched-off setting: on 2026-09-13 a new built-in animation seemed
  broken on the owner's phone because Enable Animations was off, while every
  preview in the builder still played. Ask about that switch before debugging
  a trigger. A note in the builder whenever the switch is off was offered and
  not taken up.
- **"Clear saved data" on the error screen deletes this phone's copy** of
  the animations, and its remembered PINs — they share the `dmuyot_party_`
  prefix. Whatever reached the server comes back once the name is typed
  again, and the PIN has to be typed again too. Anything saved while sharing
  was unavailable, and not uploaded since, is gone.

## Shared animations

The server half is `frontend/server/animations.ts`, run as a Vercel function.
Vercel's own TypeScript step could not follow this repository's extensionless
imports, so `npm run build` bundles the source — the rules and
`@upstash/redis` included — into one plain file, `api/animations.js`
(`vite.api.config.ts`). **That file is committed**, because Vercel finds
functions among the committed files. A change to `server/`, or to anything
`animations/rules.ts` reaches, shows up after a build as a modified
`api/animations.js`: commit it with the change.

- **`animations/rules.ts` runs on the server too.** The sanitiser and the
  limits live there so the function refuses exactly what the builder would,
  and sanitises again on the way out. Keep it to plain logic: anything that
  needs a browser — the DOM, storage, the registry — breaks the API bundle.
- **Storage is Upstash Redis**, attached to the Vercel project from its
  Storage tab. `redisCredentials` looks for `UPSTASH_REDIS_REST_URL`, then
  `KV_REST_API_URL`, then any name ending in `REST_API_URL`, each with the
  token named to match: the connect dialog offers a custom prefix, and a
  prefixed name must not quietly leave sharing off. With none of them the
  function answers 503, and every phone carries on with its own copy as
  before. The function runs in `iad1`, Washington, D.C. — the `x-vercel-id`
  header says so — so the database belongs in `us-east-1` beside it. Keys,
  with the name URI-encoded: `dmuyot:anim:<name>` is a hash from animation id
  to its JSON, `dmuyot:pin:<name>` the PIN's salted scrypt hash, and
  `dmuyot:tries:<name>` counts wrong PINs for an hour from the first; at ten,
  the name accepts none until the hour is up.
- **A forgotten PIN has no reset in the app.** Delete `dmuyot:pin:<name>`
  from the database: in Vercel, the project's Storage tab, then the
  database's Browser, or `DEL dmuyot:pin:<name>` in its CLI tab (Owner
  only); Upstash's own console works too. The name is unclaimed again, keeps
  its animations, and its next save sets a new PIN.
- **A name nobody has claimed can be written without a PIN.** That is how
  animations already on phones uploaded themselves the first time the app
  opened after sharing shipped, before anyone had been asked for one. Until
  someone saves with a PIN, anyone can change that name's animations.
- **Deletions must not come back.** `dmuyot_party_synced` records, per name,
  the ids this phone last saw on the server. An animation missing from the
  server that the phone once saw there was deleted on another phone, and is
  dropped here; one it never saw was made here, and is uploaded. Without the
  record, a phone with an old copy brings back everything deleted since. A
  deletion made while the server cannot be reached is not recorded, though,
  so the next sync brings that one back.
- **Anything short of an answer counts as offline.** A 404 (the dev server
  without the mock), a 5xx (storage not connected), a page where JSON was
  expected, no network: the builder says sharing is not available and saves
  on the phone, and the next sync uploads it. A refusal is different — a
  wrong PIN, too many animations — and undoes the change on the phone too, so
  the phone never shows what the name does not have.
- **It syncs when the app opens and when the name changes**, not
  continuously: `useAnimationSync` runs from `App.tsx`, so what plays after a
  spin is the name's latest as of opening, and a change made on another phone
  arrives on the next open. It waits until the name has stopped changing for
  600ms, since the name changes with every keystroke while it is typed.
- **Locally**, the dev server proxies `/api` to the `dmuyot-animations-api`
  server in `launch.json`, which serves the built bundle with an in-memory
  store and forgets everything when stopped. `server/test-animations.mjs`
  checks the server's rules against the same bundle, with no network.

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

Nothing converts colours in that layer either: what a shader there writes is
what the screen shows. The wings want exactly that, since their textures are
drawn on a canvas in screen colours already. A shader that works in linear
colour does not — `THREE.Color` turns a hex into linear values — and once the
eyes moved there their `#4a2a14` iris came out as `#0b0401`, near black, until
`VFXEyes` ended its shader with `#include <colorspace_fragment>`. The wings'
`color` tint goes in through `THREE.Color` too, so a tint other than white
draws darker than the one picked. The words and memes use `MeshBasicMaterial`,
which converts for itself: their textures are marked `SRGBColorSpace`, and the
materials `toneMapped: false`, since the canvas turns tone mapping on and it
dulls every colour — white words measured exactly white with both set.

**Video textures only refresh when the browser announces a frame.** three.js
waits for `requestVideoFrameCallback`, which does not fire in a page that is
not on screen: the meme videos loaded and played, and nothing was drawn.
`VFXMemes` marks each texture for upload every frame instead.

**eslint refuses property assignment on anything a hook returned.**
`react-hooks/immutability` reads `mesh.rotation.z = x` or
`material.uniforms.a.value = b` inside `useFrame` as modifying a value that
came from `useMemo` or went into `useEffect`, and fails the build. Method calls
(`mesh.position.set`, `mesh.scale.set`) pass, and so does anything done inside
a plain module-level function. The newer effects therefore keep their parts in
a ref and write through small helpers — `setPose`, `setOpacity`, `setTurn`,
`setUniform`. Copy that shape rather than fighting the rule.

**The range box is saved, and a leftover range hides characters.** On
2026-10-01 loading seemed broken — "it now loads only one character" — and the
cause was a `1` left in Include Ranges from an earlier visit. Like the animations
switch above, ask about that box before debugging a missing character. The help
now says it is kept and to look there first. Showing "1 of 4 shown" beside a
range that cuts characters out was offered and not taken up.

**The header's corner buttons are absolutely positioned.** Information sits in
the top left; history, animations and settings in the top right. Below about
560px the title no longer fits between them, and on every phone the right-hand
group covered the end of "Dmuyot Party". `index.css` moves the title down into a
row of its own under 600px. A fourth button on that side needs the overlap
measured again — compare the button group's box with the title's.

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
The four added next, `סאם (מגהברס 1)`, `סאלין (הכל)`, `איש הזיקוקים` and
`אבלין אלדורה`, have been checked against each other but not against the
document. `בארי אזומה`, added on 2026-09-22 (first mistyped `ברי אזומה`), was run
through both real documents (154 and 945 characters): no line begins with it,
and nothing there is that character yet, so it has matched nothing real so far.
The nearest, `השרביט של בארי (...)`, does not start with it. The apostrophe in
`הנרץ'` is **U+0027**, the plain ASCII one, not the visually identical Hebrew
geresh.

Five more were added on 2026-10-01 and run through both documents the same way:
`ארה [נ]`, `אמה [נ]`, `אייט [נ]`, `ג'ול\ייט` and `הגבירה השחורה`. Three of them
carry a bracketed `[נ]` because the owner's list writes them that way, and it
earns its place: `אמה` alone would also fire for `אמה סוואן (המימד הסגול)`, who
is already in the long document, and `ארה` is three letters. The backslash in
`ג'ול\ייט` is part of the name, so it is part of the pattern — written twice in
the source to mean one — and the apostrophe may be a geresh or the plain one,
since `comparable()` reads them alike. None of the five matches anything in
either document yet.

Both sides of a match now go through `comparable()` in `registry.ts` first,
which drops direction marks, zero-width characters and vowel points, collapses
runs of spaces, reads a geresh or curly apostrophe as the plain one, and strips
anything before the first letter or digit — including the `- ` the stale Render
backend leaves on a line written `12 - Name`. Run through both real documents,
it changed nothing except catching one דיבי line that starts with `*   **"`.
A pattern still has to be spelled the same, and a word in front of a name still
stops a prefix match.

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
- **`.claude/launch.json` has four servers.** `dmuyot-frontend` is the dev
  server on :5173. `dmuyot-frontend-preview` serves the production build on
  :4173, so run `npm run build` first. Use it for anything that differs between
  the two — the developer sandbox animations, for one, exist only in dev.
  `dmuyot-backend` runs the API on :8000, which the dev server calls: without
  it no list loads, and the builder refuses to start an animation until one
  has. `dmuyot-animations-api` is the shared-animations function on :8787,
  in memory; the dev server proxies `/api` to it, and without it the builder
  says sharing is not available and works on its own.
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
- **Editing from scripts on Windows.** Git Bash heredocs have failed outright
  on a script body holding an apostrophe inside a double-quoted string
  ("unexpected EOF while looking for matching `'`"). Write the script with the
  editor's Write tool and run that file instead. That tool trims trailing
  spaces, so a block copied from a source line that had them no longer matches;
  match with a pattern that allows `[ \t]*` before each newline. The Edit tool
  turns a `\uXXXX` escape into the character itself, which once put invisible
  characters into `registry.ts` — build escapes from `chr(92)` in a script.
  And `git add -p` is interactive: it hangs until the command times out.
- **A page reload drops anything kept on `window`**, and Vite's hot reload
  fires one whenever a file is saved. Keep a long test helper's source in
  `localStorage` and `eval` it back afterwards, rather than resending it.
- **The live canvas can be read too.** Its root is in the fiber module's
  `_roots` map, keyed by the canvas element; a callback registered with
  `store.getState().internal.subscribe(ref, 3, store)` runs after the unlit
  layer, and `readPixels` there sees the finished frame. In a hidden pane the
  page draws about once a second and GSAP's lag smoothing advances each of
  those frames by only 33ms, so fades crawl and everything reads faint: judge
  what is drawn and where, not how strongly.

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

**Shared animations need their storage connected.** The function shipped on
2026-10-01 and answers 503 until an Upstash Redis database is attached to
the `dmuyot-party-6gjy` project in Vercel — not the leftover `dmuyot-party`
one — and the site is redeployed. Until then every phone keeps its
animations to itself, as before. Check rather than ask:

```bash
curl -s "https://dmuyot-party-6gjy.vercel.app/api/animations?user=x"   # "no-storage": not attached yet
```

**The backend is deployed, and `VITE_API_URL` is set.** It runs at
`https://dmuyot-party.onrender.com`, and the Vercel build has that URL compiled
into it. This sat here as an open question for several sessions, phrased as
though the opposite were likely. It is not: production loads lists fine. Settle
it from the built bundle rather than by asking:

```bash
site=https://dmuyot-party-6gjy.vercel.app
curl -s "$site/$(curl -s "$site/" | grep -o 'assets/index-[^"]*\.js')" | grep -o 'https://[^"]*api/extract'
```

**But Render is not running `main`.** Checked on 2026-09-10, on 2026-09-11 and
again on 2026-10-01: the live API has no `/health` route (FastAPI answers it with its own
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
