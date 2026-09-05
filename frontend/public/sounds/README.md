# Sound files

Recorded spin sounds. These are **not** bundled into the JavaScript — they are
served from here and fetched at runtime, so they stay off the critical path and
the browser caches them normally.

Nothing here is committed by default. A pack with no files simply stays silent,
and Settings labels it "No sound files added yet."

## What to add

For the `Wheel` pack, in `public/sounds/wheel/`:

| File | What it is | Length |
| --- | --- | --- |
| `tick-1.wav` … `tick-4.wav` | One click of the flapper passing a peg | 30–120 ms |
| `land.wav` | The wheel arriving on its result | 0.5–2 s |

`.mp3` and `.ogg` work too — change the filenames in `SAMPLE_PACK_SPECS`
(`src/sound/samples.ts`) to match. `.wav` is the safest choice for very short
clicks, where compression artefacts are most audible.

## Why four ticks and not one

A 2.5-second spin fires up to 200 clicks. One recording repeated that many
times is instantly recognisable as a loop. The engine picks between the
available ticks at random and varies playback rate and level per hit, so four
short recordings comfortably cover a whole spin. Two works; one sounds
mechanical in the wrong way.

Record or choose them so they differ slightly — a real wheel's pegs never
sound identical.

## Levels

Keep peaks below roughly -6 dBFS. Everything is summed through a limiter, so
hot files do not get louder, only flatter. Per-pack level is `gain` in the spec
if a set needs trimming.

## Adding a whole new recorded pack

Append to `SAMPLE_PACK_SPECS` in `src/sound/samples.ts` and create a folder
named after its `id`. Nothing else needs changing — the picker, persistence and
preloading all read from that list.

## Licensing

Whatever goes here ships to everyone who loads the app. Use sounds you have
the right to distribute — CC0/public-domain, a licence you hold, or your own
recordings — and note the source below.

| Pack | Source | Licence |
| --- | --- | --- |
| wheel | _(not yet added)_ | |
