'use strict';
/*
 * Offline checks for the Chromium gate runtime.
 *
 * These tests model chrome.* (DNR, session storage, events, tabs), the
 * extension origin and the gate document. They do NOT replace Chrome/Edge,
 * RE2, or live Amazon verification. No browser, network or Amazon host is
 * touched.
 *
 * Contract under test (ported from temp/gate-prototype/worker.js):
 *   - chromium/gate-rules.js exposes PrimeSorterChromiumGateRules with
 *     buildRules(settings, marketplaces, gateUrl) and
 *     parseSource(value, marketplaces).
 *   - chromium/service-worker.js answers { type: 'prepare-gate', tabId,
 *     source } from the extension's own gate document and returns
 *     { ok: true, target, bypassId } only after the exact session allow rule
 *     is installed and persisted.
 *   - The worker publishes a readiness promise (any global name ending in
 *     "Ready"). The harness also settles by flushing microtasks, so a missing
 *     promise does not mask a broken init.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

const EXTENSION_ID = 'test-extension-id';
const DEFAULT_GATE_URL = `chrome-extension://${EXTENSION_ID}/chromium/gate.html`;

/* --------------------------------------------------------------- shared core */

function loadCore() {
  const context = vm.createContext({ URL, console });
  for (const file of ['lib/storage.js', 'lib/rewrite.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}

const core = loadCore();
const marketplaces = plain(core.getAllMarketplaces());
const defaults = {
  enabled: true,
  autoPrime: true,
  autoSort: true,
  sortOption: 'price-asc-rank',
  enabledMarketplaces: null,
  showNotifications: false,
};

/* ------------------------------------------------------------- gate-rules.js */

const GATE_RULES_FILE = 'chromium/gate-rules.js';
const gateRules = (() => {
  if (!fs.existsSync(path.join(root, GATE_RULES_FILE))) return null;
  const context = vm.createContext({
    URL,
    console,
    chrome: { runtime: { getURL: (file) => `chrome-extension://${EXTENSION_ID}/${file}` } },
  });
  vm.runInContext(read(GATE_RULES_FILE), context, { filename: GATE_RULES_FILE });
  return context.PrimeSorterChromiumGateRules || null;
})();
const gateRulesSkip = gateRules ? false : `${GATE_RULES_FILE} is not present yet`;

/* ---------------------------------------------------------------- URL helpers */

/**
 * DNR treats *, ^ and | as operators inside urlFilter. The gate encodes raw
 * occurrences before the fragment so the same string can be used as a literal
 * filter and as the navigation target. The fragment is not part of the request
 * URL and stays untouched.
 */
function dnrLiteral(url) {
  const index = url.indexOf('#');
  const base = index === -1 ? url : url.slice(0, index);
  const hash = index === -1 ? '' : url.slice(index);
  return base.replace(/\*/g, '%2A').replace(/\^/g, '%5E').replace(/\|/g, '%7C') + hash;
}

function expectedTarget(source, settings) {
  const rewritten = core.buildRewrittenUrl(source, settings);
  return dnrLiteral(rewritten && typeof rewritten.url === 'string' ? rewritten.url : source);
}

/** Minimal model of a DNR urlFilter: | anchors, * wildcard, ^ separator. */
function urlFilterRegExp(filter) {
  let body = filter;
  let start = false;
  let end = false;
  if (body.startsWith('|')) {
    start = true;
    body = body.slice(1);
  }
  if (body.endsWith('|')) {
    end = true;
    body = body.slice(0, -1);
  }
  const parts = body.split('*').map((part) => part
    .replace(/\^/g, '\u0000')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\u0000/g, '(?:[^A-Za-z0-9_.%-]|$)'));
  return new RegExp(`${start ? '^' : ''}${parts.join('.*')}${end ? '$' : ''}`);
}

/* --------------------------------------------------------------- chrome mock */

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { if (typeof listener === 'function') listeners.push(listener); },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    hasListener(listener) { return listeners.includes(listener); },
  };
}

