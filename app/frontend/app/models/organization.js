import EmberObject from '@ember/object';
import { attr } from '@ember-data/model';
import BaseModel from './base';
import $ from 'jquery';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import modal from '../utils/modal';
import Subscription from '../utils/subscription';
import Utils from '../utils/misc';
import { computed, observer } from '@ember/object';

LingoLinq.Organization = BaseModel.extend({
  init() {
    this._super(...arguments);
  },
  // Update licenses when organization is loaded or updated from server
  // Observer fires when allotted_licenses is set (emulating didLoad) and on subsequent changes (emulating didUpdate)
  updateLicensesOnUpdate: observer('retrieved', 'allotted_licenses', function() {
    this.set('total_licenses', this.get('allotted_licenses'));
    this.update_licenses_expire();
  }),
  name: attr('string'),
  permissions: attr('raw'),
  purchase_history: attr('raw'),
  org_subscriptions: attr('raw'),
  default_home_board: attr('raw'),
  home_board_keys: attr('raw'),
  admin: attr('boolean'),
  org_access: attr('boolean'),
  allotted_licenses: attr('number'),
  allotted_eval_licenses: attr('number'),
  allotted_supervisor_licenses: attr('number'),
  allotted_extras: attr('number'),
  used_licenses: attr('number'),
  used_evals: attr('number'),
  used_supervisors: attr('number'),
  used_extras: attr('number'),
  total_users: attr('number'),
  total_managers: attr('number'),
  total_supervisors: attr('number'),
  total_premium_supervisors: attr('number'),
  total_extras: attr('number'),
  include_extras: attr('boolean'),
  support_target: attr('raw'),
  extra_colors: attr('raw'),
  sale_cutoff_date: attr('string'),
  site: attr('raw'),
  status_overrides: attr('raw'),
  note_templates: attr('raw'),
  premium: attr('boolean'),
  licenses_expire: attr('string'),
  saml_metadata_url: attr('string'),
  saml_sso_url: attr('string'),
  image_url: attr('string'),
  created: attr('date'),
  children_orgs: attr('raw'),
  parent_org: attr('raw'),
  management_action: attr('string'),
  assignment_action: attr('string'),
  offboarding_parent_email: attr('string'),
  offboarding_birth_month: attr('number'),
  offboarding_birth_year: attr('number'),
  offboarding_under_13: attr('boolean'),
  offboarding_under_16: attr('boolean'),
  default_locale: attr('string'),
  jurisdiction: attr('string'),
  default_beta_program_access: attr('boolean'),
  external_ai_processing: attr('boolean'),
  preferred_symbols: attr('string'),
  start_codes: attr('raw'),
  custom_domain: attr('boolean'),
  supervisor_profile_id: attr('string'),
  supervisor_profile_frequency: attr('number'),
  communicator_profile_id: attr('string'),
  communicator_profile_frequency: attr('number'),
  hosts: attr('raw'),
  host_settings: attr('raw'),
  update_licenses_expire: function() {
    if(this.get('licenses_expire')) {
      var m = window.moment(this.get('licenses_expire'));
      if(m.isValid()) {
        this.set('licenses_expire', m.format('YYYY-MM-DD'));
      }
    }
  },
  licenses_available: computed('allotted_licenses', 'total_licenses', 'used_licenses', function() {
    return (this.get('allotted_licenses') || 0) > (this.get('used_licenses') || 0);
  }),
  eval_licenses_available: computed('allotted_eval_licenses', 'used_evals', function() {
    return (this.get('allotted_eval_licenses') || 0) > (this.get('used_evals') || 0);
  }),
  supervisor_licenses_available: computed('allotted_supervisor_licenses', 'used_supervisors', function() {
    return (this.get('allotted_supervisor_licenses') || 0) > (this.get('used_supervisors') || 0);
  }),
  extras_available_count: computed('allotted_extras', 'used_extras', function() {
    return (this.get('allotted_extras') || 0) - (this.get('used_extras') || 0);
  }),
  extras_available: computed('allotted_extras', 'used_extras', function() {
    return (this.get('allotted_extras') || 0) > (this.get('used_extras') || 0);
  }),
  processed_purchase_history: computed('purchase_history', function() {
    var res = [];
    (this.get('purchase_history') || []).forEach(function(e) {
      var evt = $.extend({}, e);
      evt[e.type] = true;
      res.push(evt);
    });
    return res;
  }),
  processed_org_subscriptions: computed('org_subscriptions', function() {
    var res = [];
    (this.get('org_subscriptions') || []).forEach(function(s) {
      var user = EmberObject.create(s);
      user.set('subscription_object', Subscription.create({user: user}));
      res.push(user);
    });
    return res;
  }),
  load_users: function() {
    var _this = this;
    Utils.all_pages('/api/v1/organizations/' + this.get('id') + '/users', {result_type: 'user', type: 'GET', data: {}}).then(function(data) {
      _this.set('all_communicators', data.filter(function(u) { return !u.org_pending; }));
    }, function(err) {
      _this.set('user_error', true);
    });
    Utils.all_pages('/api/v1/organizations/' + this.get('id') + '/supervisors', {result_type: 'user', type: 'GET', data: {}}).then(function(data) {
      _this.set('all_supervisors', data);
    }, function(err) {
      _this.set('user_error', true);
    });
  },
  supervisor_options: computed('all_supervisors', function() {
    var res = [{
      id: null,
      name: i18n.t('select_user', "[ Select User ]")
    }];
    (this.get('all_supervisors') || []).forEach(function(sup) {
      res.push({
        id: sup.id,
        name: sup.user_name
      });
    });
    return res;
  }),
  communicator_options: computed('all_communicators', function() {
    var res = [{
      id: null,
      name: i18n.t('select_user', "[ Select User ]")
    }];
    (this.get('all_communicators') || []).forEach(function(sup) {
      res.push({
        id: sup.id,
        name: sup.user_name
      });
    });
    return res;
  })
});

LingoLinq.Organization.mimic_server_processing = function(record, hash) {
  hash.organization.permissions = {
    "view": true,
    "edit": true
  };

  return hash;
};

export default LingoLinq.Organization;
