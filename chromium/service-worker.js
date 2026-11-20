/* Chromium MV3. Blocking webRequest is deliberately NOT used.
 *
 * Fresh Amazon searches are redirected by declarativeNetRequest to
 * chromium/gate.html#<original URL>. The gate page asks this worker for the
 * rewritten target. The worker reuses the shared rewrite core
 * (lib/storage.js + lib/rewrite.js), installs a short-lived exact session
 * allow rule for that target and only then answers. The gate navigates last.
 *
 * Only production code lives here: no test hooks, no loopback hosts.
 */
'use strict';
importScripts('../lib/storage.js', '../lib/rewrite.js', 'gate-rules.js');

const dnr = chrome.declarativeNetRequest;
const GATE_URL = chrome.runtime.getURL('chromium/gate.html');
const GUARD_WINDOW_MS = 5000;
const BYPASS_TTL_MS = 15000;
const BYPASS_RULE_BASE_ID = 1000;
const BYPASS_PRIORITY = 100000;
// Older Chromium builds used session guard rules in this id range. They are
// unknown to this worker and are removed during reconciliation.
const LEGACY_GUARD_ID_START = 1000000;
const SWEEP_ALARM = 'primeSorterGateSweep';
const NEUTRAL_ERROR = 'Preparation failed.';

const K_COUNTER = 'primeSorterGate.counter';
const K_GUARDS = 'primeSorterGate.guards';
const K_BYPASSES = 'primeSorterGate.bypasses';

const guards = new Map(); // tabId -> { originalUrlNoHash, at }
const bypasses = new Map(); // ruleId -> { ruleId, tabId, target, targetNoHash, createdAt, requestId, pendingRemoval }
const requestBindings = new Map(); // requestId -> ruleId
const tabQueues = new Map(); // tabId -> Promise

let ruleCounter = 0;
let dnrAvailable = false;
let eventsReady = false;
let ruleQueue = Promise.resolve();
let persistQueue = Promise.resolve();

/* ------------------------------------------------------------------ helpers */

function fail() {
  return { ok: false, error: NEUTRAL_ERROR };
}

function stripHash(url) {
  const index = url.indexOf('#');
  return index === -1 ? url : url.slice(0, index);
}

/**
 * DNR urlFilter treats *, ^ and | as operators. Encode raw occurrences before
 * the fragment so the same string can be used as a literal filter and as the
 * returned target. The fragment is not part of the request URL and stays as is.
 */
function canonicalizeTarget(url) {
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const encoded = base
    .replace(/\*/g, '%2A')
    .replace(/\^/g, '%5E')
    .replace(/\|/g, '%7C');
  return encoded + hash;
}

function runSerial(tabId, fn) {
  const previous = tabQueues.get(tabId) || Promise.resolve();
  const next = previous.then(fn, fn);
  const tracked = next.catch(() => {});
  tabQueues.set(tabId, tracked);
  tracked.then(() => {
    if (tabQueues.get(tabId) === tracked) tabQueues.delete(tabId);
  });
  return next;
}

async function tabMatchesSender(tabId, senderUrl) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || typeof tab.url !== 'string') return false;
    if (tab.url === senderUrl) return true;
    try {
      return new URL(tab.url).href === new URL(senderUrl).href;
    } catch (err) {
      return false;
    }
  } catch (err) {
    return false;
  }
}

/* --------------------------------------------------------------- persistence */

/**
 * One global persist chain. The snapshot is read inside the queued function at
 * execution time, so an older snapshot can never overwrite newer state.
 */
function enqueuePersist(fn) {
  const run = persistQueue.then(fn, fn);
  persistQueue = run.catch(() => {});
  return run;
}

function queuePersist() {
  return enqueuePersist(async () => {
    const guardsPlain = {};
    for (const [tabId, guard] of guards) guardsPlain[String(tabId)] = guard;
    const bypassPlain = {};
    for (const [ruleId, record] of bypasses) bypassPlain[String(ruleId)] = record;
    await chrome.storage.session.set({
      [K_COUNTER]: ruleCounter,
      [K_GUARDS]: guardsPlain,
      [K_BYPASSES]: bypassPlain
    });
  });
}

