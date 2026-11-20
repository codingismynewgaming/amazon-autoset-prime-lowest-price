/* Chromium: notifications only. Never navigate or reload from a content script. */
(() => {
  'use strict';
  if (window._amazonPrimeSorterInitialized) return;
  window._amazonPrimeSorterInitialized = true;

  async function run() {
    const settings = await getSettings();
    if (!settings.enabled || !settings.showNotifications) return;
    const url = new URL(location.href);
    const marketplace = getCurrentMarketplace(url.hostname);
    if (!marketplace || !isMarketplaceEnabledSync(settings, marketplace.domain) || !isFreshSearch(url)) return;
    const prime = settings.autoPrime && hasPrimeFacet(url.searchParams.get('rh') || '');
    const sorted = settings.autoSort && url.searchParams.get('s') === getSortValue(settings);
    const message = prime && sorted ? 'Prime + sort applied'
      : prime ? 'Prime filter applied'
      : sorted ? (getSortValue(settings) === 'review-rank' ? 'Sorted by customer review' : 'Sorted by price (low to high)')
      : null;
    if (!message || !document.body) return;

    const toast = document.createElement('div');
    toast.id = 'amazon-prime-sorter-notification';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#232f3e;color:white;padding:12px 20px;border-radius:8px;z-index:2147483647;font-family:Arial,sans-serif;font-size:14px;box-shadow:0 4px 12px #0005;border-left:4px solid #ff9900';
    toast.textContent = `✓ ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  run().catch(() => { /* Optional notice must never affect navigation. */ });
})();
