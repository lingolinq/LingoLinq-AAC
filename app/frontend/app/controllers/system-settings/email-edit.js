import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { getOwner } from '@ember/application';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';

export default Controller.extend({
  persistence: service('persistence'),

  template_slug: null,
  template: null,
  subject: '',
  html_body: '',
  text_body: '',
  i18nBlocks: null,
  brandingVariables: null,
  dynamicVariables: null,
  activeFormat: 'html',
  loading: false,
  loadError: false,
  saving: false,
  previewing: false,
  previewHtml: null,
  previewText: null,
  previewSubject: null,

  hasI18nBlocks: computed('template.has_i18n_blocks', function() {
    return !!this.get('template.has_i18n_blocks');
  }),

  clearPreviewState: function() {
    this.set('previewSubject', null);
    this.set('previewHtml', null);
    this.set('previewText', null);
  },

  brandingEditRoute: computed('template.org_id', function() {
    var orgId = this.get('template.org_id') || this.getOrgId();
    if (!orgId || orgId === 'default') {
      return 'system-settings.app-defaults';
    }
    return 'organization.settings';
  }),

  brandingEditOrgId: computed('template.org_id', function() {
    var orgId = this.get('template.org_id') || this.getOrgId();
    if (!orgId || orgId === 'default') {
      return null;
    }
    return orgId;
  }),

  brandingEditLabel: computed('template.org_id', function() {
    var orgId = this.get('template.org_id') || this.getOrgId();
    if (!orgId || orgId === 'default') {
      return i18n.t('system_settings_edit_app_defaults', 'Edit app defaults');
    }
    return i18n.t('system_settings_edit_org_defaults', 'Edit organization defaults');
  }),

  getOrgId: function() {
    var parent = getOwner(this).lookup('controller:system-settings');
    return (parent && parent.get('org_id')) || 'default';
  },

  buildI18nOverrides: function() {
    var blocks = this.get('i18nBlocks') || [];
    var overrides = {};
    blocks.forEach(function(block) {
      if (block.key && block.value != null) {
        overrides[block.key] = block.value;
      }
    });
    return overrides;
  },

  loadTemplate: function() {
    var _this = this;
    var slug = this.get('template_slug');
    var orgId = this.getOrgId();
    if (!slug) {
      return;
    }
    this.clearPreviewState();
    this.set('loading', true);
    this.set('loadError', false);
    this.set('template', null);
    this.set('subject', '');
    this.set('html_body', '');
    this.set('text_body', '');
    this.set('i18nBlocks', []);
    this.set('brandingVariables', []);
    this.set('dynamicVariables', []);
    this.set('activeFormat', 'html');
    this.persistence.ajax('/api/v1/system_email_templates/' + encodeURIComponent(slug) + '?org_id=' + encodeURIComponent(orgId), {type: 'GET'}).then(function(res) {
      var t = res.template || {};
      _this.set('loading', false);
      _this.set('template', t);
      _this.set('subject', t.subject || '');
      _this.set('html_body', t.html_body || '');
      _this.set('text_body', t.text_body || '');
      _this.set('i18nBlocks', (t.i18n_blocks || []).map(function(block) {
        return Object.assign({}, block);
      }));
      _this.set('brandingVariables', t.branding_variables || []);
      _this.set('dynamicVariables', t.dynamic_variables || []);
      if (t.has_i18n_blocks) {
        _this.set('activeFormat', 'message');
      }
    }, function() {
      _this.set('loading', false);
      _this.set('loadError', true);
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
  },


  actions: {
    setFormat: function(format) {
      this.set('activeFormat', format);
    },

    updateI18nBlock: function(block, value) {
      var blocks = (this.get('i18nBlocks') || []).map(function(item) {
        if (item.key === block.key) {
          return Object.assign({}, item, { value: value });
        }
        return item;
      });
      this.set('i18nBlocks', blocks);
    },

    saveTemplate: function() {
      var _this = this;
      var slug = this.get('template_slug');
      var orgId = this.getOrgId();
      var payload = {
        subject: this.get('subject'),
        html_body: this.get('html_body'),
        text_body: this.get('text_body')
      };
      if (this.get('template.has_i18n_blocks')) {
        payload.i18n_overrides = this.buildI18nOverrides();
        payload.subject = '';
      }
      this.set('saving', true);
      this.persistence.ajax('/api/v1/system_email_templates/' + encodeURIComponent(slug), {
        type: 'PUT',
        data: {
          org_id: orgId,
          template: payload
        }
      }).then(function() {
        _this.set('saving', false);
        modal.success(i18n.t('system_settings_email_saved', 'Email template saved.'));
        _this.loadTemplate();
      }, function(err) {
        _this.set('saving', false);
        modal.error(err.error || err.errors || i18n.t('system_settings_save_error', 'Could not save settings.'));
      });
    },

    resetTemplate: function() {
      var _this = this;
      var slug = this.get('template_slug');
      var orgId = this.getOrgId();
      if (!window.confirm(i18n.t('system_settings_email_reset_confirm', 'Reset this email to the default template?'))) {
        return;
      }
      this.persistence.ajax('/api/v1/system_email_templates/' + encodeURIComponent(slug) + '?org_id=' + encodeURIComponent(orgId), {type: 'DELETE'}).then(function() {
        modal.success(i18n.t('system_settings_email_reset_done', 'Email template reset.'));
        _this.loadTemplate();
      }, function(err) {
        modal.error(err.error || err.errors || i18n.t('system_settings_save_error', 'Could not save settings.'));
      });
    },

    previewTemplate: function() {
      if (this.get('loading') || !this.get('template')) {
        return;
      }
      var _this = this;
      var slug = this.get('template_slug');
      var orgId = this.getOrgId();
      var payload = {
        subject: this.get('subject'),
        html_body: this.get('html_body'),
        text_body: this.get('text_body')
      };
      if (this.get('template.has_i18n_blocks')) {
        payload.i18n_overrides = this.buildI18nOverrides();
        payload.subject = '';
      }
      this.clearPreviewState();
      this.set('previewing', true);
      this.persistence.ajax('/api/v1/system_email_templates/' + encodeURIComponent(slug) + '/preview?org_id=' + encodeURIComponent(orgId), {
        type: 'POST',
        data: {
          template: payload
        }
      }).then(function(res) {
        _this.set('previewing', false);
        _this.set('previewSubject', res.subject);
        _this.set('previewHtml', res.html_body);
        _this.set('previewText', res.text_body);
      }, function(err) {
        _this.set('previewing', false);
        modal.error(err.error || err.errors || i18n.t('system_settings_preview_error', 'Could not generate preview.'));
      });
    }
  }
});
