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
