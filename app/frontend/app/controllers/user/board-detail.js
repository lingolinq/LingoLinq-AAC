import Controller from '@ember/controller';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import speecher from '../../utils/speecher';
import utterance from '../../utils/utterance';
import editManager from '../../utils/edit_manager';
import contentGrabbers from '../../utils/content_grabbers';
import boundClasses from '../../utils/bound_classes';
import wordSuggestionsModule from '../../utils/word_suggestions';

export default Controller.extend({
  app_state: service('app-state'),
  stashes: service('stashes'),
  router: service('router'),

  is_board_detail: true,
  folder_labels_on_tab: false,
  boardname: null,
  active_category: 'all',

  board_detail_history: computed('app_state.board_detail_nav_history.[]', function() {
    return this.get('app_state.board_detail_nav_history') || [];
  }),

  has_board_history: computed('board_detail_history.[]', function() {
    return (this.get('board_detail_history') || []).length > 0;
  }),
  sentence_parts: null,
  recent_phrases: computed('app_state.board_detail_recent_phrases.[]', function() {
    return this.get('app_state.board_detail_recent_phrases') || [];
  }),
  weekly_goals: null,
  todays_schedule: null,
  show_color_legend: false,
  show_quick_phrases: false,
  show_categories: false,
  panels_collapsed: false,
  edit_mode: false,
  board_collapsed: true,
  color_picker_button: null,
  custom_color_value: null,
  show_paint_color_picker: false,
  custom_paint_color: '#4a90d9',
  paint_mode: null,
  show_paint_dropdown: false,
  button_menu_id: null,
  show_options_menu: false,
  dark_mode: false,
  board_saving: false,
  ordered_buttons: null,
  preview_level: null,
  noUndo: true,
  noRedo: true,

  init: function() {
    this._super(...arguments);
    this.set('sentence_parts', []);
    // Initialize session state on the service if not already set
    if(!this.get('app_state.board_detail_recent_phrases')) {
      this.set('app_state.board_detail_recent_phrases', []);
    }
    if(!this.get('app_state.board_detail_nav_history')) {
      this.set('app_state.board_detail_nav_history', []);
    }
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
    if(desc && desc.indexOf('CoughDrop') !== -1) {
      return i18n.t('board_detail_subtitle', "Tap symbols to build your message");
    }
    if(desc) { return desc; }
    return i18n.t('board_detail_subtitle', "Tap symbols to build your message");
  }),

  description_expanded: false,

  subtitle_is_long: computed('subtitle', function() {
    var sub = this.get('subtitle') || '';
    return sub.length > 120;
  }),

  board_image_url: computed('model.image_url', function() {
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
      { id: 'adverb', label: i18n.t('category_adverbs', "Adverbs"), css_class: 'adverb' },
      { id: 'determiner', label: i18n.t('category_determiners', "Determiners"), css_class: 'determiner' },
      { id: 'conjunction', label: i18n.t('category_conjunctions', "Conjunctions"), css_class: 'conjunction' },
      { id: 'other', label: i18n.t('category_other', "Other"), css_class: 'other' },
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
      { id: 'adverb', label: i18n.t('category_adverbs', "Adverbs"), css_class: 'adverb' },
      { id: 'determiner', label: i18n.t('category_determiners', "Determiners"), css_class: 'determiner' },
      { id: 'conjunction', label: i18n.t('category_conjunctions', "Conjunctions"), css_class: 'conjunction' },
      { id: 'other', label: i18n.t('category_other', "Other"), css_class: 'other' }
    ];
  }),

  color_picker_swatches: computed(function() {
    var darken = function(color) {
      if(window.tinycolor) {
        return window.tinycolor(color).darken(30).toHexString();
      }
      return color;
    };
    var swatches = [
      { label: i18n.t('swatch_pronoun', "Pronoun"), pos_class: 'pronoun', bg: '#FAFAAA' },
      { label: i18n.t('swatch_verb', "Verb"), pos_class: 'verb', bg: '#C0E8C8' },
      { label: i18n.t('swatch_descriptor', "Descriptor"), pos_class: 'adjective', bg: '#B9D0F6' },
      { label: i18n.t('swatch_noun', "Noun"), pos_class: 'noun', bg: '#FDCF98' },
      { label: i18n.t('swatch_social', "Social"), pos_class: 'social', bg: '#E8B5DC' },
      { label: i18n.t('swatch_negative', "Negative"), pos_class: 'negation', bg: '#F5A0A0' },
      { label: i18n.t('swatch_question', "Question"), pos_class: 'question', bg: '#D0B8E8' },
      { label: i18n.t('swatch_preposition', "Preposition"), pos_class: 'preposition', bg: '#F5DCEA' },
      { label: i18n.t('swatch_adverb', "Adverb"), pos_class: 'adverb', bg: '#D4B896' },
      { label: i18n.t('swatch_determiner', "Determiner"), pos_class: 'determiner', bg: '#DCDCDC' },
      { label: i18n.t('swatch_conjunction', "Conjunction"), pos_class: 'conjunction', bg: '#fff', border: '#ccc' },
      { label: i18n.t('swatch_other', "Other"), pos_class: 'other', bg: 'rgb(115, 204, 255)' },
      { label: i18n.t('swatch_contrast', "Contrast"), pos_class: 'contrast', bg: '#000' }
    ];
    swatches.forEach(function(s) {
      if(!s.border) {
        s.border = (s.bg === '#fff') ? '#eee' : darken(s.bg);
      }
    });
    return swatches;
  }),

  color_legend_items: computed(function() {
    return [
      { type: i18n.t('legend_pronoun', "Pronouns"), parts: i18n.t('legend_pronoun_ex', "I, you, he, she, we"), css_class: 'pronoun' },
      { type: i18n.t('legend_verb', "Verbs"), parts: i18n.t('legend_verb_ex', "go, want, eat, play, care"), css_class: 'verb' },
      { type: i18n.t('legend_descriptor', "Descriptors"), parts: i18n.t('legend_descriptor_ex', "big, happy, fast, more"), css_class: 'adjective' },
      { type: i18n.t('legend_noun', "Nouns"), parts: i18n.t('legend_noun_ex', "cat, water, home, school"), css_class: 'noun' },
      { type: i18n.t('legend_social', "Social"), parts: i18n.t('legend_social_ex', "please, hello, thank you"), css_class: 'social' },
      { type: i18n.t('legend_determiner', "Determiners"), parts: i18n.t('legend_determiner_ex', "the, a, this, that"), css_class: 'determiner' },
      { type: i18n.t('legend_conjunction', "Conjunctions"), parts: i18n.t('legend_conjunction_ex', "and, or, but, if"), css_class: 'conjunction' },
      { type: i18n.t('legend_negatives', "Negatives"), parts: i18n.t('legend_negatives_ex', "no, not, don't, stop"), css_class: 'negation' },
      { type: i18n.t('legend_questions', "Questions"), parts: i18n.t('legend_questions_ex', "what, where, who, why"), css_class: 'question' },
      { type: i18n.t('legend_prepositions', "Prepositions"), parts: i18n.t('legend_prepositions_ex', "in, on, to, with"), css_class: 'preposition' },
      { type: i18n.t('legend_adverb', "Adverbs"), parts: i18n.t('legend_adverb_ex', "quickly, very, well, always"), css_class: 'adverb' },
      { type: i18n.t('legend_other', "Other"), parts: i18n.t('legend_other_ex', "miscellaneous words"), css_class: 'other' },
      { type: i18n.t('legend_contrast', "Contrast"), parts: i18n.t('legend_contrast_ex', "high contrast buttons"), css_class: 'contrast' },
      { type: i18n.t('legend_folder', "Folder"), parts: i18n.t('legend_folder_ex', "links to another board"), css_class: 'folder' }
    ];
  }),

  // ── Shared Pipeline (editManager) ──
  // These methods match the original board/index.js controller pattern.
  // editManager is set up by the route's setupController.

  // Snapshot of the board name at load time (for rename detection on save)
  _original_board_name: null,

  // Build display buttons from raw API data (proven approach)
  _build_from_raw: function(raw) {
    var _this = this;
    var image_map = raw.image_urls || {};
    (raw.images || []).forEach(function(img) {
      if(img && img.id && img.url) { image_map[img.id] = img.url; }
    });

    var grid = raw.grid;
    if(!grid || !grid.order) {
      var buttons = (raw.buttons || []).map(function(btn) {
        return _this._make_btn(btn, image_map);
      });
      _this.set('ordered_buttons', [buttons]);
      return;
    }

    var button_map = {};
    (raw.buttons || []).forEach(function(btn) {
      if(btn && btn.id !== undefined) { button_map[String(btn.id)] = btn; }
    });

    var result = [];
    for(var ri = 0; ri < grid.rows; ri++) {
      var row = [];
      for(var ci = 0; ci < grid.columns; ci++) {
        var btn_id = (grid.order[ri] || [])[ci];
        var raw_btn = btn_id !== null && btn_id !== undefined ? button_map[String(btn_id)] : null;
        if(raw_btn) {
          row.push(_this._make_btn(raw_btn, image_map));
        } else {
          row.push({ id: btn_id || ('fake_' + ri + '_' + ci), label: '', empty: true, pos_class: 'default' });
        }
      }
      result.push(row);
    }
    _this.set('ordered_buttons', result);

    // Resolve POS for untyped buttons
    _this.resolve_unknown_buttons(_this.get('flat_ordered_buttons') || []);
  },

  _make_btn: function(btn, image_map) {
    var img_url = null;
    if(btn.image_id && image_map[btn.image_id]) {
      img_url = image_map[btn.image_id];
    }
    return {
      id: btn.id,
      label: btn.label || '',
      vocalization: btn.vocalization || '',
      image_url: img_url,
      image_id: btn.image_id,
      load_board: btn.load_board,
      hidden: btn.hidden,
      part_of_speech: btn.part_of_speech || btn.painted_part_of_speech || btn.suggested_part_of_speech,
      background_color: btn.background_color || null,
      border_color: btn.border_color || null,
      level_modifications: btn.level_modifications,
      empty: !(btn.label || btn.image_id)
    };
  },

  // Called by editManager — on board-detail we use plain objects for display,
  // so we only rebuild from raw data, not from editManager
  processButtons: function() {
    // No-op: board-detail uses _build_from_raw for display.
    // editManager.process_for_displaying overwrites ordered_buttons
    // with async Button objects that may not resolve, so we skip it.
  },

  update_button_symbol_class: function() {
    var buttons = this.get('model.buttons');
    if(buttons) {
      boundClasses.add_rules(buttons);
    }
  },

  // No-ops: board-detail uses CSS grid, not computed height or canvas
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
      var word_suggestions = (window.LingoLinq && window.LingoLinq.word_suggestions) || wordSuggestionsModule;
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

  undo_redo_disabled: computed('borders_matched', 'board_recolored', 'folder_labels_on_tab', function() {
    return this.get('borders_matched') || this.get('board_recolored') || this.get('folder_labels_on_tab');
  }),

  // Button text preferences from user device settings
  button_text_size_class: computed('app_state.referenced_user.preferences.device.button_text', function() {
    var size = this.get('app_state.referenced_user.preferences.device.button_text') || 'medium';
    return 'md-board-detail-grid--text-' + size;
  }),

  button_text_size_px: computed('app_state.referenced_user.preferences.device.button_text', function() {
    var size = this.get('app_state.referenced_user.preferences.device.button_text') || 'medium';
    var map = { 'small': 14, 'medium': 18, 'large': 22, 'huge': 35 };
    return map[size] || 18;
  }),

  button_text_position_class: computed('app_state.referenced_user.preferences.device.button_text_position', function() {
    var pos = this.get('app_state.referenced_user.preferences.device.button_text_position') || 'top';
    return 'md-board-detail-grid--text-pos-' + pos;
  }),

  button_font_style: computed('app_state.referenced_user.preferences.device.button_style', function() {
    var style = this.get('app_state.referenced_user.preferences.device.button_style') || 'default';
    var fonts = {
      'arial': 'Arial, sans-serif',
      'arial_caps': 'Arial, sans-serif',
      'arial_small': 'Arial, sans-serif',
      'comic_sans': '"Comic Sans MS", cursive',
      'comic_sans_caps': '"Comic Sans MS", cursive',
      'comic_sans_small': '"Comic Sans MS", cursive',
      'open_dyslexic': 'OpenDyslexic, sans-serif',
      'open_dyslexic_caps': 'OpenDyslexic, sans-serif',
      'open_dyslexic_small': 'OpenDyslexic, sans-serif',
      'architects_daughter': 'ArchitectsDaughter, cursive',
      'architects_daughter_caps': 'ArchitectsDaughter, cursive',
      'architects_daughter_small': 'ArchitectsDaughter, cursive'
    };
    var cases = {};
    if(style && style.match(/_caps$/)) { cases.transform = 'uppercase'; }
    if(style && style.match(/_small$/)) { cases.transform = 'lowercase'; }
    return {
      family: fonts[style] || 'inherit',
      transform: cases.transform || 'none'
    };
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
  _apply_category_filter: function(category) {
    var ob = this.get('ordered_buttons') || [];
    var _this = this;
    var match_map = {
      'pronoun': ['pronoun'],
      'verb': ['verb'],
      'adjective': ['adjective'],
      'noun': ['noun', 'nominative'],
      'social': ['social', 'social_phrase', 'interjection'],
      'negation': ['negation', 'expletive'],
      'question': ['question'],
      'preposition': ['preposition'],
      'adverb': ['adverb'],
      'determiner': ['determiner', 'article'],
      'conjunction': ['conjunction', 'number'],
      'other': ['other'],
      'folder': ['folder']
    };
    var matches = match_map[category] || null;
    for(var ri = 0; ri < ob.length; ri++) {
      var row = ob[ri] || [];
      for(var ci = 0; ci < row.length; ci++) {
        var btn = row[ci];
        if(!btn) { continue; }
        var is_empty = (btn.get && btn.get('empty')) || btn.empty;
        if(is_empty) {
          if(btn.set) { btn.set('_filtered_out', category !== 'all'); }
          else { btn._filtered_out = category !== 'all'; }
          continue;
        }
        if(!category || category === 'all') {
          if(btn.set) { btn.set('_filtered_out', false); }
          else { btn._filtered_out = false; }
        } else {
          var pos = _this.pos_css_class(btn);
          var out = matches ? matches.indexOf(pos) < 0 : false;
          if(btn.set) { btn.set('_filtered_out', out); }
          else { btn._filtered_out = out; }
        }
      }
    }
    // Force re-render
    this.set('ordered_buttons', ob.map(function(row) { return [].concat(row); }));
  },

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
      'adjective': ['adjective'],
      'noun': ['noun', 'nominative'],
      'social': ['social', 'social_phrase', 'interjection'],
      'negation': ['negation', 'expletive'],
      'question': ['question'],
      'preposition': ['preposition'],
      'adverb': ['adverb'],
      'determiner': ['determiner', 'article'],
      'conjunction': ['conjunction', 'number'],
      'other': ['other'],
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
    var board = this.get('model');
    if(!board) { return; }

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

    // Use editManager to convert Button objects to save format
    var state = editManager.process_for_saving();
    if(!state || !state.buttons) {
      modal.error(i18n.t('board_save_failed', "Failed to save board"));
      return;
    }

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
    this.set('board_recolored', false);
    this.set('_saved_recolor', null);
    this.set('borders_matched', false);
    this.set('_saved_border_colors', null);
    stashes.persist('current_mode', 'default');

    // Preserve image_urls before save
    var imageUrlsBeforeSave = board.get('image_urls') ? Object.assign({}, board.get('image_urls')) : {};
    (orderedButtons || []).forEach(function(btnRow) {
      (btnRow || []).forEach(function(btn) {
        var imgId = btn && (btn.get ? btn.get('image_id') : null);
        if(imgId && !imageUrlsBeforeSave[imgId]) {
          var url = btn.get ? btn.get('local_image_url') : null;
          if(url) { imageUrlsBeforeSave[imgId] = url; }
        }
      });
    });

    // Show loading state
    _this.set('board_saving', true);

    // Save via Ember Data (shared pipeline)
    board.save().then(function() {
      // Merge back image_urls
      if(imageUrlsBeforeSave) {
        var current = board.get('image_urls') || {};
        for(var k in imageUrlsBeforeSave) {
          if(!current[k]) { current[k] = imageUrlsBeforeSave[k]; }
        }
        board.set('image_urls', current);
      }

      if(update_locale) {
        stashes.persist('label_locale', update_locale);
        _this.get('app_state').set('label_locale', update_locale);
        stashes.persist('vocalization_locale', update_locale);
        _this.get('app_state').set('vocalization_locale', update_locale);
      }

      // Rebuild display from fresh saved data
      persistence.ajax('/api/v1/boards/' + board.get('key'), { type: 'GET' }).then(function(data) {
        if(data && data.board) {
          _this._build_from_raw(data.board);
        }
        _this.set('board_saving', false);

        // Transition to index subroute so edit route can be re-entered
        _this.get('router').transitionTo('user.board-detail.index', _this.get('user.user_name'), _this.get('boardname'));
        _this.set('panels_collapsed', true);
        _this.set('board_collapsed', true);

        // Auto-rename the board key if the display name changed
        var original_name = _this.get('_original_board_name');
        var current_name = board.get('name');
        if(original_name && current_name && original_name !== current_name) {
          _this._auto_rename_board(board, current_name);
          _this.set('_original_board_name', current_name);
        } else {
          modal.success(i18n.t('board_saved', "Board saved!"));
        }
      }, function() {
        _this.set('board_saving', false);
        _this.get('router').transitionTo('user.board-detail.index', _this.get('user.user_name'), _this.get('boardname'));
        _this.set('panels_collapsed', true);
        _this.set('board_collapsed', true);
        modal.success(i18n.t('board_saved', "Board saved!"));
      });
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
      _this.get('router').transitionTo('user.board-detail', user_name, new_slug);
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

  // Set up the floating cursor element for manual placement mode

  // Generate the next available button ID for the board
  _next_button_id: function() {
    var board = this.get('model');
    var buttons = (board && board.get('buttons')) || [];
    var max_id = 0;
    buttons.forEach(function(b) {
      var id = parseInt(b.id, 10);
      if(id > max_id) { max_id = id; }
    });
    // Also check ordered_buttons for IDs from fake buttons
    var ob = this.get('ordered_buttons') || [];
    ob.forEach(function(row) {
      (row || []).forEach(function(btn) {
        var id = parseInt(btn.get ? btn.get('id') : btn.id, 10);
        if(id > max_id) { max_id = id; }
      });
    });
    return max_id + 1;
  },

  // Push current board state to navigation history
  _push_nav_history: function() {
    var user = this.get('user');
    var boardname = this.get('boardname');
    if(!user || !boardname) { return; }
    var history = (this.get('app_state.board_detail_nav_history') || []).slice();
    history.push({
      user_name: user.get('user_name'),
      boardname: boardname,
      title: this.get('title')
    });
    // Cap at 20 entries
    if(history.length > 20) { history = history.slice(history.length - 20); }
    this.set('app_state.board_detail_nav_history', history);
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

    enter_edit_mode: function() {
      this.set('show_options_menu', false);
      this.set('show_color_legend', false);
      this.set('board_collapsed', false);
      this.set('panels_collapsed', true);
      this.get('router').transitionTo('user.board-detail.edit', this.get('user.user_name'), this.get('boardname'));
    },

    exit_to_home: function() {
      this.set('app_state.board_detail_nav_history', []);
      this.set('app_state.board_detail_entry_board', null);
      this.get('router').transitionTo('index');
    },

    exit_speak_mode: function() {
      this.set('show_options_menu', false);
      this.get('app_state').toggle_speak_mode();
    },

    toggle_all_buttons: function() {
      this.set('show_options_menu', false);
      var state = this.get('stashes').get('all_buttons_enabled');
      if(state) {
        this.get('stashes').persist('all_buttons_enabled', null);
      } else {
        this.get('stashes').persist('all_buttons_enabled', true);
      }
    },

    toggle_focus: function() {
      this.set('show_options_menu', false);
      if(this.get('app_state').get('focus_words')) {
        this.get('app_state').set('focus_words', null);
        this.get('model').set('focus_id', 'blank');
        editManager.process_for_displaying();
      } else {
        modal.open('modals/focus-words', {board: this.get('model')});
      }
    },

    switch_communicators: function() {
      this.set('show_options_menu', false);
      var _this = this;
      var ready = RSVP.resolve({correct_pin: true});
      if(this.get('app_state').get('speak_mode') && this.get('app_state').get('currentUser.preferences.require_speak_mode_pin') && this.get('app_state').get('currentUser.preferences.speak_mode_pin')) {
        ready = modal.open('speak-mode-pin', {actual_pin: this.get('app_state').get('currentUser.preferences.speak_mode_pin'), action: 'none', hide_hint: this.get('app_state').get('currentUser.preferences.hide_pin_hint')});
      }
      ready.then(function(res) {
        if(res && res.correct_pin) {
          modal.open('switch-communicators', {});
        }
      }, function() { });
    },

    find_button: function() {
      this.set('show_options_menu', false);
      var include_other_boards = this.get('app_state').get('speak_mode') && ((this.get('stashes').get('root_board_state') || {}).key) == this.get('app_state').get('currentUser.preferences.home_board.key');
      modal.open('find-button', {
        inactivity_timeout: this.get('app_state').get('speak_mode'),
        board: this.get('model'),
        include_other_boards: include_other_boards
      });
    },

    toggle_sticky_board: function() {
      this.set('show_options_menu', false);
      this.get('stashes').persist('sticky_board', !this.get('stashes').get('sticky_board'));
    },

    toggle_pause_logging: function() {
      this.set('show_options_menu', false);
      var ts = (new Date()).getTime();
      if(this.get('stashes').get('logging_paused_at')) {
        ts = null;
      }
      this.get('stashes').persist('logging_paused_at', ts);
    },

    revert_to_old_style: function() {
      this.set('show_options_menu', false);
      var user = this.get('user');
      var boardname = this.get('boardname');
      if(user && boardname) {
        this.get('router').transitionTo('user.board-alt', user.get('user_name'), boardname);
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

    toggle_description: function() {
      this.toggleProperty('description_expanded');
    },

    speak_phrase: function(phrase) {
      if(phrase && phrase.text) {
        utterance.speak_text(phrase.text);
      }
    },

    go_back: function() {
      var history = (this.get('app_state.board_detail_nav_history') || []).slice();
      var prev = history.pop();
      if(!prev) { return; }
      this.set('app_state.board_detail_nav_history', history);
      this.get('router').transitionTo('user.board-detail', prev.user_name, prev.boardname);
    },

    go_home: function() {
      this.set('show_options_menu', false);
      // Prefer the user's saved home board
      var home = this.get('app_state.currentUser.preferences.home_board');
      if(home && home.key) {
        this.set('app_state.board_detail_nav_history', []);
        var parts = home.key.split('/');
        this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
        return;
      }
      // Fall back to the first board the user entered on this session
      var entry = this.get('app_state.board_detail_entry_board');
      if(entry && entry.user_name && entry.boardname) {
        // Check if already on the entry board
        var current_boardname = this.get('boardname');
        var current_user = this.get('user.user_name');
        if(current_boardname === entry.boardname && current_user === entry.user_name) {
          modal.notice(i18n.t('no_home_board_set', "You haven't selected a home board yet. You can set one in your user preferences."));
          return;
        }
        this.set('app_state.board_detail_nav_history', []);
        this.get('router').transitionTo('user.board-detail', entry.user_name, entry.boardname);
        return;
      }
      // No entry board either
      modal.notice(i18n.t('no_home_board_set', "You haven't selected a home board yet. You can set one in your user preferences."));
    },

    // button-listener dispatches events here for scanning/gaze/dwell support
    button_event: function(action, a, b) {
      this.send(action, a, b);
    },

    // button-listener delegates to buttonSelect/buttonPaint (defined below in actions)

    toggle_quick_phrases: function() {
      this.toggleProperty('show_quick_phrases');
    },

    toggle_categories: function() {
      this.toggleProperty('show_categories');
    },

    toggle_panels: function() {
      this.toggleProperty('panels_collapsed');
    },

    toggle_dark_mode: function() {
      this.toggleProperty('dark_mode');
    },

    toggle_favorite: function() {
      var board = this.get('model');
      if(board.get('starred')) {
        board.unstar();
      } else {
        board.star();
      }
    },

    make_a_copy: function() {
      var _this = this;
      var board = _this.get('model');
      if(!persistence.get('online')) {
        modal.error(i18n.t('need_online_for_copying', "You must be connected to the Internet to make copies of boards."));
        return;
      }
      modal.open('copy-board', {board: board}).then(function(opts) {
        if(opts && opts.board) {
          _this.get('app_state').jump_to_board({
            id: opts.board.get('id'),
            key: opts.board.get('key')
          });
        }
      });
    },

    set_as_home: function() {
      var board = this.get('model');
      modal.open('set-as-home', {board: board});
    },

    add_to_sidebar: function() {
      var _this = this;
      var board = _this.get('model');
      modal.open('add-to-sidebar', {board: {
        name: board.get('name'),
        key: board.get('key'),
        levels: board.get('levels'),
        home_lock: false,
        image: board.get('image_url')
      }});
    },

    download_board: function() {
      var _this = this;
      this.get('app_state').assert_source().then(function() {
        var board = _this.get('model');
        if(!board) { return; }
        var linked = board.get('linked_boards');
        var has_links = !!(linked && linked.length > 0);
        var board_id = board.get('key') || board.get('id');
        modal.open('download-board', { type: 'obf', has_links: has_links, id: board_id });
      }, function() {});
    },

    print_board: function() {
      var _this = this;
      this.get('app_state').assert_source().then(function() {
        var board = _this.get('model');
        if(!board) { return; }
        var linked = board.get('linked_boards');
        var has_links = !!(linked && linked.length > 0);
        var board_id = board.get('key') || board.get('id');
        modal.open('download-board', { type: 'pdf', has_links: has_links, id: board_id });
      }, function() {});
    },

    share_board: function() {
      var _this = this;
      this.get('app_state').assert_source().then(function() {
        modal.open('share-board', { board: _this.get('model') });
      }, function() {});
    },

    other_board_actions: function() {
      modal.open('modals/board-actions', { board: this.get('model') });
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
        if(editManager.finding_target()) {
          editManager.apply_to_target(btn_id);
          return;
        }
        if(this.get('paint_mode')) {
          this.send('paint_button', button);
          return;
        }
        // If the click landed on the label input, let it focus for inline editing
        var activeEl = document.activeElement;
        if(activeEl && (activeEl.classList.contains('md-board-detail-symbol-card__label-input') || activeEl.classList.contains('md-folder-tab__label-input'))) {
          return;
        }
        this._open_button_settings(btn_id, 'general');
        return;
      }

      // Speak mode
      var _this = this;
      // button may be a plain object or a Button object
      var _get = function(obj, key) {
        return (obj && obj.get && typeof obj.get === 'function') ? obj.get(key) : (obj && obj[key]);
      };

      // Folder navigation — intercept for board-detail routing
      var load_board = _get(button, 'load_board');
      if(load_board) {
        _this._push_nav_history();
        var board_key = load_board.key;
        if(board_key && board_key.indexOf('/') !== -1) {
          var key_parts = board_key.split('/');
          _this.get('router').transitionTo('user.board-detail', key_parts[0], key_parts.slice(1).join('/'));
          return;
        }
        var lookup = board_key || load_board.id;
        if(lookup) {
          persistence.ajax('/api/v1/boards/' + lookup, { type: 'GET' }).then(function(data) {
            if(data && data.board && data.board.key) {
              var parts = data.board.key.split('/');
              _this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
            }
          });
          return;
        }
      }

      // Add to sentence bar
      var label = _get(button, 'label');
      var image_url = _get(button, 'local_image_url') || _get(button, 'image_url');
      var vocalization = _get(button, 'vocalization');
      var parts = (_this.get('sentence_parts') || []).slice();
      parts.push({ id: btn_id, label: label, image_url: image_url });
      _this.set('sentence_parts', parts);

      // Speak the button immediately
      speecher.stop('text');
      utterance.speak_button({
        label: label,
        vocalization: vocalization || label
      });

      // Also try full activation for logging and special actions
      var appController = _this.get('app_state.controller');
      var board = _this.get('model');
      var em_button = editManager.find_button(btn_id);
      var has_em = em_button && em_button.get && typeof em_button.get === 'function';
      if(has_em && appController && appController.activateButton && board) {
        appController.activateButton(em_button, { board: board });
      }
    },

    // Action dispatched by raw_events.js / button-listener for button clicks
    buttonSelect: function(id, event) {
      if(!id) { return; }
      var button = editManager.find_button(id);
      if(button) {
        this.send('select_button', button);
      }
    },

    // Action dispatched by raw_events.js for button paint
    buttonPaint: function(id) {
      if(!id) { return; }
      if(editManager.controller === this) {
        editManager.paint_button(id);
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
      this.set('button_menu_id', null);
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
        var phrases = (this.get('app_state.board_detail_recent_phrases') || []).slice();
        phrases.unshift({ text: text, timestamp: new Date() });
        if(phrases.length > 5) { phrases = phrases.slice(0, 5); }
        this.set('app_state.board_detail_recent_phrases', phrases);
      }
    },

    // ── Navigation ──

    set_category: function(category_id) {
      this.set('active_category', category_id);
      this.set('show_categories', false);
      this._apply_category_filter(category_id);
    },

    nav_select: function(item_id) {
      var user = this.get('user');
      if(!user) { return; }
      var un = user.get('user_name');
      if(item_id === 'preferences') {
        this.get('router').transitionTo('user.preferences', un);
      } else if(item_id === 'progress-reports') {
        this.get('router').transitionTo('user.stats', un);
      } else if(item_id === 'goal-tracking') {
        this.get('router').transitionTo('user.goals', un);
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
      var _this = this;
      modal.open('confirm-discard-changes', {}).then(function(result) {
        if(result === 'discard') {
          _this.set('edit_mode', false);
          _this.set('paint_mode', null);
          _this.set('color_picker_button', null);
          _this.set('board_recolored', false);
          _this.set('_saved_recolor', null);
          _this.set('borders_matched', false);
          _this.set('_saved_border_colors', null);
          _this.get('stashes').persist('current_mode', 'default');
          // Discard unsaved changes: rollback Ember Data model and reload fresh from server
          _this.get('model').rollbackAttributes();
          _this.set('ordered_buttons', null);
          _this.set('board_loading', true);
          var board_key = _this.get('user.user_name') + '/' + _this.get('boardname');
          persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
            if(data && data.board) {
              _this.set('_raw_board_data', data.board);
              _this._build_from_raw(data.board);
            }
            _this.set('board_loading', false);
          }, function() {
            _this.set('board_loading', false);
          });
          // Transition back to the index subroute with panels collapsed
          _this.set('panels_collapsed', true);
          _this.set('board_collapsed', true);
          _this.get('router').transitionTo('user.board-detail.index', _this.get('user.user_name'), _this.get('boardname'));
        }
      });
    },

    // ── Paint Mode ──

    set_paint_mode: function(fill, border, part_of_speech) {
      this.set('show_paint_dropdown', false);
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
      this.set('show_paint_color_picker', false);
      if(editManager.controller === this) {
        editManager.clear_paint_mode();
      }
    },

    toggle_paint_color_picker: function() {
      this.toggleProperty('show_paint_color_picker');
    },

    toggle_paint_dropdown: function() {
      this.toggleProperty('show_paint_dropdown');
    },

    update_custom_paint_color: function(color) {
      this.set('custom_paint_color', color);
    },

    apply_custom_paint_color: function() {
      var color = this.get('custom_paint_color');
      if(!color) { return; }
      // Darken slightly for border
      var tc = window.tinycolor(color);
      var border = tc.darken(15).toHexString();
      this.set('show_paint_color_picker', false);
      this.send('set_paint_mode', color, border, null);
    },

    paint_button: function(btn) {
      var pm = this.get('paint_mode');
      if(!pm || !btn) { return; }
      var btn_id = this._btn_id(btn);

      // Apply paint — mutate the object properties
      if(pm.fill) {
        if(btn.set && typeof btn.set === 'function') {
          btn.set('background_color', pm.fill);
          btn.set('border_color', pm.border || pm.fill);
        } else {
          btn.background_color = pm.fill;
          btn.border_color = pm.border || pm.fill;
        }
      }
      if(pm.part_of_speech) {
        if(btn.set && typeof btn.set === 'function') {
          btn.set('part_of_speech', pm.part_of_speech);
          btn.set('painted_part_of_speech', pm.part_of_speech);
        } else {
          btn.part_of_speech = pm.part_of_speech;
          btn.painted_part_of_speech = pm.part_of_speech;
        }
      }
      if(pm.hidden === true) {
        if(btn.set && typeof btn.set === 'function') { btn.set('hidden', true); } else { btn.hidden = true; }
      }
      if(pm.hidden === false) {
        if(btn.set && typeof btn.set === 'function') { btn.set('hidden', false); } else { btn.hidden = false; }
      }

      // Also update the model's raw buttons for saving
      var model_buttons = this.get('model.buttons') || [];
      var raw = model_buttons.find(function(b) { return b && String(b.id) === String(btn_id); });
      if(raw) {
        if(pm.fill) {
          raw.background_color = pm.fill;
          raw.border_color = pm.border || pm.fill;
        }
        if(pm.part_of_speech) {
          raw.painted_part_of_speech = pm.part_of_speech;
        }
        if(pm.hidden === true) { raw.hidden = true; }
        if(pm.hidden === false) { delete raw.hidden; }
      }

      // Force re-render by rebuilding the array with new row references
      var ob = this.get('ordered_buttons');
      if(ob) {
        var newOb = ob.map(function(row) { return [].concat(row); });
        this.set('ordered_buttons', null);
        this.set('ordered_buttons', newOb);
      }
    },

    // ── Button Operations ──

    toggle_button_menu: function(btn) {
      var btn_id = btn.get ? btn.get('id') : btn.id;
      if(this.get('button_menu_id') === btn_id) {
        this.set('button_menu_id', null);
      } else {
        this.set('button_menu_id', btn_id);
      }
    },

    edit_button_settings: function(btn) {
      this.set('button_menu_id', null);
      var btn_id = this._btn_id(btn);
      if(btn_id) {
        this._open_button_settings(btn_id, 'general');
      }
    },

    clear_button: function(btn) {
      this.set('button_menu_id', null);
      var btn_id = this._btn_id(btn);
      if(btn_id) { editManager.clear_button(btn_id); }
    },

    stash_button: function(btn) {
      this.set('button_menu_id', null);
      var btn_id = this._btn_id(btn);
      if(btn_id) {
        editManager.stash_button(btn_id);
        modal.success(i18n.t('button_stashed', "Button stashed!"));
      }
    },

    word_data: function(btn) {
      this.set('button_menu_id', null);
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
      modal.open('board-details', { board: board, edit_mode: this.get('edit_mode') });
    },

    edit_board_details: function() {
      var board = this.get('model');
      if(!board) { return; }
      modal.open('edit-board-details', { board: board });
    },

    recolor_board: function() {
      var _this = this;
      var saved = this.get('_saved_recolor');

      if(saved) {
        // Revert to saved colors
        for(var id in saved) {
          editManager.change_button(id, {
            background_color: saved[id].bg,
            border_color: saved[id].border
          });
        }
        this.set('_saved_recolor', null);
        this.set('board_recolored', false);
        return;
      }

      modal.open('confirm-recolor-board', {}).then(function(result) {
        if(result === 'recolor') {
          var ob = _this.get('ordered_buttons') || [];
          var colors = window.LingoLinq.board_detail_keyed_colors || window.LingoLinq.keyed_colors;
          var savedColors = {};
          for(var ri = 0; ri < ob.length; ri++) {
            var row = ob[ri] || [];
            for(var ci = 0; ci < row.length; ci++) {
              var btn = row[ci];
              if(!btn) { continue; }
              var is_empty = btn.get ? btn.get('empty') : btn.empty;
              var is_folder = btn.get ? btn.get('load_board') : btn.load_board;
              var label = btn.get ? btn.get('label') : btn.label;
              if(is_empty || is_folder || !label) { continue; }
              var btn_id = btn.get ? btn.get('id') : btn.id;
              // Save current colors before overwriting
              savedColors[btn_id] = {
                bg: btn.get ? btn.get('background_color') : btn.background_color,
                border: btn.get ? btn.get('border_color') : btn.border_color
              };
              // Clear existing colors so check_for_parts_of_speech will assign new ones
              editManager.change_button(btn_id, {
                background_color: null,
                border_color: null
              });
              btn.check_for_parts_of_speech(colors);
            }
          }
          _this.set('_saved_recolor', savedColors);
          _this.set('board_recolored', true);
          // If borders are matched, re-apply after API calls complete
          if(_this.get('borders_matched')) {
            runLater(function() {
              var currentOb = _this.get('ordered_buttons') || [];
              for(var ri2 = 0; ri2 < currentOb.length; ri2++) {
                var row2 = currentOb[ri2] || [];
                for(var ci2 = 0; ci2 < row2.length; ci2++) {
                  var b = row2[ci2];
                  if(!b) { continue; }
                  var bEmpty = (b.get && b.get('empty')) || b.empty;
                  var bFolder = (b.get && b.get('load_board')) || b.load_board;
                  var bBg = (b.get && b.get('background_color')) || b.background_color;
                  if(bEmpty || bFolder || !bBg) { continue; }
                  var bId = (b.get && b.get('id')) || b.id;
                  editManager.change_button(bId, { border_color: bBg });
                }
              }
              _this.set('ordered_buttons', currentOb.map(function(r) { return [].concat(r); }));
            }, 2000);
          }
        }
      });
    },

    toggle_folder_label_position: function() {
      this.toggleProperty('folder_labels_on_tab');
    },

    match_borders_to_fill: function() {
      var ob = this.get('ordered_buttons') || [];
      var saved = this.get('_saved_border_colors');

      if(saved) {
        // Revert to saved border colors
        for(var id in saved) {
          editManager.change_button(id, { border_color: saved[id] });
        }
        this.set('_saved_border_colors', null);
        this.set('borders_matched', false);
      } else {
        // Save current borders and match to fill
        var savedColors = {};
        for(var ri = 0; ri < ob.length; ri++) {
          var row = ob[ri] || [];
          for(var ci = 0; ci < row.length; ci++) {
            var btn = row[ci];
            if(!btn) { continue; }
            var is_empty = (btn.get && btn.get('empty')) || btn.empty;
            var is_folder = (btn.get && btn.get('load_board')) || btn.load_board;
            var bg = (btn.get && btn.get('background_color')) || btn.background_color;
            if(is_empty || is_folder || !bg) { continue; }
            var btn_id = (btn.get && btn.get('id')) || btn.id;
            var current_border = (btn.get && btn.get('border_color')) || btn.border_color;
            savedColors[btn_id] = current_border || null;
            editManager.change_button(btn_id, { border_color: bg });
          }
        }
        this.set('_saved_border_colors', savedColors);
        this.set('borders_matched', true);
      }
      // Force Ember to re-render the grid by creating a new array reference
      this.set('ordered_buttons', ob.map(function(row) { return [].concat(row); }));
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
    }
  }
});
