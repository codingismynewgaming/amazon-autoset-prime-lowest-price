#!/usr/bin/env node
/**
 * Build the Chromium packages (Chrome and Edge) for
 * "Prime Filter & Price Sort for Amazon".
 *
 * Usage:
 *   node scripts/build-chromium.mjs [chrome|edge|all] [--out-dir PATH]
 *
 * Defaults: target "all", out dir <repo>/../builds/chromium.
 * No npm dependencies, no network, no git. Only the package folder and ZIP
 * belonging to the selected browser are replaced.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUT_DIR = path.resolve(APP_ROOT, '..', 'builds', 'chromium');
const PRIVACY_BASE = 'https://github.com/codingismynewgaming/prime-filter-price-sort-for-amazon/blob/master/';

const TARGETS = {
  chrome: {
    manifest: 'chromium/manifest.chrome.json',
    privacyDoc: 'PRIVACY.md',
    privacyUrl: `${PRIVACY_BASE}PRIVACY.md`,
    packageName: 'prime-filter-price-sort-for-amazon-chrome',
  },
  edge: {
    manifest: 'chromium/manifest.edge.json',
    privacyDoc: 'PRIVACY.md',
    privacyUrl: `${PRIVACY_BASE}PRIVACY.md`,
    packageName: 'prime-filter-price-sort-for-amazon-edge',
  },
};

/** Runtime and shared assets copied unchanged into every package. */
const SHARED_FILES = [
  'lib/storage.js',
  'lib/rewrite.js',
  'chromium/gate-rules.js',
  'chromium/service-worker.js',
  'chromium/gate.html',
  'chromium/gate.js',
  'chromium/content.js',
  'popup/popup.css',
  'popup/popup.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon96.png',
  'icons/icon128.png',
  '_locales/en/messages.json',
  '_locales/de/messages.json',
  'LICENSE',
];

const FORBIDDEN_TOP_LEVEL = new Set(['.git', 'node_modules', 'scripts', 'docs', 'temp', 'ressourcen', 'backups']);
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env/i,
  /^\.amo-upload-uuid$/i,
  /\.pem$/i,
  /\.key$/i,
  /credential/i,
  /secret/i,
];

function fail(message) {
  throw new Error(message);
}

