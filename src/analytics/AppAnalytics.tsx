import { AnalyticsConsent } from './AnalyticsConsent';
const config = {
  key: import.meta.env.VITE_POSTHOG_KEY ?? '',
  host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  app: 'draw',
  enabled: typeof location !== 'undefined' && location.hostname === 'draw.ajwoo.com',
};
export function AppAnalytics() { return <AnalyticsConsent config={config} />; }
