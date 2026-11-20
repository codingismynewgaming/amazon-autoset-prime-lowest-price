'use strict';
/*
 * Gate page for Chromium. The service worker redirects fresh Amazon searches
 * here with the original URL in the fragment. This page asks the worker for a
 * prepared target, verifies it, and only then navigates. The worker answers
 * only after the exact session allow rule is installed and persisted.
 */
(async () => {
  const status = document.getElementById('status');
  const text = (key, fallback) => {
    try {
      return chrome.i18n.getMessage(key) || fallback;
    } catch (err) {
      return fallback;
    }
  };
  const show = (message) => {
    if (status) status.textContent = message;
  };

  try {
    document.title = text('gateTitle', 'Prime Filter & Price Sort');
    try {
      document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];
    } catch (err) {
      // Keep the document language if the UI language is unavailable.
    }
    show(text('gatePreparing', 'Preparing your Amazon search…'));

    if (window.top !== window.self) throw new Error('Not a top-level page');

    const source = location.hash.slice(1);
    if (!source) throw new Error('Missing source');

    // Defensive production safety: an erroneous allow rule must never create an
    // unbounded sequence of gate documents in one tab.
    const key = 'prime-sorter-gate-bounce';
    let previous = null;
    try {
      previous = JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch (err) {
      previous = null;
    }
    const count = previous && previous.source === source && Date.now() - previous.at < 5000
      ? previous.count + 1
      : 1;
    sessionStorage.setItem(key, JSON.stringify({ source, count, at: Date.now() }));
    if (count > 3) {
      show(text('gateBounce', 'Too many automatic redirects. Navigation was stopped. Please try again.'));
      return;
    }

    const tab = await chrome.tabs.getCurrent();
    if (!Number.isInteger(tab && tab.id) || tab.id < 0) throw new Error('Missing tab');

    const response = await chrome.runtime.sendMessage({
      type: 'prepare-gate',
      tabId: tab.id,
      source,
    });
    if (!response || response.ok !== true || !Number.isInteger(response.bypassId)) {
      throw new Error('Preparation failed');
    }

    const target = new URL(response.target);
    const marketplace = getCurrentMarketplace(target.hostname);
    if (target.protocol !== 'https:' || !marketplace ||
        target.hostname !== `www.${marketplace.domain}` ||
        target.port !== '' || target.username !== '' || target.password !== '' ||
        !isAmazonSearchPath(target.pathname)) {
      throw new Error('Invalid target');
    }

    // The worker acknowledged only after installing and persisting the bypass.
    location.replace(target.href);
  } catch (err) {
    show(text('gateFailed', 'The search could not be prepared. Please try again.'));
  }
})();
