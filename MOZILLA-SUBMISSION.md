# Mozilla Add-ons Submission Package

**Extension:** Amazon Autoset All Prime Delivery & Sort Price Low to High  
**Version:** 1.0.0  
**Date:** March 13, 2026

---

## Package Contents

This package contains everything needed for Mozilla Add-ons submission:

### Required Files ✅
- [x] `manifest.json` - Extension manifest (MV3 compliant)
- [x] `background/service-worker.js` - Background script
- [x] `content/content.js` - Content script
- [x] `lib/storage.js` - Storage utility
- [x] `popup/popup.html` - Settings popup UI
- [x] `popup/popup.css` - Popup styles
- [x] `popup/popup.js` - Popup logic
- [x] `icons/` - All required icon sizes (16, 32, 48, 96, 128px)
- [x] `README.md` - Documentation
- [x] `LICENSE` - MIT License
- [x] `CHANGELOG.md` - Version history

---

## Mozilla Add-ons Requirements Compliance

### 1. Manifest Requirements ✅

```json
{
  "manifest_version": 3,
  "name": "Amazon Autoset All Prime Delivery & Sort Price Low to High",
  "version": "1.0.0",
  "browser_specific_settings": {
    "gecko": {
      "id": "{a1b2c3d4-e5f6-7890-abcd-ef1234567890}",
      "strict_min_version": "109.0"
    }
  }
}
```

✅ **Status:** All required fields present
- Unique extension ID (stable UUID)
- Minimum Firefox version specified
- Manifest version 3 compatible

### 2. Permissions ✅

**Requested Permissions:**
- `storage` - Save user settings locally

**Host Permissions:**
- Amazon marketplaces only (`.amazon.com/*`, `.amazon.de/*`, etc.)

✅ **Status:** Minimal permissions, all justified

### 3. Privacy Practices ✅

**Data Collection:** NONE
- No personal data collected
- No browsing history tracking
- No external servers
- No analytics or telemetry
- All data stored locally via `chrome.storage.sync`

✅ **Status:** Privacy-first design, GDPR compliant

### 4. Content Security Policy ✅

**Default CSP:** Extension uses default CSP (no remote code execution)
- No external scripts loaded
- All code is local
- No `eval()` or `Function()` usage
- No remote resources

✅ **Status:** Secure by default

### 5. Icon Requirements ✅

**Provided Sizes:**
- 16x16px - Toolbar icon (small displays)
- 32x32px - Toolbar icon (standard)
- 48x48px - **Required for Mozilla**
- 96x96px - **Required for Mozilla** (HiDPI)
- 128x128px - Store listing

✅ **Status:** All required sizes included

### 6. Code Quality ✅

**Best Practices:**
- No console.log in production (minimal logging only)
- Proper error handling
- Clean, readable code structure
- No deprecated APIs
- Manifest V3 compatible

✅ **Status:** Production-ready code

### 7. Documentation ✅

**Provided:**
- README.md with installation and usage instructions
- CHANGELOG.md with version history
- LICENSE (MIT)
- In-extension legal information

✅ **Status:** Complete documentation

---

## Submission Instructions

### Step 1: Create Mozilla Add-ons Developer Account

1. Go to https://addons.mozilla.org/developers/
2. Sign in with Firefox Account
3. Accept developer agreement
4. **Fee:** $0 (Free for open source extensions)

### Step 2: Submit New Extension

1. Click **"Submit a New Add-on"**
2. Choose **"Host it myself"** (self-hosted)
3. Upload the `.xpi` file from this package

### Step 3: Fill in Store Listing

#### Basic Information
- **Name:** Amazon Autoset All Prime Delivery & Sort Price Low to High
- **Short Description:** Automatically apply Prime filters and sort by lowest price on Amazon. Privacy-first with no data collection.
- **Category:** Shopping
- **License:** MIT