function readJson(relPath) {
  const abs = path.join(APP_ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`Missing source file: ${relPath}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function parseArgs(argv) {
  let target = 'all';
  let outDir = null;
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--out-dir') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail('--out-dir requires a path');
      outDir = value;
      i += 1;
    } else if (arg.startsWith('--out-dir=')) {
      const value = arg.slice('--out-dir='.length);
      if (!value) fail('--out-dir requires a path');
      outDir = value;
    } else if (arg.startsWith('-')) {
      fail(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) fail(`Expected at most one target, got: ${positional.join(' ')}`);
  if (positional.length === 1) {
    const value = positional[0].toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(TARGETS, value) && value !== 'all') {
      fail(`Unknown target "${positional[0]}". Use chrome, edge or all.`);
    }
    target = value;
  }

  return {
    target,
    outDir: outDir ? path.resolve(process.cwd(), outDir) : DEFAULT_OUT_DIR,
  };
}

function assertNoForbiddenKeys(value, trail = 'manifest') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const location = `${trail}.${key}`;
    if (key === 'browser_specific_settings' || key === 'gecko' || key === 'gecko_android') {
      fail(`${location} is Firefox-only and must not appear in a Chromium manifest`);
    }
    if (key === 'update_url') fail(`${location} is not allowed`);
    if (key === 'declarative_net_request') fail(`${location} must not be used; rules are registered dynamically`);
    assertNoForbiddenKeys(child, location);
  }
}

function validateManifest(manifest, baseManifest, browser, messages) {
  const label = `${browser} manifest`;
  if (manifest.manifest_version !== 3) fail(`${label}: manifest_version must be 3`);
  if (manifest.version !== baseManifest.version) {
    fail(`${label}: version ${manifest.version} does not match Firefox base ${baseManifest.version}`);
  }
  if (manifest.default_locale !== 'en') fail(`${label}: default_locale must be "en"`);
  if (manifest.name !== '__MSG_extensionName__') fail(`${label}: name must come from __MSG_extensionName__`);
  if (manifest.description !== '__MSG_extensionDescription__') {
    fail(`${label}: description must come from __MSG_extensionDescription__`);
  }

  const expectedPermissions = ['storage', 'declarativeNetRequestWithHostAccess', 'webRequest', 'alarms'];
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)) {
    fail(`${label}: permissions must be exactly ${expectedPermissions.join(', ')}`);
  }
  if (manifest.permissions.includes('webRequestBlocking')) {
    fail(`${label}: blocking webRequest is not allowed`);
  }

  const expectedHosts = baseManifest.host_permissions;
  if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedHosts)) {
    fail(`${label}: host_permissions must match the Firefox base exactly (${expectedHosts.length} entries)`);
  }

  const script = Array.isArray(manifest.content_scripts) ? manifest.content_scripts[0] : null;
  if (!script) fail(`${label}: content_scripts[0] is missing`);
  if (JSON.stringify(script.matches) !== JSON.stringify(baseManifest.content_scripts[0].matches)) {
    fail(`${label}: content_scripts[0].matches must match the Firefox base exactly`);
  }
  const expectedJs = ['lib/storage.js', 'lib/rewrite.js', 'chromium/content.js'];
  if (JSON.stringify(script.js) !== JSON.stringify(expectedJs)) {
    fail(`${label}: content_scripts[0].js must be ${expectedJs.join(', ')}`);
  }
  if (script.run_at !== 'document_end') fail(`${label}: content_scripts[0].run_at must be "document_end"`);

  if (!manifest.background || manifest.background.service_worker !== 'chromium/service-worker.js') {
    fail(`${label}: background.service_worker must be "chromium/service-worker.js"`);
  }
  if (manifest.background.scripts) fail(`${label}: background.scripts is not valid for MV3 service workers`);

  const accessible = manifest.web_accessible_resources;
  if (!Array.isArray(accessible) || accessible.length !== 1 ||
      JSON.stringify(accessible[0].resources) !== JSON.stringify(['chromium/gate.html']) ||
      JSON.stringify(accessible[0].matches) !== JSON.stringify(expectedHosts)) {
    fail(`${label}: only chromium/gate.html may be web-accessible, on the 19 existing Amazon hosts`);
  }

  if (!manifest.action || manifest.action.default_popup !== 'popup/popup.html') {
    fail(`${label}: action.default_popup must be "popup/popup.html"`);
  }
  const iconSizes = ['16', '32', '48', '96', '128'];
  for (const size of iconSizes) {
    if (!manifest.icons || manifest.icons[size] !== `icons/icon${size}.png`) {
      fail(`${label}: icons.${size} must be "icons/icon${size}.png"`);
    }
    if (!manifest.action.default_icon || manifest.action.default_icon[size] !== `icons/icon${size}.png`) {
      fail(`${label}: action.default_icon.${size} must be "icons/icon${size}.png"`);
    }
  }

  if (!manifest.homepage_url) fail(`${label}: homepage_url is missing`);
  if (!manifest.author) fail(`${label}: author is missing`);

  assertNoForbiddenKeys(manifest);

  const description = messages.en.extensionDescription.message;
  if (description.length > 132) {
    fail(`${label}: English description is ${description.length} chars, limit is 132`);
  }
  const germanDescription = messages.de.extensionDescription.message;
  if (germanDescription.length > 132) {
    fail(`${label}: German description is ${germanDescription.length} chars, limit is 132`);
  }
}

function validateMessages(messages, baseManifest) {
  for (const locale of ['en', 'de']) {
    const entry = messages[locale];
    if (!entry.extensionName || typeof entry.extensionName.message !== 'string') {
      fail(`_locales/${locale}/messages.json: extensionName.message is missing`);
    }
    if (!entry.extensionDescription || typeof entry.extensionDescription.message !== 'string') {
      fail(`_locales/${locale}/messages.json: extensionDescription.message is missing`);
    }
  }
  if (messages.en.extensionName.message !== baseManifest.name) {
    fail('_locales/en/messages.json: extensionName must match the Firefox manifest name');
  }
}

/**
 * Replace the false privacy claims in the popup copy. Every replacement must
 * match exactly once, otherwise the original changed and the build stops.
 */
function transformPopup(html, privacyUrl) {
  const replacements = [
    {
      name: 'privacy list',
      oldText: [
        '            <ul>',
        '              <li>No data collection</li>',
        '              <li>Local storage only</li>',
        '              <li>No tracking or analytics</li>',
        '              <li>GDPR compliant</li>',
        '            </ul>',
      ].join('\n'),
      newText: [
        '            <ul>',
        '              <li>No data collection by the developer</li>',
        '              <li>Settings may sync via your browser account</li>',
        '              <li>No tracking or analytics</li>',
        '              <li>Search-URL rewriting only</li>',
        '            </ul>',
        '',
        `            <p><a href="${privacyUrl}" target="_blank" rel="noopener">Privacy policy</a></p>`,
      ].join('\n'),
    },
    {
      name: 'compliance claim',
      oldText: '              <li>Uses standard DOM APIs</li>',
      newText: '              <li>Uses standard browser extension APIs</li>',
    },
  ];

  let output = html;
  for (const replacement of replacements) {
    const occurrences = output.split(replacement.oldText).length - 1;
    if (occurrences !== 1) {
      fail(
        `popup/popup.html changed: expected exactly one match for ${replacement.name}, found ${occurrences}. ` +
          'Update scripts/build-chromium.mjs instead of shipping a stale claim.',
      );
    }
    output = output.replace(replacement.oldText, replacement.newText);
  }

  const forbidden = ['Local storage only', 'GDPR compliant', 'Uses standard DOM APIs'];
  for (const claim of forbidden) {
    if (output.includes(claim)) fail(`popup/popup.html still contains the claim "${claim}"`);
  }
  if (!output.includes(privacyUrl)) fail('popup/popup.html is missing the privacy policy link');
  if (!output.includes('Version 1.0.5')) fail('popup/popup.html lost the "Version 1.0.5" string');
  if (!output.includes('v1.0.5')) fail('popup/popup.html lost the "v1.0.5" footer string');

  return output;
}

function copyInto(pkgDir, relPath, destRel = relPath) {
  const source = path.join(APP_ROOT, relPath);
  if (!fs.existsSync(source)) fail(`Missing source file: ${relPath}`);
  const destination = path.join(pkgDir, destRel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function assertSafeEntry(entry) {
  if (!entry || entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) {
    fail(`Unsafe ZIP entry (absolute path): ${entry}`);
  }
  if (entry.includes('\\')) fail(`Unsafe ZIP entry (backslash): ${entry}`);
  const segments = entry.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    fail(`Unsafe ZIP entry (path traversal): ${entry}`);
  }
  if (FORBIDDEN_TOP_LEVEL.has(segments[0])) {
    fail(`Forbidden ZIP entry (${segments[0]}/): ${entry}`);
  }
  const fileName = segments[segments.length - 1];
  if (FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(fileName))) {
    fail(`Forbidden ZIP entry (sensitive file): ${entry}`);
  }
}

function listFiles(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(abs, rel));
    } else if (entry.isFile()) {
      files.push(rel);
    } else {
      fail(`Unsupported file type in package: ${rel}`);
    }
  }
  return files.sort();
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixed DOS timestamp (2020-01-01 00:00:00) for reproducible archives.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

function writeZip(pkgDir, zipPath) {
  const entries = listFiles(pkgDir).map((rel) => {
    assertSafeEntry(rel);
    const data = fs.readFileSync(path.join(pkgDir, rel));
    return { rel, data, nameBuf: Buffer.from(rel, 'utf8') };
  });

  if (!entries.some((entry) => entry.rel === 'manifest.json')) {
    fail('Package root is missing manifest.json');
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(entry.nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, entry.nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, entry.nameBuf);

    offset += local.length + entry.nameBuf.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDirectory, eocd]));
}

function readZipEntryNames(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail(`ZIP verification failed: end of central directory not found in ${zipPath}`);

  const count = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const names = [];
  let pointer = centralOffset;

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
      fail(`ZIP verification failed: bad central directory entry ${i} in ${zipPath}`);
    }
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    names.push(buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength));
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return names;
}

function verifyZip(zipPath) {
  const names = readZipEntryNames(zipPath);
  if (!names.includes('manifest.json')) fail(`ZIP verification failed: manifest.json is not at the ZIP root (${zipPath})`);
  for (const name of names) assertSafeEntry(name);
  return names;
}

function buildTarget(browser, outDir, baseManifest, messages) {
  const target = TARGETS[browser];
  const manifest = readJson(target.manifest);
  validateManifest(manifest, baseManifest, browser, messages);

  const packageFolder = `${target.packageName}-${baseManifest.version}`;
  const packageDir = path.join(outDir, packageFolder);
  const zipPath = path.join(outDir, `${packageFolder}.zip`);
  const tempDir = path.join(outDir, `.tmp-${packageFolder}-${process.pid}`);
  const tempZip = path.join(outDir, `.tmp-${packageFolder}-${process.pid}.zip`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    for (const relPath of SHARED_FILES) copyInto(tempDir, relPath);

    const popupSource = fs.readFileSync(path.join(APP_ROOT, 'popup', 'popup.html'), 'utf8');
    const popupOutput = transformPopup(popupSource, target.privacyUrl);
    fs.mkdirSync(path.join(tempDir, 'popup'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'popup', 'popup.html'), popupOutput, 'utf8');

    fs.writeFileSync(path.join(tempDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    copyInto(tempDir, target.privacyDoc, 'PRIVACY.md');

    // Replace only our own package folder and ZIP.
    fs.rmSync(packageDir, { recursive: true, force: true });
    fs.renameSync(tempDir, packageDir);

    fs.rmSync(tempZip, { force: true });
    writeZip(packageDir, tempZip);
    const names = verifyZip(tempZip);

    fs.rmSync(zipPath, { force: true });
    fs.renameSync(tempZip, zipPath);

    return { browser, packageDir, zipPath, fileCount: names.length, zipBytes: fs.statSync(zipPath).size };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tempZip, { force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/build-chromium.mjs [chrome|edge|all] [--out-dir PATH]');
    console.log(`Default out dir: ${DEFAULT_OUT_DIR}`);
    return;
  }

  const baseManifest = readJson('manifest.json');
  const messages = {
    en: readJson('_locales/en/messages.json'),
    de: readJson('_locales/de/messages.json'),
  };
  validateMessages(messages, baseManifest);

  const browsers = options.target === 'all' ? ['chrome', 'edge'] : [options.target];
  fs.mkdirSync(options.outDir, { recursive: true });
  fs.writeFileSync(path.join(options.outDir, 'NOT-READY.txt'),
    'LOCAL DEVELOPMENT ARTIFACTS ONLY. NOT APPROVED FOR STORE SUBMISSION.\n' +
    'Gate runtime: local validation is separate from real Amazon, branded Chrome and Edge testing.\n' +
    'Store assets, privacy disclosures, public privacy URLs and release approval remain pending.\n' +
    'Do not upload, submit or publish these packages without explicit approval.\n', 'utf8');
  const results = browsers.map((browser) => buildTarget(browser, options.outDir, baseManifest, messages));

  for (const result of results) {
    console.log(`[${result.browser}] package: ${result.packageDir}`);
    console.log(`[${result.browser}] zip:     ${result.zipPath}`);
    console.log(`[${result.browser}] entries: ${result.fileCount}, ${(result.zipBytes / 1024).toFixed(1)} KiB`);
  }
  console.log(`Version ${baseManifest.version}; Firefox sources untouched.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
const modulePath = fileURLToPath(import.meta.url).toLowerCase();

if (invokedPath === modulePath) {
  try {
    main();
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export { transformPopup, writeZip, readZipEntryNames, verifyZip, listFiles, parseArgs };
