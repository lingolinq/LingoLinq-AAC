import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { debounce } from '@ember/runloop';
import i18n from '../../utils/i18n';

export default Controller.extend({
  persistence: service('persistence'),

  items: null,
  meta: null,
  loadError: false,
  loading: false,

  searchQuery: '',
  filterType: '',
  filterSeverity: '',
  filterPriority: '',
  sortColumn: 'created_at',
  sortOrder: 'desc',

  feedbackTypeOptions: null,
  severityOptions: null,
  priorityOptions: null,

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
    this.ctrlActionMut = function(propPath, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.set(propPath, value);
      };
    };

    this.set('feedbackTypeOptions', [
      { id: '', label: i18n.t('beta_feedback_admin_filter_all_types', 'All categories') },
      { id: 'hidden', label: i18n.t('beta_feedback_admin_filter_hidden', 'Hidden') },
      { id: 'crash', label: i18n.t('beta_feedback_type_crash', 'Crash or freeze') },
      { id: 'speak_mode', label: i18n.t('beta_feedback_type_speak_mode', 'Speak mode or speech / TTS') },
      { id: 'boards', label: i18n.t('beta_feedback_type_boards', 'Boards or editing') },
      { id: 'editing', label: i18n.t('beta_feedback_type_editing', "Editing") },
      { id: 'sync', label: i18n.t('beta_feedback_type_sync', 'Sync, offline, or data') },
      { id: 'account', label: i18n.t('beta_feedback_type_account', 'Login or account') },
      { id: 'performance', label: i18n.t('beta_feedback_type_performance', 'Performance or loading') },
      { id: 'accessibility', label: i18n.t('beta_feedback_type_accessibility', 'Accessibility or UI') },
      { id: 'feature', label: i18n.t('beta_feedback_type_feature', 'Feature idea') },
      { id: 'other', label: i18n.t('beta_feedback_type_other', 'Other') }
    ]);
    this.set('severityOptions', [
      { id: '', label: i18n.t('beta_feedback_admin_filter_all_severities', 'All severities') },
      { id: 'blocker', label: i18n.t('beta_feedback_severity_blocker', 'Blocker — cannot complete key tasks') },
      { id: 'major', label: i18n.t('beta_feedback_severity_major', 'Major — serious problem with a workaround') },
      { id: 'minor', label: i18n.t('beta_feedback_severity_minor', 'Minor — small issue or polish') },
      { id: 'suggestion', label: i18n.t('beta_feedback_severity_suggestion', 'Suggestion — idea or enhancement') }
    ]);
    this.set('priorityOptions', [
      { id: '', label: i18n.t('beta_feedback_admin_filter_all_priorities', "All priorities") },
      { id: 'high', label: i18n.t('beta_feedback_priority_high', "High") },
      { id: 'medium', label: i18n.t('beta_feedback_priority_medium', "Medium") },
      { id: 'low', label: i18n.t('beta_feedback_priority_low', "Low") }
    ]);
  },

  onSearchQueryChanged: observer('searchQuery', function() {
    debounce(this, this.loadList, 400);
  }),

  onFilterChanged: observer('filterType', 'filterSeverity', 'filterPriority', function() {
    this.loadList();
  }),

  loadList() {
    var _this = this;
    this.set('loading', true);
    var parts = [];
    var q = this.get('searchQuery');
    if (q && q.trim()) {
      parts.push('q=' + encodeURIComponent(q.trim()));
    }
    if (this.get('filterType')) {
      parts.push('filter_type=' + encodeURIComponent(this.get('filterType')));
    }
    if (this.get('filterSeverity')) {
      parts.push('filter_severity=' + encodeURIComponent(this.get('filterSeverity')));
    }
    if (this.get('filterPriority')) {
      parts.push('filter_priority=' + encodeURIComponent(this.get('filterPriority')));
    }
    parts.push('sort_by=' + encodeURIComponent(this.get('sortColumn') || 'created_at'));
    parts.push('sort_order=' + encodeURIComponent(this.get('sortOrder') || 'desc'));
    var url = '/api/v1/beta_feedback' + (parts.length ? '?' + parts.join('&') : '');
    return this.get('persistence').ajax(url, { type: 'GET', dataType: 'json' }).then(function(json) {
      _this.set('loading', false);
      _this.set('loadError', false);
      _this.set('items', json.beta_feedback || []);
      _this.set('meta', json.meta || {});
    }).catch(function() {
      _this.set('loading', false);
      _this.set('loadError', true);
      _this.set('items', []);
      _this.set('meta', {});
    });
  },

  actions: {
    toggleSort(column) {
      if (this.get('sortColumn') === column) {
        this.set('sortOrder', this.get('sortOrder') === 'asc' ? 'desc' : 'asc');
      } else {
        this.set('sortColumn', column);
        this.set('sortOrder', column === 'created_at' ? 'desc' : 'asc');
      }
      this.loadList();
    },

    hideRow(row) {
      var _this = this;
      if (!row || !row.id) {
        return;
      }
      this.set('loading', true);
      this.get('persistence').ajax('/api/v1/beta_feedback/' + encodeURIComponent(row.id), {
        type: 'PATCH',
        contentType: 'application/json; charset=UTF-8',
        data: JSON.stringify({ beta_feedback: { hidden: true } }),
        dataType: 'json'
      }).then(function() {
        return _this.loadList();
      }).catch(function() {
        _this.set('loading', false);
        _this.set('loadError', true);
      });
    },

    unhideRow(row) {
      var _this = this;
      if (!row || !row.id) {
        return;
      }
      this.set('loading', true);
      this.get('persistence').ajax('/api/v1/beta_feedback/' + encodeURIComponent(row.id), {
        type: 'PATCH',
        contentType: 'application/json; charset=UTF-8',
        data: JSON.stringify({ beta_feedback: { hidden: false } }),
        dataType: 'json'
      }).then(function() {
        return _this.loadList();
      }).catch(function() {
        _this.set('loading', false);
        _this.set('loadError', true);
      });
    },

    clearFilters() {
      this.setProperties({
        searchQuery: '',
        filterType: '',
        filterSeverity: '',
        filterPriority: ''
      });
      this.loadList();
    }
  }
});
