// AAC-aware part-of-speech selection.
//
// The server's /api/v1/search/parts_of_speech and batch_parts_of_speech
// endpoints return a `types` array sourced from a general-purpose English
// dictionary. The order is dictionary-conventional, not AAC-conventional —
// e.g. "I" lists `noun` (Roman numeral) before `pronoun`, "like" lists
// `adjective` before `verb`, and "go" lists `noun` (board game) before
// `verb`. Naively picking types[0] therefore mis-classifies common AAC
// words.
//
// Tiered priority below:
//   Tier 1 — True closed class (pronoun, question): essentially never
//            anything else in AAC when listed. Always promoted.
//   Tier 2 — Verb: AAC users communicate actions heavily; words like
//            "like", "love", "go", "play", "help" need verb classification
//            even when the dictionary lists another type first.
//   Tier 3 — Secondary closed class (preposition, conjunction, article,
//            determiner, number): preferred over noun when no verb
//            match. Catches "in", "on", "the", "a".
//
// Excluded from priority (fall through to types[0]):
//   - interjection / social / negation: these are often listed as
//     SECONDARY types for primarily-adjective words ("happy" → adj,
//     interjection, noun) — promoting them would mis-color descriptors.
//     Words like "wow"/"hi" still classify correctly because their
//     types[0] IS interjection/social.
//   - Open-class ambiguity (noun-vs-verb for "fish", "cat", "stone"):
//     accept that promoting verb mis-colors common nouns occasionally;
//     users can paint these manually. Inverse choice (don't promote
//     verb) breaks "like", "love", "go" which are core AAC vocabulary.

var AAC_PRIORITY = [
  // Tier 1
  'pronoun',
  'question',
  // Tier 2
  'verb',
  // Tier 3
  'preposition',
  'conjunction',
  'article', 'determiner',
  'number'
];

// AAC-canonical overrides for common words the dictionary tags
// differently. Keyed by lower-case word/phrase. The server-side admin
// Word Data tool is the preferred place to fix these permanently for
// all clients; this map is a frontend safety net for the most common
// words. Add entries here when AAC convention diverges from dictionary
// primary type.
var AAC_WORD_OVERRIDES = {
  // Social phrases — dictionary often tags as verb/adverb/interjection
  'please': 'social',
  'thanks': 'social',
  'thank you': 'social',
  'thank-you': 'social',
  'hi': 'social',
  'hello': 'social',
  'hey': 'social',
  'bye': 'social',
  'goodbye': 'social',
  'sorry': 'social',
  'welcome': 'social',
  // Affirmations / negations — dictionary often tags as adverb/article
  'yes': 'social',
  'yeah': 'social',
  'yep': 'social',
  'no': 'negation',
  'nope': 'negation',
  'not': 'negation',
  'never': 'negation',
  "don't": 'negation',
  "can't": 'negation',
  "won't": 'negation'
};

function normalize_aac_word(word) {
  if(!word) { return word; }
  var key = String(word).trim().toLowerCase();
  if(AAC_WORD_OVERRIDES[key]) { return key; }
  // Simple English plural heuristic for single-token Fitzgerald lookup.
  if(key.indexOf(' ') === -1 && key.length > 3 && key.match(/ies$/)) {
    return key.replace(/ies$/, 'y');
  }
  if(key.indexOf(' ') === -1 && key.length > 3 && key.match(/es$/)) {
    return key.replace(/es$/, '');
  }
  if(key.indexOf(' ') === -1 && key.length > 2 && key.match(/s$/) && !key.match(/ss$/)) {
    return key.replace(/s$/, '');
  }
  return key;
}

function normalize_aac_types(types) {
  if(!types || !types.length) { return types; }
  return types.map(function(t) {
    if(t === 'plural noun' || t === 'plural_noun') { return 'noun'; }
    if(t === 'noun phrase') { return 'noun'; }
    return t;
  });
}

