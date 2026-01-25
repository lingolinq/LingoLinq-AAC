import Controller from '@ember/controller';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import { computed } from '@ember/object';

export default Controller.extend({
  refresh_lists: function() {
    this.load_blocked_emails();
    this.load_gifts();
  },
  load_gifts: function(more) {
    var _this = this;
    _this.set('gifts', {loading: true});
    _this.store.query('gift', {}).then(function(list) {
      _this.set('gifts', list);
    }, function(err) {
      _this.set('gifts', {error: true});
    });
  },
  load_blocked_emails: function() {
    var _this = this;
    _this.set('blocked_emails', {loading: true});
    persistence.ajax('/api/v1/organizations/' + this.get('model.id') + '/blocked_emails', {type: 'GET'}).then(function(res) {
      _this.set('blocked_emails', res.emails);
    }, function(err) {
      _this.set('blocked_emails', {error: true});
    });
    _this.set('blocked_cells', {loading: true});
    persistence.ajax('/api/v1/organizations/' + this.get('model.id') + '/blocked_cells', {type: 'GET'}).then(function(res) {
      _this.set('blocked_cells', res.emails);
    }, function(err) {
      _this.set('blocked_cells', {error: true});
    });
  },
  gift_types: [
    {name: i18n.t('select_type', "[ Select Type ]"), id: ""},
    {name: i18n.t('single_user_gift_code', "Single User Gift Code"), id: "user_gift"},
    {name: i18n.t('bulk_purchase', "Bulk License Purchase"), id: "bulk_purchase"},
    {name: i18n.t('gift_code_batch', "Gift Code Batch"), id: "multi_code"},
    {name: i18n.t('discount_code', "Discount Code"), id: "discount"},
  ],
  current_gift_type: computed('gift_type', function() {
    var res = {};
    res[this.get('gift_type')] = true;
    return res;
  }),
  actions: {
    start_code_lookup: function() {
      this.transitionToRoute('start_codes', this.get('start_code'));
    },
    word_data_import: function() {
      var url = this.get('word_data_url');
      if(url) {
        persistence.ajax('/api/v1/organizations/' + this.get('model.id') + '/extra_action', {
          type: 'POST',
          data: {
            extra_action: 'import_word_data',
            url: url
          }
        }).then(function(res) {
          modal.success(i18n.t('import_scheduled', "Word Data Import scheduled! It could take a few hours to process"))
        }, function(err) {
          modal.error(i18n.t('error_importing_word_data', "Unexpected error importing word data"));
        });
      }
    },
    update_sale_date: function() {
      var cutoff = this.get('sale_cutoff_date') || "2000-01-01";
      var model = this.get('model');
      model.set('sale_cutoff_date', cutoff);
      var _this = this;
      model.save().then(function(org) {
        _this.set('sale_cutoff_date', org.get('sale_cutoff_date'));
      }, function(err) {
        modal.error(i18n.t('error_updating_date', "Error Updating Sale Date"));
      });
    },
    block_email: function() {
      var email = this.get('blocked_email_address');
      var _this = this;
      if(email) {
        persistence.ajax('/api/v1/organizations/' + this.get('model.id') + '/extra_action', {
          type: 'POST',
          data: {
            extra_action: 'block_email',
            email: email
          }
        }).then(function(res) {
          if(res.success === false) {
            modal.error(i18n.t('blocking_email_failed', "Email address was not blocked"));
          } else {
            _this.set('blocked_email_address', null);
            _this.load_blocked_emails();
          }
        }, function(err) {
          modal.error(i18n.t('error_blocking_email', "There was an unexpected error while trying to add the blocked email address"));
        });
      }
    },
    find_code: function() {
      var code = this.get('code_lookup');
      this.transitionToRoute('bulk_purchase', code);
    },
    add_gift: function(type) {
      var gift = this.store.createRecord('gift');
      if(type == 'purchase') {
        gift.set('amount', parseFloat(this.get('amount')));
        gift.set('licenses', parseInt(this.get('licenses'), 10));
        gift.set('organization', this.get('org'));
        gift.set('include_extras', this.get('include_extras'));
        gift.set('email', this.get('email'));
        gift.set('memo', this.get('memo'));
      } else if(type == 'multi_code') {
        gift.set('org_id', this.get('org_id'));
        gift.set('total_codes', parseInt(this.get('total_codes'), 10));
        gift.set('organization', this.get('org'));
        gift.set('email', this.get('email'));
        gift.set('memo', this.get('memo'));
        var years = parseFloat(this.get('years')) || 5;
        gift.set('seconds', years * 365.25 * 24 * 60 * 60);
      } else if(type == 'discount') {
        var amount = parseFloat(this.get('discount_pct'));
        if(amount <= 0 || isNaN(amount)) { return; }
        if(amount > 1.0) { amount = amount / 100; }
        gift.set('discount', amount);
        gift.set('organization', this.get('org'));
        gift.set('email', this.get('email'));
        if(this.get('expires') && this.get('expires').length > 0) {
          gift.set('expires', window.moment(this.get('expires'))._d);
        }
        gift.set('code', this.get('code'));
        gift.set('limit', this.get('limit'));
      } else {
        var years = parseFloat(this.get('duration')) || 3;
        gift.set('seconds', years * 365.25 * 24 * 60 * 60);
        gift.set('gift_name', this.get('gift_name'));
      }
      var _this = this;
      gift.save().then(function() {
        _this.load_gifts();
      }, function(err) {
        if(err && err.error == 'code is taken') {
          modal.error(i18n.t('code_taken', "There was an error creating the custom purchase, that code has already been taken"));
        } else {
          modal.error(i18n.t('error_creating_gift', "There was an error creating the custom purchase"));
        }
      });
    }
  }
});
