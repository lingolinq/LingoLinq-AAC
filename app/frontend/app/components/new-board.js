import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer } from '@ember/object';
import $ from 'jquery';
import modalUtil from '../utils/modal';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';

/**
 * New Board Modal Component
 * 
 * Converted from new-board template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  router: service('router'),
  store: service('store'),
  stashes: service('stashes'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'new-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};

    // Initialize model; for_user_id 'self' ensures create payload includes owner for API
    var currentUserId = this.appState.get('currentUser.id') || this.appState.get('sessionUser.id');
    this.set('model', LingoLinq.store.createRecord('board', {
      public: false,
      visibility: 'private',
      license: {type: 'private'},
      grid: {rows: 2, columns: 4, labels_order: 'rows'},
      for_user_id: currentUserId ? 'self' : undefined
    }));
    
    // Initialize speech recognition if available
    if(window.webkitSpeechRecognition) {
      var speech = new window.webkitSpeechRecognition();
      if(speech) {
        speech.continuous = true;
        this.set('speech', {engine: speech});
      }
    }
    
    // Restore labels order from stash (overrides default when present)
    if(this.stashes.get('new_board_labels_order')) {
      this.set('model.grid.labels_order', this.stashes.get('new_board_labels_order'));
    }

    // Set locale
    var locale = ((i18n.langs || {}).preferred || window.navigator.language || 'en').replace(/-/g, '_');
    var pieces = locale.split(/_/);
    if(pieces[0]) { pieces[0] = pieces[0].toLowerCase(); }
    if(pieces[1]) { pieces[1] = pieces[1].toUpperCase(); }
    locale = pieces[0] + '_' + pieces[1];
    var locales = (i18n.get && i18n.get('locales')) || {};
    if(locales[locale]) {
      this.set('model.locale', locale);
    } else {
      locale = locale.split(/_/)[0];
      if(locales[locale]) {
        this.set('model.locale', locale);
      }
    }
    
    this.set('status', null);
    this.set('more_options', false);

    // Initialize board categories
    var res = [];
    var categories = LingoLinq.board_categories || [];
    categories.forEach(function(c) {
      var cat = $.extend({}, c);
      res.push(cat);
    });
    this.set('board_categories', res);

    var sessionUser = this.appState.get('sessionUser');
    var superviseesLen = (sessionUser && sessionUser.supervisees && sessionUser.supervisees.length) || 0;
    var managedOrgsLen = (sessionUser && sessionUser.managed_orgs && sessionUser.managed_orgs.length) || 0;
    this.set('has_supervisees', superviseesLen > 0 || managedOrgsLen > 0);
    
    // Initialize preview grid
    this.set('previewRows', this.get('model.grid.rows'));
    this.set('previewColumns', this.get('model.grid.columns'));
    
    // Initialize showGrid immediately (observers don't fire during init)
    this.updateShowGrid();
  },

  for_user_id: computed('model.for_user_id', function() {
    return this.get('model.for_user_id');
  }),

  ai_board_generation_enabled: computed('appState.feature_flags.ai_board_generation', function() {
    return !!this.appState.get('feature_flags.ai_board_generation');
  }),

  willDestroy() {
    // Stop recording before teardown (don't use send() - component is being destroyed)
    var speech = this.get('speech');
    if(speech && speech.engine) {
      try { speech.engine.abort(); } catch(e) { }
    }
    if(speech) {
      this.set('speech.resume', false);
      this.set('speech.recording', false);
      this.set('speech.ready', false);
      this.set('speech.almost_recording', false);
    }
    this._super(...arguments);
  },

  locales: computed(function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('choose_locale', '[Choose a Language]'), id: ''}];
    for(var key in list) {
      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('unspecified', "Unspecified"), id: ''});
    return res;
  }),

  license_options: LingoLinq.licenseOptions,
  public_options: LingoLinq.publicOptions,

  createBoardDisabled: computed('model.name', 'model.image_url', 'model.description', 'status.saving', function() {
    var name = (this.get('model.name') || '').trim();
    var icon = (this.get('model.image_url') || '').trim();
    var description = (this.get('model.description') || '').trim();
    return this.get('status.saving') || name.length === 0 || icon.length === 0 || description.length === 0;
  }),

  attributable_license_type: computed('model.license.type', function() {
    if(this.get('model.license') && this.get('model.license.type') != 'private') {
      this.update_license();
    }
    return this.get('model.license.type') != 'private';
  }),

  update_license() {
    this.set('model.license.author_name', this.appState.get('currentUser.name'));
    this.set('model.license.author_url', this.appState.get('currentUser.profile_url'));
  },

  label_count: computed('model.grid', 'model.grid.labels', function() {
    var str = this.get('model.grid.labels') || "";
    var lines = str.split(/\n|,\s*/);
    return lines.filter(function(l) { return l && !l.match(/^\s+$/); }).length;
  }),

  too_many_labels: computed('label_count', 'model.grid.rows', 'model.grid.columns', function() {
    return (this.get('label_count') || 0) > (parseInt(this.get('model.grid.rows'), 10) * parseInt(this.get('model.grid.columns'), 10));
  }),

  labels_class: computed('too_many_labels', function() {
    var res = "label_count ";
    if(this.get('too_many_labels')) {
      res = res + "too_many ";
    }
    return res;
  }),

  labels_order_list: [
    {name: i18n.t('columns_first', "Populate buttons in columns, left to right"), id: "columns"},
    {name: i18n.t('rows_first', "Populate buttons in rows, top to bottom"), id: "rows"}
  ],

  remember_labels_order: observer('model.grid.labels_order', function() {
    if(this.get('model.grid.labels_order')) {
      this.stashes.persist('new_board_labels_order', this.get('model.grid.labels_order'));
    }
  }),

  speech_enabled: computed('speech', function() {
    return !!this.get('speech');
  }),

  key_placeholder: computed(function() {
    return i18n.t('board_key_placeholder', 'board-key');
  }),

  updatePreview: observer('model.grid.rows', 'model.grid.columns', function() {
    this.set('previewRows', this.get('model.grid.rows'));
    this.set('previewColumns', this.get('model.grid.columns'));
  }),

  updateShowGrid: function() {
    var grid = [];
    var maxRows = 6, maxColumns = 12;
    var previewEnabled = this.get('previewRows') <= maxRows && this.get('previewColumns') <= maxColumns;
    for(var idx = 1; idx <= maxRows; idx++) {
      var row = [];
      for(var jdx = 1; jdx <= maxColumns; jdx++) {
        var preview = (previewEnabled && idx <= this.get('previewRows') && jdx <= this.get('previewColumns'));
        row.push({
          row: idx,
          column: jdx,
          preview: preview,
          preview_class: "cell " + (preview ? "preview" : "")
        });
      }
      grid.push(row);
    }
    this.set('showGrid', grid);
  },

  updateShow: observer('previewRows', 'previewColumns', function() {
    this.updateShowGrid();
  }),

  actions: {
    close: function() {
      if(this.get('standalone')) {
        var onClose = this.get('onClose');
        if (onClose && typeof onClose === 'function') {
          onClose();
        } else {
          var un = this.appState.get('currentUser.user_name');
          var r = this.get('router');
          var st = this.get('store');
          if (un) {
            r.transitionTo('user.home', un);
          } else if (st) {
            st.findRecord('user', 'self').then(function(u) {
              r.transitionTo('user.home', u.get('user_name'));
            });
          } else {
            r.transitionTo('index');
          }
        }
      } else {
        this.get('modal').close();
      }
    },
    importFromHtml: function() {
      if(!this.get('standalone')) {
        this.get('modal').close();
      }
      modalUtil.open('import-from-html');
    },
    generateWithAi: function() {
      if(!this.get('standalone')) {
        this.get('modal').close();
      }
      modalUtil.open('generate-board');
    },
    opening: function() {
      if (this.get('standalone')) { return; }
      const component = this;
      this.get('modal').setComponent(component);
    },
    closing: function() {
      this.send('stop_recording');
    },
    grid_event: function(action, row, col) {
      this.send(action, row, col);
    },
    plus_minus: function(direction, attribute) {
      var value = parseInt(this.get(attribute), 10);
      if(direction == 'minus') {
        value = value - 1;
      } else {
        value = value + 1;
      }
      value = Math.min(Math.max(1, value), 20);
      this.set(attribute, value);
    },
    setForUserId: function(userId) {
      this.set('model.for_user_id', userId);
    },
    setVisibility: function(value) {
      this.set('model.visibility', value);
    },
    setLicenseType: function(value) {
      this.set('model.license.type', value);
    },
    setLocale: function(value) {
      this.set('model.locale', value);
    },
    setLabelsOrder: function(value) {
      this.set('model.grid.labels_order', value);
    },
    more_options: function() {
      this.set('more_options', true);
    },
    pick_core: function() {
      this.send('stop_recording');
      this.set('core_lists', i18n.get('core_words'));
      this.set('core_words', i18n.core_words_map());
    },
    speech_content: function(str) {
      this.send('add_recorded_word', str);
    },
    speech_error: function(err) {
      this.set('speech.ready', false);
    },
    speech_stop: function() {
      this.set('speech.ready', false);
    },
    record_words: function() {
      var speech = this.get('speech');
      var _this = this;
      this.set('speech.ready', true);
    },
    stop_recording: function() {
      if(this.get('speech') && this.get('speech.engine')) {
        this.set('speech.resume', false);
        this.get('speech.engine').abort();
      }
      if(this.get('speech')) {
        this.set('speech.recording', false);
        this.set('speech.ready', false);
        this.set('speech.almost_recording', false);
      }
    },
    next_word: function() {
      if(this.get('speech') && this.get('speech.engine')) {
        this.set('speech.stop_and_resume', true);
      }
    },
    remove_word: function(id) {
      var lines = (this.get('model.grid.labels') || "").split(/\n|,\s*/);
      var words = [].concat(this.get('speech.words') || []);
      var new_words = [];
      var word = {};
      for(var idx = 0; idx < words.length; idx++) {
        if(words[idx].id == id) {
          word = words[idx];
        } else {
          new_words.push(words[idx]);
        }
      }
      var new_lines = [];
      var removed = false;
      for(var idx = 0; idx < lines.length; idx++) {
        if(!lines[idx] || lines[idx].match(/^\s+$/)) {
        } else if(!removed && lines[idx] == word.label) {
          removed = true;
        } else {
          new_lines.push(lines[idx]);
        }
      }
      if(this.get('speech')) {
        this.set('speech.words', new_words);
        this.set('model.grid.labels', new_lines.join("\n"));
      }
    },
    add_recorded_word: function(str) {
      var lines = (this.get('model.grid.labels') || "").split(/\n|,\s*/);
      var words = [].concat(this.get('speech.words') || []);
      var id = Math.random();
      words.push({id: id, label: str});
      var new_lines = [];
      for(var idx = 0; idx < lines.length; idx++) {
        if(!lines[idx] || lines[idx].match(/^\s+$/)) {
        } else {
          new_lines.push(lines[idx]);
        }
      }
      new_lines.push(str);
      if(this.get('speech')) {
        this.set('speech.words', words);
        this.set('model.grid.labels', new_lines.join("\n"));
      }
    },
    enable_word: function(id) {
      var words = this.get('core_words');
      var enabled_words = [];
      var disable_word = null;
      for(var idx = 0; idx < words.length; idx++) {
        if(words[idx].id == id) {
          if(emberGet(words[idx], 'active')) {
            emberSet(words[idx], 'active', false);
            disable_word = words[idx].label;
          } else {
            emberSet(words[idx], 'active', true);
          }
        }
        if(emberGet(words[idx], 'active')) {
          enabled_words.push(words[idx].label);
        }
      }
      var lines = (this.get('model.grid.labels') || "").split(/\n|,\s*/);
      var new_lines = [];
      var word_filter = function(w) { return w != lines[idx]; };
      for(var idx = 0; idx < lines.length; idx++) {
        if(disable_word && lines[idx] == disable_word) {
          disable_word = null;
        } else if(!lines[idx] || lines[idx].match(/^\s+$/)) {
        } else {
          new_lines.push(lines[idx]);
          if(enabled_words.indexOf(lines[idx]) != -1) {
            enabled_words = enabled_words.filter(word_filter);
          }
        }
      }
      for(var idx = 0; idx < enabled_words.length; idx++) {
        new_lines.push(enabled_words[idx]);
      }
      this.set('model.grid.labels', new_lines.join("\n"));
    },
    saveBoard: function(event) {
      var _this = this;
      var name = (this.get('model.name') || '').trim();
      var icon = (this.get('model.image_url') || '').trim();
      var description = (this.get('model.description') || '').trim();
      if (!name.length || !icon.length || !description.length) {
        this.set('status', {error: true});
        return;
      }
      this.set('status', {saving: true});
      if(this.get('model.license')) {
        this.set('model.license.copyright_notice_url', LingoLinq.licenseOptions.license_url(this.get('model.license.type')));
      }
      if(this.get('model.home_board')) {
        var cats = [];
        this.get('board_categories').forEach(function(cat) {
          if(cat.selected) {
            cats.push(cat.id);
          }
        });
        this.set('model.categories', cats);
      }
      // Ensure API has an owner: use for_user_id when creating for a supervisee, otherwise 'self' for current user
      var currentUserId = this.appState.get('currentUser.id') || this.appState.get('sessionUser.id');
      if(!this.get('model.for_user_id') && currentUserId) {
        this.set('model.for_user_id', 'self');
      }
      this.get('model').save().then(function(board) {
        board.set('button_locale', board.get('locale'));
        _this.appState.set('label_locale', board.get('locale'));
        _this.appState.set('vocalization_locale', board.get('locale'));
        _this.set('status', null);
        modalUtil.close(true);
        editManager.auto_edit(board.get('id'));
        _this.appState.set('referenced_board', {id: board.get('id'), key: board.get('key')});
        _this.get('router').transitionTo('board', board.get('key'));
      }, function() {
        _this.set('status', {error: true});
      });
    },
    hoverGrid: function(row, col) {
      this.set('previewRows', row);
      this.set('previewColumns', col);
    },
    hoverOffGrid: function() {
      this.set('previewRows', this.get('model.grid.rows'));
      this.set('previewColumns', this.get('model.grid.columns'));
    },
    setGrid: function(row, col) {
      this.set('model.grid.rows', row);
      this.set('model.grid.columns', col);
    },
    pickImageUrl: function(url) {
      this.set('model.image_url', url);
    }
  }
});