// Returns the AAC-preferred type for a `types` array, or null if empty.
// If `word` is provided and matches an AAC override, returns the override
// type (caller should still verify the override type maps to a color in
// the active palette via pick_aac_color, which falls back gracefully).
// Otherwise falls back to types[0] when no priority match is found.
export function pick_aac_type(types, word) {
  types = normalize_aac_types(types);
  if(word) {
    var key = String(word).trim().toLowerCase();
    if(AAC_WORD_OVERRIDES[key]) { return AAC_WORD_OVERRIDES[key]; }
    var normalized = normalize_aac_word(key);
    if(normalized !== key && AAC_WORD_OVERRIDES[normalized]) {
      return AAC_WORD_OVERRIDES[normalized];
    }
  }
  if(!types || !types.length) { return null; }
  for(var i = 0; i < AAC_PRIORITY.length; i++) {
    if(types.indexOf(AAC_PRIORITY[i]) >= 0) {
      return AAC_PRIORITY[i];
    }
  }
  return types[0];
}

// Find the Fitzgerald color entry whose `types` array includes the given
// POS type. Returns the color object (with fill/border/types) or null.
export function color_for_type(type, palette) {
  if(!type || !palette) { return null; }
  for(var i = 0; i < palette.length; i++) {
    var c = palette[i];
    if(c && c.types && c.types.indexOf(type) >= 0) {
      return c;
    }
  }
  return null;
}

// ── Shared label → part-of-speech resolution ────────────────────────────
//
// Both the live board (controllers/user/board-detail.js#resolve_unknown_buttons)
// and the board preview canvas need the SAME answer for "what colour is this
// uncoloured button", or the preview shows a different board than the one the
// user lands on. That answer comes from /api/v1/search/batch_parts_of_speech,
// so the lookup lives here once, with a session-lifetime word cache in front of
// it: a word is fetched at most once per page load no matter how many boards or
// previews ask for it.
//
// `word_types` maps a raw word to its `types` array, or to `null` when the
// server had no entry — caching the miss matters as much as caching the hit,
// since AAC boards repeat the same closed-class words on every board.
var word_types = {};
var MAX_WORDS_PER_REQUEST = 100;

// Highest-value type for a single word when several are listed. Distinct from
// pick_aac_type: this runs over the types of the LAST meaningful word in a
// multi-word label, where AAC override words don't apply.
var MULTIWORD_PRIORITY = [
  'verb', 'noun', 'nominative',
  'negation', 'expletive',
  'question',
  'adjective', 'adverb',
  'pronoun',
  'social', 'interjection',
  'preposition',
  'conjunction', 'number', 'article', 'determiner'
];

// Types too weak to characterize a multi-word label ("in the box" is about the
// box, not about "the").
var WEAK_TYPES = ['article', 'determiner', 'preposition', 'conjunction'];

export function best_type(types) {
  if(!types || !types.length) { return null; }
  for(var i = 0; i < MULTIWORD_PRIORITY.length; i++) {
    if(types.indexOf(MULTIWORD_PRIORITY[i]) >= 0) { return MULTIWORD_PRIORITY[i]; }
  }
  return types[0];
}

// Split a label into the words we look up. Exported so callers can collect the
// full word set for one batched request before resolving any label.
export function words_for_label(label) {
  if(!label) { return []; }
  return String(label).split(/\s+/).filter(function(w) { return !!w; });
}

// The part of speech for a whole label, given a word -> types lookup.
// Single word: the AAC-preferred type (honours the override map).
// Multi word: a leading verb wins; otherwise the last non-weak word decides.
export function pos_for_label(label, lookup) {
  var words = words_for_label(label);
  if(!words.length) { return null; }
  var types_for = function(w) { return (lookup && lookup[w]) || []; };
  if(words.length === 1) {
    return pick_aac_type(types_for(words[0]), words[0]);
  }
  var first = types_for(words[0]);
  if(first.length > 0 && first[0] === 'verb') { return 'verb'; }
  for(var i = words.length - 1; i >= 0; i--) {
    var picked = best_type(types_for(words[i]));
    if(picked && WEAK_TYPES.indexOf(picked) < 0) { return picked; }
  }
  return best_type(types_for(words[words.length - 1]));
}

