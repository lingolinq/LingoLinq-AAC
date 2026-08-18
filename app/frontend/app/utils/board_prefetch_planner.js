// Shared phased board-root enumeration for session prefetch
// (board_detail_cache) and offline sync (persistence.sync_boards).

import RSVP from 'rsvp';
import { get as emberGet } from '@ember/object';
import filterRootBoards, { filterBrandSetRootBoards } from './board-roots';
import LingoLinq from '../app';

export var OWNED_ROOT_CAP = 200;
export var CATALOG_ROOT_CAP = 100;
export var GLOBAL_PUBLIC_ROOT_CAP = 50;
export var CATALOG_ROOTS_PER_PAGE = 50;
export var CATALOG_ACCOUNT = 'lingolinq';

function _seenFromList(list) {
  var seen = {};
  (list || []).forEach(function(l) {
    if (l) { seen[l] = true; }
  });
  return seen;
}

function _addUnique(result, seen, lookup, cap) {
  if (!lookup || seen[lookup] || (cap && result.length >= cap)) { return; }
  seen[lookup] = true;
  result.push(lookup);
}

export function collectHomeLookups(user) {
  if (!user || !user.get) { return []; }
  var hb = user.get('preferences.home_board');
  if (!hb) { return []; }
  var lookup = hb.key || hb.id;
  return lookup ? [lookup] : [];
}

export function collectLikedLookups(user, seen) {
  if (!user || !user.get) { return []; }
  seen = seen || {};
  var refs = user.get('stats.starred_board_refs') || [];
  var syncAll = user.get('preferences.sync_starred_boards') === true;
  var result = [];
  refs.forEach(function(ref) {
    if (!ref) { return; }
    if (!syncAll && ref.suggested) { return; }
    if (ref.style && ref.style.options) {
      ref.style.options.forEach(function(opt) {
        if (opt && opt.key) {
          _addUnique(result, seen, opt.key);
        }
      });
    } else if (ref.key) {
      _addUnique(result, seen, ref.key);
    } else if (ref.id) {
      _addUnique(result, seen, ref.id);
    }
  });
  return result;
}

export function collectOwnedRootLookups(user, boardsFromApi, seen) {
  if (!user || !user.get || !boardsFromApi) { return []; }
  seen = seen || {};
  var userId = user.get('id');
  var roots = filterRootBoards(boardsFromApi, userId);
  var result = [];
  roots.forEach(function(b) {
    var lookup = (b && (b.key || b.id)) || null;
    _addUnique(result, seen, lookup, OWNED_ROOT_CAP);
  });
  return result;
}

/* Brand-family test() reads board.get('key'). Prefetch list rows are
   plain API objects, so wrap them before filterBrandSetRootBoards. */
function _wrapBoardForBrand(board) {
  if (!board) { return null; }
  if (typeof board.get === 'function') { return board; }
  return {
    get: function(path) { return emberGet(board, path); },
    key: board.key,
    id: board.id,
    name: board.name,
    parent_board_key: board.parent_board_key
  };
}

function _publicRootBoards(boards) {
  return filterBrandSetRootBoards((boards || []).map(_wrapBoardForBrand).filter(Boolean));
}

export function collectPublicLookups(user, catalogBoards, globalBoards, seen) {
  seen = seen || {};
  var result = [];
  var catalogCount = 0;
  _publicRootBoards(catalogBoards).forEach(function(b) {
    var key = (b && (b.key || (b.get && b.get('key')))) || null;
    if (key) {
      var before = result.length;
      _addUnique(result, seen, key);
      if (result.length > before) { catalogCount++; }
      if (catalogCount >= CATALOG_ROOT_CAP) { return; }
    }
  });
  var globalCount = 0;
  _publicRootBoards(globalBoards).forEach(function(b) {
    var key = (b && (b.key || (b.get && b.get('key')))) || null;
    if (key) {
      var before = result.length;
      _addUnique(result, seen, key);
      if (result.length > before) { globalCount++; }
      if (globalCount >= GLOBAL_PUBLIC_ROOT_CAP) { return; }
    }
  });
  return result;
}

export function buildPhasedLookups(user, opts) {
  opts = opts || {};
  var seen = {};
  var phase1 = collectHomeLookups(user);
  Object.assign(seen, _seenFromList(phase1));

  var phase2 = [];
  if (opts.includeLiked !== false) {
    phase2 = collectLikedLookups(user, seen);
    Object.assign(seen, _seenFromList(phase2));
  }

  var phase3 = [];
  if (opts.ownedBoards) {
    phase3 = collectOwnedRootLookups(user, opts.ownedBoards, seen);
    Object.assign(seen, _seenFromList(phase3));
  }

  var phase4 = [];
  if (opts.catalogBoards || opts.globalBoards) {
    phase4 = collectPublicLookups(user, opts.catalogBoards, opts.globalBoards, seen);
  }

  return { phase1: phase1, phase2: phase2, phase3: phase3, phase4: phase4 };
}

function _flagFromAppState(flagName) {
  try {
    if (typeof window !== 'undefined' && LingoLinq && LingoLinq.appState) {
      return !!LingoLinq.appState.get('feature_flags.' + flagName);
    }
  } catch (e) { /* app may not be booted */ }
  return false;
}

