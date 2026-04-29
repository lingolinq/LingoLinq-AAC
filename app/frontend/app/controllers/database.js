import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';
export default Controller.extend({
  persistence: service('persistence'),

  // ── Setup tab state ────────────────────────────────────────────
  tables: null,
  loading: false,
  loadError: false,
  tableSearch: '',
  columnSearch: '',
  selectedTableName: null,

  // ── Tab + Contents tab state ──────────────────────────────────
  activeTab: 'setup',                // 'setup' | 'contents'
  contentsTableSearch: '',
  contentsTableName: null,
  contentsRows: null,
  contentsColumns: null,
  contentsTotal: 0,
  contentsTotalExact: true,
  contentsLimit: 50,
  contentsOffset: 0,
  contentsLoading: false,
  contentsLoadError: false,

  filteredTables: computed('tables.[]', 'tableSearch', function() {
    var tables = this.get('tables') || [];
    var q = (this.get('tableSearch') || '').trim().toLowerCase();
    if (!q) {
      return tables;
    }
    return tables.filter(function(t) {
      return (t.name || '').toLowerCase().indexOf(q) !== -1;
    });
  }),

  filteredContentsTables: computed('tables.[]', 'contentsTableSearch', function() {
    var tables = this.get('tables') || [];
    var q = (this.get('contentsTableSearch') || '').trim().toLowerCase();
    if (!q) {
      return tables;
    }
    return tables.filter(function(t) {
      return (t.name || '').toLowerCase().indexOf(q) !== -1;
    });
  }),

  selectedTable: computed('tables', 'selectedTableName', function() {
    var name = this.get('selectedTableName');
    var tables = this.get('tables') || [];
    if (!name) {
      return null;
    }
    var found = null;
    tables.some(function(t) {
      if (t.name === name) {
        found = t;
        return true;
      }
      return false;
    });
    return found;
  }),

  filteredColumns: computed('selectedTable', 'columnSearch', function() {
    var table = this.get('selectedTable');
    if (!table || !table.columns) {
      return [];
    }
    var cols = table.columns;
    var q = (this.get('columnSearch') || '').trim().toLowerCase();
    if (!q) {
      return cols;
    }
    return cols.filter(function(c) {
      var n = (c.name || '').toLowerCase();
      var ty = (c.type || '').toLowerCase();
      return n.indexOf(q) !== -1 || ty.indexOf(q) !== -1;
    });
  }),

  selectionSync: observer('filteredTables.[]', 'selectedTableName', function() {
    var list = this.get('filteredTables') || [];
    if (!list.length) {
      return;
    }
    var names = list.map(function(t) { return t.name; });
    var cur = this.get('selectedTableName');
    if (!cur || names.indexOf(cur) === -1) {
      this.set('selectedTableName', list[0].name);
    }
  }),

  hasMoreContents: computed('contentsTotal', 'contentsLimit', 'contentsOffset', function() {
    var total = this.get('contentsTotal') || 0;
    var limit = this.get('contentsLimit') || 0;
    var offset = this.get('contentsOffset') || 0;
    return (offset + limit) < total;
  }),

  noMoreContents: computed('hasMoreContents', function() {
    return !this.get('hasMoreContents');
  }),

  contentsRangeStart: computed('contentsOffset', 'contentsRows.length', function() {
    var rows = this.get('contentsRows') || [];
    if (!rows.length) { return 0; }
    return (this.get('contentsOffset') || 0) + 1;
  }),

  contentsRangeEnd: computed('contentsOffset', 'contentsRows.length', function() {
    var rows = this.get('contentsRows') || [];
    return (this.get('contentsOffset') || 0) + rows.length;
  }),

  actions: {
    selectTable(name) {
      this.set('selectedTableName', name);
    },
    setActiveTab(name) {
      this.set('activeTab', name);
    },
    selectContentsTable(name) {
      // Don't queue another request if one is already in flight; flipping
      // tables mid-load was the most likely source of "stuck" UI state.
      if (this.get('contentsLoading')) { return; }
      if (name === this.get('contentsTableName')) { return; }
      this.set('contentsTableName', name);
      this.set('contentsOffset', 0);
      this.set('contentsRows', null);
      this.set('contentsColumns', null);
      this.loadContents();
    },
    nextContentsPage() {
      var newOffset = (this.get('contentsOffset') || 0) + (this.get('contentsLimit') || 50);
      this.set('contentsOffset', newOffset);
      this.loadContents();
    },
    prevContentsPage() {
      var newOffset = Math.max(0, (this.get('contentsOffset') || 0) - (this.get('contentsLimit') || 50));
      this.set('contentsOffset', newOffset);
      this.loadContents();
    }
  },

  loadSchema() {
    var _this = this;
    this.set('loading', true);
    this.set('loadError', false);
    return this.get('persistence').ajax('/api/v1/database_schema', { type: 'GET', dataType: 'json' }).then(function(json) {
      _this.set('loading', false);
      var payload = (json && json.database_schema) || {};
      var tables = payload.tables || [];
      _this.set('tables', tables);
      _this.set('loadError', false);
      if (tables.length && !_this.get('selectedTableName')) {
        _this.set('selectedTableName', tables[0].name);
      }
    }).catch(function() {
      _this.set('loading', false);
      _this.set('loadError', true);
      _this.set('tables', []);
    });
  },

  loadContents() {
    var name = this.get('contentsTableName');
    if (!name) { return; }
    var _this = this;
    var limit = this.get('contentsLimit') || 50;
    var offset = this.get('contentsOffset') || 0;
    this.set('contentsLoading', true);
    this.set('contentsLoadError', false);
    var url = '/api/v1/database_contents?table=' + encodeURIComponent(name) +
              '&limit=' + encodeURIComponent(limit) +
              '&offset=' + encodeURIComponent(offset);
    return this.get('persistence').ajax(url, { type: 'GET', dataType: 'json' }).then(function(json) {
      var payload = (json && json.database_contents) || {};
      _this.set('contentsLoading', false);
      _this.set('contentsRows', payload.rows || []);
      _this.set('contentsColumns', payload.columns || []);
      _this.set('contentsTotal', payload.total || 0);
      _this.set('contentsTotalExact', payload.total_exact !== false);
      _this.set('contentsLimit', payload.limit || limit);
      _this.set('contentsOffset', payload.offset || 0);
    }).catch(function() {
      _this.set('contentsLoading', false);
      _this.set('contentsLoadError', true);
      _this.set('contentsRows', []);
      _this.set('contentsColumns', []);
      _this.set('contentsTotal', 0);
      _this.set('contentsTotalExact', true);
    });
  }
});
