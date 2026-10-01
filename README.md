# Dmuyot Party

A random character chooser. Paste a public Google Docs link (or raw text), and
it extracts a numbered character list, puts it on a weighted spinning wheel and
picks winners. Some winners trigger an animation — built in, or made by people
in the app's own animation builder.

## Layout

Two services, run separately in development, and one serverless function.

| Path        | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `backend/`  | FastAPI. `POST /api/extract` fetches a Google Doc through its `export?format=html` URL and scrapes names and text colours out of it; `GET /health` does nothing and exists for the keep-awake ping. |
| `frontend/` | Vite + React + TypeScript. The wheel, the character list, and the effects engine in `src/vfx/`. Deploys to Vercel from `main`. |
| `frontend/server/` | The shared-animations API, `/api/animations`: each name's custom animations, kept in Upstash Redis and guarded by a PIN. The build bundles it into `frontend/api/animations.js`, which Vercel runs beside the site. |

## Running it

Backend, from `backend/`:

```bash
pip install -r requirements.txt && python main.py
```

That serves on `http://localhost:8000`.

Frontend, from `frontend/`:

```bash
npm install && npm run dev
```

The frontend calls `http://localhost:8000` unless `VITE_API_URL` says
otherwise. **That variable has to be set in the Vercel project**, or a
production build will call localhost and every load will fail.

Sharing custom animations needs the animations API. Locally, after
`npm run build`, `node server/dev-server.mjs` in `frontend/` serves it on
`http://localhost:8787` with an in-memory store, and the dev server passes
`/api` through to it; without it the builder says sharing is not available and
keeps animations in that browser alone. In production it needs an Upstash
Redis database connected to the Vercel project from its Storage tab: until one
is, the function answers 503 and every phone keeps its animations to itself.

## Checks

```bash
cd frontend && npm run build && npm run lint && node server/test-animations.mjs
```

`build` typechecks, builds the site and then bundles the animations API — the
same command Vercel runs, so a type error here is a broken deploy. The last
command checks the API's rules against that bundle.

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest
```

The backend tests pin the extraction rules. They are worth reading before
changing `parse_characters_html`, because several of those rules are not
obvious from the code alone.

## Rules the parser follows

These are product decisions, not accidents. Changing one is a behaviour change.

- Only numbered lines are characters. A line must start with a digit, or be an
  `<ol><li>`. Anything inside a `<ul>` is never a character.
- `Name (Source): description` keeps only the part before the colon.
- Stripping the leading number must not mangle decimals — a character named
  `1.5` survives intact, and so does `10-20 Squad`.
- Black text is converted to white for the dark theme.

## How identity works

`originalIndex` — a character's position in the extracted document — is the
app's notion of identity. Weights, include-ranges and history all key off it.
The UI shows it 1-based and the range input reads 1-based, while internally
everything is 0-based.

Consequences worth knowing:

- Weight 0 takes a character off the wheel but leaves it in the sidebar list.
- Zero total weight produces a `VOID` winner rather than a crash.
- More than one spin, or a spin duration under 0.2s, skips the wheel animation
  and resolves instantly. Multi-spin samples **with replacement** — the same
  character can win twice, by design. Knockout mode is the exception: there
  every winner leaves the wheel until Restart, and a multi-spin draws
  different characters.
- Loading a list resets every weight to 1. Weights are keyed by position, so
  carrying them over would apply the old list's tuning to whoever now occupies
  those positions. The include-range is deliberately **not** reset, and it is
  kept between visits: unlike the weights it stays visible in its input box. A
  leftover range has still hidden characters from someone who forgot it, so
  look there first when some seem to be missing.

## Adding a spin sound

Put the audio in `frontend/public/sounds/<pack id>/` and append a spec to
`SAMPLE_PACK_SPECS` in `frontend/src/sound/samples.ts`. Settings, persistence
and preloading all read from that list, so nothing else changes.

Every sound is a recording. `tools/slice-ticks.py` turns one recording of
repeated clicks into the several short tick files a pack wants. Only use audio
whose licence permits redistribution — `frontend/public/sounds/README.md` has
the details and a table recording where each pack came from.

## Adding a built-in animation

Append an entry to `CHARACTER_EFFECTS` in
`frontend/src/characters/registry.ts`. Nothing else needs to change — the modal
styling, the 3D layer and the trigger matching all read from that list.
`frontend/src/characters/testEffects.ts` holds developer sandbox effects for
eyeballing a single VFX module in isolation. They exist only under
`npm run dev` — a production build leaves them out.

People can also make their own in the app, behind the 🎬 button, with no code
at all. A new VFX module — a new building block for either kind — needs a
component, its parameters in `VFXModuleConfig`, a line in `vfx/modules.tsx` and
a description in `vfx/schema.ts`. Add it to `VFXModuleConfig` and the build
fails until the other three exist. [CLAUDE.md](CLAUDE.md) has the details.

## Saved data

Settings, the pasted list, weights, the include-range, the last result, the
name typed into the animation builder, the PINs that have worked there and this
browser's copy of the animations live in `localStorage` under
`dmuyot_party_*`. Real users have data under those keys — renaming one without
a migration loses it. Animations are also kept on the server under each name,
once its storage is connected, so "Clear saved data" on the error screen loses
only what never reached it. Knockout mode is never saved.
