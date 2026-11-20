/*
 * Chromium MV3 gate rules. Loaded as a classic script by the service worker.
 *
 * Fresh Amazon search URLs are redirected to the extension gate page. The gate
 * page computes the real target with the shared rewrite core and asks the
 * worker for a short-lived exact allow rule before navigating.
 *
 * Only short, RE2-safe expressions are used. No lookarounds, no backreferences.
 */
(() => {
  'use strict';

  const GATE_RULE_BASE_ID = 1;
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Build the settings-driven gate redirect rules.
   * @param {Object} settings - Stored settings
   * @param {Array} marketplaces - MARKETPLACE_DATA
   * @param {string} gateUrl - chrome.runtime.getURL('chromium/gate.html')
   * @returns {Array} declarativeNetRequest dynamic rules (ids start at 1)
   */
  function buildRules(settings, marketplaces, gateUrl) {
    if (!settings || settings.enabled !== true) return [];
    if (!settings.autoPrime && !settings.autoSort) return [];
    if (typeof gateUrl !== 'string' || gateUrl.length === 0) return [];
    if (!Array.isArray(marketplaces)) return [];

    const rules = [];
    let id = GATE_RULE_BASE_ID;

    for (const marketplace of marketplaces) {
      if (!marketplace || typeof marketplace.domain !== 'string' || !marketplace.domain) continue;
      if (Array.isArray(settings.enabledMarketplaces) && !settings.enabledMarketplaces.includes(marketplace.domain)) continue;
      // Same viability as the shared rewrite core: only gate a marketplace
      // where at least one configured change can actually happen.
      const canPrime = settings.autoPrime === true && Boolean(marketplace.primeFacet);
      const canSort = settings.autoSort === true;
      if (!canPrime && !canSort) continue;

      const host = `www.${marketplace.domain}`;
      rules.push({
        id: id++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: `${gateUrl}#\\0` },
        },
        condition: {
          regexFilter: `^https://${escape(host)}(?:/-/[A-Za-z0-9_-]+)?/s(?:[/?].*)?$`,
          isUrlFilterCaseSensitive: true,
          requestDomains: [host],
          requestMethods: ['get'],
          resourceTypes: ['main_frame'],
        },
      });
    }

    return rules;
  }

  /**
   * Strict source validation. Exact https://www.<marketplace>/s or /s/... only:
   * no credentials, no explicit port, no other host.
   * @param {string} value - Raw source URL from the gate fragment
   * @param {Array} marketplaces - MARKETPLACE_DATA
   * @returns {URL|null}
   */
  function parseSource(value, marketplaces) {
    if (typeof value !== 'string' || value.length === 0) return null;
    if (!Array.isArray(marketplaces)) return null;

    let url;
    try {
      url = new URL(value);
    } catch (err) {
      return null;
    }

    if (url.protocol !== 'https:') return null;
    if (url.port !== '') return null;
    if (url.username !== '' || url.password !== '') return null;

    const host = url.hostname.toLowerCase();
    const allowed = marketplaces.some((marketplace) =>
      marketplace && typeof marketplace.domain === 'string' &&
      host === `www.${marketplace.domain.toLowerCase()}`);
    if (!allowed) return null;

    const path = url.pathname;
    const validPath = typeof isAmazonSearchPath === 'function'
      ? isAmazonSearchPath(path)
      : /^\/(?:-\/[A-Za-z0-9_-]+\/)?s(?:\/|$)/.test(path);
    if (!validPath) return null;

    return url;
  }

  globalThis.PrimeSorterChromiumGateRules = Object.freeze({
    buildRules,
    parseSource,
    escapeRegex: escape,
    GATE_RULE_BASE_ID,
  });
})();
