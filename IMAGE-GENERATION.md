# Local drawing-to-image prototype

Run `npm install`, then `npm run dev`, and open the local address (normally http://127.0.0.1:5173).

1. Select objects on the canvas. The default style row shows applicable colors and thickness, Duplicate, and Delete.
2. Toggle **Prompt**, immediately after Delete. The same row switches to a text field, a main action, and **Connect**. Toggling it off restores styles; your prompt and connection stay in memory.
3. Without an API key, the main action is **Copy**: copy a PNG of the selection with instructions beneath it, plus plain clipboard text, then paste into your preferred chat app. Copy does not call a provider. If copying fails, use **Download selection**.
4. **Connect** opens a provider/model/API-key dialog. Supply your own OpenAI or Gemini key. The main action becomes **Generate**; the provider checks key validity when you generate. Disconnect restores Copy.
5. Generate inserts a raster image beside the original selection, on its original page, and frames it in the canvas when that page is still active. The source drawing remains editable. The image supports move, resize, duplicate, delete, undo/redo, local autosave, and JSON/PNG/SVG export.

## Generation behavior

Copy and Generate use the same reference-first instructions: preserve content, layout, proportions, text, and composition while improving finish. User instructions refine the reference. Interfaces remain interfaces; people and objects remain the selected subjects. An empty prompt uses a faithful-polishing instruction for API generation.

Only the selected objects are captured on white, with padding, Scrappy rendering, and visible connected-line positions preserved. Reference exports are capped at a longest edge of 2048 pixels. Generating from an image selection includes the raster reference.

Generation captures the drawing, selection, and original page before sending. Switching pages does not insert into the wrong page. If the original document was replaced or the page deleted, the result remains available through **View last image** for download instead of insertion.

## Credentials and costs

The API provider bills the supplied API account; Draw supplies no shared key. This is an API-key connection, not subscription login. Copy allows a manual handoff to the user's chat app.

Keys remain in memory and clear on reload, Disconnect, or provider change. They are never added to drawings, local storage, exports, share links, or analytics. The local relay accepts only same-origin loopback requests and sends keys only to fixed OpenAI/Google origins. It saves no request content and rejects redirects.

This feature and relay run only with `npm run dev` on localhost over HTTP. Static deployment and `npm run preview` do not enable API generation. Public deployment needs a separate credential/hosting design.

One request is sent per click with no automatic retries. A 3-minute timeout or **Stop waiting** may not prevent provider charges. Generated images increase document size; large documents can exceed share-link or browser storage limits. Export a JSON file to retain the complete drawing when needed. Embedded images are restricted to PNG, JPEG, and WebP; external URLs and SVG image payloads are rejected.

## Validation

`npm run build` and `npm test` cover the toggle, Copy/Generate switch, simulated generation through insertion and undo, provider formats/errors, reference selection, raster transforms, serialization, and unsafe-source rejection. Browser checks verify the style and prompt layouts. Paid live generation still requires the user's key and was not run during development.

Provider references: [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation), [Gemini image generation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation).
