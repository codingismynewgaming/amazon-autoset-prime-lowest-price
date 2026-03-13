/**
 * Background Script
 * 
 * Works as both:
 * - Service Worker (Chrome MV3)
 * - Persistent Background Script (Firefox)
 * 
 * Handles:
 * - Extension icon click events
 * - Communication between popup and content scripts
 * - Default settings on install
 */

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', message);
  
  switch (message.type) {
    case 'GET_SETTINGS':
      // Forward settings request to storage
      getSettings().then(sendResponse);
      return true; // Keep channel open for async response
      
    case 'UPDATE_SETTINGS':
      // Save updated settings
      saveSettings(message.settings).then(() => {
        sendResponse({ success: true });
      });
      return true;
      
    case 'CHECK_FILTERS':
      // Check if filters are applied on a specific tab
      checkTabFilters(message.tabId).then(sendResponse);
      return true;
      
    case 'APPLY_FILTERS_NOW':
      // Trigger filter application on current tab
      applyFiltersOnTab(message.tabId).then(sendResponse);
      return true;
      
    default:
      console.warn('[Background] Unknown message type:', message.type);
  }
});

/**
 * Get settings from storage
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['amazonPrimeSorterSettings'], (result) => {
      resolve(result.amazonPrimeSorterSettings || {});
    });
  });
}

/**
 * Save settings to storage
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ amazonPrimeSorterSettings: settings }, resolve);
  });
}

/**
 * Check if filters are applied on a specific tab
 */
async function checkTabFilters(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'CHECK_FILTER_STATUS'
    });
    return response;
  } catch (error) {
    console.error('[Background] Error checking tab filters:', error);
    return { applied: false, error: error.message };
  }
}

/**
 * Trigger filter application on a specific tab
 */
async function applyFiltersOnTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'APPLY_FILTERS'
    });
    return response;
  } catch (error) {
    console.error('[Background] Error applying filters:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings on first install
    chrome.storage.sync.get(['amazonPrimeSorterSettings'], (result) => {
      if (!result.amazonPrimeSorterSettings) {
        chrome.storage.sync.set({
          amazonPrimeSorterSettings: {
            enabled: true,
            autoPrime: true,
            autoSort: true,
            sortOption: 'price-asc-rank',
            enabledMarketplaces: null,
            useDomFallback: true,
            showNotifications: false
          }
        });
      }
    });
  }
});

console.log('[Background] Initialized');
