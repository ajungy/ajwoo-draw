'use client';

import { useEffect, useRef, useState } from 'react';
import { analyticsAvailable, configureAnalytics, consent, setConsent, startAnalytics, trackLink, trackPage, type AnalyticsConfig } from './core';
import './analytics.css';

export function AnalyticsConsent({ config, path }: { config: AnalyticsConfig; path?: string }) {
  const [available, setAvailable] = useState(false);
  const [choice, setChoice] = useState<'yes' | 'no'>();
  const [open, setOpen] = useState(false);
  const settings = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement>(null);
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
    const show = () => { settings.current = document.activeElement as HTMLElement; setOpen(true); };
    window.addEventListener('ajwoo-analytics-open', show);
    document.addEventListener('click', trackLink, true);
    document.addEventListener('auxclick', trackLink, true);
    return () => {
      active = false;
      window.removeEventListener('ajwoo-analytics-consent', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('ajwoo-analytics-open', show);
      document.removeEventListener('click', trackLink, true);
      document.removeEventListener('auxclick', trackLink, true);
    };
  }, [config]);
  useEffect(() => { if (analyticsAvailable()) trackPage(); }, [path]);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  if (!available || (!open && choice)) return null;
  function choose(value: 'yes' | 'no') {
    setConsent(value);
    setChoice(consent());
    setOpen(false);
    settings.current?.focus();
  }
  return <aside className="aj-analytics" aria-label="Analytics preferences">
    <section ref={panel} tabIndex={-1} className="aj-analytics-panel" aria-label="Help improve AJWOO" onKeyDown={(event) => { if (event.key === 'Escape') { if (!choice) choose('no'); else { setOpen(false); settings.current?.focus(); } } }}>
      <strong>Help improve AJWOO</strong>
      <p>Allow PostHog cookies to measure visits and app use?</p>
      {navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
        ? <><p>Your browser keeps analytics off.</p><button type="button" onClick={() => choose('no')}>Close</button></>
        : <div className="aj-analytics-actions"><button type="button" onClick={() => choose('no')}>Decline</button><button type="button" onClick={() => choose('yes')}>Allow</button></div>}
    </section>
  </aside>;
}

export function AnalyticsSettingsLink() {
  return <button type="button" className="aj-analytics-link" onClick={() => window.dispatchEvent(new Event('ajwoo-analytics-open'))}>Privacy settings</button>;
}
