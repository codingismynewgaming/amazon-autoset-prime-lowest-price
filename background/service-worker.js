/**
 * Background script (Firefox event page)
 *
 * Rewrites fresh Amazon search navigations (Prime facet + sort) before the
 * first request is sent, so the results page loads only once.
 * Depends on lib/storage.js and lib/rewrite.js (loaded before this file).
 */

const api = typeof browser !== 'undefined' ? browser : chrome;

// Loop guard: skip if the same URL was already rewritten in this tab moments ago
// (e.g. Amazon redirects back and strips the parameters).
const recentRedirects = new Map();
const LOOP_WINDOW_MS = 5000;

// `/-/<lang>/s` language prefixes need their own pattern; buildRewrittenUrl
// still filters every request by isAmazonSearchPath.
const searchUrlPatterns = getAllMarketplaces().flatMap((mp) => [
  `https://www.${mp.domain}/s*`,
  `https://www.${mp.domain}/-/*/s*`
]);

api.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.method !== 'GET') return {};

    const settings = await getSettings();
    const result = buildRewrittenUrl(details.url, settings);
    if (!result) return {};

    const now = Date.now();
    const last = recentRedirects.get(details.tabId);
    if (last && last.from === details.url && now - last.time < LOOP_WINDOW_MS) {
      return {};
    }
    recentRedirects.set(details.tabId, { from: details.url, time: now });

    return { redirectUrl: result.url };
  },
  { urls: searchUrlPatterns, types: ['main_frame'] },
  ['blocking']
);

api.tabs.onRemoved.addListener((tabId) => recentRedirects.delete(tabId));
