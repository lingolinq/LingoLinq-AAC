import Controller from '@ember/controller';
import { getOwner } from '@ember/application';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { inject as service } from '@ember/service';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import speecher from '../../utils/speecher';
import utterance from '../../utils/utterance';

export default Controller.extend({
  app_state: service('app-state'),

  boardname: null,
  board_buttons: null,
  active_category: 'all',
  sentence_parts: null,
  recent_phrases: null,
  weekly_goals: null,
  todays_schedule: null,
  board_data: null,
  show_color_legend: false,
  show_quick_phrases: false,
  show_categories: false,
  panels_collapsed: false,
  color_picker_button: null,
  custom_color_value: null,

  init: function() {
    this._super(...arguments);
    this.set('sentence_parts', []);
    this.set('recent_phrases', []);
    this.set('weekly_goals', []);
    this.set('todays_schedule', []);
  },

  title: computed('boardname', function() {
    var name = this.get('boardname');
    if(name) {
      return name.replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    }
    return i18n.t('board_detail', "Board Detail");
  }),

  subtitle: computed('board_data', function() {
    var data = this.get('board_data');
    if(data && data.get && data.get('description')) {
      return data.get('description');
    }
    return i18n.t('board_detail_subtitle', "Tap symbols to build your message");
  }),

  sentence_text: computed('sentence_parts.[]', function() {
    var parts = this.get('sentence_parts') || [];
    return parts.map(function(p) { return p.label; }).join(' ');
  }),

  has_sentence: computed('sentence_parts.[]', function() {
    return (this.get('sentence_parts') || []).length > 0;
  }),

  quick_buttons: computed('board_data', function() {
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
      { label: i18n.t('swatch_pronoun', "Pronoun"), pos_class: 'pronoun', bg: '#D9E6F7', border: '#4C86D8' },
      { label: i18n.t('swatch_verb', "Verb"), pos_class: 'verb', bg: '#D4F0EC', border: '#2A9D8F' },
      { label: i18n.t('swatch_descriptor', "Descriptor"), pos_class: 'adjective', bg: '#FBF0D3', border: '#F2B95A' },
      { label: i18n.t('swatch_noun', "Noun"), pos_class: 'noun', bg: '#F9E4CE', border: '#E08A3A' },
      { label: i18n.t('swatch_social', "Social"), pos_class: 'social', bg: '#E5E0F0', border: '#7B6BAD' },
      { label: i18n.t('swatch_negative', "Negative"), pos_class: 'negation', bg: '#F5D7D3', border: '#C0392B' },
      { label: i18n.t('swatch_question', "Question"), pos_class: 'question', bg: '#D6D8DC', border: '#374151' },
      { label: i18n.t('swatch_preposition', "Preposition"), pos_class: 'preposition', bg: '#EDE6D6', border: '#A08860' },
      { label: i18n.t('swatch_grammar', "Grammar"), pos_class: 'conjunction', bg: '#F5F3EF', border: '#E0DCD6' }
    ];
  }),

  // Save a button's color back to the board via the API
  save_button_color: function(btn, bg_color, border_color, pos_class) {
    var _this = this;
    var board_data = this.get('board_data');
    if(!board_data || !board_data.id) { return; }

    // Update the button in the raw board data
    var raw_buttons = board_data.buttons || [];
    var raw_btn = null;
    for(var i = 0; i < raw_buttons.length; i++) {
      if(raw_buttons[i].id === btn.id) {
        raw_btn = raw_buttons[i];
        break;
      }
    }
    if(raw_btn) {
      var fill = window.tinycolor(bg_color);
      var border = window.tinycolor(border_color);
      if(fill._ok) { raw_btn.background_color = fill.toRgbString(); }
      if(border._ok) { raw_btn.border_color = border.toRgbString(); }
    }

    // Update the displayed button
    emberSet(btn, 'pos_class', pos_class);
    emberSet(btn, 'custom_bg', bg_color);
    emberSet(btn, 'custom_border', border_color);
    _this.notifyPropertyChange('board_buttons');

    // Save the board
    var user = _this.get('user');
    var boardname = _this.get('boardname');
    if(!user || !boardname) { return; }
    var board_key = user.get('user_name') + '/' + boardname;
    persistence.ajax('/api/v1/boards/' + board_key, {
      type: 'PUT',
      data: {
        board: {
          buttons: raw_buttons
        }
      }
    }).then(function() {
      // saved
    }, function() {
      // error saving — could notify user
    });
  },

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

  filtered_buttons: computed('board_buttons.[]', 'active_category', function() {
    var buttons = this.get('board_buttons') || [];
    var category = this.get('active_category');
    if(category === 'all') {
      return buttons;
    }
    // Match pos_class against the selected category
    // Some categories group multiple pos types (e.g. 'adjective' includes adverb)
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
      return matches.indexOf(btn.pos_class) >= 0;
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

  // Map old keyed_colors fills to part-of-speech so we can infer type from color alone
  color_to_pos: {
    '#ffa': 'pronoun', '#ffffaa': 'pronoun',
    '#cfa': 'verb', '#ccffaa': 'verb',
    '#fca': 'noun', '#ffccaa': 'noun',
    '#acf': 'adjective', '#aaccff': 'adjective',
    '#caf': 'question', '#ccaaff': 'question',
    '#faa': 'negation', '#ffaaaa': 'negation',
    '#fac': 'social', '#ffaacc': 'social',
    '#ca8': 'adverb', '#ccaa88': 'adverb',
    '#ccc': 'conjunction', '#cccccc': 'conjunction'
  },

  // Returns a CSS modifier class for the button based on part_of_speech or folder status
  pos_css_class: function(btn) {
    // Folder detection: load_board is an object {id, key} when the button links to another board
    if(btn.load_board) {
      return 'folder';
    }
    // Check all part-of-speech fields the API may provide
    var pos = btn.part_of_speech || btn.painted_part_of_speech || btn.suggested_part_of_speech;
    if(pos) {
      return pos;
    }
    // No explicit POS — try to infer from the old auto-assigned background_color
    if(btn.background_color) {
      var c = btn.background_color.replace(/\s+/g, '').toLowerCase();
      // Normalize 3-char hex to 6-char
      if(c.length === 4 && c[0] === '#') {
        c = '#' + c[1]+c[1] + c[2]+c[2] + c[3]+c[3];
      }
      // Convert rgb() to 6-char hex for lookup
      if(c.indexOf('rgb') === 0) {
        var nums = c.match(/\d+/g);
        if(nums && nums.length >= 3) {
          c = '#' +
            ('0' + parseInt(nums[0], 10).toString(16)).slice(-2) +
            ('0' + parseInt(nums[1], 10).toString(16)).slice(-2) +
            ('0' + parseInt(nums[2], 10).toString(16)).slice(-2);
        }
      }
      var map = this.get('color_to_pos');
      if(map[c]) {
        return map[c];
      }
    }
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

  // Look up POS for buttons that have no type assigned, using each word in the label.
  // For multi-word labels, English head-word rules apply:
  //   - If the FIRST word is a verb, classify as verb (action phrase: "feed pet", "walk the dog")
  //   - Otherwise use the LAST content word as the head ("pet food" → food = noun)
  resolve_unknown_buttons: function(buttons) {
    var _this = this;
    var unknowns = buttons.filter(function(btn) {
      return btn.pos_class === 'default' && btn.label;
    });
    if(!unknowns.length) { return; }

    unknowns.forEach(function(btn) {
      var words = btn.label.split(/\s+/);
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
          // Single word: trust the API's ordering — it returns the most
          // common usage first. "pet" → [noun, verb] → noun.
          var types = (results[0] && results[0].types) || [];
          cls = types[0] || null;
        } else {
          // Multi-word: check if first word is PRIMARILY a verb → action phrase.
          // Only treat as verb if verb is the first type returned by the API
          // (i.e. its most common usage). Words like "pet" return noun first,
          // verb second, so "pet food" won't be misclassified as a verb.
          var first_types = (results[0] && results[0].types) || [];
          if(first_types.length > 0 && first_types[0] === 'verb') {
            cls = 'verb';
          } else {
            // Use the last content word (skip articles/determiners/prepositions)
            var skip_types = ['article', 'determiner', 'preposition', 'conjunction'];
            for(var i = results.length - 1; i >= 0; i--) {
              var word_types = (results[i] && results[i].types) || [];
              var word_best = _this.best_type(word_types);
              if(word_best && skip_types.indexOf(word_best) < 0) {
                cls = word_best;
                break;
              }
            }
            // Fallback: use whatever the last word gives
            if(!cls && results.length > 0) {
              var last_types = (results[results.length - 1] && results[results.length - 1].types) || [];
              cls = _this.best_type(last_types);
            }
          }
        }

        if(cls) {
          emberSet(btn, 'pos_class', cls);
          _this.notifyPropertyChange('board_buttons');
        }
      });
    });
  },

  load_board: function() {
    var _this = this;
    var user = _this.get('user');
    var boardname = _this.get('boardname');
    if(!user || !boardname) { return; }

    var board_key = user.get('user_name') + '/' + boardname;
    persistence.ajax('/api/v1/boards/' + board_key, { type: 'GET' }).then(function(data) {
      if(data && data.board) {
        var image_map = {};
        (data.board.images || []).forEach(function(img) {
          if(img && img.id) { image_map[img.id] = img.url; }
        });
        var buttons = (data.board.buttons || []).map(function(btn) {
          var img_url = null;
          if(btn.image_id && image_map[btn.image_id]) {
            img_url = image_map[btn.image_id];
          }
          return {
            id: btn.id,
            label: btn.label || '',
            image_url: img_url,
            category: btn.category || 'all',
            action: btn.action || 'speak',
            is_folder: !!(btn.load_board),
            pos_class: _this.pos_css_class(btn)
          };
        });
        _this.set('board_buttons', buttons);
        _this.set('board_data', data.board);

        // Second pass: resolve POS for buttons with no type by
        // looking up each word in their label via the API
        _this.resolve_unknown_buttons(buttons);
      }
    }, function() {
      _this.set('board_buttons', []);
    });
  },

  actions: {
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

    select_button: function(button) {
      // If color picker is open for this button, ignore (handled by picker actions)
      if(this.get('color_picker_button') === button) { return; }
      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: button.id, label: button.label, image_url: button.image_url });
      this.set('sentence_parts', parts);

      // Speak the individual button using the user's saved voice
      utterance.speak_button({
        label: button.label,
        vocalization: button.vocalization || button.label
      });
    },

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
      this.save_button_color(btn, swatch.bg, swatch.border, swatch.pos_class);
      this.set('color_picker_button', null);
    },

    apply_custom_color: function() {
      var btn = this.get('color_picker_button');
      var hex = this.get('custom_color_value');
      if(!btn || !hex) { return; }
      var fill = window.tinycolor(hex);
      if(!fill._ok) { return; }
      var border = fill.clone().darken(25);
      this.save_button_color(btn, fill.toHexString(), border.toHexString(), 'custom');
      this.set('color_picker_button', null);
    },

    select_quick: function(quick) {
      var parts = (this.get('sentence_parts') || []).slice();
      parts.push({ id: quick.id, label: quick.label });
      this.set('sentence_parts', parts);

      // Speak the quick phrase using the user's saved voice
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
      modal.open('speak-menu', {inactivity_timeout: true, scannable: true});
    },

    speak_sentence: function() {
      var text = this.get('sentence_text');
      if(text) {
        // Use the project's speecher which respects the user's saved voice,
        // pitch, rate, and volume preferences
        speecher.speak_text(text);
        var phrases = (this.get('recent_phrases') || []).slice();
        phrases.unshift({ text: text, timestamp: new Date() });
        if(phrases.length > 5) { phrases = phrases.slice(0, 5); }
        this.set('recent_phrases', phrases);
      }
    },

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
    }
  }
});