function gateHarness(options = {}) {
  const state = {
    now: options.now === undefined ? 1000 : options.now,
    settings: plain({ ...defaults, ...(options.settings || {}) }),
    session: options.session || {},
    sessionRules: options.sessionRules || [],
    dynamic: options.dynamic || [],
    tabs: options.tabs || {},
    timers: [],
    nextTimerId: 1,
    badges: [],
    logs: [],
    alarms: [],
    urls: [],
    regexSupported: options.regexSupported !== false,
    syncDelayMs: options.syncDelayMs === undefined ? 0 : options.syncDelayMs,
    failSessionRules: options.failSessionRules === true,
    failSessionWriteAfter: options.failSessionWriteAfter === undefined ? null : options.failSessionWriteAfter,
    sessionWrites: 0,
    updates: 0,
  };

  const events = {
    message: createEvent(), installed: createEvent(), startup: createEvent(),
    storageChanged: createEvent(), tabRemoved: createEvent(), tabUpdated: createEvent(),
    alarm: createEvent(), webBeforeRequest: createEvent(), webCompleted: createEvent(),
    webError: createEvent(), webRedirect: createEvent(),
  };

  const keyList = (keys) => {
    if (Array.isArray(keys)) return keys;
    if (keys === null || keys === undefined) return null;
    if (typeof keys === 'string') return [keys];
    return Object.keys(keys);
  };

  const readSync = (keys) => {
    const list = keyList(keys);
    const result = {};
    if (list === null || list.includes('amazonPrimeSorterSettings')) {
      result.amazonPrimeSorterSettings = plain(state.settings);
    }
    return result;
  };

  const readSession = (keys) => {
    const list = keyList(keys);
    const result = {};
    const names = list === null ? Object.keys(state.session) : list;
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(state.session, name)) {
        result[name] = plain(state.session[name]);
      }
    }
    return result;
  };

  const chrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      getURL(file) {
        const url = `chrome-extension://${EXTENSION_ID}/${String(file).replace(/^\/+/, '')}`;
        state.urls.push(url);
        return url;
      },
      getManifest() { return { manifest_version: 3, version: '0.0.0-test' }; },
      onMessage: events.message,
      onInstalled: events.installed,
      onStartup: events.startup,
    },
    storage: {
      sync: {
        get(keys, callback) {
          const result = readSync(keys);
          if (typeof callback === 'function') {
            // A delayed callback models a settings refresh that is still in
            // flight. The value is already the new one; only delivery is late.
            const delay = state.syncDelayMs;
            if (delay > 0) {
              setTimeout(() => callback(result), delay);
              return undefined;
            }
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        },
        set(items, callback) {
          if (items && items.amazonPrimeSorterSettings) {
            state.settings = plain(items.amazonPrimeSorterSettings);
          }
          if (typeof callback === 'function') callback();
          return Promise.resolve();
        },
      },
      session: {
        async get(keys) { return readSession(keys); },
        async set(items) {
          if (state.failSessionWriteAfter !== null) {
            if (state.sessionWrites >= state.failSessionWriteAfter) {
              throw new Error('session storage rejected the write');
            }
            state.sessionWrites += 1;
          }
          Object.assign(state.session, plain(items));
        },
        async remove(keys) {
          for (const name of keyList(keys) || []) delete state.session[name];
        },
        async clear() {
          for (const name of Object.keys(state.session)) delete state.session[name];
        },
        async setAccessLevel() {},
      },
      onChanged: events.storageChanged,
    },
    declarativeNetRequest: {
      async getDynamicRules() { return plain(state.dynamic); },
      async updateDynamicRules({ addRules = [], removeRuleIds = [] } = {}) {
        const remove = new Set(removeRuleIds);
        state.dynamic = state.dynamic.filter((rule) => !remove.has(rule.id)).concat(plain(addRules));
        state.updates += 1;
      },
      async getSessionRules() { return plain(state.sessionRules); },
      async updateSessionRules({ addRules = [], removeRuleIds = [] } = {}) {
        if (state.failSessionRules && addRules.length) {
          throw new Error('session rules rejected');
        }
        const remove = new Set(removeRuleIds);
        state.sessionRules = state.sessionRules
          .filter((rule) => !remove.has(rule.id))
          .concat(plain(addRules));
        state.updates += 1;
      },
      async isRegexSupported() { return { isSupported: state.regexSupported }; },
      async getAvailableStaticRuleCount() { return 5000; },
    },
    tabs: {
      async get(tabId, callback) {
        const tab = state.tabs[tabId];
        if (!tab) {
          if (typeof callback === 'function') {
            callback(undefined);
            return undefined;
          }
          throw new Error('No tab with id');
        }
        const result = plain(tab);
        if (typeof callback === 'function') {
          callback(result);
          return undefined;
        }
        return result;
      },
      async getCurrent() {
        const first = Object.values(state.tabs)[0];
        return first ? plain(first) : undefined;
      },
      onRemoved: events.tabRemoved,
      onUpdated: events.tabUpdated,
    },
    alarms: {
      async create(name, info) { state.alarms.push({ name, info }); },
      async clear() { return true; },
      onAlarm: events.alarm,
    },
    action: {
      async setBadgeText({ text }) { state.badges.push(text); },
      async setBadgeBackgroundColor() {},
      async setTitle() {},
    },
    i18n: { getMessage(key) { return String(key); } },
    webRequest: {
      onBeforeRequest: events.webBeforeRequest,
      onCompleted: events.webCompleted,
      onErrorOccurred: events.webError,
      onBeforeRedirect: events.webRedirect,
    },
  };

  if (options.dnrAvailable === false) delete chrome.declarativeNetRequest;

  const context = vm.createContext({
    URL,
    chrome,
    console: {
      warn() {},
      log() {},
      error(...args) { state.logs.push(args.map(String).join(' ')); },
    },
    Date: class extends Date { static now() { return state.now; } },
    setTimeout(callback, ms) {
      const id = state.nextTimerId++;
      state.timers.push({ id, callback, ms });
      return id;
    },
    clearTimeout(id) {
      const index = state.timers.findIndex((timer) => timer.id === id);
      if (index !== -1) state.timers.splice(index, 1);
    },
    setInterval(callback, ms) {
      const id = state.nextTimerId++;
      state.timers.push({ id, callback, ms, interval: true });
      return id;
    },
    clearInterval(id) {
      const index = state.timers.findIndex((timer) => timer.id === id);
      if (index !== -1) state.timers.splice(index, 1);
    },
    importScripts(...files) {
      for (const file of files) {
        const target = path.posix.normalize(path.posix.join('chromium', file));
        vm.runInContext(read(target), context, { filename: target });
      }
    },
  });

  vm.runInContext(read('chromium/service-worker.js'), context, { filename: 'chromium/service-worker.js' });

  return { state, events, context, gateUrl: DEFAULT_GATE_URL, extensionId: EXTENSION_ID };
}

