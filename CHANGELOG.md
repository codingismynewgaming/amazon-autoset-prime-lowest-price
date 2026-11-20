# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.6] - 2026-11-20

### Added
- Prime filter facets added for `amazon.ca`, `.se`, `.co.jp`, `.com.au`, `.sg`, `.ae`, `.eg`, `.com.tr` (and fixed Turkey domain from `amazon.tr` to `amazon.com.tr`).
- Support for language-prefixed Amazon search paths (such as `/-/en/s`).
- Fallback to `chrome.storage.local` when `chrome.storage.sync` fails or is unavailable.
- Local Chromium MV3 gate build (`chromium/`, `_locales/`, `scripts/build-chromium.mjs`, `tests/chromium.test.cjs`).
- Central `PRIVACY.md` and `docs/store-listing.md`.

### Changed
- Repository renamed to `prime-filter-price-sort-for-amazon`; updated repository, homepage, support, and privacy links.
- Rewrote `README.md` and updated `legal.html` to match current behavior and permissions.
- Improved popup accessibility (`aria-label`, `type="button"`) and replaced native reset confirmation with an inline prompt.
- Updated MIT license copyright to `Jan Kuehn (codingismynewgaming)` and added `.amo-upload-uuid` to `.gitignore`.

### Fixed
- Firefox: language-prefixed searches (such as `/-/en/s`) are now rewritten before the first request, so the page loads only once.
- Stored marketplace lists that still contain `amazon.tr` are migrated to `amazon.com.tr`.
- "Select All" now enables all marketplaces including future ones; checking every marketplace by hand does the same.
- Chromium build no longer fails on Windows checkouts with CRLF line endings.
- Firefox package excludes Chromium, test, script and documentation files via `web-ext-config.mjs`.

### Removed
- Outdated `MOZILLA-SUBMISSION.md`, `SUBMISSION-GUIDE.md`, `STORE-DESCRIPTIONS.md`, `.amo-upload-uuid`, `push-to-github.ps1`, and legacy icon PowerShell scripts.

## [1.0.5] - 2026-11-17

### Renamed
- Extension name is now "Prime Filter & Price Sort for Amazon" (better findability on Mozilla Add-ons). Extension ID and stored settings are unchanged.

### Added
- Toggle "Auto-apply Sort" in the popup; the sort order radios are disabled while it is off.

### Changed
- Search navigations are rewritten in the background script (`webRequest`, blocking) before the first request, so the results page loads only once. New permissions: `webRequest`, `webRequestBlocking`.
- Only fresh searches are rewritten. Sorting, filters and paging chosen on the results page (`ref=sr_*`) are left alone; an explicit `s=` in the URL is never overridden.
- Prime filter uses facets measured on the live sites (`p_n_free_shipping_eligible` on de, co.uk, fr, it, es, nl, pl, in, com.mx, com.br; `p_85` on com). Marketplaces without a verified facet (se, ca, co.jp, com.au, sg, ae, eg, tr) get sorting only.

### Fixed
- Marketplace selection in the popup is now respected.
- Login and other non-search forms no longer receive injected parameters.
- Loop guard against repeated redirects.
- Version strings in the popup match the manifest.

### Removed
- Fetch/XHR inline patch, form submit hook, unused background messages and debug logging.

## [1.0.2] - 2026-03-14

### Fixed
- Intercepted page requests (fetch/XHR) to inject Prime + sort before the request is sent.
- Search submit interception now falls back to async settings load if cache is not ready.

## [1.0.1] - 2026-03-14

### Fixed
- Single-reload application: Prime + sort now applied in one URL rewrite when needed.
- Search submit interception now updates existing `rh` and `s` params instead of skipping them.

## [1.0.0] - 2026-03-13

### Initial Release

#### Features
- **Auto Prime Filter**: Automatically applies "All Prime" filter to show only Prime-eligible items
- **Auto Price Sorting**: Instantly sorts results from lowest to highest price
- **Global Support**: Works on all Amazon marketplaces worldwide
- **Privacy First**: No data collection, everything runs locally in your browser
- **Dark Mode**: Automatically adapts to your browser's dark/light theme
- **Tab-based UI**: Settings, Legal, and Support tabs
- **Compact Design**: Optimized popup size (340px width) per Mozilla recommendations

#### Bug Fixes
- **Price Sorting Fixed**: Changed from dropdown event dispatching to URL navigation for reliable sorting

#### Supported Marketplaces
- North America: amazon.com, amazon.ca, amazon.com.mx
- Europe: amazon.de, amazon.co.uk, amazon.fr, amazon.it, amazon.es, amazon.nl, amazon.se, amazon.pl
- Asia Pacific: amazon.co.jp, amazon.com.au, amazon.in, amazon.sg
- Other: amazon.com.br, amazon.ae, amazon.eg, amazon.tr

#### Technical
- Manifest Version 3 (MV3)
- Minimum Firefox Version: 109.0
- Stable extension UUID for consistent testing
- Privacy-first architecture with local storage only

#### Support
- Buy Me a Coffee integration
- PayPal Donate integration
- GitHub repository for source code and issue tracking