function _flagFromUser(user, flagName) {
  if (user && user.get) {
    var flags = user.get('feature_flags');
    if (flags && flags[flagName]) { return true; }
  }
  return false;
}

export function catalogPrefetchEnabled(user) {
  return _flagFromAppState('catalog_board_prefetch') || _flagFromUser(user, 'catalog_board_prefetch');
}

export function backgroundBoardPrefetchEnabled(user) {
  return _flagFromAppState('background_board_prefetch') || _flagFromUser(user, 'background_board_prefetch');
}

export function publicPrefetchEnabled(user) {
  return backgroundBoardPrefetchEnabled(user) || catalogPrefetchEnabled(user);
}

function paginateBoardList(ajax, listUrl, cap) {
  var boards = [];
  var collect = function(url) {
    return ajax(url, { type: 'GET' }).then(function(data) {
      (data.board || []).forEach(function(b) {
        if (b && boards.length < cap) {
          boards.push(b);
        }
      });
      if (data.meta && data.meta.more && data.meta.next_url && boards.length < cap) {
        return collect(data.meta.next_url);
      }
    });
  };
  return collect(listUrl).then(function() {
    return boards;
  });
}

export function fetchOwnedBoards(ajax, userId) {
  var url = '/api/v1/boards?user_id=' + encodeURIComponent(userId) +
    '&per_page=' + CATALOG_ROOTS_PER_PAGE;
  return paginateBoardList(ajax, url, OWNED_ROOT_CAP * 3);
}

export function fetchCatalogBoards(ajax, locale) {
  var url = '/api/v1/boards?user_id=' + encodeURIComponent(CATALOG_ACCOUNT) +
    '&public=true&sort=home_popularity&copies=false&per_page=' + CATALOG_ROOTS_PER_PAGE;
  if (locale) {
    url += '&locale=' + encodeURIComponent(locale);
  }
  /* Fetch extra pages so brand-set children can be filtered out and
     we still reach CATALOG_ROOT_CAP real roots. */
  return paginateBoardList(ajax, url, CATALOG_ROOT_CAP * 3);
}

export function fetchGlobalPublicBoards(ajax, locale) {
  var url = '/api/v1/boards?q=&sort=popularity&per_page=' + CATALOG_ROOTS_PER_PAGE;
  if (locale) {
    url += '&locale=' + encodeURIComponent(locale);
  }
  return paginateBoardList(ajax, url, GLOBAL_PUBLIC_ROOT_CAP * 3);
}

export function fetchBoardListsForPrefetch(ajax, user, opts) {
  opts = opts || {};
  var locale = (user && user.get && user.get('preferences.locale')) || 'en';
  var userId = user && user.get && user.get('id');
  var result = { ownedBoards: [], catalogBoards: [], globalBoards: [] };
  var promises = [];

  if (opts.includeOwned && userId) {
    promises.push(fetchOwnedBoards(ajax, userId).then(function(boards) {
      result.ownedBoards = boards;
    }));
  }
  if (opts.includePublic) {
    promises.push(fetchCatalogBoards(ajax, locale).then(function(boards) {
      result.catalogBoards = boards;
    }));
    promises.push(fetchGlobalPublicBoards(ajax, locale).then(function(boards) {
      result.globalBoards = boards;
    }));
  }

  return RSVP.all(promises).then(function() {
    return result;
  });
}

export function lookupsToSyncSeeds(lookups, visitSource, depth) {
  depth = depth === undefined ? 0 : depth;
  return (lookups || []).map(function(lookup) {
    if (lookup && lookup.indexOf('/') !== -1) {
      return { key: lookup, depth: depth, visit_source: visitSource };
    }
    return { id: lookup, depth: depth, visit_source: visitSource };
  });
}

export default {
  OWNED_ROOT_CAP: OWNED_ROOT_CAP,
  CATALOG_ROOT_CAP: CATALOG_ROOT_CAP,
  GLOBAL_PUBLIC_ROOT_CAP: GLOBAL_PUBLIC_ROOT_CAP,
  CATALOG_ROOTS_PER_PAGE: CATALOG_ROOTS_PER_PAGE,
  CATALOG_ACCOUNT: CATALOG_ACCOUNT,
  collectHomeLookups: collectHomeLookups,
  collectLikedLookups: collectLikedLookups,
  collectOwnedRootLookups: collectOwnedRootLookups,
  collectPublicLookups: collectPublicLookups,
  buildPhasedLookups: buildPhasedLookups,
  catalogPrefetchEnabled: catalogPrefetchEnabled,
  backgroundBoardPrefetchEnabled: backgroundBoardPrefetchEnabled,
  publicPrefetchEnabled: publicPrefetchEnabled,
  fetchOwnedBoards: fetchOwnedBoards,
  fetchCatalogBoards: fetchCatalogBoards,
  fetchGlobalPublicBoards: fetchGlobalPublicBoards,
  fetchBoardListsForPrefetch: fetchBoardListsForPrefetch,
  lookupsToSyncSeeds: lookupsToSyncSeeds
};
