// Session language for a board grid. Switch Languages stores an override;
// each board also has a default locale. Sidebar tools (Flexiones, Keyboard)
// often have an empty `locales` list, and treating that as "not Spanish"
// was flipping Quick Core 40 back to English on Back.

function add_lang(langs, lang) {
  if(!lang || typeof lang !== 'string') { return; }
  if(langs.indexOf(lang) === -1) { langs.push(lang); }
}

export function available_board_langs(model, raw) {
  var langs = [];
  var model_langs = (model && model.get && model.get('locales')) || [];
  model_langs.forEach(function(lang) { add_lang(langs, lang); });
  ((raw && raw.translated_locales) || []).forEach(function(lang) { add_lang(langs, lang); });
  if(model && model.get) { add_lang(langs, model.get('locale')); }
  if(raw) { add_lang(langs, raw.locale); }
  return langs;
}

// When Switch Languages is on, keep that locale unless this board is known
// not to have it. An empty lang list means "we don't know yet", not "English".
export function resolve_board_display_locale(opts) {
  opts = opts || {};
  var board_default = opts.boardDefault || 'en';
  var board_langs = opts.boardLangs || [];
  var preferred = opts.preferred;
  var override = opts.override;
  if(!override || !preferred) {
    return board_default;
  }
  var stripped = preferred.split(/-|_/)[0];
  var stripped_langs = board_langs.map(function(lang) {
    return String(lang).split(/-|_/)[0];
  });
  if(board_langs.length === 0) {
    return preferred;
  }
  if(stripped_langs.indexOf(stripped) === -1) {
    return board_default;
  }
  if(board_langs.indexOf(preferred) === -1) {
    return stripped;
  }
  return preferred;
}

// A board's own language, except that a keyboard board that also has English stays English
// for a user with no language preference. Undefined when the board has no language at all
// (obf/stars, integrations), which leaves readers on their own fallback to the UI language.
export function board_default_locale(model_locale, board_key, user_locale, board_langs) {
  var has_english = (board_langs || []).some(function(lang) { return String(lang).split(/-|_/)[0] === 'en'; });
  if((board_key || '').match(/\/keyboard$/) && !user_locale && has_english) { return 'en'; }
  return model_locale;
}

// The one rule for every board page, so Basic, Modern and the legacy page cannot disagree on
// a board's language: with Switch Languages on, the session language applies where the board
// has it; otherwise the board speaks its own language. The plain label_locale and
// vocalization_locale stashes count only with Switch Languages on. Home and speak mode write
// them, and any board that also stores English would otherwise open in English.
export function session_board_locale(stashes, loc_type, board_default, board_langs) {
  var override = stashes.get('override_label_locale') || stashes.get('override_vocalization_locale');
  if(!override) { return board_default; }
  return resolve_board_display_locale({
    boardDefault: board_default,
    boardLangs: board_langs,
    override: override,
    preferred: stashes.get(loc_type) || stashes.get('override_' + loc_type) || override
  });
}
