# Local image-generation prototype

Scope: local test feature, not a public launch. No hosted inference or shared API billing.

- Uses OpenAI and Google API services with user-entered keys; source notes in ATTRIBUTIONS.md.
- New dependency: @types/node 22.18.6, MIT, development only.
- No new durable personal-data fields. API credentials are memory-only and removed on reload/disconnect/provider switch. Requests and provider content are not logged by the relay.
- Prompt and selected drawing leave the device only when Generate is chosen; the interface names the provider and discloses API billing.
- Generated raster images are now inserted into the drawing and retained with local autosave/export; deletion and undo use existing document controls. API keys are never document fields.
- Before public availability: decide hosting/credential design, update actual privacy disclosures for provider processing, and review provider terms for the intended distribution. No claim of public-launch readiness.

- Subscription handoff: Copy prepares a PNG with the selected drawing and prompt locally, plus plain clipboard text. No external chat links are shown; the user pastes the copied reference into their chosen chat app. A download fallback handles denied clipboard access. No new dependencies or persistent data.
