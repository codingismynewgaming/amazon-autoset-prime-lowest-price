/**
 * Content Script - Amazon Prime Auto-Filter & Sort
 *
 * This script runs on Amazon search result pages and automatically:
 * 1. Applies the "All Prime" filter
 * 2. Sorts by "Price: Low to High"
 *
 * Approach:
 * - Pre-emptive: Intercepts search form submission to add parameters.
 * - Reactive: Applies filters via DOM on results page (AJAX/SPA).
 * - Safety: Uses strict selectors and throttling to prevent infinite loops and misdirected clicks.
 */

(function() {
  'use strict';

  const SCRIPT_ID = 'amazon-prime-sorter';
  const LOG_PREFIX = `[${SCRIPT_ID}]`;
  
  if (window._amazonPrimeSorterInitialized) {
    return;
  }
  window._amazonPrimeSorterInitialized = true;
  
  console.log('🔍 Amazon Prime Sorter: Content script LOADED!');
  
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  /**
   * Check if current page is a search results page
   */
  function isSearchPage() {
    // 1. DOM Check (Primary)
    const hasSidebar = !!document.getElementById('s-refinements');
    const hasResults = !!document.querySelector('[data-component-type="s-search-result"]');
    if (hasSidebar || hasResults) return true;

    // 2. URL Fallback
    const url = new URL(window.location.href);
    const hasKeywords = url.searchParams.has('k') || url.searchParams.has('field-keywords');
    const isSearchPath = url.pathname.startsWith('/s') || url.pathname.includes('/search');
    return isSearchPath && hasKeywords;
  }

  /**
   * Show notification toast
   */
  async function showNotification(message) {
    const settings = await getSettings();
    if (!settings.showNotifications) return;

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

    container.innerHTML = `<span style="color: #ff9900; margin-right: 8px; font-weight: bold;">✓</span> ${message}`;
    
    // Animate in
    requestAnimationFrame(() => {
      container.style.transform = 'translateX(0)';
      container.style.opacity = '1';
    });

    // Auto-hide after 3 seconds
    setTimeout(() => {
      container.style.transform = 'translateX(120%)';
      container.style.opacity = '0';
    }, 3000);
  }

  /**
   * Intercept search form submission to add parameters pre-emptively
   */
  function interceptSearch() {
    document.addEventListener('submit', async (e) => {
      const form = e.target;
      if (form.getAttribute('action')?.includes('/s') || form.querySelector('#twotabsearchtextbox')) {
        const settings = await getSettings();
        if (!settings.enabled) return;

        const marketplace = getCurrentMarketplace(window.location.hostname);
        if (!marketplace) return;

        log('Intercepting search submission...');

        if (settings.autoPrime) {
          if (!form.querySelector('input[name="rh"]')) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'rh';
            input.value = marketplace.primeId ? `p_85:${marketplace.primeId}` : 'p_85:2';
            form.appendChild(input);
            log('Injected Prime parameter to form:', input.value);
          }
        }

        if (settings.autoSort) {
          if (!form.querySelector('input[name="s"]')) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 's';
            input.value = 'price-asc-rank';
            form.appendChild(input);
            log('Injected Sort parameter to form');
          }
        }
      }
    }, true);
  }

  /**
   * Check if filters are already applied based on settings
   */
  function areFiltersApplied(settings) {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    // Check Prime
    let primeApplied = true;
    if (settings.autoPrime) {
      const rh = params.get('rh') || '';
      const hasPrimeInUrl = rh.includes('p_85') || rh.includes('p_76') || rh.includes('p_n_free_shipping_eligible');
      
      const primeChecked = document.querySelector('li[data-a-name="p_76"] input:checked') || 
                           document.querySelector('li[data-a-name="p_85"] input:checked') ||
                           document.querySelector('li[data-a-name="p_n_free_shipping_eligible"] input:checked') ||
                           document.querySelector('.s-navigation-item.s-navigation-selected[data-a-name="p_85"]') ||
                           document.querySelector('.s-navigation-item.s-navigation-selected[data-a-name="p_76"]') ||
                           document.querySelector('.s-navigation-item.s-navigation-selected[data-a-name="p_n_free_shipping_eligible"]');
      
      primeApplied = hasPrimeInUrl || !!primeChecked;
    }

    // Check Sort
    let sortApplied = true;
    if (settings.autoSort) {
      const hasSortInUrl = params.get('s') === 'price-asc-rank';
      const sortDropdown = document.querySelector('#s-result-sort-select');
      const isSortCorrect = sortDropdown && sortDropdown.value === 'price-asc-rank';
      sortApplied = hasSortInUrl || isSortCorrect;
    }

    return primeApplied && sortApplied;
  }

  async function applyPrimeFilterDOM() {
    log('Applying Prime filter via targeted sidebar click...');
    
    const refinements = document.getElementById('s-refinements');
    if (!refinements) return false;

    const primeSelectors = [
      'li[data-a-name="p_76"] a',
      'li[data-a-name="p_85"] a',
      'li[data-a-name="p_n_free_shipping_eligible"] a',
      'li[data-a-name="p_76"] label',
      'li[data-a-name="p_85"] label',
      'li[data-a-name="p_n_free_shipping_eligible"] label'
    ];

    for (const selector of primeSelectors) {
      const element = refinements.querySelector(selector);
      if (element && element.offsetParent !== null) {
        log(`Clicking Prime element in sidebar: ${selector}`);
        element.click();
        return true;
      }
    }

    const links = Array.from(refinements.querySelectorAll('a'));
    const primeLink = links.find(a => 
      (a.textContent.includes('Prime') || a.getAttribute('aria-label')?.includes('Prime')) && 
      !a.closest('.s-navigation-selected')
    );
    
    if (primeLink) {
      log('Clicking Prime link found by text in sidebar');
      primeLink.click();
      return true;
    }

    return false;
  }

  async function applySortDOM() {
    log('Applying sort via dropdown change...');
    const sortDropdown = document.querySelector('#s-result-sort-select');
    if (sortDropdown) {
      sortDropdown.value = 'price-asc-rank';
      sortDropdown.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Throttle state to prevent rapid-fire execution
  let isExecuting = false;
  let lastExecutionTime = 0;

  async function execute() {
    const now = Date.now();
    if (isExecuting || (now - lastExecutionTime < 3000)) return;
    
    if (!isSearchPage()) return;
    
    const settings = await getSettings();
    if (!settings.enabled) return;

    if (areFiltersApplied(settings)) return;

    isExecuting = true;
    lastExecutionTime = now;

    log('Filters missing. Attempting application...');

    let primeApplied = false;
    let sortApplied = false;
    
    if (settings.autoPrime) {
      const isPrimeApplied = (new URL(window.location.href)).searchParams.get('rh')?.match(/p_76|p_85|p_n_free_shipping_eligible/) ||
                             document.querySelector('li[data-a-name="p_76"] input:checked') || 
                             document.querySelector('li[data-a-name="p_85"] input:checked') ||
                             document.querySelector('li[data-a-name="p_n_free_shipping_eligible"] input:checked') ||
                             document.querySelector('.s-navigation-item.s-navigation-selected[data-a-name="p_85"]');
      
      if (!isPrimeApplied) {
        primeApplied = await applyPrimeFilterDOM();
        if (primeApplied) {
          showNotification('Prime filter applied');
          setTimeout(() => { isExecuting = false; }, 2000);
          return; 
        }
      }
    }
    
    if (settings.autoSort) {
      const isSortApplied = (new URL(window.location.href)).searchParams.get('s') === 'price-asc-rank' ||
                            document.querySelector('#s-result-sort-select')?.value === 'price-asc-rank';
      
      if (!isSortApplied) {
        sortApplied = await applySortDOM();
        if (sortApplied) {
          showNotification('Sorted by price (low to high)');
        }
      }
    }

    isExecuting = false;
  }

  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some(m => 
        (m.target.id === 'search' || m.target.classList?.contains('s-main-slot') || m.target.id === 's-refinements') && 
        m.addedNodes.length > 0
      );

      if (hasRelevantChange && isSearchPage()) {
        execute();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialization
  interceptSearch();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      execute();
      initObserver();
    });
  } else {
    execute();
    initObserver();
  }
})();