function readyPromises(context) {
  const found = [];
  const add = (value) => {
    if (value && typeof value.then === 'function' && !found.includes(value)) found.push(value);
  };
  for (const key of Object.keys(context)) {
    if (/ready$/i.test(key)) add(context[key]);
  }
  for (const name of ['gateReady', 'gatePrototypeReady', 'gateRuntimeReady']) {
    try {
      add(vm.runInContext(`typeof ${name} === 'undefined' ? null : ${name}`, context));
    } catch (err) {
      // name is simply not defined in this runtime
    }
  }
  return found;
}

async function settle(harness) {
  for (const promise of readyPromises(harness.context)) {
    let timer;
    await Promise.race([
      promise.catch(() => {}),
      new Promise((resolve) => { timer = setTimeout(resolve, 3000); }),
    ]);
    clearTimeout(timer);
  }
  for (let i = 0; i < 25; i += 1) await tick();
  const recorded = harness.state.urls.find((url) => /\.html$/.test(url));
  if (recorded) harness.gateUrl = recorded;
}

async function gateHarnessReady(options) {
  const harness = gateHarness(options);
  await settle(harness);
  return harness;
}

/* ------------------------------------------------------------ message helper */

async function send(harness, message, sender, timeoutMs = 2000) {
  const listeners = harness.events.message.listeners;
  let settled = false;
  let response;
  const sendResponse = (value) => {
    if (settled) return;
    settled = true;
    response = value;
  };
  for (const listener of listeners) {
    try {
      listener(message, sender, sendResponse);
    } catch (err) {
      harness.state.logs.push(`listener threw: ${err && err.message}`);
    }
  }
  // Wait for the answer, not for a fixed number of ticks: a prepare may
  // legitimately await a delayed storage callback.
  const deadline = Date.now() + timeoutMs;
  while (!settled && Date.now() < deadline) await tick();
  return response;
}

function gateSender(harness, tabId, source) {
  const url = `${harness.gateUrl}#${source}`;
  return {
    id: EXTENSION_ID,
    url,
    origin: `chrome-extension://${EXTENSION_ID}`,
    frameId: 0,
    tab: { id: tabId, url },
  };
}

function prepare(harness, { tabId, source, sender }) {
  const message = { type: 'prepare-gate', tabId, source };
  const actualSender = sender === undefined ? gateSender(harness, tabId, source) : sender;
  return send(harness, message, actualSender);
}

/** Register the gate document in the tab and ask for a target. */
function openGate(harness, tabId, source) {
  harness.state.tabs[tabId] = { id: tabId, url: `${harness.gateUrl}#${source}` };
  return prepare(harness, { tabId, source });
}

/** Change settings the way the popup does: storage.sync + onChanged. */
async function applySettings(harness, settings) {
  harness.state.settings = plain({ ...defaults, ...settings });
  for (const listener of harness.events.storageChanged.listeners) {
    listener({
      amazonPrimeSorterSettings: { oldValue: undefined, newValue: plain(harness.state.settings) },
    }, 'sync');
  }
  for (let i = 0; i < 25; i += 1) await tick();
}

function bypassRules(harness) {
  return harness.state.sessionRules.filter((rule) => rule.action && rule.action.type === 'allow');
}

function assertBypassRule(harness, response, tabId) {
  assert.equal(typeof response.bypassId, 'number');
  const rule = harness.state.sessionRules.find((item) => item.id === response.bypassId);
  assert.ok(rule, 'session allow rule must be installed before the worker answers');
  assert.equal(rule.action.type, 'allow');
  assert.ok(rule.priority > 1, 'bypass must outrank the gate redirect');
  assert.deepEqual(rule.condition.tabIds, [tabId]);
  assert.deepEqual(rule.condition.requestMethods, ['get']);
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
  assert.equal(rule.condition.isUrlFilterCaseSensitive, true);

  const hashIndex = response.target.indexOf('#');
  const targetNoHash = hashIndex === -1 ? response.target : response.target.slice(0, hashIndex);
  assert.ok(!/[*^|]/.test(targetNoHash), 'target base must not contain raw DNR operators');
  const expectedFilter = hashIndex === -1 ? `|${targetNoHash}|` : `|${targetNoHash}#*|`;
  assert.equal(rule.condition.urlFilter, expectedFilter);

  const matcher = urlFilterRegExp(rule.condition.urlFilter);
  assert.ok(matcher.test(response.target), 'bypass filter must match its own target');
  assert.ok(!matcher.test(`${targetNoHash}&unexpected=1`), 'bypass filter must stay exact');
  return rule;
}

function findGateRule(state) {
  return [...state.dynamic, ...state.sessionRules].find((rule) => rule && rule.action &&
    rule.action.type === 'redirect' && rule.action.redirect &&
    typeof rule.action.redirect.regexSubstitution === 'string' &&
    rule.action.redirect.regexSubstitution.includes('#'));
}

/* ------------------------------------------------------------------ gate rules */

