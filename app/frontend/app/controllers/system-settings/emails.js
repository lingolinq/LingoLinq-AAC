import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';
import i18n from '../../utils/i18n';

export default Controller.extend({
  persistence: service('persistence'),

  templates: null,
  categories: null,
  loading: false,
  loadError: false,
  searchQuery: '',
  categoryFilter: '',

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlActionMut = function(propPath, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.set(propPath, value);
      };
    };
  },

  filteredTemplates: computed('templates.[]', 'searchQuery', 'categoryFilter', function() {
    var list = this.get('templates') || [];
    var q = (this.get('searchQuery') || '').trim().toLowerCase();
    var cat = this.get('categoryFilter') || '';
    return list.filter(function(t) {
      if (cat && t.category !== cat) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (t.name || '').toLowerCase().indexOf(q) !== -1 ||
        (t.key || '').toLowerCase().indexOf(q) !== -1;
    });
  }),

  categoryOptions: computed('categories.[]', function() {
    var cats = this.get('categories') || [];
    var options = [{id: '', label: i18n.t('system_settings_filter_all_categories', 'All categories')}];
    cats.forEach(function(c) {
      options.push({id: c, label: c});
    });
    return options;
  }),

  getOrgId: function() {
    var parent = getOwner(this).lookup('controller:system-settings');
    return (parent && parent.get('org_id')) || 'default';
  },

  loadTemplates: function() {
    var _this = this;
    var orgId = this.getOrgId();
    this.set('loading', true);
    this.set('loadError', false);
    this.persistence.ajax('/api/v1/system_email_templates?org_id=' + encodeURIComponent(orgId), {type: 'GET'}).then(function(res) {
      _this.set('loading', false);
      var templates = (res.templates || []).map(function(t) {
        t.slug = (t.key || '').replace(/\//g, '.');
        return t;
      });
      _this.set('templates', templates);
      _this.set('categories', res.categories || []);
    }, function() {
      _this.set('loading', false);
      _this.set('loadError', true);
    });
  },

  templateSlug: function(key) {
    return (key || '').replace(/\//g, '.');
  }
});
