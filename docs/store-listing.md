# Store listing texts: Prime Filter & Price Sort for Amazon

Language: English only. Name in all stores: **Prime Filter & Price Sort for Amazon**.
Category: Shopping (AMO, Chrome, Edge).
Status: Firefox is live (v1.0.6). Chrome ([Chrome Web Store](https://chromewebstore.google.com/detail/prime-filter-price-sort-f/bncbmleiffadkeekjdgcofccdbpmbldl)) and Edge ([Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/prime-filter-price-sort/mhndpkgjdillpomodinlbhicpocloemf)) are live too.

## 1. Short texts
**AMO summary** (max 250 characters, this one is 165):
Amazon Prime filter and sort by lowest price or best reviews, applied automatically to every Amazon search. One page load, no tracking. Works on all 19 Amazon sites.

**Chrome short description** (max 132 characters, this one is 129):
Amazon Prime filter plus sort by lowest price or best reviews, applied to every search automatically. One page load, no tracking.

**Edge description:** use the AMO summary as the first line of the long description. (Edge may enforce a minimum description length. Check in Partner Center before submitting.)

## 2. Full description (all stores)
I got tired of clicking the same two things on every Amazon search: the Prime filter and "sort by price". So I built an extension that does it for me.

Prime Filter & Price Sort for Amazon adds the Amazon Prime filter and your preferred sort order to every new Amazon search before the page loads. You type a search and see the result you wanted. No reload, no flicker.

What it does
- Prime filter: shows only Prime eligible items ("Prime only").
- Sorting (optional): sort by lowest price (low to high) or best customer reviews. You can switch it off.
- One page load: the parameters are added to the search request before it is sent.
- Respects your choices: if you change the sort order or a filter on the results page, the extension leaves it alone. A sort order in a shared link is never overridden.
- Per site control: pick the Amazon sites it should work on.
- Dark mode that follows your browser theme.

Where it works
It works on all 19 Amazon sites, including the Prime filter: amazon.com, .ca, .com.mx, .com.br, .co.uk, .de, .fr, .it, .es, .nl, .se, .pl, .co.jp, .com.au, .in, .sg, .ae, .com.tr and .eg.
You can switch single sites off in the settings. Amazon changes its pages now and then. If something breaks on your Amazon site, please open an issue on GitHub.

Privacy
No data collection by the developer. No analytics. No accounts. No requests to external developer servers. Your settings stay in browser storage (`chrome.storage.sync` with `chrome.storage.local` fallback). The extension only reads and rewrites Amazon search URLs.

Good to know
Sorting by price from low to high is not the same as the cheapest product. Amazon still decides what counts as a result, and sponsored items and shipping costs are not part of the sort.
This is an independent project. It is not affiliated with, endorsed by, or sponsored by Amazon. Amazon and Prime are trademarks of Amazon.com, Inc. or its affiliates.
Open source (MIT): https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon
Support and bugs: https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/issues

## 3. Keywords
AMO tags: amazon, prime, prime-filter, sort, price-sort, search-filter, shopping, privacy.
Edge search terms (max 7): amazon prime filter; amazon sort by price; amazon sort; prime filter; amazon search filter; sort by reviews; amazon shopping.
Phrases that appear naturally in the text, one or two times each: "Amazon Prime filter", "sort by lowest price", "low to high", "best reviews", "Prime only". Do not repeat any keyword more than 5 times.

## 4. Chrome Web Store first submission (matched to `chromium/manifest.chrome.json`)
**Single purpose:**
This extension has one purpose: it adds the Prime filter and the user's chosen sort order to Amazon search URLs, so Amazon search results open already filtered and sorted.

**Permission justifications** (verified against `chromium/manifest.chrome.json`):
- `declarativeNetRequestWithHostAccess`: Routes matching Amazon `/s` search navigations on enabled sites to the extension's local gate page (`chromium/gate.html`) and installs a one-time, tab-scoped session allow rule for the computed target URL, so search parameters are applied before loading the results page. No page content is read for this.
- `webRequest` (observation-only, non-blocking): Observes navigation completion and redirects on the supported Amazon hosts solely to match and remove the one-time session allow rule once used.
- `alarms`: Schedules best-effort cleanup of expired temporary loop-guard and bypass metadata in `chrome.storage.session`.
- `storage`: Saves user preferences in `chrome.storage.sync` (with `chrome.storage.local` fallback) and holds temporary per-tab loop-guard state in `chrome.storage.session`.
- Host permissions (`https://www.amazon.<tld>/*` for the 19 sites): Needed so rules, the `web_accessible_resources` gate target (`chromium/gate.html`), and the fallback content script run only on the supported Amazon sites. The extension has no access to any other site.
- Content script (`chromium/content.js`, `lib/storage.js`, `lib/rewrite.js`): Shows an optional notification toast when configured and serves as a local fallback on search pages.
- Remote code: No. No external scripts, no `eval`.

**Privacy practices tab:**
- Collected user data: none of the categories (the code and manifest collect nothing for the developer).
- Certifications: data is not sold, not used for unrelated purposes, not used for creditworthiness or lending.
- Privacy policy URL: `https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/blob/master/PRIVACY.md`
- Support URL: `https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/issues`
- EU trader status: Jan decides (relevant because of the donation links).
- Donation links in the popup: check the current Chrome Web Store policy on donation prompts before submitting. Jan decides. Do not remove or change the links yourself.

## 5. Edge Add-ons first submission
- Description as above. Edge also asks for a privacy policy URL (`https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/blob/master/PRIVACY.md`), category (Shopping), search terms, and a support or website URL.
- Notes for certification: "The extension rewrites Amazon search URLs only. Test: open amazon.com, search any term. The results page opens with the Prime facet and sort set. No login needed."
- Same Manifest V3 permissions and justifications as Chrome (`chromium/manifest.edge.json`).

## 6. Screenshot plan (1280x800, English; Jan or his marketing assistant creates them later)
1. Before and after: Amazon search "usb c cable", left without the extension, right with Prime filter and price sorted. Caption: "Prime and lowest price, already applied."
2. Popup settings: master switch, Prime, sort choice.
3. Popup site selection.
4. Results page after the user changes the sort: "Your changes stay."
5. Privacy tab: "No data collected."
GIF (about 8 seconds, under 5 MB, no sound): search, results open already filtered and sorted, open popup, change sort to reviews, search again.
Do not use the Amazon logo as a design element.

## 7. AMO manual steps for Jan
1. Edit Product Page for `amazon-all-prime-sort-price` on Mozilla Add-ons Developer Hub.
2. Support website: `https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/issues` (after the GitHub rename).
3. Homepage: `https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon` (or leave the AMO listing URL, Jan decides).
4. Summary (English): the AMO summary from section 1 above.
5. Description (English): the full description from section 2 above. Keep the German translation consistent or remove it (Jan decides).
6. Tags: `amazon`, `prime`, `prime-filter`, `sort`, `price-sort`, `search-filter`, `shopping`, `privacy`.
7. Privacy policy: `https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/blob/master/PRIVACY.md`.
8. Upload preview images (5 screenshots plus optional GIF) when they exist.
9. Note: the `manifest.json` `homepage_url` change (and the 8 new Prime facets in `lib/storage.js`) reach the AMO listing only with the next uploaded version.
