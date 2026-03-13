/**
 * Popup Logic v2.0
 * Tab-based UI with dark mode support
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initialized');

  // Cache DOM elements
  const elements = {
    enabledToggle: document.getElementById('enabledToggle'),
    autoPrimeToggle: document.getElementById('autoPrimeToggle'),
    autoSortToggle: document.getElementById('autoSortToggle'),
    notificationsToggle: document.getElementById('notificationsToggle'),
    marketplaceList: document.getElementById('marketplaceList'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    deselectAllBtn: document.getElementById('deselectAllBtn'),
    resetBtn: document.getElementById('resetBtn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content')
  };

  let currentSettings = {};
  let allMarketplaces = [];

  /**
   * Load settings from storage and populate UI
   */
  async function loadSettings() {
    try {
      currentSettings = await getSettings();
      allMarketplaces = getAllMarketplaces();

      // Populate toggles
      elements.enabledToggle.checked = currentSettings.enabled;
      elements.autoPrimeToggle.checked = currentSettings.autoPrime;
      elements.autoSortToggle.checked = currentSettings.autoSort;
      elements.notificationsToggle.checked = currentSettings.showNotifications;

      // Populate marketplace list
      renderMarketplaceList();

      console.log('[Popup] Settings loaded:', currentSettings);
    } catch (error) {
      console.error('[Popup] Error loading settings:', error);
    }
  }

  /**
   * Render marketplace list
   */
  function renderMarketplaceList() {
    const enabledMarketplaces = currentSettings.enabledMarketplaces;
    const allEnabled = enabledMarketplaces === null;

    elements.marketplaceList.innerHTML = allMarketplaces
      .map(mp => {
        const isEnabled = allEnabled || enabledMarketplaces?.includes(mp.domain);
        return `
          <div class="marketplace-item" data-domain="${mp.domain}">
            <input
              type="checkbox"
              id="mp-${mp.domain}"
              data-domain="${mp.domain}"
              ${isEnabled ? 'checked' : ''}
            >
            <div class="marketplace-info">
              <div class="marketplace-name">
                ${mp.name}
                <span class="marketplace-region">${mp.region}</span>
              </div>
              <div class="marketplace-domain">${mp.domain}</div>
            </div>
          </div>
        `;
      })
      .join('');

    // Add event listeners to marketplace checkboxes
    elements.marketplaceList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', handleMarketplaceChange);
    });

    // Add click handlers to marketplace items
    elements.marketplaceList.querySelectorAll('.marketplace-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = item.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  }

  /**
   * Handle marketplace checkbox change
   */
  async function handleMarketplaceChange(event) {
    const domain = event.target.dataset.domain;
    const isChecked = event.target.checked;

    let enabledMarketplaces = currentSettings.enabledMarketplaces || allMarketplaces.map(m => m.domain);

    if (isChecked) {
      if (!enabledMarketplaces.includes(domain)) {
        enabledMarketplaces.push(domain);
      }
    } else {
      enabledMarketplaces = enabledMarketplaces.filter(d => d !== domain);
    }

    currentSettings.enabledMarketplaces = enabledMarketplaces;
    await saveSettings(currentSettings);
  }

  /**
   * Update settings and save to storage
   */
  async function updateAndSaveSettings() {
    try {
      await saveSettings(currentSettings);
      console.log('[Popup] Settings saved:', currentSettings);
    } catch (error) {
      console.error('[Popup] Error saving settings:', error);
    }
  }

  /**
   * Tab Switching
   */
  function switchTab(tabId) {
    // Update tab buttons
    elements.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab content
    elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === tabId);
    });
  }

  /**
   * Event Handlers
   */

  // Tab switching
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Master enable toggle
  elements.enabledToggle.addEventListener('change', async (e) => {
    currentSettings.enabled = e.target.checked;
    await updateAndSaveSettings();
  });

  // Auto Prime toggle
  elements.autoPrimeToggle.addEventListener('change', async (e) => {
    currentSettings.autoPrime = e.target.checked;
    await updateAndSaveSettings();
  });

  // Auto Sort toggle
  elements.autoSortToggle.addEventListener('change', async (e) => {
    currentSettings.autoSort = e.target.checked;
    await updateAndSaveSettings();
  });

  // Notifications toggle
  elements.notificationsToggle.addEventListener('change', async (e) => {
    currentSettings.showNotifications = e.target.checked;
    await updateAndSaveSettings();
  });

  // Select All button
  elements.selectAllBtn.addEventListener('click', async () => {
    currentSettings.enabledMarketplaces = allMarketplaces.map(m => m.domain);
    await saveSettings(currentSettings);
    renderMarketplaceList();
  });

  // Deselect All button
  elements.deselectAllBtn.addEventListener('click', async () => {
    currentSettings.enabledMarketplaces = [];
    await saveSettings(currentSettings);
    renderMarketplaceList();
  });

  // Reset button
  elements.resetBtn.addEventListener('click', async () => {
    const confirmed = confirm('Reset all settings to defaults?');
    if (confirmed) {
      await resetSettings();
      await loadSettings();
    }
  });

  // Load settings on init
  await loadSettings();
});
