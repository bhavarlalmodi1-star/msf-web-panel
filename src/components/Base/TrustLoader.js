"use client";
// Keeps the trust details (Settings → Trust Details) loaded and up to date for
// the whole panel. Renders nothing.
//
//   1. Instantly: last known values from this browser (localStorage)
//   2. Public API (/api/trust-info) — works on the login page, before sign-in
//   3. Once signed in: a live Firestore listener, so a change saved in the
//      settings form shows up everywhere straight away, in every open tab.
import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firbase-client';
import { useAuth } from './AuthProvider';
import { setTrustInfo } from '@/Redux/Slice/commonSlice';
import { buildThemeCss, THEME_CSS_CACHE_KEY, THEME_STYLE_ID } from '@/utils/trust/theme';
import {
  TRUST_DOC_PATH,
  getTrust,
  getTrustRaw,
  setTrust,
  subscribeTrust,
  hydrateTrustFromCache,
} from '@/utils/trust/trustStore';

// Browser-tab icon: once a logo has been uploaded, use it instead of the
// built-in favicon.
const applyFavicon = (href) => {
  if (typeof document === 'undefined' || !href) return;
  let links = Array.from(document.querySelectorAll("link[rel~='icon']"));
  if (!links.length) {
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    links = [link];
  }
  links.forEach((link) => {
    if (link.getAttribute('href') === href) return;
    link.removeAttribute('sizes');
    link.removeAttribute('type');
    link.setAttribute('href', href);
  });
};

// Panel colours: write the override CSS (empty for the default theme) into a
// <style> tag and remember it for the next page load.
const applyThemeCss = (theme) => {
  if (typeof document === 'undefined') return;
  const css = buildThemeCss(theme);
  let el = document.getElementById(THEME_STYLE_ID);
  if (!css) {
    if (el) el.remove();
    try { window.localStorage.removeItem(THEME_CSS_CACHE_KEY); } catch { /* ignore */ }
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
  try { window.localStorage.setItem(THEME_CSS_CACHE_KEY, css); } catch { /* ignore */ }
};

export default function TrustLoader() {
  const { user } = useAuth() || {};
  const dispatch = useDispatch();
  const gotLiveData = useRef(false);
  // Until real data (cache / API / Firestore) has arrived, leave the theme the
  // boot script applied alone — otherwise it would briefly reset to default.
  const trustLoaded = useRef(false);

  // Mirror into Redux (state.data.trustInfo), the browser tab title and tab icon
  useEffect(() => {
    const sync = () => {
      const trust = getTrust();
      dispatch(setTrustInfo({ ...getTrustRaw() }));
      if (typeof document !== 'undefined' && trust.panelTitle) document.title = trust.panelTitle;
      if (trust.hasCustomLogo) applyFavicon(trust.logoSrc);
      if (trustLoaded.current) applyThemeCss(trust.theme);
    };
    const unsubscribe = subscribeTrust(sync);
    sync();
    return unsubscribe;
  }, [dispatch]);

  // Cache first, then the public API
  useEffect(() => {
    let cancelled = false;
    if (hydrateTrustFromCache()) { trustLoaded.current = true; applyThemeCss(getTrust().theme); }
    fetch('/api/trust-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || gotLiveData.current || !data?.success) return;
        trustLoaded.current = true;
        setTrust(data.trust || {});
      })
      .catch(() => { /* offline — cached/default values stay */ });
    return () => { cancelled = true; };
  }, []);

  // Live updates while signed in
  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribe = onSnapshot(
      doc(db, ...TRUST_DOC_PATH),
      (snap) => {
        gotLiveData.current = true;
        trustLoaded.current = true;
        setTrust(snap.exists() ? snap.data() : {});
      },
      (err) => console.warn('Trust details listener:', err?.code || err),
    );
    return unsubscribe;
  }, [user?.uid]);

  return null;
}
