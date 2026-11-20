# Privacy Policy: Prime Filter & Price Sort for Amazon

Last updated: 2026-11-20

Short version: this extension does not collect, store, or send any personal data to the developer. It has no servers, no analytics, and no accounts.

## What the extension does
When you start a new search on a supported Amazon site, the extension adds the Prime filter and your chosen sort order to the search URL before the results page loads. It touches `/s` search paths (including language-prefixed paths such as `/-/en/s`) and does not read the product content of the pages you visit.

## Data we collect
None. We do not collect browsing history, search terms, purchases, account details, or any other personal data. Nothing is sent to the developer or to any third party.

## Data stored in your browser
- **Settings:** Your preferences (extension on or off, Prime filter on or off, sort option, notifications, enabled Amazon sites) are stored via `chrome.storage.sync` (with `chrome.storage.local` as fallback). If browser sync is enabled, your browser vendor may sync settings across your signed-in devices; the developer has no access to that data. If you remove the extension, the browser deletes stored settings.
- **Temporary loop guard and gate state:** To avoid redirect loops, the extension temporarily holds the original and computed target search URLs per tab in memory and `chrome.storage.session` (intended 5 second guard window and 15 second one-time bypass window, with timer and `alarms` cleanup). In Chrome and Edge builds, matching `/s` navigations briefly pass through the local gate page (`chromium/gate.html`), where the original search URL sits temporarily in the local URL fragment and tab-scoped `sessionStorage` holds a bounce counter. No URL is ever written to `storage.sync` or sent to external servers. On browser restart `chrome.storage.session` is cleared; `sessionStorage` follows browser session management.

## Permissions and why they are needed
- `storage`: to save your settings in your browser (and temporary loop-guard state in `storage.session` on Chromium).
- `webRequest` and `webRequestBlocking` (Firefox): to rewrite the URL of a new Amazon search before the request is sent. Only Amazon search pages (`/s`) on the supported sites are touched.
- Host permissions for the 19 supported Amazon sites (`amazon.com`, `.ca`, `.com.mx`, `.com.br`, `.co.uk`, `.de`, `.fr`, `.it`, `.es`, `.nl`, `.se`, `.pl`, `.co.jp`, `.com.au`, `.in`, `.sg`, `.ae`, `.com.tr`, `.eg`): so the extension runs only on those sites. It has no access to any other site.
- Chrome and Edge builds (`declarativeNetRequestWithHostAccess`, `webRequest`, `alarms`, `storage`, and `web_accessible_resources` for `chromium/gate.html`): `declarativeNetRequestWithHostAccess` routes supported `/s` navigations to the local gate page (`chromium/gate.html`) and sets a one-time tab-scoped session allow rule for the computed target URL; `webRequest` is observation-only (non-blocking) to map and remove that one-time allow rule; `alarms` runs best-effort cleanup for expired loop-guard and bypass entries.

## Third parties
The extension does not load remote code and does not talk to any third party. Amazon receives the search requests you make in your browser, as it would without the extension. The only difference is that the Prime filter and sort parameters are already in the URL.

## Donation links
The Support tab links to Buy Me a Coffee and PayPal. If you click them, you leave the extension and those services apply their own privacy policies. The extension itself does not process payments.

## Children
The extension is not directed at children and collects no data from anyone.

## Changes
If this policy changes, the change appears in this file with a new date.

## Contact
Questions or bugs: https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/issues
Security reports: use GitHub private vulnerability reporting on the repo.

This extension is an independent project. It is not affiliated with, endorsed by, or sponsored by Amazon. Amazon and Prime are trademarks of Amazon.com, Inc. or its affiliates.