// Synchronous view of the cache — the POS for a label whose words have all been
// fetched already, or null if anything is still unknown. Lets a caller paint
// immediately on a warm cache and skip the request entirely.
export function cached_pos_for_label(label) {
  var words = words_for_label(label);
  if(!words.length) { return null; }
  for(var i = 0; i < words.length; i++) {
    if(!Object.prototype.hasOwnProperty.call(word_types, words[i])) { return null; }
  }
  return pos_for_label(label, word_types);
}

export function words_needing_lookup(labels) {
  var missing = [], seen = {};
  (labels || []).forEach(function(label) {
    words_for_label(label).forEach(function(w) {
      if(seen[w]) { return; }
      seen[w] = true;
      if(!Object.prototype.hasOwnProperty.call(word_types, w)) { missing.push(w); }
    });
  });
  return missing;
}

// Fetch every not-yet-known word behind `labels` and resolve with a
// label -> part-of-speech map (labels with no determinable type are omitted).
// `ajax` is the caller's persistence.ajax — passed in rather than imported so
// this module stays a pure utility. A failed chunk resolves rather than
// rejects: a partial answer beats no colours at all.
export function resolve_labels_pos(labels, ajax, RSVP) {
  var list = (labels || []).filter(function(l) { return !!l; });
  var build = function() {
    var res = {};
    list.forEach(function(label) {
      var pos = pos_for_label(label, word_types);
      if(pos) { res[label] = pos; }
    });
    return res;
  };
  var missing = words_needing_lookup(list);
  if(!missing.length || !ajax) { return RSVP.resolve(build()); }
  var fetch_chunk = function(start) {
    var chunk = missing.slice(start, start + MAX_WORDS_PER_REQUEST);
    if(!chunk.length) { return RSVP.resolve(build()); }
    return ajax('/api/v1/search/batch_parts_of_speech', {
      type: 'GET',
      data: { words: chunk.join(',') }
    }).then(function(res) {
      var results = (res && res.results) || {};
      chunk.forEach(function(w) {
        var entry = results[w];
        // Cache misses too — an unknown word must not be re-requested by the
        // next board that happens to use it.
        word_types[w] = (entry && entry.types) || null;
      });
      return fetch_chunk(start + MAX_WORDS_PER_REQUEST);
    }, function() {
      chunk.forEach(function(w) { word_types[w] = null; });
      return fetch_chunk(start + MAX_WORDS_PER_REQUEST);
    });
  };
  return fetch_chunk(0);
}

// Test seam — drops the session word cache.
export function reset_pos_cache() {
  word_types = {};
}

// Combined: pick the AAC-preferred type AND its matching Fitzgerald color
// from the given palette. Returns { type, color } or null. If `word` is
// provided, the AAC override map is consulted first. If the picked type
// isn't represented in the palette, falls through remaining types in
// dictionary order so an exotic primary doesn't blank out coloring.
export function pick_aac_color(types, palette, word) {
  var lookupWord = word;
  if(word) {
    var normalized = normalize_aac_word(String(word).trim().toLowerCase());
    if(normalized !== String(word).trim().toLowerCase()) {
      lookupWord = normalized;
    }
  }
  var picked = pick_aac_type(types, lookupWord || word);
  if(!picked) { return null; }
  var c = color_for_type(picked, palette);
  if(c) { return { type: picked, color: c }; }
  // Fallback: try remaining types in dictionary order.
  for(var i = 0; i < (types || []).length; i++) {
    if(types[i] === picked) { continue; }
    var fb = color_for_type(types[i], palette);
    if(fb) { return { type: types[i], color: fb }; }
  }
  return null;
}
