import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';
export default Controller.extend({
  persistence: service('persistence'),

  tables: null,
  loading: false,
  loadError: false,
  tableSearch: '',
  columnSearch: '',
  selectedTableName: null,

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

  actions: {
    selectTable(name) {
      this.set('selectedTableName', name);
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
  }
});
