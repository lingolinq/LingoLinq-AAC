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
  sortColumn: 'created_at',
  sortOrder: 'desc',

  feedbackTypeOptions: null,
  severityOptions: null,

  init() {
    this._super(...arguments);
    this.set('feedbackTypeOptions', [
      { id: '', label: i18n.t('beta_feedback_admin_filter_all_types', 'All categories') },
      { id: 'hidden', label: i18n.t('beta_feedback_admin_filter_hidden', 'Hidden') },
      { id: 'crash', label: i18n.t('beta_feedback_type_crash', 'Crash or freeze') },
      { id: 'speak_mode', label: i18n.t('beta_feedback_type_speak_mode', 'Speak mode or speech / TTS') },
      { id: 'boards', label: i18n.t('beta_feedback_type_boards', 'Boards or editing') },
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
  },

  onSearchQueryChanged: observer('searchQuery', function() {
    debounce(this, this.loadList, 400);
  }),

  onFilterChanged: observer('filterType', 'filterSeverity', function() {
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
        filterSeverity: ''
      });
      this.loadList();
    }
  }
});