async function tryRemoveRule(ruleId) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
    return true;
  } catch (err) {
    return false;
  }
}

/** Keep the record until the DNR removal actually succeeded. */
async function removeAndPersist(ruleId) {
  const record = bypasses.get(ruleId);
  if (!record) return;
  record.pendingRemoval = true;
  const removed = await tryRemoveRule(ruleId);
  if (removed) {
    if (record.requestId) requestBindings.delete(record.requestId);
    bypasses.delete(ruleId);
  }
  await queuePersist();
}

async function loadState() {
  let data;
  try {
    data = await chrome.storage.session.get([K_COUNTER, K_GUARDS, K_BYPASSES]);
  } catch (err) {
    return;
  }
  if (Number.isInteger(data[K_COUNTER]) && data[K_COUNTER] >= 0) {
    ruleCounter = data[K_COUNTER];
  }
  const storedGuards = data[K_GUARDS];
  if (storedGuards && typeof storedGuards === 'object') {
    for (const [key, guard] of Object.entries(storedGuards)) {
      const tabId = Number(key);
      if (!Number.isInteger(tabId) || tabId < 0) continue;
      if (!guard || typeof guard.originalUrlNoHash !== 'string') continue;
      if (!Number.isFinite(guard.at)) continue;
      guards.set(tabId, { originalUrlNoHash: guard.originalUrlNoHash, at: guard.at });
    }
  }
  const storedBypasses = data[K_BYPASSES];
  if (storedBypasses && typeof storedBypasses === 'object') {
    for (const [key, record] of Object.entries(storedBypasses)) {
      const ruleId = Number(key);
      if (!Number.isInteger(ruleId) || ruleId <= BYPASS_RULE_BASE_ID) continue;
      if (!record || record.ruleId !== ruleId) continue;
      if (!Number.isInteger(record.tabId) || typeof record.target !== 'string') continue;
      if (typeof record.targetNoHash !== 'string' || !Number.isFinite(record.createdAt)) continue;
      const normalized = {
        ruleId,
        tabId: record.tabId,
        target: record.target,
        targetNoHash: record.targetNoHash,
        createdAt: record.createdAt,
        requestId: typeof record.requestId === 'string' ? record.requestId : null,
        pendingRemoval: record.pendingRemoval === true
      };
      bypasses.set(ruleId, normalized);
      if (normalized.requestId) requestBindings.set(normalized.requestId, ruleId);
    }
  }
}

/* ----------------------------------------------------------------- DNR setup */

/**
 * Reconcile persisted state with the live session rules. Runs before any new
 * rule is installed, so a previous worker instance stays intact until its
 * orphaned state has been identified.
 */
async function reconcileSessionRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const liveIds = new Set(rules.map((rule) => rule.id));
    let changed = false;
    let maxKnown = 0;
    const unknown = [];
    for (const rule of rules) {
      if (rule.id > maxKnown && rule.id < LEGACY_GUARD_ID_START) maxKnown = rule.id;
      if (!bypasses.has(rule.id)) unknown.push(rule.id);
    }
    if (maxKnown > BYPASS_RULE_BASE_ID && maxKnown - BYPASS_RULE_BASE_ID > ruleCounter) {
      ruleCounter = maxKnown - BYPASS_RULE_BASE_ID;
      changed = true;
    }
    if (unknown.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: unknown });
      changed = true;
    }
    // Records without a live DNR rule are stale and must not survive.
    for (const [ruleId, record] of bypasses) {
      if (liveIds.has(ruleId)) continue;
      if (record.requestId) requestBindings.delete(record.requestId);
      bypasses.delete(ruleId);
      changed = true;
    }
    if (changed) await queuePersist();
  } catch (err) {
    // prepare still fails closed on rule errors
  }
}

