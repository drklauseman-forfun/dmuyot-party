# Dmuyot Party

A random character chooser. Paste a public Google Docs link (or raw text), and
it extracts a numbered character list, puts it on a weighted spinning wheel and
picks winners. Certain winners trigger 3D visual effects.

## Layout

Two services, run separately in development.

| Path        | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `backend/`  | FastAPI. One endpoint, `POST /api/extract`, which fetches a Google Doc through its `export?format=html` URL and scrapes names and text colours out of it. |
| `frontend/` | Vite + React + TypeScript. The wheel, the character list, and the effects engine in `src/vfx/`. Deploys to Vercel from `main`. |

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

## Checks

```bash
cd frontend && npm run build && npm run lint
```

`build` is `tsc -b && vite build` — the same command Vercel runs, so a type
error here is a broken deploy.

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
  character can win twice, by design.
- Loading a list resets every weight to 1. Weights are keyed by position, so
  carrying them over would apply the old list's tuning to whoever now occupies
  those positions. The include-range is deliberately **not** reset — unlike the
  weights it stays visible in its input box, so it can't go stale unnoticed.

## Adding a spin sound

Append an entry to `SOUND_PACKS` in `frontend/src/sound/packs.ts`. Settings
builds its picker from that list, and the stored preference is validated
against it, so a removed pack falls back rather than breaking. Sounds are
synthesised at runtime — there are no audio assets to add.

## Adding a character effect

Append an entry to `CHARACTER_EFFECTS` in
`frontend/src/characters/registry.ts`. Nothing else needs to change — the modal
styling, the 3D layer and the trigger matching all read from that list.
`frontend/src/characters/testEffects.ts` holds developer sandbox effects for
eyeballing a single VFX module in isolation.

## Saved data

Settings, the pasted list, weights and the last result live in `localStorage`
under `dmuyot_party_*`. Real users have data under those keys — renaming one
without a migration loses it.
