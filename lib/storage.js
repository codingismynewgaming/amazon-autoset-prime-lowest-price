/**
 * Storage Wrapper
 * 
 * Provides a clean API for extension storage using chrome.storage.sync
 * Falls back to chrome.storage.local if sync is not available
 */

const STORAGE_KEY = 'amazonPrimeSorterSettings';
const AMAZON_SEARCH_PATH_RE = /^\/(?:-\/[A-Za-z0-9_-]+\/)?s(?:\/|$)/;

/**
 * Marketplace Data for the popup and URL building
 * primeFacet: rh facet measured on the live site; null = not verified, no Prime filter is applied
 */
const MARKETPLACE_DATA = [
  { domain: 'amazon.com', name: 'United States', region: 'North America', primeFacet: 'p_85:2470955011' },
  { domain: 'amazon.ca', name: 'Canada', region: 'North America', primeFacet: null },
  { domain: 'amazon.com.mx', name: 'Mexico', region: 'North America', primeFacet: 'p_n_free_shipping_eligible:205563675011' },
  { domain: 'amazon.de', name: 'Germany', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:20943778031' },
  { domain: 'amazon.co.uk', name: 'United Kingdom', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:20930951031' },
  { domain: 'amazon.fr', name: 'France', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:20934939031' },
  { domain: 'amazon.it', name: 'Italy', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:20930967031' },
  { domain: 'amazon.es', name: 'Spain', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:20930980031' },
  { domain: 'amazon.nl', name: 'Netherlands', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:17033278031' },
  { domain: 'amazon.se', name: 'Sweden', region: 'Europe', primeFacet: null },
  { domain: 'amazon.pl', name: 'Poland', region: 'Europe', primeFacet: 'p_n_free_shipping_eligible:20876078031' },
  { domain: 'amazon.co.jp', name: 'Japan', region: 'Asia Pacific', primeFacet: null },
  { domain: 'amazon.com.au', name: 'Australia', region: 'Asia Pacific', primeFacet: null },
  { domain: 'amazon.in', name: 'India', region: 'Asia Pacific', primeFacet: 'p_n_free_shipping_eligible:205563695031' },
  { domain: 'amazon.sg', name: 'Singapore', region: 'Asia Pacific', primeFacet: null },
  { domain: 'amazon.com.br', name: 'Brazil', region: 'South America', primeFacet: 'p_n_free_shipping_eligible:19171733011' },
  { domain: 'amazon.ae', name: 'United Arab Emirates', region: 'Middle East', primeFacet: null },
  { domain: 'amazon.eg', name: 'Egypt', region: 'Middle East', primeFacet: null },
  { domain: 'amazon.tr', name: 'Turkey', region: 'Middle East', primeFacet: null }
];

/**
 * Default settings for the extension
 */
const DEFAULT_SETTINGS = {
  // Master toggle - enables/disables all functionality
  enabled: true,
  
  // Auto-apply Prime filter
  autoPrime: true,
  
  // Auto-apply sort by price
  autoSort: true,
  
  // Sort option: 'price-asc-rank' (default), 'price-desc-rank', etc.
  sortOption: 'price-asc-rank',
  
  // Which marketplaces are enabled (default: all)
  enabledMarketplaces: null, // null = all enabled
  
  // Show notification when filters are applied
  showNotifications: false
};

/**
 * Get all available marketplaces
 * @returns {Array} - Array of marketplace objects
 */
function getAllMarketplaces() {
  return MARKETPLACE_DATA;
}

/**
 * Get the current marketplace domain from the URL
 * @param {string} hostname - The window.location.hostname
 * @returns {Object|null} - The marketplace config or null if not found
 */
function getCurrentMarketplace(hostname) {
  const domain = hostname.replace(/^www\./, '');
  return MARKETPLACE_DATA.find(mp => mp.domain === domain) || null;
}

/**
 * Check whether an Amazon pathname targets a search results path (including
 * optional language prefixes such as /-/en/s).
 * @param {string} pathname - URL pathname
 * @returns {boolean}
 */
function isAmazonSearchPath(pathname) {
  return typeof pathname === 'string' && AMAZON_SEARCH_PATH_RE.test(pathname);
}

function hasStorageArea(areaName) {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage && chrome.storage[areaName]);
}

function readStorageArea(areaName) {
  return new Promise((resolve) => {
    if (!hasStorageArea(areaName)) {
      resolve({ ok: false, value: undefined });
      return;
    }
    try {
      chrome.storage[areaName].get([STORAGE_KEY], (result) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve({ ok: false, value: undefined });
          return;
        }
        resolve({ ok: true, value: result && result[STORAGE_KEY] });
      });
    } catch (err) {
      resolve({ ok: false, value: undefined });
    }
  });
}

function writeStorageArea(areaName, settings) {
  return new Promise((resolve) => {
    if (!hasStorageArea(areaName)) {
      resolve(false);
      return;
    }
    try {
      chrome.storage[areaName].set({ [STORAGE_KEY]: settings }, () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (err) {
      resolve(false);
    }
  });
}

/**
 * Get settings from storage
 * @returns {Promise<Object>} - The stored settings or defaults
 */
async function getSettings() {
  if (!hasStorageArea('sync') && !hasStorageArea('local')) {
    console.warn('[Storage] chrome.storage not available, using defaults');
    return { ...DEFAULT_SETTINGS };
  }

  const syncResult = await readStorageArea('sync');
  if (syncResult.ok && syncResult.value && typeof syncResult.value === 'object') {
    return { ...DEFAULT_SETTINGS, ...syncResult.value };
  }

  const localResult = await readStorageArea('local');
  if (localResult.ok && localResult.value && typeof localResult.value === 'object') {
    return { ...DEFAULT_SETTINGS, ...localResult.value };
  }

  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to storage
 * @param {Object} settings - The settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  if (!hasStorageArea('sync') && !hasStorageArea('local')) {
    console.warn('[Storage] chrome.storage not available');
    return;
  }

  const savedToSync = await writeStorageArea('sync', settings);
  if (!savedToSync) {
    await writeStorageArea('local', settings);
  }
}

/**
 * Update a single setting
 * @param {string} key - The setting key
 * @param {any} value - The new value
 * @returns {Promise<Object>} - The updated settings
 */
async function updateSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  await saveSettings(settings);
  return settings;
}

/**
 * Get a single setting
 * @param {string} key - The setting key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {Promise<any>} - The setting value
 */
async function getSetting(key, defaultValue = null) {
  const settings = await getSettings();
  return key in settings ? settings[key] : defaultValue;
}

/**
 * Reset settings to defaults
 * @returns {Promise<void>}
 */
async function resetSettings() {
  await saveSettings(DEFAULT_SETTINGS);
}

/**
 * Check if a marketplace is enabled in the given settings
 * @param {Object} settings - Settings object
 * @param {string} domain - The marketplace domain (without www)
 * @returns {boolean}
 */
function isMarketplaceEnabledSync(settings, domain) {
  // null = all marketplaces enabled
  if (!Array.isArray(settings.enabledMarketplaces)) return true;
  return settings.enabledMarketplaces.includes(domain);
}

/**
 * Listen for settings changes
 * @param {Function} callback - Function to call when settings change
 */
function onSettingsChange(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area === 'sync' || area === 'local') && changes[STORAGE_KEY]) {
        callback(changes[STORAGE_KEY].newValue);
      }
    });
  }
}
