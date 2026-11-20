/**
 * Shared URL rewrite logic (used by background and content script).
 * Requires lib/storage.js (getCurrentMarketplace, isMarketplaceEnabledSync).
 *
 * Only fresh keyword searches are rewritten. Refinements, sorting and paging
 * done by the user on the results page carry a `ref=sr_*` marker and stay untouched.
 */

function hasPrimeFacet(rhValue) {
  if (!rhValue) return false;
  return rhValue.includes('p_76') || rhValue.includes('p_85') || rhValue.includes('p_n_free_shipping_eligible');
}

function getPrimeFacet(marketplace) {
  return marketplace && marketplace.primeFacet ? marketplace.primeFacet : null;
}

function getSortValue(settings) {
  return settings.sortOption || 'price-asc-rank';
}

function mergePrimeFacet(existingRh, primeFacet) {
  if (!existingRh) return primeFacet;
  if (hasPrimeFacet(existingRh)) return existingRh;
  return `${existingRh},${primeFacet}`;
}

/**
 * True for a keyword search that was not triggered by a results-page action.
 */
function isFreshSearch(urlObj) {
  const path = urlObj.pathname;
  if (!isAmazonSearchPath(path)) return false;
  const params = urlObj.searchParams;
  if (!params.has('k') && !params.has('field-keywords')) return false;
  // `ref` is a query param on /s?k=... and a path segment on /s/ref=...
  const pathRef = (path.match(/\/ref=([^/?]+)/) || [])[1] || '';
  const ref = params.get('ref') || pathRef;
  return !ref.startsWith('sr_');
}

/**
 * Compute the rewritten URL for a search URL.
 * @returns {{url: string, primeChanged: boolean, sortChanged: boolean}|null} null if nothing to change
 */
function buildRewrittenUrl(rawUrl, settings) {
  if (!settings || !settings.enabled) return null;

  let urlObj;
  try {
    urlObj = new URL(rawUrl);
  } catch (err) {
    return null;
  }

  const marketplace = getCurrentMarketplace(urlObj.hostname);
  if (!marketplace) return null;
  if (!isMarketplaceEnabledSync(settings, marketplace.domain)) return null;
  if (!isFreshSearch(urlObj)) return null;

  let primeChanged = false;
  let sortChanged = false;

  const primeFacet = getPrimeFacet(marketplace);
  if (settings.autoPrime && primeFacet) {
    const currentRh = urlObj.searchParams.get('rh') || '';
    const mergedRh = mergePrimeFacet(currentRh, primeFacet);
    if (mergedRh !== currentRh) {
      urlObj.searchParams.set('rh', mergedRh);
      primeChanged = true;
    }
  }

  // An explicit sort in the URL (shared link, user choice) is never overridden.
  if (settings.autoSort && !urlObj.searchParams.has('s')) {
    urlObj.searchParams.set('s', getSortValue(settings));
    sortChanged = true;
  }

  if (!primeChanged && !sortChanged) return null;
  return { url: urlObj.toString(), primeChanged, sortChanged };
}
