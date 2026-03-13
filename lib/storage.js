/**
 * Storage Wrapper
 * 
 * Provides a clean API for extension storage using chrome.storage.sync
 * Falls back to chrome.storage.local if sync is not available
 */

const STORAGE_KEY = 'amazonPrimeSorterSettings';

/**
 * Marketplace Data for the popup and URL building
 */
const MARKETPLACE_DATA = [
  { domain: 'amazon.com', name: 'United States', region: 'North America', primeId: '2470955011' },
  { domain: 'amazon.ca', name: 'Canada', region: 'North America', primeId: '11828088011' },
  { domain: 'amazon.com.mx', name: 'Mexico', region: 'North America', primeId: '21419833051' },
  { domain: 'amazon.de', name: 'Germany', region: 'Europe', primeId: '20943776031' },
  { domain: 'amazon.co.uk', name: 'United Kingdom', region: 'Europe', primeId: '2490344031' },
  { domain: 'amazon.fr', name: 'France', region: 'Europe', primeId: '20943778031' },
  { domain: 'amazon.it', name: 'Italy', region: 'Europe', primeId: '20943780031' },
  { domain: 'amazon.es', name: 'Spain', region: 'Europe', primeId: '20943782031' },
  { domain: 'amazon.nl', name: 'Netherlands', region: 'Europe', primeId: '20943776031' },
  { domain: 'amazon.se', name: 'Sweden', region: 'Europe', primeId: '20943776031' },
  { domain: 'amazon.pl', name: 'Poland', region: 'Europe', primeId: '20943776031' },
  { domain: 'amazon.co.jp', name: 'Japan', region: 'Asia Pacific', primeId: '2493950051' },
  { domain: 'amazon.com.au', name: 'Australia', region: 'Asia Pacific', primeId: '21419836051' },
  { domain: 'amazon.in', name: 'India', region: 'Asia Pacific', primeId: '10440599031' },
  { domain: 'amazon.sg', name: 'Singapore', region: 'Asia Pacific', primeId: '21419838051' },
  { domain: 'amazon.com.br', name: 'Brazil', region: 'South America', primeId: '21419839051' },
  { domain: 'amazon.ae', name: 'United Arab Emirates', region: 'Middle East', primeId: '21419840051' },
  { domain: 'amazon.eg', name: 'Egypt', region: 'Middle East', primeId: '21419841051' },
  { domain: 'amazon.tr', name: 'Turkey', region: 'Middle East', primeId: '21419842051' }
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
 * Get settings from storage
 * @returns {Promise<Object>} - The stored settings or defaults
 */
async function getSettings() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (result[STORAGE_KEY]) {
          // Merge with defaults to ensure all keys exist
          resolve({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] });
        } else {
          // Return defaults
          resolve({ ...DEFAULT_SETTINGS });
        }
      });
    } else {
      // Fallback for environments without chrome.storage
      console.warn('[Storage] chrome.storage not available, using defaults');
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

/**
 * Save settings to storage
 * @param {Object} settings - The settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
        resolve();
      });
    } else {
      console.warn('[Storage] chrome.storage not available');
      resolve();
    }
  });
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
 * Check if extension is enabled for a specific marketplace
 * @param {string} domain - The marketplace domain
 * @returns {Promise<boolean>}
 */
async function isEnabledForMarketplace(domain) {
  const settings = await getSettings();
  
  // If master toggle is off, return false
  if (!settings.enabled) {
    return false;
  }
  
  // If no specific marketplace settings, all are enabled
  if (!settings.enabledMarketplaces) {
    return true;
  }
  
  // Check if this marketplace is in the enabled list
  return settings.enabledMarketplaces.includes(domain);
}

/**
 * Listen for settings changes
 * @param {Function} callback - Function to call when settings change
 */
function onSettingsChange(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        callback(changes[STORAGE_KEY].newValue);
      }
    });
  }
}
