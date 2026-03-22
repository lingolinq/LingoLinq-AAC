import Controller from '@ember/controller';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import speecher from '../../utils/speecher';
import utterance from '../../utils/utterance';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';

export default Controller.extend({
  app_state: service('app-state'),
  stashes: service('stashes'),

  boardname: null,
  active_category: 'all',
  sentence_parts: null,
  recent_phrases: null,
  weekly_goals: null,
  todays_schedule: null,
  show_color_legend: false,
  show_quick_phrases: false,
  show_categories: false,
  panels_collapsed: false,
  edit_mode: false,
  board_collapsed: false,
  color_picker_button: null,
  custom_color_value: null,
  paint_mode: null,
  show_options_menu: false,
  board_saving: false,
  ordered_buttons: null,
  preview_level: null,
  noUndo: true,
  noRedo: true,

  init: function() {
    this._super(...arguments);
    this.set('sentence_parts', []);
    this.set('recent_phrases', []);
    this.set('weekly_goals', []);
    this.set('todays_schedule', []);
  },

  title: computed('model.name', 'boardname', function() {
    var name = this.get('model.name');
    if(name) { return name; }
    var boardname = this.get('boardname');
    if(boardname) {
      return boardname.replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    }
    return i18n.t('board_detail', "Board Detail");
  }),

  subtitle: computed('model.description', function() {
    var desc = this.get('model.description');
    if(desc) { return desc; }
    return i18n.t('board_detail_subtitle', "Tap symbols to build your message");
  }),

  board_image_url: computed('board_data', 'model.image_url', function() {
    var board_data = this.get('board_data');
    if(board_data && board_data.image_url) { return board_data.image_url; }
    return this.get('model.image_url') || null;
  }),

  sentence_text: computed('sentence_parts.[]', function() {
    var parts = this.get('sentence_parts') || [];
    return parts.map(function(p) { return p.label; }).join(' ');
  }),

  has_sentence: computed('sentence_parts.[]', function() {
    return (this.get('sentence_parts') || []).length > 0;
  }),

  quick_buttons: computed(function() {
    return [
      { id: 'yes', label: i18n.t('quick_yes', "Yes"), icon: '\u2705' },
      { id: 'no', label: i18n.t('quick_no', "No"), icon: '\u274C' },
      { id: 'please', label: i18n.t('quick_please', "Please"), icon: '\uD83D\uDE4F' },
      { id: 'thank_you', label: i18n.t('quick_thank_you', "Thank you"), icon: '\uD83D\uDE0A' },
      { id: 'help_me', label: i18n.t('quick_help_me', "Help me"), icon: '\uD83C\uDD98' },
      { id: 'wait', label: i18n.t('quick_wait', "Wait"), icon: '\u23F8' }
    ];
  }),

  categories: computed(function() {
    return [
      { id: 'all', label: i18n.t('category_all', "All") },
      { id: 'people', label: i18n.t('category_people', "People") },
      { id: 'actions', label: i18n.t('category_actions', "Actions") },
      { id: 'feelings', label: i18n.t('category_feelings', "Feelings") },
      { id: 'food_drink', label: i18n.t('category_food_drink', "Food & Drink") },
      { id: 'places', label: i18n.t('category_places', "Places") },
      { id: 'descriptors', label: i18n.t('category_descriptors', "Descriptors") }
    ];
  }),

  pos_categories: computed(function() {
    return [
      { id: 'all', label: i18n.t('category_all', "All"), css_class: null },
      { id: 'pronoun', label: i18n.t('category_pronoun', "Pronouns"), css_class: 'pronoun' },
      { id: 'verb', label: i18n.t('category_verb', "Verbs"), css_class: 'verb' },
      { id: 'adjective', label: i18n.t('category_descriptor', "Descriptors"), css_class: 'adjective' },
      { id: 'noun', label: i18n.t('category_noun', "Nouns"), css_class: 'noun' },
      { id: 'social', label: i18n.t('category_social', "Social"), css_class: 'social' },
      { id: 'negation', label: i18n.t('category_negatives', "Negatives"), css_class: 'negation' },
      { id: 'question', label: i18n.t('category_questions', "Questions"), css_class: 'question' },
      { id: 'preposition', label: i18n.t('category_prepositions', "Prepositions"), css_class: 'preposition' },
      { id: 'conjunction', label: i18n.t('category_grammar', "Grammar"), css_class: 'conjunction' },
      { id: 'folder', label: i18n.t('category_folders', "Folders"), css_class: 'folder' }
    ];
  }),

  active_filter_label: computed('active_category', 'pos_categories', function() {
    var cat = this.get('active_category');
    if(!cat || cat === 'all') { return null; }
    var cats = this.get('pos_categories') || [];
    var match = cats.find(function(c) { return c.id === cat; });
    return match ? match.label : null;
  }),

  active_filter_css: computed('active_category', 'pos_categories', function() {
    var cat = this.get('active_category');
    if(!cat || cat === 'all') { return null; }
    var cats = this.get('pos_categories') || [];
    var match = cats.find(function(c) { return c.id === cat; });
    return match ? match.css_class : null;
  }),

  pos_type_categories: computed(function() {
    return [
      { id: 'pronoun', label: i18n.t('category_pronoun', "Pronouns"), css_class: 'pronoun' },
      { id: 'verb', label: i18n.t('category_verb', "Verbs"), css_class: 'verb' },
      { id: 'adjective', label: i18n.t('category_descriptor', "Descriptors"), css_class: 'adjective' },
      { id: 'noun', label: i18n.t('category_noun', "Nouns"), css_class: 'noun' },
      { id: 'social', label: i18n.t('category_social', "Social"), css_class: 'social' },
      { id: 'negation', label: i18n.t('category_negatives', "Negatives"), css_class: 'negation' },
      { id: 'question', label: i18n.t('category_questions', "Questions"), css_class: 'question' },
      { id: 'preposition', label: i18n.t('category_prepositions', "Prepositions"), css_class: 'preposition' },
      { id: 'conjunction', label: i18n.t('category_grammar', "Grammar"), css_class: 'conjunction' }
    ];
  }),

  color_picker_swatches: computed(function() {
    return [
      { label: i18n.t('swatch_pronoun', "Pronoun"), pos_class: 'pronoun', bg: '#C8D8F0', border: '#3A6FBF' },
      { label: i18n.t('swatch_verb', "Verb"), pos_class: 'verb', bg: '#B8E8DF', border: '#1D8C7A' },
      { label: i18n.t('swatch_descriptor', "Descriptor"), pos_class: 'adjective', bg: '#F7E5A8', border: '#C4920A' },
      { label: i18n.t('swatch_noun', "Noun"), pos_class: 'noun', bg: '#FBCFA0', border: '#D07318' },
      { label: i18n.t('swatch_social', "Social"), pos_class: 'social', bg: '#D8CFF0', border: '#6B4FAD' },
      { label: i18n.t('swatch_negative', "Negative"), pos_class: 'negation', bg: '#F5C4C0', border: '#C0362A' },
      { label: i18n.t('swatch_question', "Question"), pos_class: 'question', bg: '#C5CCD8', border: '#3C4E6A' },
      { label: i18n.t('swatch_preposition', "Preposition"), pos_class: 'preposition', bg: '#E0D4B8', border: '#8B7340' },
      { label: i18n.t('swatch_grammar', "Grammar"), pos_class: 'conjunction', bg: '#E8E4DC', border: '#8A8070' }
    ];
  }),

  color_legend_items: computed(function() {
    return [
      { type: i18n.t('legend_pronoun', "Pronouns"), parts: i18n.t('legend_pronoun_ex', "I, you, he, she, we"), css_class: 'pronoun' },
      { type: i18n.t('legend_verb', "Verbs"), parts: i18n.t('legend_verb_ex', "go, want, eat, play, care"), css_class: 'verb' },
      { type: i18n.t('legend_descriptor', "Descriptors"), parts: i18n.t('legend_descriptor_ex', "big, happy, fast, more"), css_class: 'adjective' },
      { type: i18n.t('legend_noun', "Nouns"), parts: i18n.t('legend_noun_ex', "cat, water, home, school"), css_class: 'noun' },
      { type: i18n.t('legend_social', "Social"), parts: i18n.t('legend_social_ex', "please, hello, thank you"), css_class: 'social' },
      { type: i18n.t('legend_grammar', "Grammar"), parts: i18n.t('legend_grammar_ex', "the, and, a, is"), css_class: 'conjunction' },
      { type: i18n.t('legend_negatives', "Negatives"), parts: i18n.t('legend_negatives_ex', "no, not, don't, stop"), css_class: 'negation' },
      { type: i18n.t('legend_questions', "Questions"), parts: i18n.t('legend_questions_ex', "what, where, who, why"), css_class: 'question' },
      { type: i18n.t('legend_prepositions', "Prepositions"), parts: i18n.t('legend_prepositions_ex', "in, on, to, with"), css_class: 'preposition' },
      { type: i18n.t('legend_folder', "Folder"), parts: i18n.t('legend_folder_ex', "links to another board"), css_class: 'folder' }
    ];
  }),

  // ── Board Loading ──

  // Raw board data from the API (used for display and as data source)
  board_data: null,
  _original_board_name: null,

  // Load the board via persistence.ajax (the proven, working approach)
  // and also set up the Ember Data model for editManager integration
  load_board: function() {
    var _this = this;
    var user = _this.get('user');
    var boardname = _this.get('boardname');
    if(!user || !boardname) { return; }

    var board_key = user.get('user_name') + '/' + boardname;
    persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
      if(data && data.board) {
        _this.set('board_data', data.board);
        _this.set('_original_board_name', data.board.name);
        _this._rebuild_display_buttons();

        // Resolve POS for buttons with no type
        _this.resolve_unknown_buttons(_this.get('flat_ordered_buttons') || []);

        // Also load the Ember Data model for editManager (used in edit mode)
        _this._setup_edit_manager(data.board.id || board_key);
      }
    }, function() {
      _this.set('ordered_buttons', []);
    });
  },

  // Build the ordered_buttons 2D grid from raw board_data
  _rebuild_display_buttons: function() {
    var _this = this;
    var board_data = this.get('board_data');
    if(!board_data) { return; }

    // image_urls is a hash of { image_id: url } returned by the API
    var image_map = board_data.image_urls || {};
    // Also merge in any images from the images array (if present)
    (board_data.images || []).forEach(function(img) {
      if(img && img.id && img.url) { image_map[img.id] = img.url; }
    });

    var grid = board_data.grid;
    if(!grid || !grid.order) {
      // No grid — build a flat list as a single row
      var buttons = (board_data.buttons || []).map(function(btn) {
        return _this._make_display_button(btn, image_map);
      });
      _this.set('ordered_buttons', [buttons]);
      return;
    }

    // Build 2D grid matching the board's grid.order
    var button_map = {};
    (board_data.buttons || []).forEach(function(btn) {
      if(btn && btn.id) { button_map[btn.id] = btn; }
    });

    var result = [];
    for(var ri = 0; ri < grid.rows; ri++) {
      var row = [];
      for(var ci = 0; ci < grid.columns; ci++) {
        var btn_id = (grid.order[ri] || [])[ci];
        var raw_btn = btn_id ? button_map[btn_id] : null;
        if(raw_btn) {
          row.push(_this._make_display_button(raw_btn, image_map));
        } else {
          // Empty grid cell
          row.push({ id: btn_id || ('fake_' + ri + '_' + ci), label: '', empty: true, pos_class: 'default' });
        }
      }
      result.push(row);
    }
    _this.set('ordered_buttons', result);
  },

  // Create a display button object from raw API data
  _make_display_button: function(btn, image_map) {
    var img_url = null;
    if(btn.image_id && image_map[btn.image_id]) {
      img_url = image_map[btn.image_id];
    }
    var bg = btn.background_color ? window.tinycolor(btn.background_color) : null;
    var bdr = btn.border_color ? window.tinycolor(btn.border_color) : null;
    return {
      id: btn.id,
      label: btn.label || '',
      vocalization: btn.vocalization || '',
      image_url: img_url,
      image_id: btn.image_id,
      category: btn.category || 'all',
      action: btn.action || 'speak',
      is_folder: !!(btn.load_board),
      load_board: btn.load_board,
      hidden: btn.hidden,
      part_of_speech: btn.part_of_speech || btn.painted_part_of_speech || btn.suggested_part_of_speech,
      pos_class: this.pos_css_class(btn),
      background_color: (bg && bg._ok) ? bg.toRgbString() : null,
      border_color: (bdr && bdr._ok) ? bdr.toRgbString() : null,
      level_modifications: btn.level_modifications,
      empty: !(btn.label || btn.image_id)
    };
  },

  // Find a raw button in board_data.buttons by id
  _find_raw_button: function(btn_id) {
    var raw_buttons = (this.get('board_data') || {}).buttons || [];
    for(var i = 0; i < raw_buttons.length; i++) {
      if(raw_buttons[i].id === btn_id) {
        return raw_buttons[i];
      }
    }
    return null;
  },

  // Set up editManager with the Ember Data board model (for edit mode operations)
  _setup_edit_manager: function(board_id) {
    var _this = this;
    var store = window.LingoLinq && window.LingoLinq.store;
    if(!store) { return; }

    store.findRecord('board', board_id).then(function(board) {
      _this.set('model', board);

      var appState = _this.get('app_state');
      var stashes = _this.get('stashes');

      // Set locale information
      var board_langs = (board.get('locales') || []);
      var stripped_langs = board_langs.map(function(l) { return l.split(/-|_/)[0]; });
      ['label_locale', 'vocalization_locale'].forEach(function(loc_type) {
        if(stashes.get(loc_type)) {
          var preferred = stashes.get(loc_type);
          var stripped = preferred.split(/-|_/)[0];
          if(stripped_langs.indexOf(stripped) == -1) {
            appState.set(loc_type, board.get('locale'));
          } else if(board_langs.indexOf(preferred) == -1) {
            appState.set(loc_type, stripped);
          } else {
            appState.set(loc_type, preferred);
          }
        } else {
          appState.set(loc_type, board.get('locale'));
        }
      });

      appState.set('currentBoardState', {
        id: board.get('global_id') || board.get('id'),
        key: board.get('key'),
        parent_id: board.get('parent_board_id'),
        name: board.get('name'),
        has_fallbacks: board.get('has_fallbacks'),
        default_locale: board.get('locale'),
        copy_version: board.get('copy_version'),
        parent_key: board.get('parent_board_key'),
        text_direction: i18n.text_direction(board.get('locale')),
        translatable: board_langs.length > 1
      });

      // Temporarily clear ordered_buttons during setup so clear_history
      // doesn't iterate plain objects (it expects Ember Button objects)
      var saved_buttons = _this.get('ordered_buttons');
      _this.set('ordered_buttons', null);
      editManager.setup(_this, appState, persistence, stashes);
      _this.set('ordered_buttons', saved_buttons);
      contentGrabbers.board_controller = _this;
    }, function() {
      // Could not load Ember Data model — edit mode may not work
    });
  },

  // ── editManager Stubs ──
  // These are called by editManager but not needed for board-detail's CSS grid layout
  processButtons: function() {
    editManager.process_for_displaying();
  },
  update_button_symbol_class: function() { },
  computeHeight: function() { },
  redraw_if_needed: function() { },

  // Word suggestions
  suggestions: null,
  show_word_suggestions: computed('model.word_suggestions', 'edit_mode', function() {
    return this.get('model.word_suggestions') && !this.get('edit_mode');
  }),

  updateSuggestions: observer(
    'app_state.button_list',
    'app_state.button_list.[]',
    function() {
      if(!this.get('model.word_suggestions') || this.get('edit_mode')) { return; }
      var _this = this;
      var word_suggestions = window.LingoLinq && window.LingoLinq.word_suggestions;
      if(!word_suggestions) {
        try { word_suggestions = require('lingolinq-aac/utils/word_suggestions').default; } catch(e) { }
      }
      if(!word_suggestions || !word_suggestions.lookup) { return; }

      var button_list = this.get('app_state.button_list') || [];
      var last_button = button_list[button_list.length - 1];
      var current_button = null;
      if(last_button && last_button.in_progress) {
        current_button = last_button;
        last_button = button_list[button_list.length - 2];
      }
      var last_finished_word = ((last_button && (last_button.vocalization || last_button.label)) || '').toLowerCase();
      var word_in_progress = ((current_button && (current_button.vocalization || current_button.label)) || '').toLowerCase();

      word_suggestions.lookup({
        last_finished_word: last_finished_word,
        word_in_progress: word_in_progress,
        board_ids: [this.get('app_state.currentUser.preferences.home_board.id')]
      }).then(function(result) {
        _this.set('suggestions', { ready: true, list: result });
      }, function() {
        _this.set('suggestions', { ready: true, list: [] });
      });
    }
  ),

  has_rendered_material: computed('ordered_buttons', function() {
    return !!(this.get('ordered_buttons'));
  }),

  // Current grid dimensions from ordered_buttons
  current_grid: computed('ordered_buttons', function() {
    var ob = this.get('ordered_buttons');
    if(!ob || !Array.isArray(ob) || !ob.length) {
      return { rows: 0, columns: 0 };
    }
    return {
      rows: ob.length,
      columns: (ob[0] && Array.isArray(ob[0]) && ob[0].length) || 0
    };
  }),

  grid_style: computed('current_grid.columns', 'current_grid.rows', function() {
    var cols = this.get('current_grid.columns');
    var rows = this.get('current_grid.rows');
    var parts = [];
    if(cols && cols > 0) { parts.push('--board-columns: ' + cols); }
    if(rows && rows > 0) { parts.push('--board-rows: ' + rows); }
    return parts.length ? parts.join('; ') + ';' : '';
  }),

  // Flatten the 2D ordered_buttons grid for template iteration and filtering
  flat_ordered_buttons: computed('ordered_buttons', 'ordered_buttons.[]', function() {
    var ob = this.get('ordered_buttons') || [];
    var result = [];
    ob.forEach(function(row) {
      if(!row) { return; }
      row.forEach(function(btn) {
        if(btn) { result.push(btn); }
      });
    });
    return result;
  }),

  // Returns the POS CSS class for a button (works with both Button objects and plain objects)
  pos_css_class: function(btn) {
    if(!btn) { return 'default'; }
    var load_board = btn.get ? btn.get('load_board') : btn.load_board;
    var folder_action = btn.get ? btn.get('folderAction') : btn.folderAction;
    if(load_board || folder_action) {
      return 'folder';
    }
    var pos = (btn.get ? btn.get('part_of_speech') : btn.part_of_speech) ||
              (btn.get ? btn.get('painted_part_of_speech') : btn.painted_part_of_speech) ||
              (btn.get ? btn.get('suggested_part_of_speech') : btn.suggested_part_of_speech);
    if(pos) { return pos; }
    return 'default';
  },

  // Pick the best POS from a list of types for a single word
  best_type: function(types) {
    if(!types || !types.length) { return null; }
    var priority = [
      'verb', 'noun', 'nominative',
      'negation', 'expletive',
      'question',
      'adjective', 'adverb',
      'pronoun',
      'social', 'interjection',
      'preposition',
      'conjunction', 'number', 'article', 'determiner'
    ];
    for(var i = 0; i < priority.length; i++) {
      if(types.indexOf(priority[i]) >= 0) {
        return priority[i];
      }
    }
    return types[0];
  },

  // Look up POS for buttons that have no type assigned
  resolve_unknown_buttons: function(buttons) {
    var _this = this;
    var unknowns = buttons.filter(function(btn) {
      var pos = _this.pos_css_class(btn);
      var label = btn.get ? btn.get('label') : btn.label;
      return pos === 'default' && label;
    });
    if(!unknowns.length) { return; }

    unknowns.forEach(function(btn) {
      var label = btn.get ? btn.get('label') : btn.label;
      var words = label.split(/\s+/);
      var lookup_promises = words.map(function(word) {
        return persistence.ajax('/api/v1/search/parts_of_speech', {
          type: 'GET',
          data: { q: word }
        }).then(function(res) {
          return res;
        }, function() {
          return null;
        });
      });

      RSVP.all(lookup_promises).then(function(results) {
        var cls = null;

        if(words.length === 1) {
          var types = (results[0] && results[0].types) || [];
          cls = types[0] || null;
        } else {
          var first_types = (results[0] && results[0].types) || [];
          if(first_types.length > 0 && first_types[0] === 'verb') {
            cls = 'verb';
          } else {
            var skip_types = ['article', 'determiner', 'preposition', 'conjunction'];
            for(var i = results.length - 1; i >= 0; i--) {
              var word_types = (results[i] && results[i].types) || [];
              var word_best = _this.best_type(word_types);
              if(word_best && skip_types.indexOf(word_best) < 0) {
                cls = word_best;
                break;
              }
            }
            if(!cls && results.length > 0) {
              var last_types = (results[results.length - 1] && results[results.length - 1].types) || [];
              cls = _this.best_type(last_types);
            }
          }
        }

        if(cls) {
          if(btn.set) {
            btn.set('suggested_part_of_speech', cls);
          } else {
            emberSet(btn, 'suggested_part_of_speech', cls);
          }
          _this.notifyPropertyChange('ordered_buttons');
        }
      });
    });
  },

  // Filter buttons by active category
  filtered_buttons: computed('flat_ordered_buttons.[]', 'active_category', function() {
    var buttons = this.get('flat_ordered_buttons') || [];
    var category = this.get('active_category');
    var _this = this;
    if(category === 'all') {
      return buttons;
    }
    var match_map = {
      'pronoun': ['pronoun'],
      'verb': ['verb'],
      'adjective': ['adjective', 'adverb'],
      'noun': ['noun', 'nominative'],
      'social': ['social', 'interjection'],
      'negation': ['negation', 'expletive'],
      'question': ['question'],
      'preposition': ['preposition'],
      'conjunction': ['conjunction', 'number', 'article', 'determiner'],
      'folder': ['folder']
    };
    var matches = match_map[category] || [category];
    return buttons.filter(function(btn) {
      var pos = _this.pos_css_class(btn);
      return matches.indexOf(pos) >= 0;
    });
  }),

  sidebar_nav: computed(function() {
    return {
      communicate: [
        { id: 'symbol-board', label: i18n.t('nav_symbol_board', "Symbol Board"), icon: 'symbol-board', active: true },
        { id: 'phrase-builder', label: i18n.t('nav_phrase_builder', "Phrase Builder"), icon: 'phrase-builder' },
        { id: 'favorites', label: i18n.t('nav_favorites', "Favorites"), icon: 'favorites' },
        { id: 'recent', label: i18n.t('nav_recent', "Recent"), icon: 'recent' }
      ],
      clinical: [
        { id: 'progress-reports', label: i18n.t('nav_progress_reports', "Progress Reports"), icon: 'progress-reports' },
        { id: 'sessions', label: i18n.t('nav_sessions', "Sessions"), icon: 'sessions' },
        { id: 'profiles', label: i18n.t('nav_profiles', "Profiles"), icon: 'profiles' },
        { id: 'goal-tracking', label: i18n.t('nav_goal_tracking', "Goal Tracking"), icon: 'goal-tracking' }
      ],
      settings: [
        { id: 'preferences', label: i18n.t('nav_preferences', "preferences"), icon: 'preferences' },
        { id: 'voice-output', label: i18n.t('nav_voice_output', "Voice & Output"), icon: 'voice-output' }
      ]
    };
  }),

  // ── Level Preview ──

  available_levels: computed('ordered_buttons', function() {
    var ob = this.get('ordered_buttons') || [];
    var levels = [];
    ob.forEach(function(row) {
      (row || []).forEach(function(btn) {
        if(btn && btn.get && btn.get('level_modifications')) {
          var mods = btn.get('level_modifications');
          for(var lvl in mods) {
            if(mods.hasOwnProperty(lvl)) {
              var num = parseInt(lvl, 10);
              if(!isNaN(num) && levels.indexOf(num) < 0) {
                levels.push(num);
              }
            }
          }
        }
      });
    });
    return levels.sort(function(a, b) { return a - b; });
  }),

  has_levels: computed('available_levels.[]', function() {
    return (this.get('available_levels') || []).length > 0;
  }),

  preview_levels_mode: false,

  preview_levels: computed('edit_mode', 'preview_levels_mode', function() {
    return this.get('edit_mode') && this.get('preview_levels_mode');
  }),

  // ── Save Logic (adapted from board/index.js saveButtonChanges) ──

  saveButtonChanges: function() {
    var _this = this;
    var orderedButtons = this.get('ordered_buttons') || [];

    // Check for pending images
    var pendingImage = false;
    for(var ri = 0; ri < orderedButtons.length && !pendingImage; ri++) {
      var row = orderedButtons[ri];
      for(var ci = 0; ci < row.length && !pendingImage; ci++) {
        var btn = row[ci];
        if(btn && btn.get && btn.get('image_id') && btn.get('pending_image')) {
          pendingImage = true;
        }
      }
    }
    if(pendingImage) {
      modal.warning(i18n.t('wait_for_images', "Please wait for all images to finish loading before saving."), true);
      return;
    }

    // Use board_data directly (it has our paint/label changes applied)
    // rather than editManager.process_for_saving() which may not have them
    var board_data = this.get('board_data');
    var state;
    if(board_data && board_data.buttons && board_data.grid) {
      state = {
        buttons: board_data.buttons,
        grid: board_data.grid
      };
    } else if(editManager.controller === this) {
      state = editManager.process_for_saving();
    } else {
      modal.error(i18n.t('board_save_failed', "Failed to save board"));
      return;
    }
    var board = this.get('model');
    if(!board) { return; }

    // Handle locale-specific translations if editing in a non-default locale
    var button_locale = board.get('button_locale') || this.get('app_state.label_locale');
    var update_locale = false;
    if(button_locale && button_locale != board.get('locale')) {
      update_locale = button_locale;
      var changes = board.changedAttributes();
      if(changes.name && changes.name[0] != changes.name[1]) {
        var trans = board.get('translations') || {};
        trans.board_name = trans.board_name || {};
        trans.board_name[button_locale] = changes.name[1];
        trans.board_name[board.get('locale')] = trans.board_name[board.get('locale')] || changes.name[0];
        board.set('name', changes.name[0]);
        board.set('translations', trans);
      }
      state.buttons.forEach(function(btn) {
        btn.translations = btn.translations || [];
        var btn_trans = btn.translations.find(function(t) { return t.locale == button_locale; });
        if(!btn_trans) {
          btn_trans = { code: button_locale, locale: button_locale };
          btn.translations.push(btn_trans);
        }
        emberSet(btn_trans, 'label', btn_trans.label || btn.label);
        emberSet(btn_trans, 'vocalization', btn_trans.vocalization || btn.vocalization);
        emberSet(btn_trans, 'inflections', btn_trans.inflections || btn.inflections);

        var orig_trans = btn.translations.find(function(t) { return t.locale == board.get('locale'); });
        orig_trans = orig_trans || ((board.get('translations') || {})[btn.id] || {})[board.get('locale')];
        if(orig_trans) {
          emberSet(btn, 'vocalization', null);
          emberSet(btn, 'inflections', null);
          for(var key in orig_trans) {
            if(key != 'code' && key != 'locale') {
              emberSet(btn, key, orig_trans[key]);
            }
          }
        } else {
          var old_btn = (board.get('buttons') || []).find(function(b) { return b.id == btn.id; });
          if(old_btn) {
            emberSet(btn, 'label', old_btn.label);
            emberSet(btn, 'vocalization', old_btn.vocalization);
            emberSet(btn, 'inflections', old_btn.inflections);
          }
        }
      });
    }

    board.set('buttons', state.buttons);
    board.set('grid', state.grid);
    this.processButtons();

    // Handle copy-on-save
    var stashes = this.get('stashes');
    if(this.get('app_state.currentBoardState.id') && stashes.get('copy_on_save') == this.get('app_state.currentBoardState.id')) {
      var appController = this.get('app_state.controller');
      if(appController) {
        appController.send('tweakBoard', { update_locale: update_locale });
      }
      return;
    }

    // Exit edit mode
    this.set('edit_mode', false);
    this.set('paint_mode', null);
    this.set('color_picker_button', null);
    stashes.persist('current_mode', 'default');

    // Preserve image_urls before save
    var imageUrlsBeforeSave = board.get('image_urls') ? Object.assign({}, board.get('image_urls')) : {};
    (orderedButtons || []).forEach(function(btnRow) {
      (btnRow || []).forEach(function(btn) {
        var imgId = btn && (btn.get ? btn.get('image_id') : btn.image_id);
        if(imgId && !imageUrlsBeforeSave[imgId]) {
          var url = (btn.get ? btn.get('local_image_url') : btn.local_image_url) ||
                    (btn.get ? btn.get('image_url') : btn.image_url);
          if(url) {
            imageUrlsBeforeSave[imgId] = url;
          }
        }
      });
    });

    // Save via persistence.ajax PUT (proven approach)
    var user = _this.get('user');
    var boardname = _this.get('boardname');
    if(!user || !boardname) { return; }
    var board_key = user.get('user_name') + '/' + boardname;

    // Show loading state and clear current display
    _this.set('board_saving', true);
    _this.set('ordered_buttons', null);

    persistence.ajax('/api/v1/boards/' + board_key, {
      type: 'PUT',
      data: {
        board: {
          buttons: state.buttons,
          grid: state.grid
        }
      }
    }).then(function() {
      if(update_locale) {
        stashes.persist('label_locale', update_locale);
        _this.get('app_state').set('label_locale', update_locale);
        stashes.persist('vocalization_locale', update_locale);
        _this.get('app_state').set('vocalization_locale', update_locale);
      }

      // Transition back to index subroute so edit mode fully exits
      _this.transitionToRoute('user.board-detail.index', _this.get('user.user_name'), boardname);

      // Auto-rename the board key if the display name changed
      var original_name = _this.get('_original_board_name');
      var current_name = board.get('name');

      // Reload board data with fresh saved data, then clear saving state
      var reload_key = user.get('user_name') + '/' + boardname;
      persistence.ajax('/api/v1/boards/' + reload_key, { type: 'GET' }).then(function(data) {
        if(data && data.board) {
          _this.set('board_data', data.board);
          _this.set('_original_board_name', data.board.name);
          _this._rebuild_display_buttons();
        }
        _this.set('board_saving', false);
      }, function() {
        _this.set('board_saving', false);
      });

      if(original_name && current_name && original_name !== current_name) {
        _this._auto_rename_board(board, current_name);
      } else {
        modal.success(i18n.t('board_saved', "Board saved!"));
      }
    }, function(err) {
      console.error(err);
      _this.set('board_saving', false);
      modal.error(i18n.t('board_save_failed', "Failed to save board"));
    });
  },

  // Automatically rename the board key to match the new display name
  _auto_rename_board: function(board, new_name) {
    var _this = this;
    var user_name = board.get('user_name') || (_this.get('user') && _this.get('user').get('user_name'));
    var old_key = board.get('key');
    if(!user_name || !old_key) {
      modal.success(i18n.t('board_saved', "Board saved!"));
      return;
    }
    var new_slug = window.LingoLinq.clean_path(new_name);
    var new_key = user_name + '/' + new_slug;

    // Skip if the key would be the same
    if(new_key === old_key) {
      modal.success(i18n.t('board_saved', "Board saved!"));
      return;
    }

    persistence.ajax('/api/v1/boards/' + board.get('id') + '/rename', {
      type: 'POST',
      data: {
        old_key: old_key,
        new_key: new_key
      }
    }).then(function(res) {
      _this.set('_original_board_name', new_name);
      _this.set('boardname', new_slug);
      modal.success(i18n.t('board_saved_and_renamed', "Board saved and URL updated!"));
      // Update the URL to reflect the new board key
      _this.transitionToRoute('user.board-detail', user_name, new_slug);
    }, function() {
      // Rename failed (possibly a collision) — board was still saved
      modal.success(i18n.t('board_saved_rename_failed', "Board saved! (URL could not be updated — a board with that name may already exist)"));
    });
  },

  // Open the button-settings modal for a button
  _open_button_settings: function(btn_id, state) {
    var board = this.get('model');
    if(!board) { return; }
    var button = editManager.find_button(btn_id);
    if(button) {
      button.state = state || 'general';
      modal.open('button-settings', { button: button, board: board });
    }
  },

  // Helper to extract button ID (Button objects use .get, plain objects use direct access)
  _btn_id: function(btn) {
    if(!btn) { return null; }
    return btn.get ? btn.get('id') : btn.id;
  },

  // Find a display button in ordered_buttons by ID
  _find_display_button: function(btn_id) {
    var ob = this.get('ordered_buttons') || [];
    for(var ri = 0; ri < ob.length; ri++) {
      var row = ob[ri] || [];
      for(var ci = 0; ci < row.length; ci++) {
        var btn = row[ci];
        if(btn && (btn.id === btn_id || (btn.get && btn.get('id') === btn_id))) {
          return btn;
        }
      }
    }
    return null;
  },

  actions: {
    toggle_options_menu: function() {
      this.toggleProperty('show_options_menu');
    },

    revert_to_old_style: function() {
      this.set('show_options_menu', false);
      var user = this.get('user');
      var boardname = this.get('boardname');
      if(user && boardname) {
        this.transitionToRoute('user.board-alt', user.get('user_name'), boardname);
      }
    },

    toggle_board_collapsed: function() {
      var collapsing = !this.get('board_collapsed');
      this.set('board_collapsed', collapsing);
      if(collapsing && !this.get('panels_collapsed')) {
        this.set('panels_collapsed', true);
      }
    },

    toggle_color_legend: function() {
      this.toggleProperty('show_color_legend');
    },

    toggle_quick_phrases: function() {
      this.toggleProperty('show_quick_phrases');
    },

    toggle_categories: function() {
      this.toggleProperty('show_categories');
    },

    toggle_panels: function() {
      this.toggleProperty('panels_collapsed');
    },

    open_board_picker: function() {
      var appController = getOwner(this).lookup('controller:application');
      if(appController) {
        appController.send('openBoardPicker');
      }
    },

    // ── Button Interaction ──

    select_button: function(button) {
      if(this.get('color_picker_button') === button) { return; }

      var btn_id = this._btn_id(button);
      if(this.get('edit_mode')) {
        // If in finding_target mode (for swap or stash apply), apply to this target
        if(editManager.finding_target()) {
          editManager.apply_to_target(btn_id);
          return;
        }
        // In paint mode, paint the button
        if(this.get('paint_mode')) {
          this.send('paint_button', button);
          return;
        }
        // Otherwise open button settings modal
        this._open_button_settings(btn_id, 'general');
        return;
      }

      // Normal mode: add to sentence and speak
      var label = button.get ? button.get('label') : button.label;
      var image_url = button.get ? (button.get('local_image_url') || button.get('image')) : button.image_url;
      var vocalization = button.get ? button.get('vocalization') : button.vocalization;

      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: btn_id, label: label, image_url: image_url });
      this.set('sentence_parts', parts);

      utterance.speak_button({
        label: label,
        vocalization: vocalization || label
      });
    },

    // Action dispatched by raw_events.js for button clicks
    buttonSelect: function(id, event) {
      if(!id) { return; }
      var _this = this;
      if(_this.get('edit_mode')) {
        if(editManager.finding_target()) {
          editManager.apply_to_target(id);
        } else if(_this.get('paint_mode')) {
          editManager.paint_button(id);
        } else {
          if(typeof(event) != 'string') { event = null; }
          _this._open_button_settings(id, event || 'general');
        }
      } else {
        var button = editManager.find_button(id);
        if(!button) { return; }
        var app = _this.get('app_state.controller');
        if(app && app.activateButton) {
          app.activateButton(button, { board: _this.get('model'), event: event });
        }
      }
    },

    // Action dispatched by raw_events.js for button paint
    buttonPaint: function(id) {
      if(!id) { return; }
      var btn = this._find_display_button(id);
      if(btn) {
        this.send('paint_button', btn);
      } else if(editManager.controller === this) {
        try { editManager.paint_button(id); } catch(e) { }
      }
    },

    // Action dispatched by raw_events.js for symbol click in edit mode
    symbolSelect: function(id) {
      if(!this.get('edit_mode') || !id) { return; }
      this._open_button_settings(id, 'picture');
    },

    // Action dispatched by raw_events.js for action icon click
    actionSelect: function(id) {
      if(!this.get('edit_mode') || !id) { return; }
      this._open_button_settings(id, 'action');
    },

    // ── Color Picker (board-detail specific) ──

    open_color_picker: function(button, event) {
      if(event) { event.stopPropagation(); }
      if(this.get('color_picker_button') === button) {
        this.set('color_picker_button', null);
        return;
      }
      this.set('color_picker_button', button);
      this.set('custom_color_value', null);
    },

    close_color_picker: function() {
      this.set('color_picker_button', null);
      this.set('custom_color_value', null);
    },

    toggle_minicolors: function() {
      var _this = this;
      var $input = $('#board-detail-custom-color');
      if(!$input.length) { return; }

      if(!$input.hasClass('minicolors-input')) {
        $input.minicolors({
          theme: 'default',
          position: 'bottom left',
          change: function(hex) {
            _this.set('custom_color_value', hex);
          }
        });
      }
      if($input.next().next('.minicolors-panel:visible').length > 0) {
        $input.minicolors('hide');
      } else {
        $input.minicolors('show');
      }
    },

    apply_swatch_color: function(swatch) {
      var btn = this.get('color_picker_button');
      if(!btn) { return; }
      var btn_id = this._btn_id(btn);
      editManager.change_button(btn_id, {
        background_color: swatch.bg,
        border_color: swatch.border,
        part_of_speech: swatch.pos_class
      });
      this.set('color_picker_button', null);
    },

    apply_custom_color: function() {
      var btn = this.get('color_picker_button');
      var hex = this.get('custom_color_value');
      if(!btn || !hex) { return; }
      var fill = window.tinycolor(hex);
      if(!fill._ok) { return; }
      var border = fill.clone().darken(25);
      var btn_id = this._btn_id(btn);
      editManager.change_button(btn_id, {
        background_color: fill.toHexString(),
        border_color: border.toHexString()
      });
      this.set('color_picker_button', null);
    },

    // ── Quick Phrases & Sentence ──

    select_quick: function(quick) {
      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: quick.id, label: quick.label });
      this.set('sentence_parts', parts);
      speecher.speak_text(quick.label);
    },

    clear_sentence: function() {
      this.set('sentence_parts', []);
    },

    backspace_sentence: function() {
      var parts = (this.get('sentence_parts') || []).slice();
      if(parts.length > 0) {
        parts.pop();
        this.set('sentence_parts', parts);
      }
    },

    open_speak_menu: function() {
      modal.open('speak-menu', { inactivity_timeout: true, scannable: true });
    },

    complete_word: function(word) {
      if(!word) { return; }
      var text = word.word;
      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: 'suggestion', label: text, image_url: word.image || word.original_image });
      this.set('sentence_parts', parts);
      speecher.speak_text(text);
    },

    speak_sentence: function() {
      var text = this.get('sentence_text');
      if(text) {
        speecher.speak_text(text);
        var phrases = (this.get('recent_phrases') || []).slice();
        phrases.unshift({ text: text, timestamp: new Date() });
        if(phrases.length > 5) { phrases = phrases.slice(0, 5); }
        this.set('recent_phrases', phrases);
      }
    },

    // ── Navigation ──

    set_category: function(category_id) {
      this.set('active_category', category_id);
      this.set('show_categories', false);
    },

    nav_select: function(item_id) {
      var user = this.get('user');
      if(!user) { return; }
      var un = user.get('user_name');
      if(item_id === 'preferences') {
        this.transitionToRoute('user.preferences', un);
      } else if(item_id === 'progress-reports') {
        this.transitionToRoute('user.stats', un);
      } else if(item_id === 'goal-tracking') {
        this.transitionToRoute('user.goals', un);
      }
    },

    // ── Edit Toolbar Actions ──

    undo_edit: function() {
      editManager.undo();
    },

    redo_edit: function() {
      editManager.redo();
    },

    save_board: function() {
      this.saveButtonChanges();
    },

    cancel_edit: function() {
      this.set('edit_mode', false);
      this.set('paint_mode', null);
      this.set('color_picker_button', null);
      this.get('stashes').persist('current_mode', 'default');
      // Reload the board from the server to discard any unsaved changes
      this.load_board();
      // Transition back to the index subroute
      this.transitionToRoute('user.board-detail.index', this.get('user.user_name'), this.get('boardname'));
    },

    // ── Paint Mode ──

    set_paint_mode: function(fill, border, part_of_speech) {
      if(fill === 'hide') {
        this.set('paint_mode', { hidden: true });
      } else if(fill === 'show') {
        this.set('paint_mode', { hidden: false });
      } else {
        var fill_tc = window.tinycolor(fill);
        var border_tc = border ? window.tinycolor(border) : window.tinycolor(fill_tc.toRgb()).darken(30);
        this.set('paint_mode', {
          fill: fill_tc.toRgbString(),
          border: border_tc.toRgbString(),
          part_of_speech: part_of_speech
        });
      }
      // Also set on editManager if available
      if(editManager.controller === this) {
        editManager.set_paint_mode(fill, border, part_of_speech);
      }
    },

    clear_paint_mode: function() {
      this.set('paint_mode', null);
      if(editManager.controller === this) {
        editManager.clear_paint_mode();
      }
    },

    paint_button: function(btn) {
      var pm = this.get('paint_mode');
      if(!pm || !btn) { return; }
      var btn_id = this._btn_id(btn);

      // Update the display object directly
      if(pm.fill && pm.border) {
        emberSet(btn, 'background_color', pm.fill);
        emberSet(btn, 'border_color', pm.border);
        if(pm.part_of_speech) {
          emberSet(btn, 'part_of_speech', pm.part_of_speech);
        }
      }
      if(pm.hidden === true) { emberSet(btn, 'hidden', true); }
      if(pm.hidden === false) { emberSet(btn, 'hidden', false); }

      // Update raw board_data
      var raw_btn = this._find_raw_button(btn_id);
      if(raw_btn) {
        if(pm.fill) { raw_btn.background_color = pm.fill; }
        if(pm.border) { raw_btn.border_color = pm.border; }
        if(pm.part_of_speech) { raw_btn.painted_part_of_speech = pm.part_of_speech; }
        if(pm.hidden === true) { raw_btn.hidden = true; }
        if(pm.hidden === false) { delete raw_btn.hidden; }
      }

      // Also update via editManager if available
      if(editManager.controller === this && btn_id) {
        try { editManager.paint_button(btn_id); } catch(e) { }
      }

      this.notifyPropertyChange('ordered_buttons');
    },

    // ── Button Operations ──

    clear_button: function(btn) {
      var btn_id = this._btn_id(btn);
      if(btn_id) { editManager.clear_button(btn_id); }
    },

    stash_button: function(btn) {
      var btn_id = this._btn_id(btn);
      if(btn_id) {
        editManager.stash_button(btn_id);
        modal.success(i18n.t('button_stashed', "Button stashed!"));
      }
    },

    word_data: function(btn) {
      if(!btn) { return; }
      var label = btn.get ? btn.get('label') : btn.label;
      var vocalization = btn.get ? btn.get('vocalization') : btn.vocalization;
      var word = label || vocalization;
      if(word) {
        modal.open('word-data', { word: word, button: btn, usage_stats: null, user: this.get('app_state').get('currentUser') });
      }
    },

    board_details: function() {
      var board = this.get('model');
      if(!board) { return; }
      modal.open('board-details', { board: board });
    },

    edit_board_details: function() {
      var board = this.get('model');
      if(!board) { return; }
      modal.open('edit-board-details', { board: board });
    },

    open_button_stash: function() {
      this.set('paint_mode', null);
      modal.open('button-stash');
    },

    suggestions: function() {
      var board = this.get('model');
      if(!board) { return; }
      modal.open('button-suggestions', { board: board, user: this.get('app_state').get('currentUser') });
    },

    // ── Drag & Drop ──

    rearrangeButtons: function(dragId, dropId) {
      editManager.switch_buttons(dragId, dropId);
    },

    prep_for_swap: function(id) {
      editManager.prep_for_swap(id);
    },

    // ── Grid Configuration ──

    modify_size: function(type, action, index) {
      editManager.modify_size(type, action, index);
    },

    // ── Level Preview ──

    toggle_preview_levels: function() {
      this.toggleProperty('preview_levels_mode');
      if(!this.get('preview_levels_mode')) {
        this.set('preview_level', null);
      }
    },

    shift_level: function(direction) {
      var levels = this.get('available_levels') || [];
      if(!levels.length) { return; }
      var current = this.get('preview_level');
      var idx = current ? levels.indexOf(current) : -1;

      if(direction === 'up') {
        idx = Math.min(idx + 1, levels.length - 1);
      } else if(direction === 'down') {
        idx = Math.max(idx - 1, 0);
      } else if(direction === 'done') {
        this.set('preview_level', null);
        this.set('preview_levels_mode', false);
        return;
      }
      this.set('preview_level', levels[idx]);
    },

    // ── Misc actions dispatched by raw_events or other systems ──

    compute_height: function() {
      // No-op: board-detail uses CSS grid, not computed height
    },

    redraw: function() {
      // No-op: board-detail doesn't use canvas rendering
    },

    button_event: function(action, a, b) {
      this.send(action, a, b);
    }
  }
});
