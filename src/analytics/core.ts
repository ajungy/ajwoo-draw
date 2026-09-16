import type { PostHog } from 'posthog-js';

export type AnalyticsConfig = { key: string; host: string; app: string; enabled: boolean };
export type AnalyticsEvent = '$pageview' | 'app_opened' | 'booking_clicked' | 'outbound_clicked' |
  'download_requested' | 'drawing_export_requested' | 'drawing_export_failed' |
  'conversion_started' | 'conversion_succeeded' | 'conversion_failed' | 'conversion_cancelled';
const events = new Set<AnalyticsEvent>(['$pageview', 'app_opened', 'booking_clicked', 'outbound_clicked',
  'download_requested', 'drawing_export_requested', 'drawing_export_failed',
  'conversion_started', 'conversion_succeeded', 'conversion_failed', 'conversion_cancelled']);
const consentKey = 'ajwoo_analytics_consent_v1';
const safeProperties = new Set(['distinct_id', '$device_id', '$session_id', '$window_id',
  '$lib', '$lib_version', '$browser', '$browser_version', '$os', '$os_version',
  '$device_type', '$screen_height', '$screen_width', '$viewport_height', '$viewport_width',
  '$is_identified', '$process_person_profile', '$referring_domain',
  'app', 'destination_app', 'destination_domain', 'format', 'count',
  'utm_source', 'utm_medium', 'utm_campaign']);
let config: AnalyticsConfig | undefined;
let client: PostHog | undefined;
let pending: Promise<void> | undefined;
let lastPage = '';

export function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : undefined; }
  catch { return undefined; }
}

// An allowlist also removes SDK-added initial URLs, person updates and DOM data.
export function sanitizeProperties(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === '$current_url') { const clean = cleanUrl(value); if (clean) output[key] = clean; }
    else if (safeProperties.has(key) && ['string', 'number', 'boolean'].includes(typeof value)) {
      output[key] = typeof value === 'string' ? value.slice(0, 200) : value as number | boolean;
    }
  }
  return output;
}

function privacySignal(): boolean {
  return navigator.doNotTrack === '1' || Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}
export function consent(): 'yes' | 'no' | undefined {
  if (typeof document === 'undefined') return undefined;
  if (privacySignal()) return 'no';
  const value = document.cookie.split('; ').find((part) => part.startsWith(consentKey + '='))?.split('=')[1];
  return value === 'yes' || value === 'no' ? value : undefined;
}
export function configureAnalytics(value: AnalyticsConfig): boolean {
  config = value;
  return value.enabled && /^phc_/.test(value.key) && /^https:\/\/(us|eu)\.i\.posthog\.com$/.test(value.host);
}
export function analyticsAvailable(): boolean {
  return Boolean(config && config.enabled && /^phc_/.test(config.key) && /^https:\/\/(us|eu)\.i\.posthog\.com$/.test(config.host));
}
export function setConsent(value: 'yes' | 'no'): void {
  if (privacySignal()) value = 'no';
  const domain = /(^|\.)ajwoo\.com$/.test(location.hostname) ? '; Domain=ajwoo.com' : '';
  document.cookie = `${consentKey}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${domain}${location.protocol === 'https:' ? '; Secure' : ''}`;
  if (value === 'no') {
    client?.opt_out_capturing();
    client?.reset();
    lastPage = '';
  }
  window.dispatchEvent(new Event('ajwoo-analytics-consent'));
}
export async function startAnalytics(): Promise<void> {
  if (!analyticsAvailable() || consent() !== 'yes') return;
  if (client) { client.opt_in_capturing({ captureEventName: false }); return; }
  if (pending) return pending;
  pending = (async () => {
    const { default: posthog } = await import('posthog-js');
    if (consent() !== 'yes' || !config) return;
    posthog.init(config.key, {
      api_host: config.host, defaults: '2026-08-29',
      persistence: 'cookie', cross_subdomain_cookie: true, cookie_expiration: 180,
      secure_cookie: location.protocol === 'https:',
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_dead_clicks: false, capture_performance: false, capture_exceptions: false,
      disable_session_recording: true, disable_surveys: true,
      disable_external_dependency_loading: true, advanced_disable_flags: true,
      person_profiles: 'never', respect_dnt: true,
      save_referrer: false, save_campaign_params: false,
      before_send: (event) => {
        if (!event || consent() !== 'yes' || !events.has(event.event as AnalyticsEvent)) return null;
        event.properties = sanitizeProperties(event.properties ?? {});
        // The ingestion API requires the SDK's public project token here.
        event.properties.token = config!.key;
        return event;
      },
    });
    client = posthog;
  })().catch(() => { /* Analytics must never prevent the visitor's task. */ }).finally(() => { pending = undefined; });
  return pending;
}
export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
  if (!client || !config || consent() !== 'yes' || !events.has(event)) return;
  try { client.capture(event, sanitizeProperties({ ...properties, app: config.app, $current_url: location.href })); }
  catch { /* Optional analytics cannot break app actions. */ }
}
export function trackPage(): void {
  if (!client || consent() !== 'yes') return;
  const page = location.origin + location.pathname;
  if (page === lastPage) return;
  lastPage = page;
  let referring = '$direct';
  try { if (document.referrer) referring = new URL(document.referrer).hostname; } catch { /* absent */ }
  const query = new URLSearchParams(location.search);
  track('$pageview', { $referring_domain: referring,
    utm_source: query.get('utm_source') ?? '', utm_medium: query.get('utm_medium') ?? '',
    utm_campaign: query.get('utm_campaign') ?? '' });
}
export function trackLink(event: MouseEvent): void {
  if (!(event.target instanceof Element) || (event.type === 'auxclick' && event.button !== 1)) return;
  const link = event.target.closest('a');
  if (!link) return;
  let url: URL;
  try { url = new URL(link.href, location.href); } catch { return; }
  if (!/^https?:$/.test(url.protocol)) return;
  const properties = { destination_domain: url.hostname };
  if (url.hostname === 'calendly.com') track('booking_clicked', properties);
  else if (url.hostname !== location.hostname && /(^|\.)ajwoo\.com$/.test(url.hostname)) {
    track('app_opened', { ...properties, destination_app: url.hostname.split('.')[0] });
  } else if (link.hasAttribute('download') || url.pathname.startsWith('/downloads/')) track('download_requested', properties);
  else if (url.hostname !== location.hostname) track('outbound_clicked', properties);
}
