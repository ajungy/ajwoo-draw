# Image generation

Scope: public browser-based feature. No hosted inference or shared API billing.

- Uses OpenAI and Google API services with user-entered keys; source notes in ATTRIBUTIONS.md.
- New dependency: @types/node 22.18.6, MIT, development only.
- No new durable personal-data fields. API credentials are memory-only and removed on reload/disconnect/provider switch. Requests and provider content are not logged by the relay.
- Prompt and selected drawing leave the device only when Generate is chosen; the interface names the provider and discloses API billing.
- Generated raster images are now inserted into the drawing and retained with local autosave/export; deletion and undo use existing document controls. API keys are never document fields.
- Public requests use fixed provider endpoints directly from the browser. The connection dialog discloses provider processing, memory-only credentials, and API billing. Browser request restrictions surface an error with a Copy fallback.

- Subscription handoff: Copy prepares a PNG with the selected drawing and prompt locally, plus plain clipboard text. No external chat links are shown; the user pastes the copied reference into their chosen chat app. A download fallback handles denied clipboard access. No new dependencies or persistent data.
