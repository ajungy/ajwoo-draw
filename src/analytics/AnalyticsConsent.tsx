'use client';

import { useEffect, useRef, useState } from 'react';
import { analyticsAvailable, configureAnalytics, consent, setConsent, startAnalytics, trackLink, trackPage, type AnalyticsConfig } from './core';
import './analytics.css';

export function AnalyticsConsent({ config, path }: { config: AnalyticsConfig; path?: string }) {
  const [available, setAvailable] = useState(false);
  const [choice, setChoice] = useState<'yes' | 'no'>();
  const [open, setOpen] = useState(false);
  const settings = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const enabled = configureAnalytics(config);
    setAvailable(enabled);
    if (!enabled) return;
    let active = true;
    const refresh = () => {
      setChoice(consent());
      void startAnalytics().then(() => { if (active) trackPage(); });
    };
    refresh();
    window.addEventListener('ajwoo-analytics-consent', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('click', trackLink, true);
    document.addEventListener('auxclick', trackLink, true);
    return () => {
      active = false;
      window.removeEventListener('ajwoo-analytics-consent', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('click', trackLink, true);
      document.removeEventListener('auxclick', trackLink, true);
    };
  }, [config]);
  useEffect(() => { if (analyticsAvailable()) trackPage(); }, [path]);
  if (!available) return null;
  function choose(value: 'yes' | 'no') {
    setConsent(value);
    setChoice(consent());
    setOpen(false);
    settings.current?.focus();
  }
  return <aside className="aj-analytics" aria-label="Analytics preferences">
    <button ref={settings} type="button" className="aj-analytics-settings" aria-expanded={open || !choice} onClick={() => setOpen(!open)}>Analytics: {choice === 'yes' ? 'on' : 'off'}</button>
    {(open || !choice) && <section className="aj-analytics-panel" aria-label="Help improve AJWOO">
      <strong>Help improve AJWOO</strong>
      <p>Allow PostHog to measure page visits, traffic sources and app actions using analytics cookies across AJWOO sites? No recordings, file contents or drawings are collected. Change your choice here anytime.</p>
      {navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
        ? <><p>Your browser’s privacy preference keeps analytics off.</p><button type="button" onClick={() => choose('no')}>Close</button></>
        : <div className="aj-analytics-actions"><button type="button" onClick={() => choose('no')}>No thanks</button><button type="button" onClick={() => choose('yes')}>Allow analytics</button></div>}
    </section>}
  </aside>;
}
