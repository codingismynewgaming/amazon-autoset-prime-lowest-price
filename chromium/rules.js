/*
 * Chromium MV3 request rules. Loaded as a classic script by the worker.
 * Each redirect sets Prime and sorting together, before the network request.
 * No lookarounds/backreferences in conditions: Chrome uses RE2, not JS RegExp.
 */
(() => {
  'use strict';

  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const VALUE = '[^&#]*';
  const FRAGMENT = '(?:#.*)?';

  function encodedCharacter(character) {
    const hex = character.charCodeAt(0).toString(16).padStart(2, '0');
    const percent = [...hex].map((c) => /[a-f]/.test(c) ? `[${c}${c.toUpperCase()}]` : c).join('');
    return `(?:${escape(character)}|%${percent})`;
  }

  function encodedText(text) {
    return [...text].map(encodedCharacter).join('');
  }

  function rawEncodings(text) {
    let variants = [''];
    for (const character of text) {
      const hex = character.charCodeAt(0).toString(16).padStart(2, '0');
      const escapes = [...new Set([`%${hex}`, `%${hex.toUpperCase()}`])];
      variants = variants.flatMap((prefix) => [character, ...escapes].map((suffix) => prefix + suffix));
    }
    return variants;
  }

  /* Complement a finite trie, without negative lookahead. This is used only
   * for short parameter names (rh/s/ref), not unbounded query values. */
  function exceptStrings(words, delimiters, prefixMatch = false) {
    const root = { end: false, next: new Map() };
    for (const word of words) {
      let node = root;
      for (const c of word) {
        if (!node.next.has(c)) node.next.set(c, { end: false, next: new Map() });
        node = node.next.get(c);
      }
      node.end = true;
    }
    const classEscape = (s) => s.replace(/[\\\]\[\^-]/g, '\\$&');
    const tail = `[^${classEscape(delimiters)}]*`;
    function visit(node) {
      if (prefixMatch && node.end) return null;
      const alternatives = node.end ? [] : [''];
      alternatives.push(`[^${classEscape(delimiters + [...node.next.keys()].join(''))}]${tail}`);
      for (const [c, child] of node.next) {
        const suffix = visit(child);
        if (suffix !== null) alternatives.push(escape(c) + suffix);
      }
      return `(?:${alternatives.join('|')})`;
    }
    return visit(root);
  }

  const parameterCache = new Map();
  function parameterExcept(keys) {
    const cacheKey = [...keys].sort().join(',');
    if (!parameterCache.has(cacheKey)) {
      const key = keys.length ? exceptStrings(keys.flatMap(rawEncodings), '&=#') : '[^&=#]*';
      parameterCache.set(cacheKey, `${key}(?:=${VALUE})?`);
    }
    return parameterCache.get(cacheKey);
  }

  const KEYWORD = `(?:${encodedText('k')}|${encodedText('field-keywords')})(?:=${VALUE})?`;
  const RH = encodedText('rh');
  const REF = encodedText('ref');
  const PRIME = `(?:${['p_76', 'p_85', 'p_n_free_shipping_eligible'].map(encodedText).join('|')})`;

  function queryWithKeyword(base, excluded = []) {
    const other = parameterExcept(excluded);
    return `${base}\\?(?:${other}&)*${KEYWORD}(?:&${other})*${FRAGMENT}$`;
  }

  /* Match the FIRST rh parameter, with a keyword before or after it. For
   * substitutions groups 1/2/3/4 are prefix/value/suffix/fragment. */
  function firstRh(base, value, excluded = [], capture = false) {
    const prefixOther = parameterExcept(['rh', ...excluded]);
    const suffixOther = parameterExcept(excluded);
    return ['before', 'after'].map((position) => {
      const prefix = position === 'before'
        ? `(?:${prefixOther}&)*${KEYWORD}(?:&${prefixOther})*&`
        : `(?:${prefixOther}&)*`;
      const suffix = position === 'after'
        ? `(?:&${suffixOther})*&${KEYWORD}(?:&${suffixOther})*`
        : `(?:&${suffixOther})*`;
      if (capture) return `(${base}\\?${prefix}${RH}=)(${value})(${suffix})(#.*)?$`;
      return `${base}\\?${prefix}${RH}${value}${suffix}${FRAGMENT}$`;
    });
  }

  function buildRules(settings, marketplaces) {
    if (!settings || !settings.enabled || (!settings.autoPrime && !settings.autoSort)) return [];
    const rules = [];
    let nextId = 1;
    const sort = settings.sortOption || 'price-asc-rank';
    for (const marketplace of marketplaces) {
      if (Array.isArray(settings.enabledMarketplaces) && !settings.enabledMarketplaces.includes(marketplace.domain)) continue;
      const host = `https://www.${marketplace.domain}`;
      const origin = `^${escape(host)}`;
      const base = `${origin}/s(?:/[^?#]*)?`;
      const add = (regexes, priority, action) => {
        for (const [offset, regexFilter] of (Array.isArray(regexes) ? regexes : [regexes]).entries()) {
          rules.push({
            id: nextId++, priority: priority + offset, action,
            condition: {
              regexFilter, isUrlFilterCaseSensitive: true,
              requestDomains: [`www.${marketplace.domain}`],
              requestMethods: ['get'], resourceTypes: ['main_frame'],
            },
          });
        }
      };
      const allow = { type: 'allow' };
      const setQuery = (parameters) => ({ type: 'redirect', redirect: {
        transform: { queryTransform: { addOrReplaceParams: Object.entries(parameters).map(([key, value]) => ({ key, value })) } },
      } });

      // Query ref wins over path ref; the FIRST query ref is significant.
      const notRef = parameterExcept(['ref']);
      add(`${base}\\?(?:${notRef}&)*${REF}=${encodedText('sr_')}${VALUE}(?:&[^#]*)?${FRAGMENT}$`, 10000, allow);

      // Empty query ref falls back to the first non-empty /ref= path segment.
      const notPathRef = `(?:${exceptStrings(['ref='], '/?#', true)}|ref=)`;
      const resultsPath = `${origin}/s/(?:${notPathRef}/)*ref=sr_[^?#]*`;
      add(`${resultsPath}\\?(?:${notRef}&)*${notRef}${FRAGMENT}$`, 10010, allow);
      add(`${resultsPath}\\?(?:${notRef}&)*${REF}(?:=)?(?:&[^#]*)?${FRAGMENT}$`, 10020, allow);

      const prime = settings.autoPrime && marketplace.primeFacet;
      if (!prime) {
        if (settings.autoSort) add(queryWithKeyword(base, ['s']), 3000, setQuery({ s: sort }));
        continue;
      }

      // An existing Prime facet must NOT prevent missing sorting being added.
      const hasPrime = `=${VALUE}${PRIME}${VALUE}`;
      add(firstRh(base, hasPrime), 6000, allow);
      if (settings.autoSort) add(firstRh(base, hasPrime, ['s']), 6500, setQuery({ s: sort }));

      const noRh = queryWithKeyword(base, ['rh']);
      const emptyRh = firstRh(base, '(?:=)?');
      add([noRh, ...emptyRh], 4000, setQuery({ rh: prime }));
      if (settings.autoSort) {
        add([queryWithKeyword(base, ['rh', 's']), ...firstRh(base, '(?:=)?', ['s'])], 4500, setQuery({ rh: prime, s: sort }));
      }

      // Preserve all other facets, rather than replacing rh wholesale.
      const facet = encodeURIComponent(`,${prime}`);
      const appendPrime = (alsoSort) => ({ type: 'redirect', redirect: {
        regexSubstitution: `\\1\\2${facet}\\3${alsoSort ? `&s=${encodeURIComponent(sort)}` : ''}\\4`,
      } });
      add(firstRh(base, '[^&#]+', [], true), 4000, appendPrime(false));
      if (settings.autoSort) add(firstRh(base, '[^&#]+', ['s'], true), 4500, appendPrime(true));
    }
    return rules;
  }

  globalThis.PrimeSorterChromiumRules = Object.freeze({ buildRules, escapeRegex: escape });
})();