test('gate rules redirect only the 19 Amazon www /s paths to the gate document', { skip: gateRulesSkip }, () => {
  const gateUrl = DEFAULT_GATE_URL;
  const rules = plain(gateRules.buildRules(defaults, marketplaces, gateUrl));
  assert.ok(rules.length > 0, 'gate redirect rules must exist');
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length, 'rule ids must be unique');

  for (const rule of rules) {
    assert.equal(rule.action.type, 'redirect');
    assert.ok(rule.action.redirect.regexSubstitution.startsWith(`${gateUrl}#`),
      'redirect must carry the raw source after the fragment');
    assert.ok(rule.action.redirect.regexSubstitution.includes('\\0'),
      'redirect must substitute the matched source URL');
    assert.equal(rule.action.redirect.transform, undefined, 'no queryTransform model any more');
    assert.equal(rule.condition.isUrlFilterCaseSensitive, true);
    assert.deepEqual(rule.condition.requestMethods, ['get']);
    assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
    assert.equal(typeof rule.condition.regexFilter, 'string');
    assert.ok(!/\(\?[!=<]|\\[1-9]/.test(rule.condition.regexFilter), 'RE2-incompatible construct');
  }

  const matches = (url) => rules.some((rule) => new RegExp(rule.condition.regexFilter).test(url));
  for (const marketplace of marketplaces) {
    const host = `https://www.${marketplace.domain}`;
    assert.ok(matches(`${host}/s?k=coffee`), `${marketplace.domain}: /s?k=`);
    assert.ok(matches(`${host}/s/ref=nb_sb_noss?k=coffee`), `${marketplace.domain}: /s/ref=`);
    assert.ok(matches(`${host}/-/en/s?k=coffee`), `${marketplace.domain}: /-/en/s?k=`);
    assert.ok(matches(`${host}/-/zh_CN/s/ref=nb_sb_noss?field-keywords=coffee`), `${marketplace.domain}: /-/zh_CN/s/ref=`);
    assert.ok(matches(`${host}/s?k=x#section`), `${marketplace.domain}: fragment`);
    for (const rejected of [
      `http://www.${marketplace.domain}/s?k=x`,
      `https://${marketplace.domain}/s?k=x`,
      `${host}/dp/B000000`,
      `${host}/-/en/dp/B000000`,
      `${host}/-/en/socks?k=x`,
      `${host}/-/s?k=x`,
      `${host}/search?k=x`,
      `${host}/socks?k=x`,
      `${host}/`,
      `https://www.${marketplace.domain}.evil.example/s?k=x`,
      `https://evil.example/s?k=x`,
    ]) {
      assert.equal(matches(rejected), false, `must not redirect ${rejected}`);
    }
  }

  assert.equal(plain(gateRules.buildRules({ ...defaults, enabled: false }, marketplaces, gateUrl)).length, 0);
  const narrowed = plain(gateRules.buildRules({ ...defaults, enabledMarketplaces: ['amazon.de'] }, marketplaces, gateUrl));
  assert.ok(narrowed.length > 0);
  for (const rule of narrowed) {
    const regex = new RegExp(rule.condition.regexFilter);
    assert.ok(regex.test('https://www.amazon.de/s?k=x'));
    assert.equal(regex.test('https://www.amazon.com/s?k=x'), false);
  }
});

test('parseSource accepts exactly the 19 www HTTPS /s paths', { skip: gateRulesSkip }, () => {
  for (const marketplace of marketplaces) {
    for (const suffix of ['/s', '/s?k=x', '/s/', '/s/ref=nb_sb_noss?k=x', '/s?k=x&rh=n%3A1', '/-/en/s?k=x', '/-/de/s/ref=nb_sb_noss?field-keywords=x']) {
      assert.ok(gateRules.parseSource(`https://www.${marketplace.domain}${suffix}`, marketplaces),
        `${marketplace.domain}${suffix} must be accepted`);
    }
  }
  for (const rejected of [
    'http://www.amazon.de/s?k=x',
    'https://amazon.de/s?k=x',
    'https://www.amazon.de/dp/B000000',
    'https://www.amazon.de/-/en/dp/B000000',
    'https://www.amazon.de/-/en/socks?k=x',
    'https://www.amazon.de/-/s?k=x',
    'https://www.amazon.de/search?k=x',
    'https://www.amazon.de/socks?k=x',
    'https://www.amazon.de/',
    'https://www.amazon.de.evil.example/s?k=x',
    'https://evil.www.amazon.de/s?k=x',
    'https://www.amazon.de:8443/s?k=x',
    'https://user:pass@www.amazon.de/s?k=x',
    `chrome-extension://${EXTENSION_ID}/chromium/gate.html#https://www.amazon.de/s?k=x`,
    '',
  ]) {
    assert.equal(gateRules.parseSource(rejected, marketplaces), null, `${rejected} must be rejected`);
  }
});

/* ------------------------------------------------------------- core parity */

const parityQueries = [
  '/s?k=coffee',
  '/s/ref=nb_sb_noss?field-keywords=coffee',
  '/s?k=',
  '/s?k=coffee&rh=n%3A123',
  '/s?rh=n%3A123&k=coffee',
  '/s?k=a%20b%26c%3D1&rh=n%3A123&tag=unchanged-21',
  '/s?field-keywords=caf%C3%A9&rh=n%3A123&k=second',
  '/s?k=x&rh=',
  '/s?rh&k=x',
  '/s?rh=&k=x&s=price-desc-rank',
  '/s?k=x&s=price-desc-rank',
  '/s?s=review-rank&k=x',
  '/s?k=x&s',
  '/s?k=x&s=',
  '/s?k=x&rh=p_85%3Aold',
  '/s?rh=n%3A123%2Cp_n_free_shipping_eligible%3Aold&k=x',
  '/s?k=x&rh=p_76%3Aold&s=price-desc-rank',
  '/s?k=x&rh=P_85%3AUPPERCASE',
  '/s?k=x&rh=n%3A123&ref=sr_1_1',
  '/s/ref=sr_st_sort?k=x',
  '/s/ref=sr_1_1?k=x&ref=nb_sb_noss',
  '/s/ref=sr_1_1?k=x&ref=',
  '/s/ref=sr_1_1?k=x&ref',
  '/s/ref=sr_1_1?k=x&ref=&ref=nb_sb_noss',
  '/s/ref=nb_sb_noss/ref=sr_1_1?k=x',
  '/s/foo/ref=sr_1_1/bar?k=x',
  '/s/ref=/ref=sr_1_1?k=x',
  '/s/ref=sr_1_1/ref=nb?k=x',
  '/s?k=x&ref=nb&ref=sr_1_1',
  '/s?k=x&ref=sr_1_1&ref=nb',
  '/s?%6B=x&r%68=n%3A123',
  '/s?%66ield-keywords=x&%73=review-rank',
  '/s?k=x&r%68=%70%5f%38%35%3Aold',
  '/s?k=x&ref=%73r%5F1_1',
  '/s?k=x&REF=sr_1_1',
  '/s?K=x',
  '/s?k=x&S=review-rank',
  '/s?k=x&rh=other#section',
  '/s?k=x#section',
  '/s?i=books',
];

