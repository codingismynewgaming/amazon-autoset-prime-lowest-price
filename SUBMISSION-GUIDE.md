# Mozilla Add-ons Submission Guide

## Quick Start

### Option 1: Automated Submission (Requires API Credentials)

1. **Get API Credentials:**
   - Go to https://addons.mozilla.org/developers/
   - Sign in with your Firefox Account
   - Click on **"Manage API Access"** (in footer or account settings)
   - Click **"Generate JWT"**
   - Copy the **Issuer (JWT Key)** and **Secret (JWT Secret)**

2. **Submit using web-ext CLI:**
   ```bash
   cd amazon-prime-sorter
   
   # For listed submission (public on AMO)
   web-ext sign --api-key YOUR_JWT_KEY --api-secret YOUR_JWT_SECRET --channel listed
   
   # For unlisted submission (manual distribution)
   web-ext sign --api-key YOUR_JWT_KEY --api-secret YOUR_JWT_SECRET --channel unlisted
   ```

3. **Wait for Approval:**
   - Listed: 1-3 business days for review
   - Unlisted: Usually automatic (minutes)

---

### Option 2: Manual Submission (No API Credentials Needed)

1. **Go to:** https://addons.mozilla.org/developers/

2. **Click:** "Submit a New Add-on"

3. **Choose:** "Host it myself" (self-hosted)

4. **Upload:** `amazon-autoset-prime-v1.0.0.xpi`

5. **Fill in Store Listing:**

   **Basic Info:**
   - **Name:** Amazon Prime Autoset: Filter & Sort
   - **Category:** Shopping
   - **License:** MIT
   
   **Short Description:**
   ```
   Automatically apply Prime filters and sort by lowest price on Amazon.
   ```
   
   **Full Description:**
   ```
   🛒 Shop Smarter on Amazon

   Amazon Prime Autoset automatically filters for Prime-eligible products and sorts by price (low to high) on every Amazon search. Find the best deals instantly!

   ✨ Features:
   • Auto Prime Filter - Shows only Prime-eligible items
   • Price Sorting - Lowest to highest automatically
   • Works on all Amazon marketplaces worldwide
   • Privacy-first: No data collection
   • Dark mode support

   🌍 Supported: amazon.com, .de, .co.uk, .fr, .it, .es, .ca, .co.jp, .com.au, and more!

   🔒 Privacy: No tracking, no analytics, all local storage.

   💝 Support: https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price
   ```

   **Tags:**
   ```
   amazon, prime, shopping, deals, price, sort, filter, savings
   ```

6. **Upload Screenshots** (recommended 3-4):
   - Search results with Prime filter applied
   - Settings popup (light mode)
   - Settings popup (dark mode)
   - Support tab

7. **Submit for Review**

---

## Current Status

✅ **Extension Ready:** `amazon-autoset-prime-v1.0.0.xpi` (21.47 KB)  
✅ **Linting Passed:** 0 errors, 4 warnings (non-blocking)  
✅ **Name Fixed:** "Amazon Prime Autoset: Filter & Sort" (38 chars, under 45 limit)  
✅ **All Icons:** 16px, 32px, 48px, 96px, 128px  
✅ **Manifest V3:** Compatible  

---

## Linting Results

```
Validation Summary:
errors    0
warnings  4 (non-blocking)

Warnings:
- MISSING_DATA_COLLECTION_PERMISSIONS (informational)
- KEY_FIREFOX_ANDROID_UNSUPPORTED (can ignore)
- UNSAFE_VAR_ASSIGNMENT (innerHTML in notifications - safe, static content)
```

---

## API Credentials Setup

### Step-by-Step:

1. **Create Developer Account:**
   - Visit: https://addons.mozilla.org/developers/
   - Click "Register" or "Log In"
   - Use Firefox Account (or create one)

2. **Accept Developer Agreement:**
   - Read and accept the distribution agreement
   - No fee for open source extensions

3. **Generate JWT:**
   - Scroll to footer
   - Click "Manage API Access"
   - Click "Generate JWT"
   - Copy both values:
     ```
     Issuer: abc123...
     Secret: xyz789...
     ```

4. **Store Securely:**
   - Save in password manager
   - Never commit to Git
   - Can regenerate anytime

---

## Submission Commands

### Listed (Public on AMO):
```bash
web-ext sign \
  --api-key YOUR_KEY \
  --api-secret YOUR_SECRET \
  --channel listed
```

### Unlisted (Manual Distribution):
```bash
web-ext sign \
  --api-key YOUR_KEY \
  --api-secret YOUR_SECRET \
  --channel unlisted
```

### Dry Run (Test):
```bash
web-ext build
```

---

## After Submission

### Listed Extension:
1. **Review Process:** 1-3 business days
2. **Email Notification:** When approved
3. **Public URL:** `https://addons.mozilla.org/firefox/addon/amazon-prime-autoset/`
4. **Auto Updates:** Enabled by default

### Unlisted Extension:
1. **Automatic Approval:** Usually minutes
2. **Download XPI:** From Developer Hub
3. **Manual Distribution:** Share XPI file
4. **No Auto Updates:** Manual updates required

---

## Troubleshooting

### "Invalid API credentials"
- Regenerate JWT from Developer Hub
- Check for typos in key/secret
- Ensure no extra spaces

### "Version already exists"
- Increment version in `manifest.json`
- Update `CHANGELOG.md`
- Rebuild XPI

### "Name too long"
- ✅ Fixed: Now 38 characters (limit is 45)

### "Missing icon"
- ✅ All icons present: 16, 32, 48, 96, 128px

---

## Links

- **Developer Hub:** https://addons.mozilla.org/developers/
- **Submission:** https://addons.mozilla.org/developers/addon/submit
- **API Docs:** https://addons-server.readthedocs.io/
- **Extension Workshop:** https://extensionworkshop.com/
- **GitHub Repo:** https://github.com/codingismynewgaming/amazon-autoset-prime-lowest-price

---

## Next Steps

1. **Decide:** Listed (public) or Unlisted (manual)?
2. **Get Credentials:** If using CLI submission
3. **Submit:** Using CLI or web interface
4. **Wait:** For approval (listed) or download (unlisted)
5. **Share:** Extension link with users

---

**Ready to submit! 🚀**
