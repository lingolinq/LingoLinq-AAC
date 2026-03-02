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
import { db_wait } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from 'frontend/app';
import Subscription from '../../utils/subscription';
import persistence from '../../utils/persistence';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';

describe('subscription', function() {
  it("should initialize with reasonable values", function() {
    db_wait(function() {
      var s = Subscription.create();
      expect(s.get('user_type')).toEqual('communicator');
      expect(s.get('subscription_type')).toEqual('monthly');
      expect(s.get('subscription_amount')).toEqual('monthly_6');
      expect(s.get('show_options')).toEqual(false);
    });
  });

  it("should initialize with the user object if provided", function() {
    db_wait(function() {
      var u = EmberObject.create({
        subscription: {
          plan_id: 'monthly_6',
          expires: new Date(0)
        },
        email: 'susan@example.com'
      });
      var s = Subscription.create({user: u});
      expect(s.get('user_type')).toEqual('communicator');
      expect(s.get('user_expired')).toEqual(true);
      expect(s.get('subscription_type')).toEqual('monthly');
      expect(s.get('subscription_amount')).toEqual('monthly_6');
      expect(s.get('email')).toEqual('susan@example.com');
    });
  });

  it("should initialize subscription_amount correctly", function() {
    db_wait(function() {
      var u = EmberObject.create({
        subscription: {
          plan_id: 'monthly_4_plus_trial',
          expires: new Date(0)
        },
        email: 'susan@example.com'
      });
      var s = Subscription.create({user: u});
      expect(s.get('user_type')).toEqual('communicator');
      expect(s.get('user_expired')).toEqual(true);
      expect(s.get('subscription_type')).toEqual('monthly');
      expect(s.get('subscription_amount')).toEqual('monthly_4');
      expect(s.get('email')).toEqual('susan@example.com');
    });
  });

  it("should reset properly", function() {
    db_wait(function() {
      var s = Subscription.create();
      expect(s.get('user_type')).toEqual('communicator');
      expect(s.get('subscription_type')).toEqual('monthly');
      expect(s.get('subscription_amount')).toEqual('monthly_6');
      expect(s.get('show_options')).toEqual(false);
      s.set('user_type', 'supporter');
      s.set('subscription_type', 'long_term');
      s.reset();
      expect(s.get('user_type')).toEqual('communicator');
      expect(s.get('subscription_type')).toEqual('monthly');
    });
  });

  it("should validate plan configurations", function() {
    db_wait(function() {
      var s = Subscription.create();
      s.set('user_type', 'communicator');
      s.set('subscription_type', 'monthly');
      s.set('subscription_amount', 'monthly_2');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_amount', 'monthly_3');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_amount', 'monthly_11');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_amount', 'slp_monthly_3');
      expect(s.get('subscription_amount')).toEqual('monthly_6');
      expect(s.get('valid')).toEqual(true);
      expect(s.get('subscription_type')).toNotEqual('long_term');
      s.set('user_type', 'supporter');
      expect(s.get('subscription_type')).toEqual('monthly');
      expect(s.get('subscription_amount')).toEqual('slp_monthly_free');
      s.set('subscription_type', 'monthly');
      s.set('subscription_amount', 'slp_monthly_3');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_amount', 'slp_monthly_8');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_amount', 'slp_monthly_free');
      expect(s.get('subscription_type')).toEqual('long_term');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_type', 'long_term');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_amount', 'slp_long_term_100');
      expect(s.get('valid')).toEqual(true);
      s.set('user_type', 'communicator');
      expect(s.get('subscription_amount')).toEqual('monthly_6');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_amount', 'long_term_100');
      expect(s.get('valid')).toEqual(true);

      s.set('subscription_type', 'gift_code');
      expect(s.get('valid')).toEqual(false);
      s.set('gift_code', 'abcdefg');
      expect(s.get('valid')).toEqual(true);

      s.set('subscription_type', 'long_term_gift');
      expect(s.get('valid')).toEqual(false);
      s.set('email', 'bob@example.com');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_amount', 'long_term_100');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_amount', 'long_term_150');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_amount', 'long_term_custom');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_custom_amount', '100');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_custom_amount', '150');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_custom_amount', '222');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_custom_amount', '5000');
      expect(s.get('valid')).toEqual(true);
      s.set('any_subscription_amount', true);
      s.set('subscription_custom_amount', '222');
      expect(s.get('valid')).toEqual(true);
      s.set('subscription_custom_amount', '10');
      expect(s.get('valid')).toEqual(true);

      s.set('subscription_type', 'extras');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_amount', 'long_term_custom');
      expect(s.get('valid')).toEqual(false);
      s.set('subscription_custom_amount', 25);
      expect(s.get('valid')).toEqual(true);
    });
  });

  it("should process settings and return correct descriptions", function() {
    db_wait(function() {
      var s = Subscription.create();
      s.set('subscription_amount', 'monthly_6');
      expect(s.get('amount_in_cents')).toEqual(600);
      expect(s.get('description')).toEqual("LingoLinq monthly subscription");
      expect(s.get('subscription_plan_description')).toEqual('no plan');
      expect(s.get('purchase_description')).toEqual('Subscribe');

      s.set('subscription_plan', 'monthly_3');
      s.set('subscription_amount', 'slp_long_term_100');
      expect(s.get('subscription_amount')).toEqual('monthly_6');
      expect(s.get('amount_in_cents')).toEqual(600);

      s.set('subscription_type', 'long_term');
      s.set('user_type', 'supporter');
      s.set('subscription_amount', 'slp_long_term_100');
      expect(s.get('amount_in_cents')).toEqual(10000);
      expect(s.get('description')).toEqual("LingoLinq supporting-role 5-year purchase");
      expect(s.get('subscription_plan_description')).toEqual('communicator monthly $3');
      expect(s.get('purchase_description')).toEqual('Purchase');
    });
  });

  it("should return correct description for free forever plans", function() {
      var s = Subscription.create();
      s.set('subscription_amount', 'monthly_6');
      expect(s.get('amount_in_cents')).toEqual(600);
      expect(s.get('description')).toEqual("LingoLinq monthly subscription");
      expect(s.get('subscription_plan_description')).toEqual('no plan');
      s.set('user', {subscription: {never_expires: true}});
      expect(s.get('subscription_plan_description')).toEqual('free forever');
  });

  it('should add extras price for long-term purchases to amount_in_cents', function() {
    db_wait(function() {
      var s = Subscription.create();
      s.set('subscription_type', 'long_term');
      s.set('user_type', 'communicator');
      s.set('subscription_amount', 'long_term_200');
      expect(s.get('amount_in_cents')).toEqual(20000);
      s.set('extras', true);
      expect(s.get('amount_in_cents')).toEqual(22500);

      s.set('discount_percent', 0.3);
      expect(s.get('amount_in_cents')).toEqual(16500);
    });
  });

  it("should initialize the purchasing system", function() {
    db_wait(function() {
      var handler = {};
      var checkout = {
        configure: function(args) {
          handler.args = args;
          return handler;
        }
      };
      console.log('stubbing...');
      stub(document.body, 'appendChild', function() {
        console.log('appending...');
        window.StripeCheckout = checkout;
      });
      var old_key = window.stripe_public_key;
      window.stripe_public_key = 'asdfasdf';
      Subscription.init();
      waitsFor(function() { return Subscription.handler == handler; });
      runs(function() {
        expect(handler.args.key).toEqual('asdfasdf');
        expect(handler.args.image).toEqual('/images/logo-big-blue-gold.png');
        expect(handler.args.token).toNotEqual(undefined);

        window.StripeCheckout = null;
        window.stripe_public_key = old_key;
      });
    });
  });

  describe('check_gift', function() {
    it('should update gift_status correctly', function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(url, opts) {
          return RSVP.reject({});
        });
        var s = Subscription.create();
        s.check_gift();
        expect(s.get('gift_status')).toEqual({checking: true});
        waitsFor(function() { return s.get('gift_status.error')});
        runs();
      });
    });
    it('should update gift_status error', function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(url, opts) {
          expect(url).toEqual('/api/v1/gifts/code_check?code=bacon');
          return RSVP.resolve({valid: false});
        });
        var s = Subscription.create();
        s.set('gift_code', 'bacon');
        s.check_gift();
        expect(s.get('gift_status')).toEqual({checking: true});
        waitsFor(function() { return s.get('gift_status.error')});
        runs();
      });
    });

    it('should apply the returned percent', function() {
      db_wait(function() {
        stub(persistence, 'ajax', function(url, opts) {
          if(url == '/api/v1/gifts/code_check?code=12345') {
            return RSVP.resolve({valid: true, discount_percent: 0.5});
          } else {
            return RSVP.reject({});
          }
        })
        var s = Subscription.create();
        s.set('gift_code', '12345');
        s.check_gift();
        expect(s.get('gift_status')).toEqual({checking: true});
        waitsFor(function() { return !s.get('gift_status')});
        runs(function() {
          expect(s.get('discount_percent')).toEqual(0.5);
          expect(s.get('subscription_type')).toEqual('long_term');
          expect(s.get('subscription_amount')).toEqual('long_term_200');
        });
      })
    });
  });

  describe("cheaper_offer", function() {
    it("should return cheaper_offer if there's a sale", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_6',
            expires: new Date(0)
          },
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('cheaper_offer')).toEqual(false);
        stub(LingoLinq, 'sale', ((new Date()).getTime() / 1000) + 500);
        s.reset();
        expect(s.get('sale')).toEqual(true);
        expect(s.get('cheaper_offer')).toEqual(true);
      });
    });
    it("should return much_cheaper_offer if there's a sale", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_6',
            expires: new Date(0)
          },
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('much_cheaper_offer')).toEqual(false);
        stub(LingoLinq, 'sale', ((new Date()).getTime() / 1000) + 500);
        s.reset();
        expect(s.get('sale')).toEqual(true);
        expect(s.get('much_cheaper_offer')).toEqual(true);
      });
    });
    it("should return cheaper_offer if the user is still in the discount period", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_6',
            expires: new Date(0)
          },
          joined: window.moment('2010-01-01'),
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('cheaper_offer')).toEqual(false);
        expect(s.get('discount_period')).toEqual(false);
        u.set('joined_within_24_hours', true);
        s.set('discount_period', true);
        expect(s.get('discount_period')).toEqual(true);
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('much_cheaper_offer')).toEqual(false);
      });
    });
    it("should not return cheaper offer if no sale and not in the discount period", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_6',
            expires: new Date(0)
          },
          joined: window.moment('2010-01-01'),
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('cheaper_offer')).toEqual(false);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(false);
      });
    });
    it("should return cheaper_offer if the user is already subscribed with cheaper_offer", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_4',
            expires: new Date(0)
          },
          joined: window.moment('2010-01-01'),
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(false);
        u.set('subscription.plan_id', 'monthly_4_plus_trial');
        s.reset();
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(false);
      });
    });
    it("should return cheaper_offer if the user is already subscribed with much_cheaper_offer", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_3',
            expires: new Date(0)
          },
          joined: window.moment('2010-01-01'),
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(true);
        u.set('subscription.plan_id', 'monthly_3_plus_trial');
        s.reset();
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(true);
      });
    });
    it("should return much_cheaper_offer if the user is already subscribed with much_cheaper_offer", function() {
      db_wait(function() {
        var u = EmberObject.create({
          subscription: {
            plan_id: 'monthly_3',
            expires: new Date(0)
          },
          joined: window.moment('2010-01-01'),
          email: 'susan@example.com'
        });
        var s = Subscription.create({user: u});
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(true);
        u.set('subscription.plan_id', 'monthly_3_plus_trial');
        s.reset();
        expect(s.get('cheaper_offer')).toEqual(true);
        expect(s.get('discount_period')).toEqual(false);
        expect(s.get('much_cheaper_offer')).toEqual(true);
      });
    });
  });

  describe('subscription_types', function() {
    it('should flag communicators correctly before and after their trial expires', function() {
      var user = LingoLinq.store.createRecord('user');
      var exp = window.moment().add(6, 'day').toISOString();
      user.set('subscription', {expires: exp, free_premium: false, grace_period: true, fully_purchased: false});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(true);

      exp = window.moment().add(-6, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      exp = window.moment().add(-20, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(true);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      exp = window.moment().add(-6, 'year').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(true);
      expect(user.get('really_really_expired')).toEqual(true);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);
    });

    it('should flag supporters correctly before and after their trial expires', function() {
      var user = LingoLinq.store.createRecord('user');
      var exp = window.moment().add(6, 'day').toISOString();
      user.set('preferences', {role: 'supporter'});
      user.set('subscription', {expires: exp, free_premium: false, grace_period: true, fully_purchased: false});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(true);
      expect(user.get('limited_supervisor')).toEqual(false);

      exp = window.moment().add(-6, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);

      exp = window.moment().add(-20, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);

      exp = window.moment().add(-6, 'year').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);

      user.set('subscription.limited_supervisor', true);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(true);
    });

    it('should flag long-term purchasers correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      var exp = window.moment().add(6, 'day').toISOString();
      user.set('subscription', {expires: exp, free_premium: false, grace_period: true, active: true, purchased: true, plan_id: 'long_term_150'});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(true);

      exp = window.moment().add(-6, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      user.set('subscription.fully_purchased', true);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(true);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      exp = window.moment().add(-6, 'year').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(true);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);
    });

    it('should flag paid supporters correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      var exp = window.moment().add(6, 'day').toISOString();
      user.set('subscription', {expires: exp, free_premium: false, grace_period: false, active: true, purchased: true, plan_id: 'slp_long_term_50'});
      user.set('preferences', {role: 'supporter'});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      exp = window.moment().add(-6, 'year').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);
    });

    it('should flag free supporters correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      var exp = window.moment().add(6, 'day').toISOString();
      user.set('preferences', {role: 'supporter'});
      user.set('subscription', {expires: null, free_premium: true, grace_period: false, fully_purchased: false});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);

      exp = window.moment().add(-6, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);

      user.set('subscription.limited_supervisor', true);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(true);
      expect(user.get('grace_period')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(true);
    });

    it('should flag subscribers correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      var exp = window.moment().add(6, 'day').toISOString();
      user.set('subscription', {expires: null, free_premium: false, grace_period: false, active: true, purchased: true, plan_id: 'monthly_6'});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      user.set('subscription.fully_purchased', true);
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(true);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      user.set('subscription.expires', exp);
      user.set('subscription.active', false);
      user.set('subscription.purchased', false);
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(true);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      var exp = window.moment().add(-6, 'day').toISOString();
      user.set('subscription.expires', exp);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(true);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(true);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      user.set('subscription.fully_purchased', false);
      expect(user.get('currently_premium')).toEqual(false);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(true);
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);
    });

    it('should flag org-sponsored users correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('subscription', {active: true});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);

      var exp = window.moment().add(6, 'day').toISOString();
      user.set('subscription.expires', exp);
      user.set('subscription.grace_period', true);
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(true);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(true);
    });

    it('should flag never_expires users correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('subscription', {active: true, never_expires: true});
      user.set('membership_type', 'premium');
      expect(user.get('currently_premium')).toEqual(true);
      expect(user.get('free_premium')).toEqual(false);
      expect(user.get('expired')).toEqual(false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      expect(user.get('really_expired')).toEqual(false);
      expect(user.get('really_really_expired')).toEqual(false);
      expect(user.get('fully_purchased')).toEqual(false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      expect(user.get('supporter_role')).toEqual(false);
      expect(user.get('limited_supervisor')).toEqual(false);
      expect(user.get('grace_period')).toEqual(false);
    });
  });

  describe("purchase", function() {
    it("should return a rejected promise if not initialized", function() {
      db_wait(function() {
        stub(window, 'alert', function() { });
        Subscription.handler = null;
        var failed = false;
        var res = Subscription.purchase({});
        res.then(null, function(err) { failed = err; });
        waitsFor(function() { return failed; });
        runs(function() {
          expect(failed.error).toEqual('not ready');
        });
      });
    });

    it("should return a valid promise if initialized", function() {
      db_wait(function() {
        var open_args = null;
        var handler = {
          open: function(args) {
            open_args = args;
          }
        };
        var checkout = {};
        window.StripeCheckout = checkout;
        Subscription.handler = handler;

        var s = Subscription.create();
        s.set('subscription_amount', 'monthly_6');
        var res = Subscription.purchase(s);
        expect(res.then).toNotEqual(undefined);
        window.StripeCheckout = null;
      });
    });

    it("should call the purchasing tool", function() {
      db_wait(function() {
        var open_args = null;
        var handler = {
          open: function(args) {
            open_args = args;
          }
        };
        var checkout = {};
        window.StripeCheckout = checkout;
        Subscription.handler = handler;

        var s = Subscription.create();
        s.set('subscription_amount', 'monthly_6');
        var res = Subscription.purchase(s);
        expect(res.then).toNotEqual(undefined);
        expect(open_args).toNotEqual(null);
        expect(open_args.name).toEqual('LingoLinq');
        expect(open_args.description).toEqual('LingoLinq monthly subscription');
        expect(open_args.amount).toEqual(600);
        expect(open_args.panelLabel).toEqual('Subscribe');
        expect(open_args.email).toEqual(undefined);
        expect(open_args.zipCode).toEqual(true);
        window.StripeCheckout = null;
      });
    });
  });

  describe('description', function() {
    it('should return ths correct value', function() {
      db_wait(function() {
        var s = Subscription.create();
        expect(s.get('description')).toEqual('LingoLinq supporting-role 5-year purchase');
        s.set('user_type', 'communicator');
        expect(s.get('description')).toEqual('LingoLinq monthly subscription');
        s.set('subscription_type', 'long_term');
        expect(s.get('description')).toEqual('LingoLinq 5-year purchase');
        s.set('subscription_type', 'extras');
        expect(s.get('description')).toEqual('LingoLinq premium symbols');
        s.set('val');
        expect(s.get('description')).toEqual('LingoLinq evaluation account');
        s.set('subscription_type', 'monthly');
        expect(s.get('description')).toEqual('LingoLinq monthly evaluation account');
        s.set('user_type', 'supporter');
        s.set('subscription_type', 'monthly');
        expect(s.get('description')).toEqual('LingoLinq supporting-role');
        s.set('extras', true);
        expect(s.get('description')).toEqual('LingoLinq supporting-role Plus Premium Symbols');
      })
    });
  });

  describe('purchase_description', function() {
    it('should return the correct value', function() {
      db_wait(function() {
        var s = Subscription.create();
        expect(s.get('purchase_description')).toEqual('Purchase');
        s.set('subscription_type', 'monthly');
        expect(s.get('purchase_description')).toEqual('Subscribe');
        s.set('subscription_amount', 'slp_monthly_free');
        expect(s.get('purchase_description')).toEqual('Purchase');
      })
    });
  })
});

