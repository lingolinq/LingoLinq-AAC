import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import demoBoardLoader from '../../utils/demo_board_loader';
import speecher from '../../utils/speecher';
import i18n from '../../utils/i18n';
import { buttonSpacingPx, buttonBorderPx, buttonTextPx } from '../../utils/display_prefs';

function default_prefs() {
  return {
    button_spacing: 'medium',
    button_border: 'medium',
    button_text: 'medium',
    button_text_position: 'bottom',
    button_style: 'default',
    hidden_buttons: 'grid',
    stretch_buttons: 'none',
    symbol_background: 'clear',
    high_contrast: false,
    utterance_text_only: false
  };
}

var TEXT_SIZE_OPTIONS = ['small', 'medium', 'large', 'huge'];
var BORDER_SIZE_OPTIONS = ['none', 'small', 'medium', 'large', 'huge'];
var SPACING_OPTIONS = ['none', 'small', 'medium', 'large'];
var VISIBLE_SENTENCE_PARTS = 8;
var DEMO_QUICK_WORDS = [
  { id: 'period', label: ".", punctuation: true, silent: true },
  { id: 'comma', label: ",", punctuation: true, silent: true },
  { id: 'i', label: "I" },
  { id: 'you', label: "you" },
  { id: 'we', label: "we" },
  { id: 'me', label: "me" },
  { id: 'my', label: "my" },
  { id: 'he', label: "he" },
  { id: 'she', label: "she" },
  { id: 'they', label: "they" },
  { id: 'it', label: "it" },
  { id: 'is', label: "is" },
  { id: 'want', label: "want" },
  { id: 'need', label: "need" },
  { id: 'help', label: "help" },
  { id: 'yes', label: "yes" },
  { id: 'no', label: "no" },
  { id: 'more', label: "more" },
  { id: 'go', label: "go" },
  { id: 'stop', label: "stop" }
];

function sentence_text_for(parts) {
  var text = '';
  (parts || []).forEach(function(part) {
    var word = part.vocalization || part.label;
    if(!word) { return; }
    if(part.punctuation) {
      text = text.replace(/\s+$/, '') + part.label;
    } else {
      text = text ? (text + ' ' + word) : word;
    }
  });
  return text;
}

