import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import modalUtil from '../utils/modal';
import editManager from '../utils/edit_manager';
import i18n from '../utils/i18n';
import { board_view_route } from '../utils/board_view';

/**
 * Generate board with AI modal.
 * Flow: user enters description → clicks "Generate with AI" → labels populate →
 * user edits labels → clicks "Create Board" → standard boards#create (OpenSymbols + TTS).
 */
export default Component.extend({
  persistence: service('persistence'),
  router: service('router'),
  appState: service('app-state'),
  modal: service('modal'),
  stashes: service('stashes'),
  tagName: '',

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

    this.set('prompt', '');
    this.set('labels', '');
    this.set('name', '');
    this.set('description', '');
    this.set('rows', 2);
    this.set('columns', 4);
    this.set('include_core_words', true);
    this.set('labels_order', this.stashes.get('new_board_labels_order') || 'columns');
    this.set('locale', this._defaultLocale());
    this.set('image_url', '');
    this.set('status', null);
    this.set('for_user_id', 'self');

    this.set('previewRows', this.get('rows'));
    this.set('previewColumns', this.get('columns'));
    this.updateShowGrid();
  },

  updatePreview: observer('rows', 'columns', function() {
    this.set('previewRows', this.get('rows'));
    this.set('previewColumns', this.get('columns'));
  }),

  updateShowGrid: function() {
    var grid = [];
    var maxRows = 6, maxColumns = 12;
    var previewRows = this.get('previewRows');
    var previewColumns = this.get('previewColumns');
    var previewEnabled = previewRows <= maxRows && previewColumns <= maxColumns;
    for (var idx = 1; idx <= maxRows; idx++) {
      var row = [];
      for (var jdx = 1; jdx <= maxColumns; jdx++) {
        var preview = (previewEnabled && idx <= previewRows && jdx <= previewColumns);
        row.push({
          row: idx,
          column: jdx,
          preview: preview,
          preview_class: 'cell ' + (preview ? 'preview' : '')
        });
      }
      grid.push(row);
    }
    this.set('showGrid', grid);
  },

  updateShow: observer('previewRows', 'previewColumns', function() {
    this.updateShowGrid();
  }),

  labels_non_empty: computed('labels', function() {
    var str = (this.get('labels') || '').trim();
    return str.length > 0;
  }),

  create_board_disabled: computed('status.saving', 'labels_non_empty', function() {
    return this.get('status.saving') || !this.get('labels_non_empty');
  }),

  _defaultLocale() {
    var locale = ((i18n.langs || {}).preferred || window.navigator.language || 'en').replace(/-/g, '_');
    var pieces = locale.split(/_/);
    if (pieces[0]) { pieces[0] = pieces[0].toLowerCase(); }
    if (pieces[1]) { pieces[1] = pieces[1].toUpperCase(); }
    locale = pieces[0] + '_' + pieces[1];
    var locales = i18n.get('locales');
    if (locales[locale]) { return locale; }
    locale = locale.split(/_/)[0];
    return (locales[locale] && locale) || 'en';
  },

  locales: computed(function() {
    var list = i18n.get('locales');
    var res = [{ name: i18n.t('choose_locale', '[Choose a Language]'), id: '' }];
    for (var key in list) {
      res.push({ name: list[key], id: key });
    }
    res.push({ name: i18n.t('unspecified', 'Unspecified'), id: '' });
    return res;
  }),

  labels_order_list: [
    { name: i18n.t('columns_first', 'Populate buttons in columns, left to right'), id: 'columns' },
    { name: i18n.t('rows_first', 'Populate buttons in rows, top to bottom'), id: 'rows' }
  ],

  prompt_placeholder: i18n.t('generate_board_prompt_placeholder', 'e.g. AAC board for a 4-year-old at breakfast with core vocabulary'),

  labels_placeholder: i18n.t('generate_board_labels_placeholder', 'Enter labels separated by commas, or click "Generate with AI" to fill from description'),

  description_placeholder: i18n.t('generate_board_description_placeholder', 'Brief description of the board (optional)'),

  core_words_tooltip: computed('include_core_words', function() {
    return this.get('include_core_words')
      ? i18n.t('core_words_tooltip_checked', "Include 40-60% high-frequency core words (I, want, go, more, stop, like, not, help, do, is, it, the, my, turn, fast, slow, etc.), rest topic-specific vocabulary")
      : i18n.t('core_words_tooltip_unchecked', "Focus on topic-specific vocabulary only (nouns, topic verbs, descriptors, phrases unique to that context)");
  }),

  has_supervisees: computed('appState.sessionUser.supervisees', 'appState.sessionUser.managed_orgs', function() {
    return (this.appState.get('sessionUser.supervisees.length') || 0) > 0 ||
           (this.appState.get('sessionUser.managed_orgs.length') || 0) > 0;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    plus_minus(direction, attr) {
      var val = parseInt(this.get(attr), 10) || 2;
      val = direction === 'minus' ? val - 1 : val + 1;
      val = Math.min(Math.max(1, val), 20);
      this.set(attr, val);
    },
    setForUserId(userId) {
      this.set('for_user_id', userId);
    },
    setLocale(value) {
      this.set('locale', value);
    },
    setLabelsOrder(value) {
      this.set('labels_order', value);
    },
    grid_event(action, row, col) {
      this.send(action, row, col);
    },
    hoverGrid(row, col) {
      this.set('previewRows', row);
      this.set('previewColumns', col);
    },
    hoverOffGrid() {
      this.set('previewRows', this.get('rows'));
      this.set('previewColumns', this.get('columns'));
    },
    setGrid(row, col) {
      this.set('rows', row);
      this.set('columns', col);
    },
    generateLabels() {
      var _this = this;
      var persistenceService = this.get('persistence') || window.persistence;
      if (persistenceService && !persistenceService.get('online')) {
        this.set('status', { error: i18n.t('generate_requires_online', 'AI board generation requires an Internet connection.') });
        return;
      }
      var prompt = (this.get('prompt') || '').trim();
      if (!prompt) {
        this.set('status', { error: i18n.t('prompt_required', 'Please describe the board you want to create.') });
        return;
      }
      // EU AI Act Article 50(1) NOTE: the first-AI-use gate for this surface fires in
      // new-board.js#generateWithAi, BEFORE this modal is opened -- deliberately not
      // here. modal.open() replaces the currently-showing modal, and generate-board is
      // itself modal-hosted (modal-container.hbs), so opening the disclosure from this
      // action would destroy this component along with the prompt / rows / columns the
      // user just typed. The server-side backstop in boards_controller#generate_labels
      // is what actually enforces the gate for any caller that reaches the endpoint
      // another way; this component intentionally carries no gate of its own.
      this.set('status', { generatingLabels: true });
      this.set('status.error', undefined);

      var payload = {
        prompt: prompt,
        rows: parseInt(this.get('rows'), 10) || 2,
        columns: parseInt(this.get('columns'), 10) || 4,
        include_core_words: this.get('include_core_words'),
        labels_order: this.get('labels_order') || 'columns',
        locale: this.get('locale') || 'en'
      };

      if (!persistenceService || !persistenceService.ajax) {
        this.set('status', { error: i18n.t('app_not_ready', 'App is not ready. Please try again.') });
        return;
      }

      persistenceService.ajax('/api/v1/boards/generate_labels', {
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(payload)
      }).then(function(res) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('status', null);
        var labels = (res && res.labels) || '';
        _this.set('labels', labels);
        if (res && res.name) { _this.set('name', res.name); }
        if (res && res.description) { _this.set('description', res.description); }
        // EU AI Act Article 50(2): hold the signed AI-generation marker so createBoard
        // can include it in the board payload for the server to verify + persist.
        if (res && res.ai_generated) { _this.set('ai_generated', res.ai_generated); }
      }, function(err) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        var msg = i18n.t('generate_failed', 'Generation failed');
        var resp = (err && err.fakeXHR && err.fakeXHR.responseJSON) || (err && err.responseJSON) || (err && err.responseText ? (function() {
          try { return JSON.parse(err.responseText); } catch (e) { return null; }
        })() : null);
        if (resp && resp.error) {
          msg = resp.error;
          if (resp.error_kind) { msg += ' [' + resp.error_kind + ']'; }
          if (resp.error_detail) { msg += ' - ' + resp.error_detail; }
        }
        _this.set('status', { error: msg });
      });
    },
    createBoard() {
      var _this = this;
      var labels = (this.get('labels') || '').trim();
      if (!labels) {
        this.set('status', { error: i18n.t('labels_required', 'Please add labels before creating the board. Use "Generate with AI" or enter them manually.') });
        return;
      }

      var persistenceService = this.get('persistence') || window.persistence;
      if (persistenceService && !persistenceService.get('online')) {
        this.set('status', { error: i18n.t('create_requires_online', 'Board creation requires an Internet connection.') });
        return;
      }

      this.set('status', { saving: true });
      this.set('status.error', undefined);

      var boardPayload = {
        name: (this.get('name') || '').trim() || 'AI Generated Board',
        description: (this.get('description') || '').trim() || undefined,
        locale: this.get('locale') || 'en',
        grid: {
          rows: parseInt(this.get('rows'), 10) || 2,
          columns: parseInt(this.get('columns'), 10) || 4,
          labels: labels,
          labels_order: this.get('labels_order') || 'columns'
        },
        for_user_id: this.get('for_user_id') || 'self'
      };
      if (this.get('image_url')) {
        boardPayload.image_url = this.get('image_url');
      }
      // EU AI Act Article 50(2): pass the signed AI-generation marker through so the
      // server verifies and persists it onto the new board's settings.
      if (this.get('ai_generated')) {
        boardPayload.ai_generated = this.get('ai_generated');
      }

      if (!persistenceService || !persistenceService.ajax) {
        this.set('status', { error: i18n.t('app_not_ready', 'App is not ready. Please try again.') });
        return;
      }

      persistenceService.ajax('/api/v1/boards', {
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ board: boardPayload })
      }).then(function(res) {
        var board = res && res.board;
        if (board && board.key) {
          _this.set('status', null);
          modalUtil.close(true);
          editManager.auto_edit(board.id);
          _this.appState.set('referenced_board', { id: board.id, key: board.key });
          var parts = (board.key || '').split('/');
          if (parts.length >= 2) {
            // Honor the user's view preference (utils/board_view.js) instead of
            // hardcoding the modern shell — a classic user who creates/imports a board
            // must land on their own board view, not be pushed into modern.
            _this.get('router').transitionTo(board_view_route(_this.appState.get('currentUser')), parts[0], parts.slice(1).join('/'));
          } else {
            _this.get('router').transitionTo('board', board.key);
          }
        } else {
          _this.set('status', {
            error: (res && res.error) || i18n.t('create_failed', 'Board creation failed')
          });
        }
      }, function(xhr) {
        var msg = i18n.t('create_failed', 'Board creation failed');
        if (xhr && xhr.responseJSON && xhr.responseJSON.error) {
          msg = xhr.responseJSON.error;
        } else if (xhr && xhr.responseText) {
          try {
            var j = JSON.parse(xhr.responseText);
            if (j && j.error) { msg = j.error; }
          } catch (e) {}
        }
        _this.set('status', { error: msg });
      });
    }
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
  },
});
