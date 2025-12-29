import EmberObject from '@ember/object';
import DS from 'ember-data';
import $ from 'jquery';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import modal from '../utils/modal';
import Subscription from '../utils/subscription';
import Utils from '../utils/misc';
import { computed, observer } from '@ember/object';

LingoLinq.Organization = DS.Model.extend({
  init() {
    this._super(...arguments);
    this.set('total_licenses', this.get('allotted_licenses'));
    this.update_licenses_expire();
  },
  // Update licenses when organization is updated from server
  // Observer on key attributes that change on update
  updateLicensesOnUpdate: observer('retrieved', 'allotted_licenses', function() {
    this.set('total_licenses', this.get('allotted_licenses'));
    this.update_licenses_expire();
  }),
  name: DS.attr('string'),
  permissions: DS.attr('raw'),
  purchase_history: DS.attr('raw'),
  org_subscriptions: DS.attr('raw'),
  default_home_board: DS.attr('raw'),
  home_board_keys: DS.attr('raw'),
  admin: DS.attr('boolean'),
  org_access: DS.attr('boolean'),
  allotted_licenses: DS.attr('number'),
  allotted_eval_licenses: DS.attr('number'),
  allotted_supervisor_licenses: DS.attr('number'),
  allotted_extras: DS.attr('number'),
  used_licenses: DS.attr('number'),
  used_evals: DS.attr('number'),
  used_supervisors: DS.attr('number'),
  used_extras: DS.attr('number'),
  total_users: DS.attr('number'),
  total_managers: DS.attr('number'),
  total_supervisors: DS.attr('number'),
  total_premium_supervisors: DS.attr('number'),
  total_extras: DS.attr('number'),
  include_extras: DS.attr('boolean'),
  support_target: DS.attr('raw'),
  extra_colors: DS.attr('raw'),
  sale_cutoff_date: DS.attr('string'),
  site: DS.attr('raw'),
  status_overrides: DS.attr('raw'),
  note_templates: DS.attr('raw'),
  premium: DS.attr('boolean'),
  licenses_expire: DS.attr('string'),
  saml_metadata_url: DS.attr('string'),
  saml_sso_url: DS.attr('string'),
  image_url: DS.attr('string'),
  created: DS.attr('date'),
  children_orgs: DS.attr('raw'),
  parent_org: DS.attr('raw'),
  management_action: DS.attr('string'),
  assignment_action: DS.attr('string'),
  default_locale: DS.attr('string'),
  preferred_symbols: DS.attr('string'),
  start_codes: DS.attr('raw'),
  custom_domain: DS.attr('boolean'),
  supervisor_profile_id: DS.attr('string'),
  supervisor_profile_frequency: DS.attr('number'),
  communicator_profile_id: DS.attr('string'),
  communicator_profile_frequency: DS.attr('number'),
  hosts: DS.attr('raw'),
  host_settings: DS.attr('raw'),
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
LingoLinq.Organization.reopenClass({
  mimic_server_processing: function(record, hash) {
    hash.organization.permissions = {
      "view": true,
      "edit": true
    };

    return hash;
  }
});

export default LingoLinq.Organization;