export default Controller.extend({
  appState: service('app-state'),
  queryParams: [
    { board_key: 'board' },
    'source'
  ],
  board_key: null,
  source: null,
  edit_mode: false,
  labels_editable: false,
  board: null,
  manifest: null,
  ordered_buttons: null,
  sentence_parts: null,
  sentence_dialog_open: false,
  board_history: null,
  status_message: null,
  demo_prefs: null,
  quick_words_open: false,
  quick_words: DEMO_QUICK_WORDS,
  folder_colored_face: false,
  folder_labels_on_tab: false,
  folder_colored_corner: true,
  active_category: 'all',
  status_message_timer: null,

  setup_demo: function(model) {
    this.set('board_key', model.board_key || null);
    this.set('source', model.source || null);
    this.set('manifest', model.manifest);
    this.set('demo_prefs', default_prefs());
    this.set('sentence_parts', []);
    this.set('board_history', []);
    this._set_board(model.board);
  },

  reset_demo: function() {
    this.set('sentence_parts', []);
    this.set('sentence_dialog_open', false);
    this.set('board_history', []);
    if(this.get('status_message_timer')) {
      runCancel(this.get('status_message_timer'));
      this.set('status_message_timer', null);
    }
    this.set('status_message', null);
    this.set('edit_mode', false);
  },

  _set_board: function(board) {
    this.set('board', board);
    this.set('ordered_buttons', board ? board.ordered_buttons : []);
    var locale = (board && board.locale) || 'en';
    this.appState.set('label_locale', locale);
    this.appState.set('vocalization_locale', locale);
  },

  has_board_history: computed('board_history.[]', function() {
    return (this.get('board_history') || []).length > 0;
  }),

  has_sentence: computed('sentence_parts.[]', function() {
    return (this.get('sentence_parts') || []).length > 0;
  }),

  sentence_text: computed('sentence_parts.[]', function() {
    return sentence_text_for(this.get('sentence_parts') || []);
  }),

  visible_sentence_parts: computed('sentence_parts.[]', function() {
    var parts = this.get('sentence_parts') || [];
    return parts.slice(Math.max(parts.length - VISIBLE_SENTENCE_PARTS, 0));
  }),

  has_hidden_sentence_parts: computed('sentence_parts.[]', function() {
    return (this.get('sentence_parts') || []).length > VISIBLE_SENTENCE_PARTS;
  }),

  utterance_show_symbols: computed('demo_prefs.utterance_text_only', function() {
    return !this.get('demo_prefs.utterance_text_only');
  }),

  utterance_text_on_top: computed('demo_prefs.button_text_position', function() {
    return (this.get('demo_prefs.button_text_position') || 'top') === 'top';
  }),

  current_grid: computed('ordered_buttons', function() {
    var ordered = this.get('ordered_buttons') || [];
    return {
      rows: ordered.length,
      columns: (ordered[0] && ordered[0].length) || 0
    };
  }),

  grid_style: computed('current_grid.rows', 'current_grid.columns', function() {
    var rows = this.get('current_grid.rows');
    var columns = this.get('current_grid.columns');
    var parts = [];
    if(columns) { parts.push('--board-columns: ' + columns); }
    if(rows) { parts.push('--board-rows: ' + rows); }
    return parts.length ? parts.join('; ') + ';' : '';
  }),

  button_text_size_class: computed('demo_prefs.button_text', function() {
    return 'md-board-detail-grid--text-' + (this.get('demo_prefs.button_text') || 'medium');
  }),

  // Demo page reads from the canonical display-prefs map in
  // utils/display_prefs.js so the demo grid stays in lockstep with
  // every other rendering surface.
  button_text_size_px: computed('demo_prefs.button_text', function() {
    return buttonTextPx(this.get('demo_prefs.button_text'));
  }),

  button_spacing_px: computed('demo_prefs.button_spacing', function() {
    return buttonSpacingPx(this.get('demo_prefs.button_spacing'));
  }),

  button_border_px: computed('demo_prefs.button_border', function() {
    return buttonBorderPx(this.get('demo_prefs.button_border'));
  }),

  button_shape_class: computed('demo_prefs.stretch_buttons', function() {
    var pref = this.get('demo_prefs.stretch_buttons') || 'none';
    if(pref === 'prefer_tall') { return 'md-board-detail-grid--shape-tall'; }
    if(pref === 'prefer_wide') { return 'md-board-detail-grid--shape-wide'; }
    return 'md-board-detail-grid--shape-square';
  }),

  button_text_position_class: computed('demo_prefs.button_text_position', function() {
    return 'md-board-detail-grid--text-pos-' + (this.get('demo_prefs.button_text_position') || 'bottom');
  }),

  hidden_buttons_class: computed('demo_prefs.hidden_buttons', function() {
    return 'md-board-detail-grid--hidden-' + (this.get('demo_prefs.hidden_buttons') || 'grid');
  }),

  symbol_background_class: computed('demo_prefs.symbol_background', function() {
    return 'symbol_background_' + (this.get('demo_prefs.symbol_background') || 'clear');
  }),

  high_contrast_class: computed('demo_prefs.high_contrast', function() {
    return this.get('demo_prefs.high_contrast') ? 'high_contrast' : '';
  }),

  image_background_value: computed('demo_prefs.symbol_background', 'demo_prefs.high_contrast', function() {
    if(this.get('demo_prefs.high_contrast')) { return 'high_contrast'; }
    return this.get('demo_prefs.symbol_background') || 'clear';
  }),

  button_font_style: computed('demo_prefs.button_style', function() {
    var style = this.get('demo_prefs.button_style') || 'default';
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
    return {
      family: fonts[style] || 'inherit',
      transform: style.match(/_caps$/) ? 'uppercase' : (style.match(/_small$/) ? 'lowercase' : 'none')
    };
  }),

  _set_pref: function(key, value) {
    var prefs = Object.assign({}, this.get('demo_prefs') || default_prefs());
    prefs[key] = value;
    this.set('demo_prefs', prefs);
  },

  _step_pref: function(key, options, direction) {
    var current = this.get('demo_prefs.' + key);
    var index = options.indexOf(current);
    if(index === -1) { index = options.indexOf(default_prefs()[key]); }
    index = index + direction;
    index = Math.max(0, Math.min(options.length - 1, index));
    this._set_pref(key, options[index]);
  },

  _set_temporary_status: function(message) {
    var timer = this.get('status_message_timer');
    if(timer) { runCancel(timer); }
    this.set('status_message', message);
    var _this = this;
    this.set('status_message_timer', runLater(function() {
      if(_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('status_message', null);
      _this.set('status_message_timer', null);
    }, 2500));
  },

  _append_button: function(button) {
    var parts = (this.get('sentence_parts') || []).slice();
    parts.push({
      id: button.id,
      label: button.label,
      vocalization: button.vocalization || button.label,
      image_url: button.image_url,
      punctuation: button.punctuation,
      silent: button.silent
    });
    this.set('sentence_parts', parts);
    if(!button.silent && (button.label || button.vocalization)) {
      speecher.speak_text(button.vocalization || button.label);
    }
  },

  _open_board: function(button) {
    var loadBoard = button.load_board;
    if(!loadBoard || !loadBoard.demo_available) {
      this.set('status_message', i18n.t('demo_folder_not_included', "This folder is not included in the demo."));
      return;
    }
    var _this = this;
    demoBoardLoader.load_board(loadBoard.demo_path).then(function(board) {
      var history = (_this.get('board_history') || []).slice();
      history.push(_this.get('board'));
      _this.set('board_history', history);
      _this._set_board(board);
      _this.set('status_message', null);
    }, function() {
      _this.set('status_message', i18n.t('demo_folder_load_failed', "This demo folder could not be loaded."));
    });
  },
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    // board-detail-grid calls these closures directly (not via {{on}}), so they
    // must invoke send immediately — unlike ctrlAction, which returns a handler.
    this.gridSelectButton = function(button) {
      self.send('select_button', button);
    };
    this.gridSelectButtonKey = function(button, event) {
      self.send('select_button_key', button, event);
    };
    this.gridDemoDisabled = function() {
      self.send('demo_disabled');
    };
    this.onSymbolBackgroundChange = function(event) {
      var value = event && event.target && event.target.value;
      self.send('set_symbol_background_from_select', value);
    };
  },


  actions: {
    select_button: function(button) {
      if(!button || button.empty) { return; }
      if(button.load_board) {
        this._open_board(button);
      } else {
        this._append_button(button);
      }
    },

    select_button_key: function(button, event) {
      var key = event && (event.key || event.keyCode);
      if(key === 'Enter' || key === ' ' || key === 13 || key === 32) {
        if(event && event.preventDefault) { event.preventDefault(); }
        this.send('select_button', button);
      }
    },

    go_home: function() {
      var _this = this;
      demoBoardLoader.load_root().then(function(model) {
        _this.set('board_history', []);
        _this._set_board(model.board);
      });
    },

    go_back: function() {
      var history = (this.get('board_history') || []).slice();
      var board = history.pop();
      if(board) {
        this.set('board_history', history);
        this._set_board(board);
      }
    },

    speak_sentence: function() {
      var text = this.get('sentence_text');
      if(text) { speecher.speak_text(text); }
    },

    backspace_sentence: function() {
      var parts = (this.get('sentence_parts') || []).slice();
      parts.pop();
      this.set('sentence_parts', parts);
      if(!parts.length) { this.set('sentence_dialog_open', false); }
    },

    clear_sentence: function() {
      this.set('sentence_parts', []);
      this.set('sentence_dialog_open', false);
    },

    open_sentence_dialog: function() {
      if(this.get('has_sentence')) {
        var wasOpen = this.get('sentence_dialog_open');
        this.set('sentence_dialog_open', true);
        if(!wasOpen) {
          this.send('speak_sentence');
        }
      }
    },

    close_sentence_dialog: function() {
      this.set('sentence_dialog_open', false);
    },

    demo_disabled: function() {
      this._set_temporary_status(i18n.t('demo_action_disabled', "This action is disabled in the demo."));
    },

    toggle_quick_words: function() {
      this.toggleProperty('quick_words_open');
    },

    add_quick_word: function(item) {
      this._append_button(item);
    },

    toggle_edit_panel: function() {
      this.toggleProperty('edit_mode');
    },

    close_edit_panel: function() {
      this.set('edit_mode', false);
    },

    set_pref: function(key, value) {
      this._set_pref(key, value);
    },

    adjust_text_size: function(direction) {
      this._step_pref('button_text', TEXT_SIZE_OPTIONS, direction);
    },

    adjust_button_border: function(direction) {
      this._step_pref('button_border', BORDER_SIZE_OPTIONS, direction);
    },

    adjust_button_spacing: function(direction) {
      this._step_pref('button_spacing', SPACING_OPTIONS, direction);
    },

    set_symbol_background_from_select: function(value) {
      this.send('set_symbol_background', value);
    },

    set_symbol_background: function(value) {
      if(value === 'high_contrast') {
        this._set_pref('symbol_background', 'black');
        this._set_pref('high_contrast', true);
      } else {
        this._set_pref('symbol_background', value);
        this._set_pref('high_contrast', false);
      }
    }
  }
});
