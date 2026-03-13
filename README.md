# Amazon Prime All Autoselect & Lowest Price Sorting

A browser extension that automatically applies Prime filters and sorts products by lowest price on Amazon search results.

## Features

- **Auto Prime Filter**: Automatically applies "All Prime" filter to show only Prime-eligible items
- **Auto Price Sorting**: Instantly sorts results from lowest to highest price
- **Global Support**: Works on all Amazon marketplaces worldwide
- **Privacy First**: No data collection, everything runs locally in your browser
- **Dark Mode**: Automatically adapts to your browser's dark/light theme

## Supported Marketplaces

- North America: amazon.com, amazon.ca, amazon.com.mx
- Europe: amazon.de, amazon.co.uk, amazon.fr, amazon.it, amazon.es, amazon.nl, amazon.se, amazon.pl
- Asia Pacific: amazon.co.jp, amazon.com.au, amazon.com.in, amazon.sg
- Other: amazon.com.br, amazon.ae, amazon.eg, amazon.tr

## Installation

### Firefox (Mozilla Add-ons)
1. Visit the [Mozilla Add-ons page](https://addons.mozilla.org/firefox/addon/amazon-prime-all-autoselect/) (pending submission)
2. Click "Add to Firefox"
3. Confirm the installation

### Manual Installation (Development)
1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from this folder

## Usage

1. **Enable Extension**: Click the extension icon and ensure "Enable Extension" is toggled on
2. **Customize Filters**: Toggle Prime filter and price sorting on/off as needed
3. **Select Marketplaces**: Choose which Amazon marketplaces to enable
4. **Search on Amazon**: Perform any search - filters apply automatically!

## Settings

### Settings Tab
- Master enable/disable toggle
- Auto-apply Prime filter
- Auto-sort by price (low to high)
- Enable/disable notifications
- Marketplace selection

### Legal Tab
- Privacy information
- Compliance details
- Disclaimer

### Support Tab
- Buy Me a Coffee
- PayPal Donate
- GitHub Repository
- Issue Tracker

## Privacy

This extension:
- ❌ Does NOT collect any personal data
- ❌ Does NOT track your browsing history
- ❌ Does NOT send data to external servers
- ✅ Stores settings locally in your browser
- ✅ Uses only standard DOM APIs

## Technical Details

- **Manifest Version**: 3 (MV3)
- **Minimum Firefox Version**: 109.0
- **Permissions**: storage, host permissions for Amazon domains

## Support Development

If this extension helps you save money, consider supporting its development:

- [Buy Me a Coffee](https://buymeacoffee.com/codingiymynewgaming)
- [PayPal Donate](https://www.paypal.com/donate/?hosted_button_id=ZXHJFTUW9NQK8)

## License

MIT License - See LICENSE file for details

## Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Amazon.com, Inc. Amazon, Prime, and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