test('prepare-gate matches the shared core for all 19 marketplaces', async () => {
  const combos = [
    {},
    { autoPrime: false, sortOption: 'review-rank' },
  ];
  for (const combo of combos) {
    const settings = { ...defaults, ...combo };
    const harness = await gateHarnessReady({ settings });
    let tabId = 100;
    for (const marketplace of marketplaces) {
      for (const query of parityQueries) {
        const source = `https://www.${marketplace.domain}${query}`;
        const response = await openGate(harness, tabId++, source);
        assert.ok(response && response.ok === true, `${marketplace.domain}${query} must be prepared`);
        assert.equal(response.target, expectedTarget(source, settings),
          `${marketplace.domain}${query} (Prime=${settings.autoPrime}, sort=${settings.autoSort}/${settings.sortOption})`);
      }
    }
    assert.equal(harness.state.logs.length, 0, 'no URL or setting may be logged');
  }
});

test('duplicate and encoded-empty rh parameters follow the core', async () => {
  const harness = await gateHarnessReady();
  for (const source of [
    'https://www.amazon.de/s?k=coffee&rh=n%3A123&x=1&rh=n%3A456',
    'https://www.amazon.de/s?k=x&r%68=&rh=B',
    'https://www.amazon.de/s?k=x&rh=&rh=B',
    'https://www.amazon.de/s?k=x&r%68=n%3A123',
  ]) {
    const response = await openGate(harness, 21, source);
    assert.equal(response.target, expectedTarget(source, defaults), source);
    const expected = core.buildRewrittenUrl(source, defaults).url;
    assert.deepEqual(
      new URL(response.target).searchParams.getAll('rh'),
      new URL(expected).searchParams.getAll('rh'),
      `${source}: rh must be normalized exactly like the core`,
    );
  }
  assert.equal(harness.state.logs.length, 0);
});

test('ref markers, fragments and empty fragments are preserved', async () => {
  const harness = await gateHarnessReady();
  const unchanged = [
    'https://www.amazon.de/s?k=x&ref=sr_1_1',
    'https://www.amazon.de/s/ref=sr_1_1?k=x',
    'https://www.amazon.de/s/ref=sr_st_sort?k=x',
  ];
  for (const source of unchanged) {
    const response = await openGate(harness, 31, source);
    assert.equal(response.ok, true);
    assert.equal(response.target, source, `${source} must stay untouched`);
    assertBypassRule(harness, response, 31);
  }

  const withHash = 'https://www.amazon.de/s?k=x#section';
  const hashed = await openGate(harness, 32, withHash);
  assert.equal(hashed.target, expectedTarget(withHash, defaults));
  assert.ok(hashed.target.endsWith('#section'), 'fragment must survive the rewrite');
  assertBypassRule(harness, hashed, 32);

  const emptyHash = 'https://www.amazon.de/s?k=x#';
  const empty = await openGate(harness, 33, emptyHash);
  assert.equal(empty.target, expectedTarget(emptyHash, defaults));
  assert.ok(empty.target.endsWith('#'), 'an empty fragment must not be dropped');
  assertBypassRule(harness, empty, 33);
  assert.equal(harness.state.logs.length, 0);
});

test('sort options and settings sync change the prepared target', async () => {
  const harness = await gateHarnessReady();
  const source = 'https://www.amazon.de/s?k=x';
  let tabId = 41;

  for (const sortOption of ['review-rank', 'price-desc-rank']) {
    await applySettings(harness, { ...defaults, sortOption });
    const response = await openGate(harness, tabId++, source);
    assert.equal(response.target, expectedTarget(source, harness.state.settings));
    assert.equal(new URL(response.target).searchParams.get('s'), sortOption);
  }

  await applySettings(harness, { ...defaults, autoSort: false });
  const noSort = await openGate(harness, tabId++, source);
  assert.equal(noSort.target, expectedTarget(source, harness.state.settings));
  assert.equal(new URL(noSort.target).searchParams.has('s'), false);

  await applySettings(harness, { ...defaults, autoPrime: false });
  const noPrime = await openGate(harness, tabId++, source);
  assert.equal(noPrime.target, expectedTarget(source, harness.state.settings));
  assert.equal(new URL(noPrime.target).searchParams.has('rh'), false);

  await applySettings(harness, { ...defaults, autoPrime: false, autoSort: false });
  const nothing = await openGate(harness, tabId++, source);
  assert.equal(nothing.ok, true);
  assert.equal(nothing.target, source);
  assert.equal(harness.state.logs.length, 0);
});

