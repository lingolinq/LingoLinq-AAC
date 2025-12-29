import DS from 'ember-data';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Gift = DS.Model.extend({
  code: DS.attr('string'),
  duration: DS.attr('string'),
  seconds: DS.attr('number'),
  created: DS.attr('date'),
  licenses: DS.attr('number'),
  gift_type: DS.attr('string'),
  total_codes: DS.attr('number'),
  redeemed_codes: DS.attr('number'),
  activated_discounts: DS.attr('number'),
  activations: DS.attr('raw'),
  limit: DS.attr('number'),
  expires: DS.attr('date'),
  include_extras: DS.attr('boolean'),
  include_supporters: DS.attr('number'),
  org_connected: DS.attr('boolean'),
  codes: DS.attr('raw'),
  active: DS.attr('boolean'),
  purchase: DS.attr('string'),
  organization: DS.attr('string'),
  gift_name: DS.attr('string'),
  giver: DS.attr('raw'),
  recipient: DS.attr('raw'),
  email: DS.attr('string'),
  memo: DS.attr('string'),
  amount: DS.attr('number'),
  discount: DS.attr('number'),
  discount_hundred: computed('discount', function() {
    return (this.get('discount') || 1.0) * 100;
  }),
  update_gift_types: observer('gift_type', function() {
    var res = {};
    res[this.get('gift_type') || 'user_gift'] = true;
    this.set('gift_types', res);
  })
});

export default LingoLinq.Gift;

