import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { observer } from '@ember/object';
import { next } from '@ember/runloop';
import { htmlSafe } from '@ember/template';
import $ from 'jquery';
import modalUtil from '../utils/modal';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import actionLock from '../utils/action-lock';
import aiFeatureGate from '../utils/ai_feature_gate';
import article50Gate from '../utils/article50_gate';
import buildEventAction from '../utils/event_action';
import { board_view_route } from '../utils/board_view';

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
    // For keydown/drag/drop bindings whose handlers need the raw event and do
    // their own preventDefault. ctrlAction above is unchanged for clicks.
    this.eventAction = buildEventAction(this);
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
  },

  for_user_id: computed('model.for_user_id', function() {
    return this.get('model.for_user_id');
  }),

  ai_board_generation_enabled: computed(
    'appState.feature_flags.ai_board_generation',
    'appState.currentUser.preferences.ai_features_enabled',
    'appState.currentUser.preferences.ai_board_generation',
    function() {
      return aiFeatureGate.aiFeatureEnabled(this.appState, 'ai_board_generation');
    }
  ),

  paste_html_import_enabled: computed('appState.feature_flags.paste_html_import', function() {
    return !!this.appState.get('feature_flags.paste_html_import');
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

  parsed_labels: computed('model.grid.labels', function() {
    var str = this.get('model.grid.labels') || '';
    if(typeof str !== 'string') { str = '' + str; }
    return str.split(/\n|,/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  }),

  preview_grid: computed('model.grid.rows', 'model.grid.columns', 'model.grid.labels_order', 'parsed_labels.[]', '_editIdx', function() {
    var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
    var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
    rows = Math.max(0, Math.min(20, rows));
    cols = Math.max(0, Math.min(20, cols));
    var order = this.get('model.grid.labels_order') || 'rows';
    var labels = this.get('parsed_labels') || [];
    var editIdx = this.get('_editIdx');
    var grid = [];
    for(var r = 0; r < rows; r++) {
      var row = [];
      for(var c = 0; c < cols; c++) {
        var idx = (order === 'columns') ? (c * rows + r) : (r * cols + c);
        var label = labels[idx] || '';
        row.push({
          row: r,
          col: c,
          idx: idx,
          label: label,
          empty: !label,
          editing: (editIdx !== null && editIdx !== undefined && editIdx === idx)
        });
      }
      grid.push(row);
    }
    return grid;
  }),

  preview_style: computed('model.grid.columns', 'model.grid.rows', function() {
    var cols = parseInt(this.get('model.grid.columns'), 10) || 1;
    var rows = parseInt(this.get('model.grid.rows'), 10) || 1;
    cols = Math.max(1, Math.min(20, cols));
    rows = Math.max(1, Math.min(20, rows));
    return htmlSafe('--preview-cols: ' + cols + '; --preview-rows: ' + rows);
  }),

  too_many_labels: computed('label_count', 'model.grid.rows', 'model.grid.columns', function() {
    return (this.get('label_count') || 0) > (parseInt(this.get('model.grid.rows'), 10) * parseInt(this.get('model.grid.columns'), 10));
  }),

  duplicate_labels: computed('model.grid.labels', function() {
    var str = this.get('model.grid.labels') || '';
    if(typeof str !== 'string') { str = '' + str; }
    var labels = str.split(/\n|,/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    var counts = {};
    labels.forEach(function(l) {
      var key = (l || '').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).filter(function(key) { return counts[key] > 1; });
  }),

  has_duplicate_labels: computed('model.grid.labels', function() {
    return (this.get('duplicate_labels') || []).length > 0;
  }),

  duplicate_label_count: computed('model.grid.labels', function() {
    return (this.get('duplicate_labels') || []).length;
  }),

  MAX_GRID_LABELS: 400,

  too_many_total_labels: computed('label_count', function() {
    return (this.get('label_count') || 0) > this.get('MAX_GRID_LABELS');
  }),

  unused_label_count: computed('label_count', function() {
    var n = (this.get('label_count') || 0);
    var max = this.get('MAX_GRID_LABELS');
    return n > max ? (n - max) : 0;
  }),

  max_grid_labels: computed(function() {
    return this.get('MAX_GRID_LABELS');
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

  // Auto-fit grid to label count: pick the most-square shape that holds
  // every label (cols >= rows for a slight landscape lean). Recomputes on
  // every label change; manual stepper edits hold until the next change.
  // Skipped while the user is mid-edit (preserves the inline-edit input).
  autoFitGrid: observer('model.grid.labels', function() {
    if(this.get('_editIdx') !== null && this.get('_editIdx') !== undefined) { return; }
    var n = (this.get('parsed_labels') || []).length;
    if(n === 0) { return; }
    var cols = Math.min(20, Math.max(1, Math.ceil(Math.sqrt(n))));
    var rows = Math.min(20, Math.max(1, Math.ceil(n / cols)));
    if(this.get('model.grid.columns') !== cols) {
      this.set('model.grid.columns', cols);
    }
    if(this.get('model.grid.rows') !== rows) {
      this.set('model.grid.rows', rows);
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
    importFromJsonBundle: function() {
      if(!this.get('standalone')) {
        this.get('modal').close();
      }
      modalUtil.open('import-from-json-bundle');
    },
    generateWithAi: function() {
      // EU AI Act Article 50(1) first-AI-use gate, BLOCK mode (D-03). Gated HERE,
      // at the point that opens the generate-board modal, NOT inside
      // generate-board.js itself: modal.open() replaces the currently-showing
      // modal, so a gate fired from within generate-board would tear down its own
      // host and discard the prompt / rows / columns the user had already typed,
      // and the post-acknowledge continuation would then no-op on isDestroyed.
      // Gating before the form exists means there is nothing to lose.
      //
      // modalUtil is the module, not a component-bound service, so it still works
      // in the continuation below even though opening ai-disclosure destroys THIS
      // component (new-board is itself modal-hosted). Nothing after the gate reads
      // component state for the same reason -- `standalone` is captured up front.
      var standalone = this.get('standalone');
      var modalService = this.get('modal');
      article50Gate.presentBlockingGate(this.get('appState')).then(function() {
        if(!standalone) {
          modalService.close();
        }
        modalUtil.open('generate-board');
      }, function() {
        // Gate not acknowledged (bumped by another modal). Do not open
        // generate-board. The disclosure modal is what the user is looking at,
        // or another modal took over; either way this is fail-closed by design
        // and needs no separate error surface here.
      });
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
    setLabels: function(value) {
      this.set('model.grid.labels', value);
    },
    cellDragStart: function(row, col, event) {
      var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
      var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
      var order = this.get('model.grid.labels_order') || 'rows';
      var idx = (order === 'columns') ? (col * rows + row) : (row * cols + col);
      var labels = this.get('parsed_labels') || [];
      if(idx >= labels.length || !labels[idx]) {
        if(event && event.preventDefault) { event.preventDefault(); }
        return;
      }
      if(event && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(idx)); } catch(e) { }
      }
      this.set('_dragSourceIdx', idx);
    },
    cellDragOver: function(event) {
      if(event && event.preventDefault) { event.preventDefault(); }
      // Stop propagation so the global file-drop handler (used for board file
      // imports) doesn't see this and treat our chip as a dropped file.
      if(event && event.stopPropagation) { event.stopPropagation(); }
      if(event && event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
    },
    cellDrop: function(row, col, event) {
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var sourceIdx = this.get('_dragSourceIdx');
      if(sourceIdx === null || sourceIdx === undefined) { return; }
      var rows = parseInt(this.get('model.grid.rows'), 10) || 0;
      var cols = parseInt(this.get('model.grid.columns'), 10) || 0;
      var order = this.get('model.grid.labels_order') || 'rows';
      var targetIdx = (order === 'columns') ? (col * rows + row) : (row * cols + col);
      if(sourceIdx === targetIdx) { return; }
      var editIdx = this.get('_editIdx');
      if(editIdx === sourceIdx || editIdx === targetIdx) { return; }
      var labels = (this.get('parsed_labels') || []).slice();
      if(targetIdx >= labels.length || !labels[targetIdx]) { return; }
      var tmp = labels[sourceIdx];
      labels[sourceIdx] = labels[targetIdx];
      labels[targetIdx] = tmp;
      this.set('_dragSourceIdx', null);
      var _this = this;
      var newValue = labels.join('\n');
      // Use View Transitions API for smooth crossfade between old and new cell
      // contents. Falls back to instant update on browsers without support.
      if(typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
        document.startViewTransition(function() {
          _this.set('model.grid.labels', newValue);
        });
      } else {
        this.set('model.grid.labels', newValue);
      }
    },
    cellDragEnd: function() {
      this.set('_dragSourceIdx', null);
    },
    startCellEdit: function(idx, event) {
      if(event && event.stopPropagation) { event.stopPropagation(); }
      var labels = this.get('parsed_labels') || [];
      if(idx >= labels.length || !labels[idx]) { return; }
      this.set('_editIdx', idx);
      this.set('_editValue', labels[idx]);
      var _this = this;
      next(function() {
        var elt = document.getElementById('new-board-cell-edit-' + idx);
        if(elt) {
          elt.focus();
          try { elt.select(); } catch(e) { }
        }
      });
    },
    cellEditChanged: function(value) {
      this.set('_editValue', value);
    },
    commitCellEdit: function() {
      var idx = this.get('_editIdx');
      if(idx === null || idx === undefined) { return; }
      var labels = (this.get('parsed_labels') || []).slice();
      var newValue = (this.get('_editValue') || '').trim();
      if(newValue.length === 0) {
        labels.splice(idx, 1);
      } else {
        labels[idx] = newValue;
      }
      this.set('_editIdx', null);
      this.set('_editValue', '');
      this.set('model.grid.labels', labels.join('\n'));
    },
    cancelCellEdit: function() {
      this.set('_editIdx', null);
      this.set('_editValue', '');
    },
    cellEditKeydown: function(event) {
      var key = event.key;
      if(key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.send('commitCellEdit');
      } else if(key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.send('cancelCellEdit');
      }
    },
    previewDragOver: function(event) {
      // Keep dropEffect consistent across the entire preview (cells + gaps),
      // so the cursor doesn't flicker between "move" and "no-drop" as the
      // user drags between cells.
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      if(event && event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
    },
    previewDrop: function(event) {
      // Drops on the container (gaps, empty zones) are no-ops; we only consume
      // the event so it doesn't bubble to the global file-drop handler.
      if(event && event.preventDefault) { event.preventDefault(); }
      if(event && event.stopPropagation) { event.stopPropagation(); }
      this.set('_dragSourceIdx', null);
    },
    more_options: function() {
      this.set('more_options', true);
    },
    pick_core: function() {
      this.send('stop_recording');
      this.set('core_lists', i18n.get('core_words'));
      this.set('core_words', i18n.core_words_map());
    },
    clearGrid: function() {
      this.set('model.grid.labels', '');
      if(this.get('speech')) {
        this.set('speech.words', []);
      }
      this.set('core_lists', null);
      this.set('core_words', null);
      this.set('_editIdx', null);
      this.set('_editValue', '');
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
      return actionLock.run('save-board:' + (this.get('model.id') || name), function() {
        _this.set('status', {saving: true});
        if(_this.get('model.license')) {
          _this.set('model.license.copyright_notice_url', LingoLinq.licenseOptions.license_url(_this.get('model.license.type')));
        }
        if(_this.get('model.home_board')) {
          var cats = [];
          _this.get('board_categories').forEach(function(cat) {
            if(cat.selected) {
              cats.push(cat.id);
            }
          });
          _this.set('model.categories', cats);
        }
        // Ensure API has an owner: use for_user_id when creating for a supervisee, otherwise 'self' for current user
        var currentUserId = _this.appState.get('currentUser.id') || _this.appState.get('sessionUser.id');
        if(!_this.get('model.for_user_id') && currentUserId) {
          _this.set('model.for_user_id', 'self');
        }
        return _this.get('model').save().then(function(board) {
          board.set('button_locale', board.get('locale'));
          _this.appState.set('label_locale', board.get('locale'));
          _this.appState.set('vocalization_locale', board.get('locale'));
          _this.set('status', null);
          modalUtil.close(true);
          editManager.auto_edit(board.get('id'));
          _this.appState.set('referenced_board', {id: board.get('id'), key: board.get('key')});
          var key = board.get('key') || '';
          var parts = key.split('/');
          // Debounced "Preparing your Board" mask for the post-create board load.
          _this.appState.arm_board_load_overlay(_this.get('router'));
          if (parts.length >= 2) {
            // Honor the user's view preference (utils/board_view.js) instead of
            // hardcoding the modern shell — a classic user who creates/imports a board
            // must land on their own board view, not be pushed into modern.
            return _this.get('router').transitionTo(board_view_route(_this.appState.get('currentUser')), parts[0], parts.slice(1).join('/'));
          } else {
            return _this.get('router').transitionTo('board', key);
          }
        }, function() {
          _this.set('status', {error: true});
        });
      }, {timeout: 10000});
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