test('prepare uses freshly read settings, not the init snapshot', async () => {
  const harness = await gateHarnessReady();
  const source = 'https://www.amazon.de/s?k=fresh';

  // Baseline: with the init snapshot the URL is rewritten.
  const initial = await openGate(harness, 101, source);
  assert.equal(initial.ok, true);
  assert.equal(initial.target, expectedTarget(source, defaults));

  // Settings change after init. storage.sync already holds enabled:false, but
  // the worker's own refresh is still in flight: the onChanged handler is
  // fired and the next sync.get callback is deliberately delayed. prepare must
  // not answer from the stale init snapshot in that window.
  harness.state.settings = plain({ ...defaults, enabled: false });
  harness.state.syncDelayMs = 60;
  for (const listener of harness.events.storageChanged.listeners) {
    listener({
      amazonPrimeSorterSettings: { oldValue: plain(defaults), newValue: plain(harness.state.settings) },
    }, 'sync');
  }

  // No settle/flush before prepare: the delayed callback must still be pending.
  const response = await openGate(harness, 102, source);
  assert.equal(response.ok, true);
  assert.equal(response.target, source, 'prepare must read the fresh settings, not the init snapshot');
  assert.equal(harness.state.logs.length, 0);
});

test('disabled marketplaces and the global off switch leave URLs untouched', async () => {
  const source = 'https://www.amazon.de/s?k=x';

  const off = await gateHarnessReady({ settings: { ...defaults, enabled: false } });
  const offResponse = await openGate(off, 51, source);
  assert.equal(offResponse.ok, true);
  assert.equal(offResponse.target, source);

  const narrowed = await gateHarnessReady({ settings: { ...defaults, enabledMarketplaces: ['amazon.com'] } });
  const narrowedResponse = await openGate(narrowed, 52, source);
  assert.equal(narrowedResponse.ok, true);
  assert.equal(narrowedResponse.target, source);

  const allowed = await gateHarnessReady({ settings: { ...defaults, enabledMarketplaces: ['amazon.de'] } });
  const allowedResponse = await openGate(allowed, 53, source);
  assert.equal(allowedResponse.ok, true);
  assert.equal(allowedResponse.target, expectedTarget(source, { ...defaults, enabledMarketplaces: ['amazon.de'] }));
});

test('unicode searches are rewritten exactly like the core', async () => {
  const harness = await gateHarnessReady();
  for (const source of [
    'https://www.amazon.de/s?field-keywords=caf%C3%A9',
    'https://www.amazon.de/s?k=Stra%C3%9Fe&rh=n%3A1',
    'https://www.amazon.co.jp/s?k=%E3%82%B3%E3%83%BC%E3%83%92%E3%83%BC',
  ]) {
    const response = await openGate(harness, 61, source);
    assert.equal(response.target, expectedTarget(source, defaults), source);
    assert.equal(harness.state.logs.length, 0);
  }
});

test('DNR wildcard characters are encoded literally in target and bypass filter', async () => {
  const harness = await gateHarnessReady({ settings: { ...defaults, autoSort: false } });

  // Rewritten path: URLSearchParams re-serialization already escapes ^ and |,
  // but a raw * survives and must be encoded for the DNR filter.
  const rewrittenSource = 'https://www.amazon.de/s?k=a*b^c|d&rh=n%3A1';
  const rewritten = await openGate(harness, 71, rewrittenSource);
  assert.equal(rewritten.target, expectedTarget(rewrittenSource, harness.state.settings));
  assert.ok(!rewritten.target.split('#')[0].includes('*'), 'raw * must be percent-encoded');
  assertBypassRule(harness, rewritten, 71);

  // Untouched path: raw operators survive the core and must still be encoded.
  const untouchedSource = 'https://www.amazon.de/s?k=a^b|c&rh=p_85%3A1';
  const untouched = await openGate(harness, 72, untouchedSource);
  assert.equal(untouched.target, expectedTarget(untouchedSource, harness.state.settings));
  assert.ok(untouched.target.includes('%5E') && untouched.target.includes('%7C'));
  assertBypassRule(harness, untouched, 72);
});

test('bypass rules are exact, per tab and limited to GET main_frame', async () => {
  const harness = await gateHarnessReady();
  const source = 'https://www.amazon.de/s?k=exact';
  const response = await openGate(harness, 81, source);
  const rule = assertBypassRule(harness, response, 81);

  assert.deepEqual(rule.condition.tabIds, [81]);
  const matcher = urlFilterRegExp(rule.condition.urlFilter);
  assert.ok(!matcher.test(response.target.replace('exact', 'other')), 'other queries must not be allowed');
  assert.equal(bypassRules(harness).length, 1, 'exactly one bypass per prepared gate');
});

/* --------------------------------------------------------------- sender/scope */