function reportFailure() {
  // Never log a URL, query, regex, API error payload, or search term.
  console.error('[Prime Sorter] Chromium gate rules or loop protection could not be updated.');
  chrome.action.setBadgeText({ text: '!' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' }).catch(() => {});
  chrome.action.setTitle({
    title: chrome.i18n.getMessage('rulesErrorTitle') || 'Prime Filter & Price Sort: rules need attention. Reload the extension.'
  }).catch(() => {});
}

async function clearFailure() {
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (err) {
    // Badge is cosmetic; rule installation must not fail because of it.
  }
  try {
    await chrome.action.setTitle({ title: chrome.i18n.getMessage('extensionName') });
  } catch (err) {
    // Title is cosmetic as well.
  }
}

/**
 * Replace every dynamic rule with the current settings-driven gate rules. This
 * also removes the 219 legacy redirect rules from the previous Chromium build.
 */
async function syncGateRules() {
  const settings = await getSettings();
  const rules = PrimeSorterChromiumGateRules.buildRules(
    settings, getAllMarketplaces(), GATE_URL);
  const existing = await dnr.getDynamicRules();
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const sorted = {};
      for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
      return sorted;
    }
    return value;
  };
  const stable = (items) => JSON.stringify(canonical([...items].sort((a, b) => a.id - b.id)));
  if (stable(existing) !== stable(rules)) {
    // Do not silently install a partial ruleset if RE2 rejects a condition.
    for (const rule of rules) {
      const requireCapturing = Boolean(rule.action.redirect?.regexSubstitution);
      const result = await dnr.isRegexSupported({
        regex: rule.condition.regexFilter,
        isCaseSensitive: true,
        requireCapturing
      });
      if (!result || !result.isSupported) throw new Error('Unsupported Chromium gate rule');
    }
    await dnr.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: rules
    });
  }
  await clearFailure();
}

function queueRules() {
  ruleQueue = ruleQueue.then(syncGateRules).catch(() => {
    reportFailure();
  });
  return ruleQueue;
}

/* -------------------------------------------------------------------- sweeps */

async function sweep() {
  const now = Date.now();
  let changed = false;
  const toRemove = [];

  for (const [tabId, guard] of guards) {
    if (now - guard.at > GUARD_WINDOW_MS) {
      guards.delete(tabId);
      changed = true;
    }
  }
  for (const [ruleId, record] of bypasses) {
    if (record.pendingRemoval || now - record.createdAt > BYPASS_TTL_MS) {
      record.pendingRemoval = true;
      toRemove.push(ruleId);
    }
  }

  for (const ruleId of toRemove) {
    if (!(await tryRemoveRule(ruleId))) continue;
    const record = bypasses.get(ruleId);
    if (record && record.requestId) requestBindings.delete(record.requestId);
    bypasses.delete(ruleId);
    changed = true;
  }
  if (changed) await queuePersist();
}

function scheduleSweep(delayMs) {
  try {
    setTimeout(() => {
      sweep().catch(() => {});
    }, delayMs);
  } catch (err) {
    // timer is best effort only
  }
}

/* --------------------------------------------------------------- webRequest */

function onBeforeRequest(details) {
  if (!details || typeof details.tabId !== 'number' || details.tabId < 0) return;
  const urlNoHash = stripHash(details.url);
  let match = null;
  for (const record of bypasses.values()) {
    if (record.tabId !== details.tabId) continue;
    if (record.pendingRemoval) continue;
    if (record.requestId !== null) continue;
    if (record.targetNoHash !== urlNoHash) continue;
    if (!match || record.createdAt > match.createdAt) match = record;
  }
  if (!match) return;
  match.requestId = details.requestId;
  requestBindings.set(details.requestId, match.ruleId);
  queuePersist().catch(() => {});
}

/** Remove only the bypass bound to this request, never newer ones in the tab. */
function releaseByRequestId(requestId) {
  const ruleId = requestBindings.get(requestId);
  if (ruleId === undefined) return;
  requestBindings.delete(requestId);
  const record = bypasses.get(ruleId);
  if (!record) return;
  record.pendingRemoval = true;
  removeAndPersist(ruleId).catch(() => {});
}

function runWhenReady(fn) {
  if (eventsReady) {
    fn();
    return;
  }
  gateReady.then(() => {
    if (eventsReady) fn();
  }, () => {});
}

/* ------------------------------------------------------------------ prepare */

