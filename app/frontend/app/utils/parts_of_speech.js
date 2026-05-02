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

// Returns the AAC-preferred type for a `types` array, or null if empty.
// If `word` is provided and matches an AAC override, returns the override
// type (caller should still verify the override type maps to a color in
// the active palette via pick_aac_color, which falls back gracefully).
// Otherwise falls back to types[0] when no priority match is found.
export function pick_aac_type(types, word) {
  if(word) {
    var key = String(word).trim().toLowerCase();
    if(AAC_WORD_OVERRIDES[key]) { return AAC_WORD_OVERRIDES[key]; }
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

// Combined: pick the AAC-preferred type AND its matching Fitzgerald color
// from the given palette. Returns { type, color } or null. If `word` is
// provided, the AAC override map is consulted first. If the picked type
// isn't represented in the palette, falls through remaining types in
// dictionary order so an exotic primary doesn't blank out coloring.
export function pick_aac_color(types, palette, word) {
  var picked = pick_aac_type(types, word);
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