test('prepare-gate requires the exact gate document of this extension', async () => {
  const harness = await gateHarnessReady();
  const source = 'https://www.amazon.de/s?k=x';
  const before = harness.state.sessionRules.length;

  const cases = [
    ['wrong fragment', { id: EXTENSION_ID, url: `${harness.gateUrl}#https://www.amazon.de/s?k=y`, frameId: 0 }],
    ['no fragment', { id: EXTENSION_ID, url: harness.gateUrl, frameId: 0 }],
    ['foreign url', { id: EXTENSION_ID, url: source, frameId: 0 }],
    ['foreign extension', { id: 'other-extension', url: `${harness.gateUrl}#${source}`, frameId: 0 }],
    ['sub frame', { id: EXTENSION_ID, url: `${harness.gateUrl}#${source}`, frameId: 1 }],
    ['missing sender', null],
  ];
  for (const [label, sender] of cases) {
    const response = await prepare(harness, { tabId: 91, source, sender });
    assert.equal(response && response.ok, false, `${label} must be rejected`);
    assert.equal(harness.state.sessionRules.length, before, `${label} must not install a rule`);
  }

  for (const message of [
    { type: 'prepare-gate', tabId: 'x', source },
    { type: 'prepare-gate', tabId: -1, source },
    { type: 'prepare-gate', tabId: 1.5, source },
    { type: 'prepare-gate', tabId: 91 },
    { type: 'prepare-gate', tabId: 91, source: 42 },
  ]) {
    const response = await send(harness, message, gateSender(harness, 91, source));
    assert.equal(response && response.ok, false, `invalid message ${JSON.stringify(message)} must be rejected`);
    assert.equal(harness.state.sessionRules.length, before);
  }

  const other = await send(harness, { type: 'other' }, gateSender(harness, 91, source), 50);
  assert.equal(other, undefined, 'unrelated messages must be ignored');
  assert.equal(harness.state.sessionRules.length, before);
  assert.equal(harness.state.logs.length, 0);
});

test('prepare-gate requires the tab to still show the gate document', async () => {
  const harness = await gateHarnessReady();
  const source = 'https://www.amazon.de/s?k=x';
  const before = harness.state.sessionRules.length;

  harness.state.tabs[92] = { id: 92, url: 'https://www.amazon.de/s?k=other' };
  const moved = await prepare(harness, { tabId: 92, source });
  assert.equal(moved && moved.ok, false, 'a navigated tab must be rejected');
  assert.equal(harness.state.sessionRules.length, before);

  delete harness.state.tabs[93];
  const missing = await prepare(harness, { tabId: 93, source });
  assert.equal(missing && missing.ok, false, 'a missing tab must be rejected');
  assert.equal(harness.state.sessionRules.length, before);
});

test('sources outside the 19 www HTTPS /s paths are rejected', async () => {
  const harness = await gateHarnessReady();
  const before = harness.state.sessionRules.length;
  const rejected = [
    'http://www.amazon.de/s?k=x',
    'https://amazon.de/s?k=x',
    'https://www.amazon.de/dp/B000000',
    'https://www.amazon.de/search?k=x',
    'https://www.amazon.de/socks?k=x',
    'https://www.amazon.de.evil.example/s?k=x',
    'https://evil.www.amazon.de/s?k=x',
    'https://www.amazon.de:8443/s?k=x',
    'https://user:pass@www.amazon.de/s?k=x',
    '',
  ];
  for (const source of rejected) {
    const response = await openGate(harness, 94, source);
    assert.equal(response && response.ok, false, `${source.slice(0, 60)} must be rejected`);
    assert.equal(harness.state.sessionRules.length, before, 'rejected sources must not install a rule');
  }

  // The prototype capped sources at 8192 characters. Dropping that cap is an
  // explicit acceptance criterion, so a clearly longer source must be prepared
  // with full core parity while the mocked APIs work. Real browser limits on
  // urlFilter length stay a separate, non-offline gate.
  const long = `https://www.amazon.de/s?k=${'a'.repeat(9000)}`;
  assert.ok(long.length > 8192);
  const longResponse = await openGate(harness, 99, long);
  assert.equal(longResponse && longResponse.ok, true, 'long sources must not be rejected');
  assert.equal(longResponse.target, expectedTarget(long, defaults), 'long sources must match the core');
  assertBypassRule(harness, longResponse, 99);
  assert.equal(harness.state.logs.length, 0);
});

/* ------------------------------------------------------------ gate rule + init */

test('the gate redirect rule is installed and unsupported regex is visible', async () => {
  const harness = await gateHarnessReady();
  const gateRule = findGateRule(harness.state);
  assert.ok(gateRule, 'a redirect rule to the gate document must be installed');
  assert.ok(gateRule.action.redirect.regexSubstitution.startsWith(`${harness.gateUrl}#`));
  assert.ok(gateRule.action.redirect.regexSubstitution.includes('\\0'));

  // Without regex support no gate rule is installed and the failure is visible
  // on the badge. A gate page that is already open may still pass its source
  // through, but only with the same exact per-tab bypass as a normal run.
  const unsupported = await gateHarnessReady({ regexSupported: false });
  assert.equal(findGateRule(unsupported.state), undefined, 'no gate rule without regex support');
  assert.ok(unsupported.state.badges.includes('!'), 'an unsupported regex must be visible on the badge');
  const passedThrough = await openGate(unsupported, 95, 'https://www.amazon.de/s?k=x');
  assert.equal(passedThrough && passedThrough.ok, true, 'an open gate must still be able to pass through');
  assertBypassRule(unsupported, passedThrough, 95);
  assert.equal(unsupported.state.sessionRules.length, 1, 'only the exact bypass may be added');

  // A missing DNR API is the hard failure: no target, no rule, no state.
  const noDnr = await gateHarnessReady({ dnrAvailable: false });
  const rejected = await openGate(noDnr, 96, 'https://www.amazon.de/s?k=x');
  assert.equal(rejected && rejected.ok, false, 'prepare must fail closed without DNR');
  assert.equal(rejected.target, undefined, 'no target may be handed out');
  assert.equal(noDnr.state.sessionRules.length, 0);
});

