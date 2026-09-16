# PostHog setup — connected locally

US Cloud project 610209 is connected in ignored .env.local. The integration
remains disabled when VITE_POSTHOG_KEY is not set
at build time, and only runs on draw.ajwoo.com. Use the same public project token
and region across AJWOO. No personal API key belongs in browser configuration.

Analytics loads after explicit opt-in only. The root-domain consent cookie lasts
180 days. The Analytics control can withdraw consent. DNT/GPC disable collection.
Replay, autocapture, surveys, flags, exceptions and person profiles are disabled.
Only explicit event names and allowlisted properties leave the browser; URL
queries/fragments, document names, drawings, files, error messages and inputs do not.
A download event means the browser was asked to download, not that it saved a file.

Before activation: connect the PostHog account, set each enabled product's spending
limit to zero, select/verify retention and deletion settings, confirm the disclosure,
build with the token, and verify live ingestion. The free account and 1M product-event cap were verified, with no paid upgrade.
Discard client IP data is enabled. A setup-test pageview and app launch were
verified in PostHog. Server retention was not changed. Production is not deployed.
Dashboard: https://app.posthog.com/project/610209/dashboard/2098006

SDK: posthog-js 1.433.4, Apache-2.0 AND MIT, official npm package.
The shared analytics implementation is copied from the website lib/analytics;
keep the three copies synchronized when changing consent or data filtering.

GitHub Pages: set repository variable POSTHOG_PROJECT_TOKEN before publishing.
The build workflow now passes it to Vite; blank keeps analytics disabled.
