import DS from 'ember-data';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import Button from '../../utils/button';

describe('Organization', function() {
  describe("processed_purchase_history", function() {
    it("should return a processed list", function() {
      var o = LingoLinq.store.createRecord('organization');
      o.set('purchase_history', []);
      expect(o.get('processed_purchase_history')).toEqual([]);

      o.set('purchase_history', [
        {'type': 'bacon', 'a': 1},
        {'type': 'fred', 'b': 2}
      ]);
      expect(o.get('processed_purchase_history').length).toEqual(2);
      expect(o.get('processed_purchase_history')[0].type).toEqual('bacon');
      expect(o.get('processed_purchase_history')[0].bacon).toEqual(true);
      expect(o.get('processed_purchase_history')[0].a).toEqual(1);
      expect(o.get('processed_purchase_history')[1].type).toEqual('fred');
      expect(o.get('processed_purchase_history')[1].fred).toEqual(true);
      expect(o.get('processed_purchase_history')[1].b).toEqual(2);
    });

    it("should not error on no result", function() {
      var o = LingoLinq.store.createRecord('organization');
      o.set('purchase_history', null);
      expect(o.get('processed_purchase_history')).toEqual([]);
    });
  });

  describe("processed_org_subscriptions", function() {
    it("should return a processed list", function() {
      var o = LingoLinq.store.createRecord('organization');
      o.set('org_subscriptions', []);
      expect(o.get('processed_org_subscriptions')).toEqual([]);

      o.set('org_subscriptions', [
        {},
        {'subscription': {never_expires: true}},
        {'subscription': {plan_id: 'monthly_4_plus_trial'}}
      ]);
      expect(o.get('processed_org_subscriptions').length).toEqual(3);
      expect(o.get('processed_org_subscriptions')[0].subscription_object).toNotEqual(null);
      expect(o.get('processed_org_subscriptions')[0].subscription_object.get('subscription_plan_description')).toEqual('no plan');
      expect(o.get('processed_org_subscriptions')[1].subscription_object).toNotEqual(null);
      expect(o.get('processed_org_subscriptions')[1].subscription_object.get('subscription_plan_description')).toEqual('free forever');
      expect(o.get('processed_org_subscriptions')[2].subscription_object).toNotEqual(null);
      expect(o.get('processed_org_subscriptions')[2].subscription_object.get('subscription_plan_description')).toEqual('communicator monthly $4');
    });

    it("should not error on no result", function() {
      var o = LingoLinq.store.createRecord('organization');
      o.set('org_subscriptions', null);
      expect(o.get('processed_org_subscriptions')).toEqual([]);
    });
  });
});
