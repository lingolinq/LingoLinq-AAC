import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Gift = BaseModel.extend({
  code: attr('string'),
  duration: attr('string'),
  seconds: attr('number'),
  created: attr('date'),
  licenses: attr('number'),
  gift_type: attr('string'),
  total_codes: attr('number'),
  redeemed_codes: attr('number'),
  activated_discounts: attr('number'),
  activations: attr('raw'),
  limit: attr('number'),
  expires: attr('date'),
  include_extras: attr('boolean'),
  include_supporters: attr('number'),
  org_connected: attr('boolean'),
  codes: attr('raw'),
  active: attr('boolean'),
  purchase: attr('string'),
  organization: attr('string'),
  gift_name: attr('string'),
  giver: attr('raw'),
  recipient: attr('raw'),
  email: attr('string'),
  memo: attr('string'),
  amount: attr('number'),
  discount: attr('number'),
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