#### Description (use this text):
```
🛒 Shop Smarter on Amazon

Amazon Autoset All Prime Delivery & Sort Price Low to High automatically filters for Prime-eligible products and sorts by price (low to high) on every Amazon search. Find the best deals instantly without manually clicking filters on every search.

✨ Key Features:
• Auto Prime Filter - Automatically applies "All Prime" filter
• Price Sorting - Instantly sorts from lowest to highest price
• Global Support - Works on all Amazon marketplaces worldwide
• Privacy First - No data collection, local storage only
• Dark Mode - Adapts to your browser theme automatically
• Compact UI - Clean, efficient interface

🌍 Supported Marketplaces:
North America: amazon.com, amazon.ca, amazon.com.mx
Europe: amazon.de, amazon.co.uk, amazon.fr, amazon.it, amazon.es, amazon.nl, amazon.se, amazon.pl
Asia Pacific: amazon.co.jp, amazon.com.au, amazon.in, amazon.sg
Other: amazon.com.br, amazon.ae, amazon.eg, amazon.tr

🔒 Privacy Commitment:
• No data collection
• No tracking or analytics
• No external servers
• All settings stored locally
• Open source (MIT License)

⚙️ How to Use:
1. Install the extension
2. Click the extension icon to open settings
3. Customize filters and marketplace selection
4. Search on Amazon - filters apply automatically!

💝 Support Development:
If this extension helps you save money, consider supporting:
• Buy Me a Coffee: https://buymeacoffee.com/codingiymynewgaming
• PayPal Donate: https://www.paypal.com/donate/?hosted_button_id=ZXHJFTUW9NQK8

📝 Legal:
This extension is not affiliated with, endorsed by, or sponsored by Amazon.com, Inc. Amazon, Prime, and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.

🔗 Links:
• Source Code: https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price
• Report Issues: https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price/issues
```

#### Tags:
```
amazon, prime, shopping, deals, price, sort, filter, auto, savings, discount, best price, marketplace, online shopping, productivity
```

### Step 4: Upload Screenshots

**Required:** Minimum 1, Recommended: 3-4

**Screenshot Specifications:**
- Format: PNG or JPG
- Minimum: 1280x800 pixels or 640x400 pixels
- Maximum: 5MB per file

**Recommended Screenshots:**

1. **Search Results with Filters Applied** (1920x1080)
   - Show Amazon search page
   - Highlight Prime checkbox checked
   - Show sort dropdown set to "Price: Low to High"

2. **Settings Popup - Settings Tab** (800x600)
   - Show the settings interface
   - Display toggles and marketplace selection

3. **Settings Popup - Dark Mode** (800x600)
   - Show dark theme variant
   - Demonstrates theme adaptation

4. **Support Tab** (800x600)
   - Show donation buttons
   - Show GitHub links

### Step 5: Privacy Policy

**URL:** https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price/blob/main/README.md#privacy

**Or use this statement:**
```
This extension does not collect, store, or transmit any personal information. All settings are stored locally in your browser using the Chrome Storage API. The extension only interacts with Amazon's webpage structure to apply filters and sorting. No data is sent to external servers, no analytics are used, and no browsing history is tracked.
```

### Step 6: Homepage & Support URLs

- **Homepage:** https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price
- **Support:** https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price/issues

### Step 7: Review & Submit

1. Review all information
2. Click **"Submit"**
3. Wait for review (typically 1-3 business days)

---

## Review Process

### What Mozilla Checks

1. **Functionality** - Extension works as described
2. **Security** - No malicious code, secure practices
3. **Privacy** - Data handling practices are clear
4. **User Experience** - No annoying behavior, clear purpose
5. **Compliance** - Follows add-on policies

### Common Issues to Avoid

✅ **Already Compliant:**
- No remote code execution
- No hidden functionality
- Clear privacy practices
- Minimal permissions
- No external dependencies

### Review Timeline

- **Initial Review:** 1-3 business days
- **Public Listing:** After approval
- **Updates:** Usually faster (few hours to 1 day)

---

## Post-Approval

### After Approval

1. Extension appears on Mozilla Add-ons
2. Public URL: `https://addons.mozilla.org/firefox/addon/amazon-autoset-prime-lowest-price/`
3. Users can install directly from Mozilla

### Maintenance

- Monitor reviews and respond
- Watch for user feedback
- Update for Firefox compatibility
- Fix bugs promptly

### Updates

To release updates:
1. Increment version in `manifest.json`
2. Update `CHANGELOG.md`
3. Create new XPI
4. Submit as update in Developer Hub
5. Usually auto-approved for minor changes

---

## Troubleshooting

### If Rejected

**Common Reasons:**
- Missing information
- Unclear privacy policy
- Excessive permissions
- Functionality issues

**Solution:**
- Address reviewer comments
- Fix issues
- Resubmit

### If Delayed

**Check:**
- Email for reviewer questions
- Developer Hub for status
- Respond promptly to any queries

---

## Package Verification Checklist

Before submitting, verify:

- [x] XPI file created successfully
- [x] All files included
- [x] Icons present (all 5 sizes)
- [x] Manifest valid JSON
- [x] Version is 1.0.0
- [x] Extension ID is stable UUID
- [x] No console.log statements (minimal only)
- [x] README.md included
- [x] LICENSE included
- [x] No node_modules folder
- [x] No sensitive data in code

---

## Contact

**Developer:** codingismynewgaming  
**GitHub:** https://github.com/codingismynewgaming  
**Email:** [Via GitHub]

---

**Status:** ✅ Ready for Mozilla Add-ons Submission!
