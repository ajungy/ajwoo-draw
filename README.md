# ajwoo draw

A local-first drawing app for the browser, built for the phone first.

Open the link, draw an idea, and send it somewhere. There is no account, no
backend, and nothing to set up. Your drawing lives in your browser and leaves
your device only when you explicitly export or share it.

---

## Running it

```bash
npm install
npm run dev
```

Then open the printed URL. On a phone, open the same URL over your local network.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting |

## Using it

Pick a tool from the bottom toolbar; the row above it changes to show only the
options that apply to what you are doing.

- **Hand** — pan and zoom. Two fingers pinch and pan together at any time,
  whichever tool is selected.
- **Pen** — freehand strokes, with stylus pressure where the device reports it.
  The eraser removes a whole stroke per swipe.
- **Line** — lines, arrows, and connectors. With connector mode on, an endpoint
  near a shape snaps to it and stays attached when that shape moves.
- **Shape** — rectangle, ellipse, triangle, star, arrow, heart, and note. Drag
  to size one, or tap to drop one at a default size.
- **Text** — tap an empty spot to start typing.
- **Select** — tap to select; tap a shape or a text object to edit its text; drag
  to move; use the corner handles to resize.

Keyboard, on a laptop: `V` select, `H` hand, `P` pen, `L` line, `S` shape,
`T` text, `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo, `Cmd/Ctrl+C` / `Cmd/Ctrl+V`
copy and paste, `Cmd/Ctrl+D` duplicate, `Cmd/Ctrl+A` select all, `Delete` to
delete, `Shift+1` to fit the view. Space-drag or middle-drag pans; `Cmd/Ctrl` and
the scroll wheel zooms. None of these are required — everything is reachable by
touch.

## How local persistence works

The current document is written to **IndexedDB** in your browser, debounced a
little after you stop drawing, and flushed again when the tab is hidden or
closed. There is no Save button; the header shows a quiet `Saving…` / `Saved`
state so you can tell what is happening.

What is stored: the document (title, pages, objects), which page you were on,
your tool preferences, and a timestamp. It is stored under one key, on this
device, in this browser profile.

If IndexedDB is unavailable — a private window, blocked site data, a browser
that refuses the database — the app keeps working entirely in memory and says
so in the header rather than pretending to save. Export the drawing to keep it.

`New drawing` clears the stored document after confirming.

## How sharing works

A share link carries the entire drawing **in the URL fragment**:

```
https://your-host.example/#drawing=d1:<compressed-document>
```

The document is serialized to JSON, compressed with `deflate-raw` via
`CompressionStream`, and base64url-encoded. A URL fragment is never sent to the
server by the browser, so the drawing reaches the recipient without ever
touching any host — there is no upload, no database row, and no link that can
expire out from under you.

Opening such a link decodes the drawing, shows it, and strips the payload from
the address bar. Because the recipient may already have their own drawing saved,
a shared drawing is **not** written to their device automatically; a banner says
so and offers `Save here`.

Links have a practical ceiling of 12,000 characters, since links get pasted into
chat apps and email clients that truncate. Past that the app says the drawing is
too large for a link-only share and offers an SVG export instead — it does not
silently produce a broken link.

The `d0:`/`d1:` prefix marks whether the payload is compressed, so a link made in
a browser with `CompressionStream` still opens in one without it.

## What data leaves your device

Nothing, unless you ask for it.

```
You → your browser → IndexedDB on this device
```

There is no server, no account, no telemetry, and no analytics. Data leaves only
through actions you take:

- **Export PNG / SVG / drawing data** — writes a file to your device.
- **Copy SVG / PNG** — writes to your system clipboard.
- **Share** — builds a link (entirely client-side) and hands it to the system
  share sheet or your clipboard. Where that link then goes is up to you.

The one external request the app makes is to Google Fonts for the UI typeface,
cached by the service worker after the first visit. Exports embed font *names*,
never font files or remote references.

Imported and shared drawings are treated as untrusted input: every field is
validated and coerced against a schema, unknown object types are dropped, colours
must be literal hex (so no `url(...)` reference can reach an export), control and
bidi characters are stripped from text, and connector bindings that point outside
their page are removed. Text is rendered through canvas and SVG text nodes and is
XML-escaped on export — no drawing content is ever interpreted as HTML or
executed.

## Offline

A service worker caches the application shell, so after one visit the app opens
with no network. Navigations are network-first (so a deploy is picked up) with
the cache as the offline fallback; static assets are cache-first. Drawings are
never involved — they are already local.

## Deploying it

The build is a fully static site with no server-side component.

```bash
npm run build   # → dist/
```

Upload `dist/` to any static host: Cloudflare Pages, GitHub Pages, Netlify,
Vercel, S3, or a plain web server.

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **No environment variables, no runtime, no database.**

Asset paths are relative (`base: './'`), so the app also works from a
subdirectory such as a GitHub Pages project site. Serve it over HTTPS: the
clipboard, Web Share, and service worker APIs all require a secure context.

### This repo's deployment: GitHub Pages at draw.ajwoo.com

`.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages on
every push to `main` — free, at zero ongoing infrastructure cost. `public/CNAME`
tells Pages the custom domain. To point `draw.ajwoo.com` at it, add one DNS
record with your domain's DNS provider:

| Type  | Name   | Value             |
|-------|--------|-------------------|
| CNAME | `draw` | `ajungy.github.io` |

GitHub provisions the HTTPS certificate automatically once that record
resolves (usually within a few minutes, occasionally up to a few hours).

## How it is put together

```
src/
  app/          store, actions, autosave, shortcuts, app shell
  canvas/       renderer, interaction, snapping, shape and text geometry
  document/     model, history, serialization
  storage/      IndexedDB session
  export/       SVG, PNG, file and clipboard plumbing
  sharing/      share-link encode/decode
  ui/           icons, buttons, menu, dialog, toast
  styles/       design tokens and application CSS
```

A few decisions worth knowing about:

**The document model is plain data.** No classes, no functions, no React state.
The same structure goes into IndexedDB, a share link, the clipboard, and a JSON
export without conversion.

**Pointer movement never rerenders React.** The store has two subscription
channels: app-level changes notify React, while camera moves and the in-flight
stroke only invalidate the canvas. Repaints are coalesced to one per frame.

**History is snapshot-based but cheap.** Every document operation shares
structure with the version before it, so an undo entry is one object reference
rather than a deep copy. A continuous stroke, a drag, and a text-editing session
each commit exactly one step.

**Shape outlines and pen strokes are generated once, as SVG path data.** The
canvas draws them via `Path2D` and the SVG exporter writes the same string, so
what you export cannot drift from what you saw.

**The canvas is paper.** The UI follows the system light/dark theme; the drawing
surface stays light in both. Ink colours are stored literally, so a theme-flipping
canvas would make the default ink invisible and then disagree with every export
and share link.

## Tests

```bash
npm test
```

63 tests covering the document model and page operations, serialization
round-trips, hit-testing and transforms, undo/redo grouping, IndexedDB save and
restore, SVG and PNG export, share-link encoding including damaged and oversized
payloads, connector snapping and release, the renderer's transform and culling
behaviour, hostile-input handling, and coarse performance budgets over hundreds
of objects.

## Known limitations

- Import reads the app's own `.json` format. SVG import is not implemented.
- Shapes can be resized and moved but not rotated through the UI; the model
  supports rotation and both renderers honour it.
- There is no multiplayer, no comments, and no cloud storage — by design.
