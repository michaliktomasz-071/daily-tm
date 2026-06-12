# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**DAILY TM** ("dziennik.") — a minimalist black-and-white journaling web app inspired by
the Stoic app. UI language is **Polish**. Entries carry a title, body, mood, tags, an
auto-computed moon phase, and a timestamp. Data is stored locally; there is no backend.

## Architecture

The **entire application is a single file: `index.html`**. There is no build step, no
package manager, no bundler. React 18 + Babel Standalone are loaded from unpkg CDN and
JSX is transpiled in the browser via `<script type="text/babel">`. The first load needs
internet (for the CDN); afterwards the browser caches the libraries.

Key consequences:
- Edit `index.html` directly. Do not introduce `npm`/`node`/Vite unless explicitly asked —
  the host machine has neither Node nor a real Python (only the Microsoft Store stub).
- All components live in the one `<script>` block. Keep using the existing patterns.

### State & routing
- `App` holds all state: `entries`, `settings`, and a hand-rolled `route` object
  (`{ name, id }`). There is no router library — screens are switched by `route.name`
  (`"list" | "add" | "edit" | "view" | "settings"`).
- Two `useEffect` hooks persist to `localStorage` and apply the theme
  (`document.documentElement.setAttribute("data-theme", ...)`).

### Persistence (localStorage)
- `daily_tm_entries_v1` — array of entry objects.
- `daily_tm_settings_v1` — `{ theme, categories }`. Defaults in `DEFAULT_SETTINGS`
  (theme `light`; categories `praca / dom / zakupy / rozrywka`).
- When changing an entry's or settings' shape, bump the storage key version and merge
  defaults on load (see `loadSettings`).

### Photos (Supabase Storage)
- Entries may carry optional photos. The entry shape has a `photos` field — an array of
  **storage paths** (not URLs), mapped to/from the DB `entries.photos` (jsonb) in
  `rowToEntry`/`entryToRow`.
- Files live in the **private** bucket `entry-photos`. Path scheme is `"<user_id>/<rand>.jpg"`;
  RLS on `storage.objects` restricts each user to their own `auth.uid()` folder (select/
  insert/update/delete policies).
- Helpers near the Supabase block: `downscaleToJpeg` (canvas resize to ~1600px / JPEG 0.85),
  `uploadPhoto(file, userId)`, `signPhoto(path)` (short-lived signed URL for preview), and
  `removePhotos(paths)`. Previews always use signed URLs since the bucket is private.
- `EntryFormScreen` uploads on file-pick and tracks `addedPaths`; orphaned files are pruned
  in `save()`/`cancel()`. `deleteEntry` removes an entry's storage objects. An entry may have
  a photo only, text only, or both (`canSave` allows photo-only).

### Screens (components)
- `EntryFormScreen` — shared by **add and edit**. The `initial` prop switches modes:
  with `initial` it edits in place and **preserves `createdAt` and `moonPhase`**; without
  it, it creates a new entry stamped with the current date and computed moon phase. The
  local date variable is `baseDate` in both modes (don't reintroduce a `now` reference).
- `ListScreen` — tag filter bar + sort toggle (newest / by moon phase). Tags come from
  `settings.categories`; clicking one filters the list.
- `ViewScreen` — read view with edit (pencil) and delete (trash) actions.
- `SettingsScreen` — theme toggle and tag-category CRUD.

### Two custom SVG icon systems
- `LucideIcon` + the `LUCIDE` object: hand-copied path data from Lucide v1.17.0 (ISC).
  To add an icon, fetch its raw SVG from `unpkg.com/lucide-static@latest/icons/<name>.svg`
  and add an entry to `LUCIDE` as `[tag, attrs]` pairs. Mood faces map via `MOODS[].icon`.
- `MoonGlyph` + `MOON_GEO`: moon phases are drawn **geometrically** (circle + computed
  shadow path), not with emoji. `moonPhaseIndex` computes the phase from a date using the
  synodic month from a known new moon — no external API.

### Theming
All colors are CSS variables on `:root`, overridden by `:root[data-theme="dark"]`. Use the
existing vars (`--bg`, `--fg`, `--muted`, `--line`, `--chip`, `--card`, `--page`) for any
new UI so both themes work. Icons use `currentColor`, so they invert automatically on dark
backgrounds (e.g. inside the black FAB / active chips).

## Running / previewing

Open `index.html` directly in a browser, **or** serve it. A static server is needed for the
Claude preview tooling:

- Preview config: `.claude/launch.json` (server name `daily-tm`, port `4321`).
- The server is `serve.ps1` — a dependency-free static file server written in pure
  PowerShell, because the machine lacks Node and Python. Start it via the preview tooling
  (`preview_start` with name `daily-tm`), not by hand.

## Verifying changes

There are no automated tests. Verify in the live preview: seed `localStorage` via
`preview_eval` (set `daily_tm_entries_v1` then `location.reload()`), exercise the flow,
assert with DOM queries, then **clear the seeded keys** when done. Note `preview_eval`'s
parameter is `expression` (not `code`).

## Docs to keep in sync

`PRD.md` (product requirements, screen specs, acceptance criteria) and `README.md` are
maintained alongside features. Update them when adding or changing user-facing behavior.