async function rollbackPrepare(ruleId, tabId, hadGuard, recordSeed) {
  if (hadGuard) guards.delete(tabId);
  let record = bypasses.get(ruleId);
  if (!record && recordSeed) {
    record = { ...recordSeed, pendingRemoval: true };
    bypasses.set(ruleId, record);
  } else if (record) {
    record.pendingRemoval = true;
  }
  const removed = await tryRemoveRule(ruleId);
  if (removed) {
    if (record && record.requestId) requestBindings.delete(record.requestId);
    bypasses.delete(ruleId);
  }
  await queuePersist().catch(() => {});
}

async function prepareGate(message, sender) {
  if (!sender || sender.id !== chrome.runtime.id) return fail();
  if (typeof sender.url !== 'string') return fail();
  if (typeof sender.frameId === 'number' && sender.frameId !== 0) return fail();
  if (!Number.isInteger(message.tabId) || message.tabId < 0) return fail();
  if (typeof message.source !== 'string') return fail();

  const gatePrefix = GATE_URL + '#';
  if (!sender.url.startsWith(gatePrefix)) return fail();
  if (sender.url.slice(gatePrefix.length) !== message.source) return fail();

  if (!PrimeSorterChromiumGateRules.parseSource(message.source, getAllMarketplaces())) return fail();

  const tabId = message.tabId;

  await gateReady;

  // A gate page that is already open must still be able to pass its source
  // through, even when no gate rule is installed any more (settings off, or
  // rules not installable). Only a missing DNR API is a hard failure.
  if (!dnrAvailable) return fail();
  if (!(await tabMatchesSender(tabId, sender.url))) return fail();

  return runSerial(tabId, async () => {
    // Re-check inside the queue: a superseded gate page must not install state.
    if (!(await tabMatchesSender(tabId, sender.url))) return fail();

    const now = Date.now();
    const sourceNoHash = stripHash(message.source);
    let target = message.source;
    let rewritten = false;

    const guard = guards.get(tabId);
    let loop = false;
    if (guard) {
      if (now - guard.at > GUARD_WINDOW_MS) {
        guards.delete(tabId);
        await queuePersist().catch(() => {});
      } else if (guard.originalUrlNoHash === sourceNoHash) {
        loop = true;
      }
    }

    if (!loop) {
      // A settings change can still be queued for dynamic-rule sync. Read the
      // current value here so an already-open gate respects a fresh toggle.
      const settings = await getSettings();
      if (!settings) return fail();
      if (!(await tabMatchesSender(tabId, sender.url))) return fail();

      let result = null;
      try {
        result = buildRewrittenUrl(message.source, settings);
      } catch (err) {
        result = null;
      }

      if (result && typeof result.url === 'string') {
        target = result.url;
        rewritten = true;
      }
    }

    const canonicalTarget = canonicalizeTarget(target);
    if (!PrimeSorterChromiumGateRules.parseSource(canonicalTarget, getAllMarketplaces())) return fail();
    const targetNoHash = stripHash(canonicalTarget);

    // DNR matches the fragment. A literal network-URL anchor without a hash can
    // therefore never match a target that carries one. Allow the wildcard only
    // behind the fixed '#': path and query stay identical, a different fragment
    // is not a different network request. The fragment itself is not rewritten.
    const bypassFilter = canonicalTarget.includes('#')
      ? `|${targetNoHash}#*|`
      : `|${targetNoHash}|`;

    ruleCounter += 1;
    const ruleId = BYPASS_RULE_BASE_ID + ruleCounter;
    try {
      await queuePersist();
    } catch (err) {
      return fail();
    }
    if (!(await tabMatchesSender(tabId, sender.url))) return fail();

    const rule = {
      id: ruleId,
      priority: BYPASS_PRIORITY,
      action: { type: 'allow' },
      condition: {
        urlFilter: bypassFilter,
        isUrlFilterCaseSensitive: true,
        requestMethods: ['get'],
        resourceTypes: ['main_frame'],
        tabIds: [tabId]
      }
    };
    const recordSeed = {
      ruleId,
      tabId,
      target: canonicalTarget,
      targetNoHash,
      createdAt: Date.now(),
      requestId: null,
      pendingRemoval: false
    };

    let added = false;
    try {
      if (!(await tabMatchesSender(tabId, sender.url))) return fail();
      added = true;
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule] });
    } catch (err) {
      if (added) await rollbackPrepare(ruleId, tabId, false, recordSeed);
      return fail();
    }

    bypasses.set(ruleId, recordSeed);
    try {
      await queuePersist();
    } catch (err) {
      await rollbackPrepare(ruleId, tabId, false, recordSeed);
      return fail();
    }

    if (!(await tabMatchesSender(tabId, sender.url))) {
      await rollbackPrepare(ruleId, tabId, false, recordSeed);
      return fail();
    }

    if (rewritten) {
      // Timestamp at the moment the guard is actually stored, not the prepare
      // start time, so slow DNR/storage calls cannot shorten the window.
      guards.set(tabId, { originalUrlNoHash: sourceNoHash, at: Date.now() });
      try {
        await queuePersist();
      } catch (err) {
        await rollbackPrepare(ruleId, tabId, true, recordSeed);
        return fail();
      }
    }

    if (!(await tabMatchesSender(tabId, sender.url))) {
      await rollbackPrepare(ruleId, tabId, rewritten, recordSeed);
      return fail();
    }

    scheduleSweep(BYPASS_TTL_MS + 100);
    return { ok: true, target: canonicalTarget, bypassId: ruleId };
  });
}