test('a rejected session rule update returns no target', async () => {
  const harness = await gateHarnessReady({ failSessionRules: true });
  const source = 'https://www.amazon.de/s?k=x';
  const response = await openGate(harness, 97, source);
  assert.equal(response && response.ok, false, 'prepare must fail closed');
  assert.equal(response.target, undefined, 'no target may be handed out');
  assert.equal(bypassRules(harness).length, 0, 'no allow rule may survive');
  assert.ok(findGateRule(harness.state), 'the gate redirect must stay installed');
});

test('a failed storage.session write rolls the bypass back', async () => {
  // First write succeeds, the write after adding the rule fails: the worker
  // must remove the rule again instead of answering with a target.
  const harness = await gateHarnessReady({ failSessionWriteAfter: 1 });
  const source = 'https://www.amazon.de/s?k=x';
  const response = await openGate(harness, 98, source);
  assert.equal(response && response.ok, false, 'prepare must fail closed');
  assert.equal(response.target, undefined, 'no target may be handed out');
  assert.equal(bypassRules(harness).length, 0, 'the bypass must be rolled back');
});

test('a restarted worker keeps the loop guard and bypass from storage.session', async () => {
  const source = 'https://www.amazon.de/s?k=restart';
  const first = await gateHarnessReady();
  const response = await openGate(first, 96, source);
  assert.equal(response.ok, true);
  assert.equal(response.target, expectedTarget(source, defaults));

  const second = await gateHarnessReady({
    session: first.state.session,
    sessionRules: first.state.sessionRules,
    dynamic: first.state.dynamic,
    tabs: { 96: { id: 96, url: `${first.gateUrl}#${source}` } },
    now: first.state.now + 100,
  });

  assert.ok(second.state.sessionRules.some((rule) => rule.id === response.bypassId),
    'the persisted bypass must survive the restart');
  const again = await prepare(second, { tabId: 96, source });
  assert.equal(again.ok, true);
  assert.equal(again.target, source, 'the restored guard must stop a second rewrite');
});

test('language-prefixed search paths are rewritten and refinements stay untouched', async () => {
  const harness = await gateHarnessReady();
  const fresh = 'https://www.amazon.de/-/en/s?k=hdmi+kabel';
  const prepared = await openGate(harness, 111, fresh);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.target, expectedTarget(fresh, defaults));
  assert.ok(prepared.target.includes('p_n_free_shipping_eligible'));
  assert.ok(prepared.target.includes('s=price-asc-rank'));

  const refine = 'https://www.amazon.de/-/en/s?k=hdmi+kabel&ref=sr_pg_2';
  const untouched = await openGate(harness, 112, refine);
  assert.equal(untouched.ok, true);
  assert.equal(untouched.target, refine);
});

test('storage.js handles runtime.lastError and falls back to storage.local', async () => {
  const localStore = {};
  const chromeMock = {
    runtime: { lastError: undefined },
    storage: {
      sync: {
        get(_keys, callback) {
          chromeMock.runtime.lastError = { message: 'Sync disabled' };
          callback(undefined);
          chromeMock.runtime.lastError = undefined;
        },
        set(_items, callback) {
          chromeMock.runtime.lastError = { message: 'Sync disabled' };
          callback();
          chromeMock.runtime.lastError = undefined;
        },
      },
      local: {
        get(keys, callback) {
          const out = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            if (Object.prototype.hasOwnProperty.call(localStore, k)) out[k] = plain(localStore[k]);
          }
          callback(out);
        },
        set(items, callback) {
          Object.assign(localStore, plain(items));
          callback();
        },
      },
      onChanged: createEvent(),
    },
  };

  const ctx = vm.createContext({ URL, console, chrome: chromeMock });
  vm.runInContext(read('lib/storage.js'), ctx, { filename: 'lib/storage.js' });

  const initial = await ctx.getSettings();
  assert.equal(initial.enabled, true);

  await ctx.saveSettings({ ...defaults, autoSort: false, sortOption: 'review-rank' });
  const loaded = await ctx.getSettings();
  assert.equal(loaded.autoSort, false);
  assert.equal(loaded.sortOption, 'review-rank');
  assert.equal(localStore.amazonPrimeSorterSettings.autoSort, false);
});

test('all 19 marketplaces have non-null primeFacet and rewrite fresh searches with rh + s', () => {
  const all = core.getAllMarketplaces();
  assert.equal(all.length, 19);

  const expectedNewFacets = {
    'amazon.ca': 'p_85:5690392011',
    'amazon.se': 'p_n_free_shipping_eligible:20692900031',
    'amazon.co.jp': 'p_n_free_shipping_eligible:8070708051',
    'amazon.com.au': 'p_n_free_shipping_eligible:5363790051',
    'amazon.sg': 'p_n_free_shipping_eligible:6966031051',
    'amazon.ae': 'p_n_free_shipping_eligible:15397661031',
    'amazon.eg': 'p_n_free_shipping_eligible:21909080031',
    'amazon.com.tr': 'p_n_free_shipping_eligible:21345962031',
  };

  for (const mp of all) {
    assert.ok(typeof mp.primeFacet === 'string' && mp.primeFacet.includes(':'), `${mp.domain} missing primeFacet`);
  }

  for (const [domain, facet] of Object.entries(expectedNewFacets)) {
    const res = core.buildRewrittenUrl(`https://www.${domain}/s?k=usb+cable`, defaults);
    assert.ok(res && res.primeChanged === true && res.sortChanged === true, `${domain} should rewrite Prime and sort`);
    const parsed = new URL(res.url);
    assert.equal(parsed.searchParams.get('rh'), facet, `${domain} rh mismatch`);
    assert.equal(parsed.searchParams.get('s'), 'price-asc-rank', `${domain} sort mismatch`);
  }
});
