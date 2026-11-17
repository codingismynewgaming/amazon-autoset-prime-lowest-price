/**
 * Content Script - Amazon Prime Auto-Filter & Sort
 *
 * The background script rewrites fresh search navigations before the request.
 * This script is only a fallback (e.g. a navigation the background could not
 * rewrite) and shows the optional notification toast.
 * Depends on lib/storage.js and lib/rewrite.js.
 */

(function() {
  'use strict';

  const SCRIPT_ID = 'amazon-prime-sorter';
  const REDIRECT_KEY = 'primeSorterLastRedirect';
  const REDIRECT_WINDOW_MS = 10000;

  if (window._amazonPrimeSorterInitialized) return;
  window._amazonPrimeSorterInitialized = true;

  function recentlyRedirected() {
    try {
      const last = Number(sessionStorage.getItem(REDIRECT_KEY) || 0);
      return Date.now() - last < REDIRECT_WINDOW_MS;
    } catch (err) {
      return false;
    }
  }

  function markRedirected() {
    try {
      sessionStorage.setItem(REDIRECT_KEY, String(Date.now()));
    } catch (err) {
      // sessionStorage unavailable: loop guard is best effort
    }
  }

  function showNotification(message) {
    let container = document.getElementById(`${SCRIPT_ID}-notification`);
    if (!container) {
      container = document.createElement('div');
      container.id = `${SCRIPT_ID}-notification`;
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #232f3e;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 2147483647;
        font-family: "Amazon Ember", Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: transform 0.3s ease, opacity 0.3s ease;
        display: flex;
        align-items: center;
        border-left: 4px solid #ff9900;
        transform: translateX(120%);
        opacity: 0;
      `;
      document.body.appendChild(container);
    }

    container.textContent = '';
    const icon = document.createElement('span');
    icon.style.color = '#ff9900';
    icon.style.marginRight = '8px';
    icon.style.fontWeight = 'bold';
    icon.textContent = '✓';
    container.appendChild(icon);
    container.appendChild(document.createTextNode(message));

    requestAnimationFrame(() => {
      container.style.transform = 'translateX(0)';
      container.style.opacity = '1';
    });

    setTimeout(() => {
      container.style.transform = 'translateX(120%)';
      container.style.opacity = '0';
    }, 3000);
  }

  /**
   * Message for a fresh search whose URL already carries the configured parameters.
   */
  function getNoticeMessage(settings) {
    if (!settings.enabled || !settings.showNotifications) return null;

    const urlObj = new URL(window.location.href);
    const marketplace = getCurrentMarketplace(urlObj.hostname);
    if (!marketplace || !isMarketplaceEnabledSync(settings, marketplace.domain)) return null;
    if (!isFreshSearch(urlObj)) return null;

    const prime = settings.autoPrime && hasPrimeFacet(urlObj.searchParams.get('rh') || '');
    const sort = settings.autoSort && urlObj.searchParams.get('s') === getSortValue(settings);

    if (prime && sort) return 'Prime + sort applied';
    if (prime) return 'Prime filter applied';
    if (sort) return getSortValue(settings) === 'review-rank' ? 'Sorted by customer review' : 'Sorted by price (low to high)';
    return null;
  }

  async function run() {
    const settings = await getSettings();

    const result = buildRewrittenUrl(window.location.href, settings);
    if (result) {
      if (recentlyRedirected()) return;
      markRedirected();
      window.location.replace(result.url);
      return;
    }

    const message = getNoticeMessage(settings);
    if (message) showNotification(message);
  }

  run();
})();