/* --------------------------------------------------------------- listeners */

// Register event listeners synchronously, before awaiting settings or rules.
chrome.runtime.onInstalled.addListener(queueRules);
chrome.runtime.onStartup.addListener(queueRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' || area === 'local') && changes.amazonPrimeSorterSettings) queueRules();
});

if (chrome.webRequest) {
  const filter = {
    urls: getAllMarketplaces().map((marketplace) => `https://www.${marketplace.domain}/*`),
    types: ['main_frame']
  };
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => runWhenReady(() => onBeforeRequest(details)),
    filter
  );
  chrome.webRequest.onCompleted.addListener(
    (details) => runWhenReady(() => releaseByRequestId(details.requestId)),
    filter
  );
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => runWhenReady(() => releaseByRequestId(details.requestId)),
    filter
  );
  chrome.webRequest.onBeforeRedirect.addListener(
    (details) => runWhenReady(() => releaseByRequestId(details.requestId)),
    filter
  );
}

chrome.tabs.onRemoved.addListener((tabId) => {
  runSerial(tabId, async () => {
    guards.delete(tabId);
    const candidates = [];
    for (const [ruleId, record] of bypasses) {
      if (record.tabId !== tabId) continue;
      record.pendingRemoval = true;
      candidates.push(ruleId);
    }
    for (const ruleId of candidates) {
      if (!(await tryRemoveRule(ruleId))) continue;
      const record = bypasses.get(ruleId);
      if (record && record.requestId) requestBindings.delete(record.requestId);
      bypasses.delete(ruleId);
    }
    await queuePersist().catch(() => {});
  }).catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === SWEEP_ALARM) sweep().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'prepare-gate') return false;
  prepareGate(message, sender)
    .then(sendResponse)
    .catch(() => sendResponse(fail()));
  return true;
});

/* --------------------------------------------------------------------- init */

const gateReady = (async () => {
  // Restored state first, then orphan reconciliation, then new rules. A
  // previous worker instance therefore stays intact until its orphaned state
  // has been identified and removed.
  await loadState();
  dnrAvailable = Boolean(
    dnr &&
    dnr.updateSessionRules &&
    dnr.updateDynamicRules &&
    dnr.getSessionRules &&
    dnr.getDynamicRules &&
    dnr.isRegexSupported
  );
  if (!dnrAvailable) {
    eventsReady = true;
    reportFailure();
    return;
  }
  await reconcileSessionRules();
  // Restored records with an expired TTL are cleaned now, not after 30s.
  await sweep().catch(() => {});
  await queueRules();
  eventsReady = true;
  try {
    chrome.alarms.create(SWEEP_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  } catch (err) {
    // alarm is best effort only
  }
})();

globalThis.gateReady = gateReady;
