require 'spec_helper'
require 'ostruct'
require 'stringio'

describe Purchasing do
  class FakeCardError < Stripe::CardError
    def initialize(json)
      @json_body = json.with_indifferent_access
    end
    
    def json_body
      @json_body
    end
  end

  def stripe_event_request(type, object, previous=nil)
    req = OpenStruct.new
    id = 'obj_' + rand(9999).to_s
    req.body = StringIO.new({'id' => id}.to_json)
    expect(Stripe::Event).to receive(:retrieve).with(id).and_return({
      'type' => type,
      'data' => {
        'object' => object,
        'previous_attributes' => previous
      }
    })
    res = Purchasing.subscription_event(req)
    expect(res[:status]).to eq(200)
    Worker.process_queues
    res
  end
  
  describe "subscription_event" do
    it "should error if event not found" do
      req = OpenStruct.new
      req.body = StringIO.new('')
      res = Purchasing.subscription_event(req)
      expect(res[:status]).to eq(400)
      expect(res[:data]).to eq({:error => "invalid parameters", :event_id => nil})

      req = OpenStruct.new
      req.body = StringIO.new({'id' => 'asdf'}.to_json)
      expect(Stripe::Event).to receive(:retrieve).with('asdf').and_return(nil)
      res = Purchasing.subscription_event(req)
      expect(res[:status]).to eq(200)
      expect(res[:data]).to eq({:error => "invalid parameters", :event_id => 'asdf'})
      
      expect(Stripe::Event).to receive(:retrieve).with('asdf') { raise "no" }
      req.body.rewind
      res = Purchasing.subscription_event(req)
      expect(res[:status]).to eq(200)
      expect(res[:data]).to eq({:error => "invalid parameters", :event_id => 'asdf'})
    end
    
    it "should succeed if something is found" do
      req = OpenStruct.new
      req.body = StringIO.new({'id' => 'asdf'}.to_json)
      expect(Stripe::Event).to receive(:retrieve).with('asdf').and_return({'type' => 'bacon'})
      res = Purchasing.subscription_event(req)
      expect(res[:status]).to eq(200)
      expect(res[:data]).to eq({:valid => false, :type => 'bacon', :event_id => 'asdf'})
    end
    
    it "should update a user when their metadata changed" do
      u1 = User.create
      u2 = User.create
      u1.settings['subscription'] = {'customer_id' => 'abacus'}
      o = OpenStruct.new(:metadata => {'user_id' => u2.global_id})
      expect(Stripe::Customer).to receive(:retrieve).with({id: 'abacus'}).and_return(o)
      expect(User).to receive(:find_by_global_id).with(u1.global_id).and_return(u1)
      expect(User).to receive(:find_by_global_id).with(u2.global_id).and_return(u2)
      expect(u1).to receive(:transfer_subscription_to).with(u2, true)
      stripe_event_request('customer.updated', {
        'id' => 'abacus',
        'metadata' => {
          'user_id' => u2.global_id
        }
      }, {
        'metadata' => {
          'user_id' => u1.global_id
        }
      })
    end
    
    it "should not update a user when their metadata change has already been updated" do
      u1 = User.create
      u2 = User.create
      o = OpenStruct.new(:metadata => {'user_id' => u2.global_id})
      expect(Stripe::Customer).to receive(:retrieve).with({id: 'abacus'}).and_return(o)
      expect(User).to receive(:find_by_global_id).with(u1.global_id).and_return(u1)
      expect(User).to receive(:find_by_global_id).with(u2.global_id).and_return(u2)
      expect(u1).to_not receive(:transfer_subscription_to)
      stripe_event_request('customer.updated', {
        'id' => 'abacus',
        'metadata' => {
          'user_id' => u2.global_id
        }
      }, {
        'metadata' => {
          'user_id' => u1.global_id
        }
      })
    end


    describe "charge.succeeded" do
      it "should trigger a purchase event" do
        u = User.create
        u.settings['purchase_bounced'] = true
        u.save
        exp = u.expires_at
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
        
        expect(Stripe::Customer).to receive(:retrieve).with({id: 'qwer'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => 'qwer',
          'metadata' => {
            'user_id' => u.global_id,
            'plan_id' => 'long_term_100'
          }
        }
        u.reload
        expect(u.settings['subscription']['last_purchase_plan_id']).to eq('long_term_100')
        expect(u.settings['subscription']['customer_id']).to eq('qwer')
        expect(u.settings['subscription']['last_purchase_id']).to eq('12345')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq([])
        expect(u.settings['purchase_bounced']).to eq(false)
        expect(u.expires_at).to eq(exp + 5.years.to_i)
        expect(res[:data]).to eq({:purchase => true, :purchase_id => '12345', :valid => true})
      end

      it "should not trigger a purchase event from the wrong source" do
        u = User.create
        u.settings['purchase_bounced'] = true
        u.save
        exp = u.expires_at
        expect(SubscriptionMailer).to_not receive(:schedule_delivery)
        expect(SubscriptionMailer).to_not receive(:schedule_delivery)
        
        expect(Stripe::Customer).to_not receive(:retrieve).with({id: 'qwer'})
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => 'qwer',
          'metadata' => {
            'user_id' => u.global_id,
            'plan_id' => 'long_term_100',
            'platform_source' => 'not_coughdrop'
          }
        }
        u.reload
        expect(u.settings['subscription']['last_purchase_plan_id']).to eq(nil)
        expect(u.settings['subscription']['customer_id']).to eq(nil)
        expect(res[:data][:valid]).to eq(false)
      end

      it 'should handle extras purchases' do
        u = User.create
        exp = u.expires_at
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:extras_purchased, u.global_id)
        
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => '23456',
          'metadata' => {
            'user_id' => u.global_id,
            'purchased_symbols' => 'true',
            'type' => 'extras'
          }
        }
        u.reload
        expect(u.subscription_hash['extras_enabled']).to eq(true)
        expect(u.settings['subscription']['extras']['customer_id']).to eq('23456')
        expect(u.settings['subscription']['extras']['purchase_id']).to eq('12345')
        expect(res[:data]).to eq({:extras => true, :purchase_id => '12345', :valid => true})
      end

      it 'should ignore extras purchases from a different source' do
        u = User.create
        exp = u.expires_at
        expect(SubscriptionMailer).to_not receive(:schedule_delivery)
        
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => '23456',
          'metadata' => {
            'user_id' => u.global_id,
            'purchased_symbols' => 'true',
            'platform_source' => 'not_coughdrop',
            'type' => 'extras'
          }
        }
        u.reload
        expect(u.billing_state).to eq(:trialing_communicator)
        expect(u.settings['subscription']['extras']).to eq(nil)
        expect(res[:data][:valid]).to eq(false)
      end

      it 'should handle adding supporters on extras charge' do
        u = User.create
        exp = u.expires_at
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:extras_purchased, u.global_id)
        
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => '23456',
          'metadata' => {
            'user_id' => u.global_id,
            'purchased_supporters' => 3,
            'purchased_symbols' => 'true',
            'type' => 'extras'
          }
        }
        u.reload
        expect(u.premium_supporter_grants).to eq(3)
        expect(u.subscription_hash['extras_enabled']).to eq(true)
        expect(u.settings['subscription']['extras']['customer_id']).to eq('23456')
        expect(u.settings['subscription']['extras']['purchase_id']).to eq('12345')
        expect(res[:data]).to eq({:extras => true, :purchase_id => '12345', :valid => true})
      end

      it 'should not re-execute already-run extras purchase' do
        u = User.create
        exp = u.expires_at
        u.settings['subscription'] = {}
        u.settings['subscription']['prior_purchase_ids'] = ['extras:12345']
        u.save!
        
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => '23456',
          'metadata' => {
            'user_id' => u.global_id,
            'purchased_supporters' => 3,
            'purchased_symbols' => 'true',
            'type' => 'extras'
          }
        }
        u.reload
        expect(u.premium_supporter_grants).to eq(0)
        expect(u.billing_state).to eq(:trialing_communicator)
        expect(u.settings['subscription']['extras']).to eq(nil)
        expect(res[:data]).to eq({:extras => true, :purchase_id => '12345', :valid => true})
      end

      it 'should ignore second charge.succeeded event for purchasing extras' do
        u = User.create
        exp = u.expires_at
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:extras_purchased, u.global_id)
        
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => '23456',
          'metadata' => {
            'user_id' => u.global_id,
            'purchased_supporters' => 3,
            'purchased_symbols' => 'true',
            'type' => 'extras'
          }
        }
        u.reload
        expect(u.premium_supporter_grants).to eq(3)
        expect(u.subscription_hash['extras_enabled']).to eq(true)
        expect(u.settings['subscription']['extras']['customer_id']).to eq('23456')
        expect(u.settings['subscription']['extras']['purchase_id']).to eq('12345')
        expect(res[:data]).to eq({:extras => true, :purchase_id => '12345', :valid => true})

        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => '23456',
          'metadata' => {
            'user_id' => u.global_id,
            'purchased_supporters' => 3,
            'purchased_symbols' => 'true',
            'type' => 'extras'
          }
        }
        u.reload
        expect(u.premium_supporter_grants).to eq(3)
        expect(u.subscription_hash['extras_enabled']).to eq(true)
        expect(u.settings['subscription']['extras']['customer_id']).to eq('23456')
        expect(u.settings['subscription']['extras']['purchase_id']).to eq('12345')
        expect(res[:data]).to eq({:extras => true, :purchase_id => '12345', :valid => true})
      end

      it 'should handle an extras addendum purchase on a one-time purchase' do
        u = User.create
        u.settings['purchase_bounced'] = true
        u.save
        exp = u.expires_at
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
        
        expect(Stripe::Customer).to receive(:retrieve).with({id: 'qwer'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        res = stripe_event_request 'charge.succeeded', {
          'id' => '12345',
          'customer' => 'qwer',
          'metadata' => {
            'user_id' => u.global_id,
            'plan_id' => 'long_term_200',
            'purchased_supporters' => 4,
            'purchased_symbols' => 'true'
          }
        }
        u.reload
        expect(u.settings['subscription']['last_purchase_plan_id']).to eq('long_term_200')
        expect(u.settings['subscription']['customer_id']).to eq('qwer')
        expect(u.settings['subscription']['last_purchase_id']).to eq('12345')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq(["extras:12345"])
        expect(u.settings['purchase_bounced']).to eq(false)
        expect(u.expires_at).to eq(exp + 5.years.to_i)
        expect(res[:data]).to eq({:purchase => true, :purchase_id => '12345', :valid => true})
        Worker.process_queues
        expect(u.reload.premium_supporter_grants).to eq(4)
        expect(u.subscription_hash['extras_enabled']).to eq(true)
      end
    end
    
    describe "charge.failed" do
      it "should trigger a purchase_failed event" do
        u = User.create
        expect(Stripe::Customer).to receive(:retrieve).with({id: 'qwer'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_bounced, u.global_id)
        res = stripe_event_request 'charge.failed', {
          'customer' => 'qwer'
        }
        expect(res[:data]).to eq({:notified => true, :purchase => false, :valid => true})
      end

      it "should not trigger a purchase_failed event from a different source" do
        u = User.create
        expect(Stripe::Customer).to_not receive(:retrieve).with({id: 'qwer'})
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:purchase_bounced, u.global_id)
        res = stripe_event_request 'charge.failed', {
          'customer' => 'qwer',
          'metadata' => {'platform_source' => 'not_coughdrop'}
        }
        expect(res[:data][:valid]).to eq(false)
      end   
      
      it "should not error if no customer provided" do
        u = User.create
        expect(Stripe::Customer).to_not receive(:retrieve)
        expect(SubscriptionMailer).to_not receive(:schedule_delivery)
        res = stripe_event_request 'charge.failed', {
          'customer' => nil
        }
        expect(res[:data]).to eq({:notified => true, :purchase => false, :valid => false})
      end
    end
    
    describe "charge.dispute.created" do
      it "should trigger a chargeback_created event" do
        u = User.create
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:chargeback_created, u.global_id)
        expect(Stripe::Charge).to receive(:retrieve).with('zxcv').and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        res = stripe_event_request 'charge.dispute.created', {
          'id' => 'zxcv'
        }
        expect(res[:data]).to eq({:notified => true, :dispute => true, :valid => true})
      end
    end
    
    describe "customer.subscription.created" do
      it "should trigger a subscribe event" do
        u = User.create
        expect(Stripe::Customer).to receive(:retrieve).with({id: 'tyuio'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
        expect(Purchasing).to receive(:cancel_other_subscriptions).with(u, '12345')
        res = stripe_event_request 'customer.subscription.created', {
          'customer' => 'tyuio',
          'id' => '12345',
          'plan' => {
            'id' => 'monthly_6'
          }
        }
        u.reload
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).not_to eq(nil)
        expect(u.settings['subscription']['customer_id']).to eq('tyuio')
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['plan_id']).to eq('monthly_6')
        expect(u.expires_at).to eq(nil)
        expect(res[:data]).to eq({:subscribe => true, :valid => true})
      end

      it "should not trigger a subscribe event from the wrong source" do
        u = User.create
        expect(Stripe::Customer).to_not receive(:retrieve).with({id: 'tyuio'})
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:new_subscription, u.global_id)
        expect(Purchasing).to_not receive(:cancel_other_subscriptions).with(u, '12345')
        res = stripe_event_request 'customer.subscription.created', {
          'customer' => 'tyuio',
          'id' => '12345',
          'plan' => {
            'id' => 'monthly_6'
          },
          'metadata' => {
            'platform_source' => 'not_coughdrop'
          }
        }
        u.reload
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(res[:data][:valid]).to eq(false)
      end
    end
    
    describe "customer.subscription.updated" do
      it "should trigger an unsubscribe event if it was status changed to unpaid or canceled" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345', 'subscription_id' => '23456'}
        u.save
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:unsubscribe_reason, u.global_id)
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:subscription_expiring, u.global_id)
        res = stripe_event_request 'customer.subscription.updated', {
          'status' => 'unpaid',
          'customer' => '12345',
          'id' => '23456'
        }, {
          'status' => 'active'
        }
        
        u.reload
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq(nil)
        expect(u.expires_at).to be > Time.now
        expect(res[:data]).to eq({:unsubscribe => true, :valid => true})
      end
      
      it "should trigger a subscribe event if the status is active" do
        u = User.create
        expect(Stripe::Customer).to receive(:retrieve).with({id: 'tyuio'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
        expect(Purchasing).to receive(:cancel_other_subscriptions).with(u, '12345')
        res = stripe_event_request 'customer.subscription.updated', {
          'customer' => 'tyuio',
          'status' => 'active',
          'id' => '12345',
          'plan' => {
            'id' => 'monthly_6'
          }
        }
        u.reload
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).not_to eq(nil)
        expect(u.settings['subscription']['customer_id']).to eq('tyuio')
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['plan_id']).to eq('monthly_6')
        expect(u.expires_at).to eq(nil)
        expect(res[:data]).to eq({:subscribe => true, :valid => true})
      end

      it "should not trigger a subscribe event when from the wrong source" do
        u = User.create
        expect(Stripe::Customer).to_not receive(:retrieve).with({id: 'tyuio'})
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:new_subscription, u.global_id)
        expect(Purchasing).to_not receive(:cancel_other_subscriptions).with(u, '12345')
        res = stripe_event_request 'customer.subscription.updated', {
          'customer' => 'tyuio',
          'status' => 'active',
          'id' => '12345',
          'plan' => {
            'id' => 'monthly_6'
          },
          'metadata' => {'platform_source' => 'not_coughdrop'}
        }
        u.reload
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(res[:data][:valid]).to eq(false)
      end
    end
    
    describe "customer.subscription.deleted" do
      it "should trigger an unsubscribe event" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345', 'subscription_id' => '23456'}
        u.save
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345'}).and_return({
          'metadata' => {
            'user_id' => u.global_id
          }
        })
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:unsubscribe_reason, u.global_id)
        expect(SubscriptionMailer).to receive(:schedule_delivery).with(:subscription_expiring, u.global_id)
        res = stripe_event_request 'customer.subscription.deleted', {
          'customer' => '12345',
          'id' => '23456'
        }
        
        u.reload
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq(nil)
        expect(u.expires_at).to be > Time.now
        expect(res[:data]).to eq({:unsubscribe => true, :valid => true})
      end

      it "should not trigger an unsubscribe event when from the wrong source" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345', 'subscription_id' => '23456'}
        u.save
        expect(Stripe::Customer).to_not receive(:retrieve).with({id: '12345'})
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:unsubscribe_reason, u.global_id)
        expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:subscription_expiring, u.global_id)
        res = stripe_event_request 'customer.subscription.deleted', {
          'customer' => '12345',
          'id' => '23456',
          'metadata' => {'platform_source' => 'not_coughdrop'}
        }
        
        u.reload
        expect(u.settings['subscription']['subscription_id']).to_not eq(nil)
        expect(res[:data][:valid]).to eq(false)
      end      
    end
    
    describe "ping" do
      it "should respond" do
        res = stripe_event_request 'ping', {}
        
        expect(res[:data]).to eq({:ping => true, :valid => true})
      end
    end
    
  end

  describe "purchase" do
    it "should trigger subscription event on free purchases" do
      u = User.create
      res = Purchasing.purchase(u, {'id' => 'free'}, 'slp_monthly_free');
      u.reload
      expect(u.settings['subscription']).not_to eq(nil)
      expect(u.settings['subscription']['started']).to eq(nil)
      expect(res).to eq({:success => true, :type => 'slp_monthly_free'})
      expect(u.reload.settings['subscription']['plan_id']).to eq('slp_monthly_free')
      expect(u.reload.settings['subscription']['modeling_only']).to eq(true)
    end
    
    it "should error gracefully on invalid purchase amounts" do
      u = User.create
      
      res = Purchasing.purchase(u, {'id' => 'token'}, 'monthly_2')
      expect(res).to eq({:success => false, :error => "2 not valid for type monthly_2"});

      res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_long_term_15')
      expect(res).to eq({:success => false, :error => "15 not valid for type slp_long_term_15"});

      # res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_long_term_200')
      # expect(res).to eq({:success => false, :error => "200 not valid for type slp_long_term_200"});

      res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_monthly_1')
      expect(res).to eq({:success => false, :error => "1 not valid for type slp_monthly_1"});

      res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_monthly_6')
      expect(res).to eq({:success => false, :error => "6 not valid for type slp_monthly_6"});

      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_75')
      expect(res).to eq({:success => false, :error => "75 not valid for type long_term_75"});

      ENV['CURRENT_SALE'] = nil
      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_100')
      expect(res).to eq({:success => false, :error => "100 not valid for type long_term_100"});

      # res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_350')
      # expect(res).to eq({:success => false, :error => "350 not valid for type long_term_350"});
    end
    
    it "should allow discounts during a sale" do
      u = User.create
      ENV['CURRENT_SALE'] = nil

      expect(Purchasing.active_sale?).to eq(false)

      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_75')
      expect(res).to eq({:success => false, :error => "75 not valid for type long_term_75"});

      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_100')
      expect(res).to eq({:success => false, :error => "100 not valid for type long_term_100"});

      ENV['CURRENT_SALE'] = 2.weeks.from_now.to_i.to_s
      expect(Purchasing.active_sale?).to eq(true)
      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_100')
      expect(res[:error]).to eq('unexpected_error');

      ENV['CURRENT_SALE'] = nil
    end
    
    it "should error gracefully on invalid purchase types" do
      u = User.create
      
      res = Purchasing.purchase(u, {'id' => 'token'}, 'bacon')
      expect(res).to eq({:success => false, :error => "unrecognized purchase type, bacon"});
    end
    
    it "should error gracefully on raised errors" do
      u = User.create
      
      expect(Stripe::Charge).to receive(:create) { raise "no" }
      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq('unexpected_error')
      expect(res[:error_message]).to eq('no')
    end
    
    it "should return status" do
      res = Purchasing.purchase(nil, 'token', 'bacon')
      expect(res.is_a?(Hash)).to eq(true)
      expect(res[:success]).not_to eq(nil)
    end
    
    it "should return the correct error code for declined cards" do
      u = User.create
      
      expect(Stripe::Charge).to receive(:create).and_raise(FakeCardError.new({error: {code: 'no', decline_code: 'no way'}}))
      res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      expect(res).to eq({
        success: false,
        error: 'no',
        decline_code: 'no way'
      })
    end

    it "should charge extras fee even on free purchase if specified" do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 2500,
        :currency => 'usd',
        :source => 'token',
        :description => 'CoughDrop supporter account (plus premium symbols)',
        :receipt_email => nil,
        :metadata => {
          'user_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'plan_id' => 'slp_long_term_free',
          'purchased_symbols' => 'true',
          'type' => 'license'
        }
      }).and_return({
        'id' => '23456',
        'customer' => '45678'
      })

      res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_monthly_free_plus_extras');
      Worker.process_queues
      u.reload
      expect(u.settings['subscription']).not_to eq(nil)
      expect(u.settings['subscription']['extras']).to_not eq(nil)
      expect(res).to eq({:success => true, :type => 'slp_long_term_free_plus_extras'})
      expect(u.settings['subscription']['extras']['customer_id']).to eq('45678')
      expect(u.settings['subscription']['extras']['purchase_id']).to eq('23456')
    end

    describe "subscription" do
      it "should retrieve the existing customer record if there is one" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345'}
        subs = OpenStruct.new(data: [], count: 0)
        new_sub = OpenStruct.new({
          'id' => '3456',
          'customer' => '12345',
          'status' => 'active'
        })
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          subscriptions: subs,
          id: '12345'
        })).at_least(1).times
        expect(subs).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            :metadata => {:platform_source => 'coughdrop'},
            :source => 'token',
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)
        expect(Purchasing).to receive(:cancel_other_subscriptions).with(u, '3456')
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_9')
      end
      
      it "should cancel other subscriptions for an existing customer record" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345'}
        subs = OpenStruct.new({
          data: [OpenStruct.new({
            'id' => '3456',
            'status' => 'canceled'
          })],
          count: 1
        })
        new_sub = OpenStruct.new({
          'id' => '3457',
          'customer' => '12345',
          'status' => 'active'
        })
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          subscriptions: subs,
          id: '12345'
        })).at_least(1).times
        expect(subs).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            :metadata => {:platform_source => 'coughdrop'},
            :source => 'token',
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)
        expect(Purchasing).to receive(:cancel_other_subscriptions).with(u, '3457')
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
      end

      it "should immediately charge extras fee if specified" do
        u = User.create
        subs = OpenStruct.new({
          'data' => [
            OpenStruct.new({'status' => 'broken', 'id' => 'sub1'}),
            OpenStruct.new({'status' => 'busted', 'id' => 'sub2'})
          ],
          'count' => 2,
          'id' => '12345'
        })
        new_sub = OpenStruct.new({
          'id' => '3456',
          'customer' => '12345',
          'status' => 'active'
        })
        cus = OpenStruct.new({
          id: '12345',
          subscriptions: subs,
          default_source: 'deftoken'
        })
        expect(cus).to receive(:id).and_return('12345')
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop','user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => nil
        }).and_return(cus)
        expect(Stripe::Customer).to receive(:retrieve).and_return(cus).at_least(1).times
        expect(cus.subscriptions).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            :source => 'token',
            :metadata => {:platform_source => 'coughdrop'},
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'deftoken',
          :customer => '12345',
          :description => 'CoughDrop premium symbols one-time charge',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'purchased_symbols' => 'true',
            'type' => 'extras'
          }
        }).and_return({
          'id' => '87654',
          'customer' => '12345'
        })
          
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6_plus_extras')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
        expect(u.premium_supporter_grants).to eq(0)
      end

      it "should charge supporter fee independent of extra symbols fee" do
        u = User.create
        subs = OpenStruct.new({
          'data' => [
            OpenStruct.new({'status' => 'broken', 'id' => 'sub1'}),
            OpenStruct.new({'status' => 'busted', 'id' => 'sub2'})
          ],
          'count' => 2,
          'id' => '12345'
        })
        new_sub = OpenStruct.new({
          'id' => '3456',
          'customer' => '12345',
          'status' => 'active'
        })
        cus = OpenStruct.new({
          id: '12345',
          subscriptions: subs,
          default_source: 'deftoken'
        })
        expect(cus).to receive(:id).and_return('12345')
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop', 'user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => nil
        }).and_return(cus)
        expect(Stripe::Customer).to receive(:retrieve).and_return(cus).at_least(1).times
        expect(cus.subscriptions).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            :source => 'token',
            :metadata => {:platform_source => 'coughdrop', 'purchased_supporters' => 3},
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 7500,
          :currency => 'usd',
          :source => 'deftoken',
          :customer => '12345',
          :description => 'CoughDrop premium 3 supporter accounts one-time charge',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'purchased_supporters' => 3,
            'type' => 'extras'
          }
        }).and_return({
          'id' => '87654',
          'customer' => '12345'
        })
          
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6_plus_3_supporters')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(nil)
        expect(u.premium_supporter_grants).to eq(3)
      end

      it "should charge combined supporter and symbols fee immediately" do
        u = User.create
        subs = OpenStruct.new({
          'data' => [
            OpenStruct.new({'status' => 'broken', 'id' => 'sub1'}),
            OpenStruct.new({'status' => 'busted', 'id' => 'sub2'})
          ],
          'count' => 2,
          'id' => '12345'
        })
        new_sub = OpenStruct.new({
          'id' => '3456',
          'customer' => '12345',
          'status' => 'active'
        })
        cus = OpenStruct.new({
          id: '12345',
          subscriptions: subs,
          default_source: 'deftoken'
        })
        expect(cus).to receive(:id).and_return('12345')
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop','user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => nil
        }).and_return(cus)
        expect(Stripe::Customer).to receive(:retrieve).and_return(cus).at_least(1).times
        expect(cus.subscriptions).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            :source => 'token',
            :metadata => {:platform_source => 'coughdrop', 'purchased_supporters' => 2},
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 7500,
          :currency => 'usd',
          :source => 'deftoken',
          :customer => '12345',
          :description => 'CoughDrop premium symbols and 2 supporter accounts one-time charge',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'purchased_symbols' => 'true',
            'platform_source' => 'coughdrop',
            'purchased_supporters' => 2,
            'type' => 'extras'
          }
        }).and_return({
          'id' => '87654',
          'customer' => '12345'
        })
          
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6_plus_2_supporters_plus_extras')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
        expect(u.premium_supporter_grants).to eq(2)
      end
      
      it "should trigger a subscription event for an existing customer record" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345'}
        subs = OpenStruct.new({
          data: [],
          count: 0
        })
        new_sub = OpenStruct.new({
          'id' => '3456',
          'customer' => '12345',
          'status' => 'active'
        })
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          subscriptions: subs,
          id: '12345'
        })).at_least(1).times
        expect(subs).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            metadata: {:platform_source => 'coughdrop'},
            :source => 'token',
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)
        expect(User).to receive(:subscription_event).with({
          'subscribe' => true,
          'user_id' => u.global_id,
          'subscription_id' => '3456',
          'customer_id' => '12345',
          'token_summary' => 'Unknown Card',
          'purchase_amount' => 6,
          'plan_id' => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
          'source' => 'new subscription',
          'source_id' => 'stripe',
          'cancel_others_on_update' => true
        })
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
      end

      it "should create a customer if one doesn't exist" do
        u = User.create
        subs = OpenStruct.new({
          'data' => [
            OpenStruct.new({'status' => 'broken', 'id' => 'sub1'}),
            OpenStruct.new({'status' => 'busted', 'id' => 'sub2'})
          ],
          'count' => 2,
          'id' => '12345'
        })
        new_sub = OpenStruct.new({
          'id' => '3456',
          'customer' => '12345',
          'status' => 'active'
        })
        cus = OpenStruct.new({
          subscriptions: subs
        })
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop', 'user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => nil
        }).and_return(cus)
        expect(Stripe::Customer).to receive(:retrieve).and_return(cus).at_least(1).times
        expect(cus.subscriptions).to receive(:create){|opts|
          expect(opts).to eq({
            :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            :metadata => {:platform_source => 'coughdrop'},
            :source => 'token',
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
      end

      it "should add the email when creating a customer" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        subs = OpenStruct.new({
          data: [
            OpenStruct.new({'status' => 'broken', 'id' => 'sub1'}),
            OpenStruct.new({'status' => 'active', 'id' => 'sub2'})
          ],
          count: 2
        })
        cus = OpenStruct.new({
          subscriptions: subs,
          id: '12345'
        })
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop', 'user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => 'testing@example.com'
        }).and_return(cus)
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345', expand: ['subscriptions']}).and_return(cus)
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
      end

      it "should not add the email when creating a customer if protected" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.settings['authored_organization_id'] = 'asdf'
        u.save
        s2 = OpenStruct.new({'status' => 'active', 'id' => 'sub2'})
        subs = OpenStruct.new({
          data: [
            OpenStruct.new({'status' => 'broken', 'id' => 'sub1'}),
            s2
          ],
          count: 2
        })
        cus = OpenStruct.new({
          subscriptions: subs,
          id: '12345'
        })
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop','user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => nil
        }).and_return(cus)
        expect(s2).to receive(:save) do
          expect(s2.source).to eq('token')
          expect(s2.plan).to eq('price_1NQzXZBoyWVHHEVPoaYXBeyy')
          expect(s2.prorate).to eq(true)
        end
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345', expand: ['subscriptions']}).and_return(cus)
        expect(subs).to_not receive(:create)
        res = Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
        expect(res[:success]).to eq(true)
      end

      it "should trigger a subscription event for a new customer" do
        u = User.create
        subs = OpenStruct.new({
          data: [],
          count: 0
        })
        cus = OpenStruct.new({
          id: '9876',
          subscriptions: subs
        })
        new_sub = OpenStruct.new({
          id: 'sub2',
          status: 'active',
          customer: '9876'
        })
        expect(Stripe::Customer).to receive(:create).with({
          :metadata => {'platform_source' => 'coughdrop', 'user_id' => u.global_id},
          :expand => ['subscriptions'],
          :email => nil
        }).and_return(cus)
        expect(Stripe::Customer).to receive(:retrieve).with({id: '9876', expand: ['subscriptions']}).and_return(cus)
        expect(subs).to receive(:create){|opts|
          expect(opts).to eq({
            plan: 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
            metadata: {:platform_source => 'coughdrop'},
            source: 'token',
            trial_end: (u.created_at + 60.days).to_i
          })
          subs.data.push(new_sub)
        }.and_return(new_sub)
        expect(User).to receive(:subscription_event).with({
          'user_id' => u.global_id,
          'subscribe' => true,
          'subscription_id' => 'sub2',
          'purchase_amount' => 6,
          'customer_id' => '9876',
          'token_summary' => 'Unknown Card',
          'plan_id' => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
          'source_id' => 'stripe',
          'source' => 'new subscription',
          'cancel_others_on_update' => true
        })
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
      end
      
      it "should update subscription information if an existing subscription record is updated and the plan changes" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '12345'}
        sub1 = OpenStruct.new({
          'id' => '3456',
          'status' => 'active'
        })
        subs = OpenStruct.new({
          data: [sub1],
          count: 1
        })
        expect(Stripe::Customer).to receive(:retrieve).with({id: '12345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          subscriptions: subs,
          id: '12345'
        })).at_least(1).times
        expect(sub1).to receive(:save).and_return(true)
        
        expect(Purchasing).to receive(:cancel_other_subscriptions).with(u, '3456')
        Purchasing.purchase(u, {'id' => 'token'}, 'monthly_6')
        expect(sub1.prorate).to eq(true)
        expect(sub1.plan).to eq('price_1NQzXZBoyWVHHEVPoaYXBeyy')
        expect(sub1.source).to eq('token')
      end

      it "should confirm long_term_ios purchase" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                purchase_date_ms: '9',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSBundle',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSBundle')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
        expect(u.settings['premium_voices']['allowed']).to eq(4)

        res = Purchasing.purchase(u, {'id' => 'ios_iap'}, 'long_term_ios')
        expect(res[:success]).to eq(true)
        expect(res[:type]).to eq('long_term_ios')
      end

      it "should confirm monthly_ios purchase" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                purchase_date_ms: '9',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(false)
        expect(res['subscribed']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['plan_id']).to eq('monthly_ios')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
        expect(u.reload.settings['premium_voices']).to eq(nil)
        res = Purchasing.purchase(u, {'id' => 'ios_iap'}, 'monthly_ios')
        expect(res[:success]).to eq(true)
        expect(res[:type]).to eq('monthly_ios')
      end

      it "should error if expecting long_term_ios purchase but not getting it" do
        u = User.create
        res = Purchasing.purchase(u, {'id' => 'ios_iap'}, 'long_term_ios')
        expect(res[:success]).to eq(false)
        expect(res[:error]).to eq(true)
        expect(res[:type]).to eq('long_term_ios')
        expect(res[:error_message]).to eq('subscription type did not match expected value, none but expecting long_term_ios')
      end
      
      it "should error if expecting monthly_ios purchase but not getting it" do
        u = User.create
        res = Purchasing.purchase(u, {'id' => 'ios_iap'}, 'monthly_ios')
        expect(res[:success]).to eq(false)
        expect(res[:error]).to eq(true)
        expect(res[:type]).to eq('monthly_ios')
        expect(res[:error_message]).to eq('subscription type did not match expected value, none but expecting monthly_ios')
      end
    end

    describe "long-term purchase" do
      it "should create a charge record" do
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      end
      
      it "should add extras fee if specified" do
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 22500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase (plus premium symbols)',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'plan_id' => 'long_term_200',
            'platform_source' => 'coughdrop',
            'purchased_symbols' => 'true',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200_plus_extras')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
      end

      it "should add supporters fee if specified" do
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 32500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase (plus 5 premium supporters)',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'purchased_supporters' => 5,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200_plus_5_supporters')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(nil)
        expect(u.premium_supporter_grants).to eq(5)
      end

      it "should add both supporters and extras fee if specified" do
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 30000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase (plus premium symbols) (plus 3 premium supporters)',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'purchased_supporters' => 3,
            'platform_source' => 'coughdrop',
            'purchased_symbols' => 'true',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200_plus_3_supporters_plus_extras')
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
        expect(u.premium_supporter_grants).to eq(3)
      end

      it "should allow percent discount" do
        g = GiftPurchase.create(settings: {'discount' => 0.5})
        expect(g.discount_percent).to eq(0.5)

        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 10000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200', g.code)
      end

      it "should record a percent discount on the gift record" do
        g = GiftPurchase.create(settings: {'discount' => 0.5})
        expect(g.discount_percent).to eq(0.5)

        # gift = GiftPurchase.find_by_code(discount_code) rescue nil
        # return {success: false, error: "Invalid gift/discount code", code: discount_code} unless gift
        # gift.redeem_code!(code, user)
        # amount *= (1.0 - gift.discount_percent)

        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 10000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        expect(g.settings['activations']).to eq(nil)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200', g.code)
        g.reload
        expect(g.settings['activations']).to_not eq(nil)
        expect(g.settings['activations'].length).to eq(1)
        expect(g.settings['activations'][0]['receiver_id']).to eq(u.global_id)
      end

      it "should not apply discount codes to the supporter or symbols fees" do
        g = GiftPurchase.create(settings: {'discount' => 0.5})
        expect(g.discount_percent).to eq(0.5)
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase (plus premium symbols) (plus 3 premium supporters)',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'purchased_supporters' => 3,
            'platform_source' => 'coughdrop',
            'purchased_symbols' => 'true',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200_plus_3_supporters_plus_extras', g.code)
        Worker.process_queues
        expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
        expect(u.premium_supporter_grants).to eq(3)
      end

      it "should create specify the email" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      end

      it "should not specify the email if protected" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.settings['authored_organization_id'] = 'asdf'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'plan_id' => 'long_term_200',
            'platform_source' => 'coughdrop',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event)
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      end
      
      it "should trigger a purchase event" do
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'plan_id' => 'long_term_200',
            'platform_source' => 'coughdrop',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event).with({
          'purchase' => true,
          'user_id' => u.global_id,
          'purchase_id' => '23456',
          'customer_id' => '45678',
          'discount_code' => nil,
          'plan_id' => 'long_term_200',
          'source_id' => 'stripe',
          'purchase_amount' => 200,
          'token_summary' => 'Unknown Card',
          'seconds_to_add' => 5.years.to_i,
          'source' => 'new purchase'
        })
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      end
      
      it "should cancel any running subscriptions" do
        u = User.create
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => nil,
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event).with({
          'purchase' => true,
          'user_id' => u.global_id,
          'purchase_id' => '23456',
          'customer_id' => '45678',
          'discount_code' => nil,
          'plan_id' => 'long_term_200',
          'purchase_amount' => 200,
          'source_id' => 'stripe',
          'token_summary' => 'Unknown Card',
          'seconds_to_add' => 5.years.to_i,
          'source' => 'new purchase'
        })
        expect(Purchasing).to receive(:cancel_other_subscriptions).with(u, 'all')
        Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      end

      it "should allow premium supporter purchase" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop supporter account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'slp_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event).with({
          'purchase' => true,
          'user_id' => u.global_id,
          'purchase_id' => '23456',
          'customer_id' => '45678',
          'discount_code' => nil,
          'plan_id' => 'slp_long_term_25',
          'source_id' => 'stripe',
          'purchase_amount' => 25,
          'token_summary' => 'Unknown Card',
          'seconds_to_add' => 5.years.to_i,
          'source' => 'new purchase'
        })
        Purchasing.purchase(u, {'id' => 'token'}, 'slp_long_term_25')
      end

      it "should allow eval account purchase" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop evaluator account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'eval_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        expect(User).to receive(:subscription_event).with({
          'purchase' => true,
          'user_id' => u.global_id,
          'purchase_id' => '23456',
          'customer_id' => '45678',
          'discount_code' => nil,
          'plan_id' => 'eval_long_term_25',
          'source_id' => 'stripe',
          'purchase_amount' => 25,
          'token_summary' => 'Unknown Card',
          'seconds_to_add' => 5.years.to_i,
          'source' => 'new purchase'
        })
        Purchasing.purchase(u, {'id' => 'token'}, 'eval_long_term_25')
      end

      it "should not re-charge for a second eval account purchase" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop evaluator account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'eval_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        }).exactly(1).times
        res = Purchasing.purchase(u, {'id' => 'token'}, 'eval_long_term_25')
        expect(res).to eq({:success=>true, :type=>"eval_long_term_25"})
        res = Purchasing.purchase(u.reload, {'id' => 'token'}, 'eval_long_term_25')
        expect(res).to eq({:error=>"0 not valid for type eval_long_term_25", :success=>false})
      end

      it "should not re-charge for a second premium supporter purchase" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop supporter account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'slp_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        }).exactly(1).times
        res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_long_term_25')
        expect(res).to eq({:success=>true, :type=>"slp_long_term_25"})
        res = Purchasing.purchase(u.reload, {'id' => 'token'}, 'slp_long_term_25')
        expect(res).to eq({:error=>"0 not valid for type slp_long_term_25", :success=>false})
      end

      it "should not allow charging for extras on an already-purchased type" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop supporter account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'slp_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_long_term_25')
        expect(res).to eq({:success=>true, :type=>"slp_long_term_25"})
        res = Purchasing.purchase(u.reload, {'id' => 'token'}, 'slp_long_term_25_plus_extras')
        expect(res).to eq({:error=>"0 not valid for type slp_long_term_25_plus_extras", :success=>false})
      end

      it "should allow re-upping a long_term subscription" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(true)
        expect(u.reload.expires_at).to be > 4.years.from_now
        expect(u.reload.expires_at).to be < 6.years.from_now
        expect(u.reload.fully_purchased?).to eq(true)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 5000,
          :currency => 'usd',
          :source => 'token2',
          :description => 'CoughDrop cloud extras re-purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'refresh_long_term_50',
            'type' => 'license'
          }
        }).and_return({
          'id' => '234567',
          'customer' => '45678'
        })
        expect(u.communicator_role?).to eq(true)
        expect(u.fully_purchased?).to eq(true) 
        expect(u.eval_account?).to eq(false)
        res = Purchasing.purchase(u, {'id' => 'token2'}, 'long_term_50')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(true)
        expect(u.reload.expires_at).to be > 9.years.from_now
        expect(u.reload.expires_at).to be < 11.years.from_now
      end

      it "should not allow re-upping a long-term subscription unless fully_purchased" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to_not receive(:create)
        res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_50')
        expect(res[:success]).to eq(false)

        expect(u.reload.long_term_purchase?).to eq(false)
        expect(u.reload.expires_at).to be < 1.years.from_now
        expect(u.reload.fully_purchased?).to eq(false)
      end

      it "should convert from slp_long_term_25 to long_term_200 correctly" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop supporter account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'slp_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token'}, 'slp_long_term_25')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(false)
        expect(u.reload.premium_supporter?).to eq(true)
        expect(u.reload.expires_at).to be > 4.years.from_now
        expect(u.reload.expires_at).to be < 6.years.from_now
        expect(u.reload.fully_purchased?).to eq(true)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token2',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '234567',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token2'}, 'long_term_200')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(true)
        expect(u.reload.premium_supporter?).to eq(false)
        expect(u.reload.expires_at).to be > 4.years.from_now
        expect(u.reload.expires_at).to be < 6.years.from_now
      end

      it "should convert from eval_long_term_25 to long_term_200 correctly" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop evaluator account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'eval_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token'}, 'eval_long_term_25')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(false)
        expect(u.reload.eval_account?).to eq(true)
        expect(u.reload.expires_at).to be > 4.years.from_now
        expect(u.reload.expires_at).to be < 6.years.from_now
        expect(u.reload.fully_purchased?).to eq(true)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token2',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '234567',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token2'}, 'long_term_200')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(true)
        expect(u.reload.eval_account?).to eq(false)
        expect(u.reload.expires_at).to be > 9.years.from_now
        expect(u.reload.expires_at).to be < 11.years.from_now
      end

      it "should correctly convert from long_term_200 to slp_long_term_25" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(true)
        expect(u.reload.premium_supporter?).to eq(false)
        expect(u.reload.expires_at).to be > 4.years.from_now
        expect(u.reload.expires_at).to be < 6.years.from_now
        expect(u.reload.fully_purchased?).to eq(true)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token2',
          :description => 'CoughDrop supporter account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'slp_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '234567',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token2'}, 'slp_long_term_25')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(false)
        expect(u.reload.premium_supporter?).to eq(true)
        expect(u.reload.expires_at).to be > 9.years.from_now
        expect(u.reload.expires_at).to be < 11.years.from_now
      end

      it "should correctly convert from long_term_200 to eval_long_term_25" do
        u = User.create
        u.settings['email'] = 'testing@example.com'
        u.save
        expect(Stripe::Charge).to receive(:create).with({
          :amount => 20000,
          :currency => 'usd',
          :source => 'token',
          :description => 'CoughDrop communicator license purchase',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'long_term_200',
            'type' => 'license'
          }
        }).and_return({
          'id' => '23456',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(true)
        expect(u.reload.eval_account?).to eq(false)
        expect(u.reload.expires_at).to be > 4.years.from_now
        expect(u.reload.expires_at).to be < 6.years.from_now
        expect(u.reload.fully_purchased?).to eq(true)

        expect(Stripe::Charge).to receive(:create).with({
          :amount => 2500,
          :currency => 'usd',
          :source => 'token2',
          :description => 'CoughDrop evaluator account',
          :receipt_email => 'testing@example.com',
          :metadata => {
            'user_id' => u.global_id,
            'platform_source' => 'coughdrop',
            'plan_id' => 'eval_long_term_25',
            'type' => 'license'
          }
        }).and_return({
          'id' => '234567',
          'customer' => '45678'
        })
        res = Purchasing.purchase(u, {'id' => 'token2'}, 'eval_long_term_25')
        expect(res[:success]).to eq(true)
        expect(u.reload.long_term_purchase?).to eq(false)
        expect(u.reload.eval_account?).to eq(true)
        expect(u.reload.expires_at).to be > 9.years.from_now
        expect(u.reload.expires_at).to be < 11.years.from_now
      end
    end
  end
  
  describe "unsubscribe" do
    it "should error gracefully on no user" do
      expect { Purchasing.unsubscribe(nil) }.not_to raise_error
    end
    
    it "should unsubscribe from all active subscriptions" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '2345', 'subscription_id' => '3456'}
      u.save
      a = {'id' => '3456'}
      b = {'id' => '6789'}
      c = {'id' => '4567'}
      all = [a, b, c]
      expect(a).to receive(:save)
      expect(a).to receive(:cancel)
      expect(b).to receive(:save)
      expect(b).to receive(:cancel)
      expect(c).to receive(:save)
      expect(c).to receive(:cancel)
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
        block.call(a)
        block.call(b)
        block.call(c)
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      res = Purchasing.unsubscribe(u)
      expect(res).to eq(true)
    end
    
    it "should not trigger a message if there wasn't an existing subscription" do
      u = User.create(:settings => {'subscription' => {}})
      expect(SubscriptionMailer).to_not receive(:schedule_delivery)
      Purchasing.unsubscribe(u)
    end
  end

  describe "change_user_id" do
    it "should error if no customer found" do
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234'}).and_return(nil)
      expect { Purchasing.change_user_id('1234', '111', '222') }.to raise_error('customer not found')
    end
    
    it "should error if customer doesn't match what's expected" do
      o = OpenStruct.new(:metadata => {})
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234'}).and_return(o)
      expect { Purchasing.change_user_id('1234', '111', '222') }.to raise_error('wrong existing user_id')
      
      o.metadata['user_id'] = '222'
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234'}).and_return(o)
      expect { Purchasing.change_user_id('1234', '111', '222') }.to raise_error('wrong existing user_id')
    end
    
    it "should update the customer correctly" do
      o = OpenStruct.new(:metadata => {'user_id' => '111'})
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234'}).and_return(o)
      expect(o).to receive(:save)
      Purchasing.change_user_id('1234', '111', '222')
      expect(o.metadata['user_id']).to eq('222')
    end
  end
  
  describe "cancel_other_subscriptions" do
    it "should return false if no customer found" do
      u = User.create
      res = Purchasing.cancel_other_subscriptions(u, '2345')
      expect(res).to eq(false)
      
      u.settings['subscription'] = {'customer_id' => '1234'}
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_return(nil)
      res = Purchasing.cancel_other_subscriptions(u, '2345')
      expect(res).to eq(false)
    end
    
    it "should return false on error" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '1234'}
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}) { raise "no" }
      res = Purchasing.cancel_other_subscriptions(u, '2345')
      expect(res).to eq(false)
    end
    
    it "should retrieve the customer record" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '1234'}
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      res = Purchasing.cancel_other_subscriptions(u, '2345')
      expect(res).to eq(true)
    end
    
    it "should cancel all non-matching active subscriptions" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '2345'}
      a = {'id' => '3456'}
      b = {'id' => '6789'}
      c = {'id' => '4567', 'status' => 'active'}
      expect(a).to receive(:save)
      expect(a).to receive(:cancel)
      expect(b).to receive(:save)
      expect(b).to receive(:cancel)
      expect(c).not_to receive(:cancel)
      subs = {}
      expect(subs).to receive(:auto_paging_each) do |&block|
        block.call(a)
        block.call(b)
        block.call(c)
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs
      }))
      res = Purchasing.cancel_other_subscriptions(u, '4567')
      expect(res).to eq(true)
    end
    
    it "should cancel subscriptions on prior customer ids" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '2345', 'prior_customer_ids' => ['3456', '4567']}
      a = {'id' => '3456'}
      b = {'id' => '6789'}
      c = {'id' => '4567', 'status' => 'active'}
      expect(a).to receive(:save)
      expect(a).to receive(:cancel)
      expect(b).to receive(:save)
      expect(b).to receive(:cancel)
      expect(c).to receive(:save)
      expect(c).to receive(:cancel)
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
        block.call(a)
      end
      subs2 = {}
      expect(subs2).to receive(:auto_paging_each) do |&block|
        block.call(b)
        block.call(c)
      end
      subs3 = {}
      expect(subs3).to receive(:auto_paging_each) do |&block|
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      expect(Stripe::Customer).to receive(:retrieve).with({id: '3456', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs2
      }))
      expect(Stripe::Customer).to receive(:retrieve).with({id: '4567', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs3
      }))
      res = Purchasing.cancel_other_subscriptions(u, 'all')
      expect(res).to eq(true)
    end
    
    it "should cancel subscriptions on all but the specified subscription_id, even for prior customer ids" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '2345', 'prior_customer_ids' => ['3456', '4567']}
      a = {'id' => '3456'}
      b = {'id' => '6789'}
      c = {'id' => '4567', 'status' => 'active'}
      expect(a).to receive(:save)
      expect(a).to receive(:cancel)
      expect(b).to receive(:save)
      expect(b).to receive(:cancel)
      expect(c).not_to receive(:cancel)
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
        block.call(a)
      end
      subs2 = {}
      expect(subs2).to receive(:auto_paging_each) do |&block|
        block.call(b)
      end
      subs3 = {}
      expect(subs3).to receive(:auto_paging_each) do |&block|
        block.call(c)
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      expect(Stripe::Customer).to receive(:retrieve).with({id: '3456', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs2
      }))
      expect(Stripe::Customer).to receive(:retrieve).with({id: '4567', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs3
      }))
      res = Purchasing.cancel_other_subscriptions(u, '4567')
      expect(res).to eq(true)
    end
    
    it "should log subscription cancellations" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '2345'}
      a = {'id' => '3456'}
      b = {'id' => '6789'}
      c = {'id' => '4567', 'status' => 'active'}
      all = [a, b, c]
      expect(a).to receive(:save)
      expect(a).to receive(:cancel)
      expect(b).to receive(:save)
      expect(b).to receive(:cancel)
      expect(c).not_to receive(:cancel)
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
        block.call(a)
        block.call(b)
        block.call(c)
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      res = Purchasing.cancel_other_subscriptions(u, '4567')
      expect(res).to eq(true)
      Worker.process_queues
      u.reload
      expect(u.subscription_events).to_not eq(nil)
      expect(u.subscription_events[-1]['log']).to eq('subscription canceled')
      expect(u.subscription_events[-1]['reason']).to eq('4567')
      expect(u.subscription_events[-2]['log']).to eq('subscription canceled')
      expect(u.subscription_events[-2]['reason']).to eq('4567')
      expect(u.subscription_events[-3]['log']).to eq('subscription canceling')
      expect(u.subscription_events[-3]['reason']).to eq('4567')
    end
    
    it "should log errors on failed cancellations" do
      u = User.create
      res = Purchasing.cancel_other_subscriptions(u, '1234')
      expect(res).to eq(false)
      expect(u.subscription_events.length).to eq(0)
      
      u = User.create({'settings' => {'subscription' => {'customer_id' => '1234'}}})
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_raise("no dice")
      res = Purchasing.cancel_other_subscriptions(u, '1234')
      expect(res).to eq(false)
      expect(u.subscription_events.length).to eq(2)
      expect(u.subscription_events.map{|e| e['log'] }).to eq(['subscription canceling', 'subscription cancel error'])
      expect(u.subscription_events[1]['error']).to eq('no dice')

      u = User.create({'settings' => {'subscription' => {'customer_id' => '2345'}}})
      subscr = OpenStruct.new
      expect(subscr).to receive(:auto_paging_each).and_raise('naughty')
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subscr
      }))
      res = Purchasing.cancel_other_subscriptions(u, '2345')
      expect(res).to eq(false)
      expect(u.subscription_events.length).to eq(2)
      expect(u.subscription_events.map{|e| e['log'] }).to eq(['subscription canceling', 'subscription cancel error'])
      expect(u.subscription_events[1]['error']).to eq('naughty')
      
      u = User.create({'settings' => {'subscription' => {'customer_id' => '3456'}}})
      a = {'id' => '3456'}
      b = {'id' => '4567'}
      all = [a, b]
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
        block.call(a)
        block.call(b)
      end
      expect(b).to receive(:save)
      expect(b).to receive(:cancel).and_raise('yipe')
      expect(Stripe::Customer).to receive(:retrieve).with({id: '3456', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      res = Purchasing.cancel_other_subscriptions(u, '3456')
      expect(res).to eq(false)
      expect(u.subscription_events.length).to eq(2)
      expect(u.subscription_events.map{|e| e['log'] }).to eq(['subscription canceling', 'subscription cancel error'])
      expect(u.subscription_events[1]['subscription_id']).to eq('4567')
      expect(u.subscription_events[1]['error']).to eq('yipe')
    end
    
    it "should not cancel other subscriptions if the referenced subscription is inactive" do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '2345'}
      a = {'id' => '3456'}
      b = {'id' => '6789'}
      c = {'id' => '4567', 'status' => 'canceled'}
      all = [a, b, c]
      expect(a).to_not receive(:cancel)
      expect(b).to_not receive(:cancel)
      expect(c).not_to receive(:cancel)
      subs1 = {}
      expect(subs1).to receive(:auto_paging_each) do |&block|
        block.call(a)
        block.call(b)
        block.call(c)
      end
      expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
        subscriptions: subs1
      }))
      res = Purchasing.cancel_other_subscriptions(u, '4567')
      expect(res).to eq(true)
    end
  end

  describe "purchase_symbol_extras" do
    it 'should error on missing user' do
      expect(Purchasing.purchase_symbol_extras('asdf', {})).to eq({success: false, error: 'user required'})
    end

    it 'should handle card error correctly' do
      u = User.create
      err = Stripe::CardError.new('a', 'b')
      expect(err).to receive(:json_body).and_return(error: {code: 'asdf', decline_code: 'qwer'})
      expect(Stripe::Charge).to receive(:create).and_raise(err)
      res = Purchasing.purchase_symbol_extras('token', {'user_id' => u.global_id})
      expect(res).to eq({success: false, error: 'asdf', decline_code: 'qwer'})
    end

    it 'should handle unexpected error correctly' do
      u = User.create
      expect(Stripe::Charge).to receive(:create).and_raise('asdf')
      res = Purchasing.purchase_symbol_extras('token', {'user_id' => u.global_id})
      expect(res).to eq({:success=>false, :error=>"unexpected_error", :error_message=>"asdf", :error_type=>false, :error_code=>"unknown"})
    end

    it 'should return success on purchase' do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 2500,
        :currency => 'usd',
        :source => 'token',
        :customer => nil,
        :receipt_email => u.settings['email'],
        :description => "CoughDrop premium symbols access",
        :metadata => {
          'user_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'purchased_symbols' => 'true',
          'type' => 'extras'
        }
      }).and_return({'id' => '1234', 'customer' => '4567'})
      res = Purchasing.purchase_symbol_extras({'id' => 'token'}, {'user_id' => u.global_id})
      expect(res).to eq({success: true, charge: 'immediate_purchase'})
    end

    it 'should update user on purchase' do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 2500,
        :currency => 'usd',
        :source => 'token',
        :customer => nil,
        :receipt_email => u.settings['email'],
        :description => "CoughDrop premium symbols access",
        :metadata => {
          'user_id' => u.global_id,
          'purchased_symbols' => 'true',
          'platform_source' => 'coughdrop',
          'type' => 'extras'
        }
      }).and_return({'id' => '1234', 'customer' => '4567'})
      res = Purchasing.purchase_symbol_extras({'id' => 'token'}, {'user_id' => u.global_id})
      expect(res).to eq({success: true, charge: 'immediate_purchase'})
      expect(User).to receive(:purchase_extras).with({
        'user_id' => u.global_id,
        'purchase_id' => '1234',
        'customer_id' => '4567',
        'premium_symbols' => true, 
        'source' => 'purchase.standalone',
        'notify' => true
      })
      Worker.process_queues
    end

    it 'should create a new charge by default' do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 2500,
        :currency => 'usd',
        :source => 'token',
        :customer => nil,
        :receipt_email => u.settings['email'],
        :description => "CoughDrop premium symbols access",
        :metadata => {
          'user_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'purchased_symbols' => 'true',
          'type' => 'extras'
        }
      }).and_return({'id' => '1234', 'customer' => '4567'})
      res = Purchasing.purchase_symbol_extras({'id' => 'token'}, {'user_id' => u.global_id})
      expect(res).to eq({success: true, charge: 'immediate_purchase'})
    end

    it 'should fail gracefully on invalid token' do
      u = User.create
      res = Purchasing.purchase_symbol_extras('none', {'user_id' => u.global_id})
      expect(res).to eq({success: false, error: 'token required without active subscription'})
    end

    it 'should use default billing settings if token is set to none' do
      u = User.create
      u.settings['subscription'] = {'customer_id' => '1234qwer'}
      u.save
      cus = {'id' => '1234qwer', 'default_source' => 'tokenny', 'subscriptions' => [{'status' => 'active'}]}
      expect(Stripe::Customer).to receive(:retrieve).with({id: '1234qwer', expand: ['subscriptions']}).and_return(cus)
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 2500,
        :currency => 'usd',
        :source => 'tokenny',
        :customer => '1234qwer',
        :receipt_email => u.settings['email'],
        :description => "CoughDrop premium symbols access",
        :metadata => {
          'user_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'purchased_symbols' => 'true',
          'type' => 'extras'
        }
      }).and_return({'id' => '1234', 'customer' => '4567'})
      Purchasing.purchase_symbol_extras('none', {'user_id' => u.global_id})
    end
  end
  
  describe "purchase_gift" do
    it "should error on unrecognized purchase type" do
      res = Purchasing.purchase_gift({}, {'type' => 'bob'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("unrecognized purchase type, bob")
    end
    
    it "should error on invalid purchase amount" do
      res = Purchasing.purchase_gift({}, {'type' => 'long_term_50'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("50 not valid for type long_term_50")

      ENV['CURRENT_SALE'] = nil
      res = Purchasing.purchase_gift({}, {'type' => 'long_term_100'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("100 not valid for type long_term_100")
    end

    it "should error on purchase amount that is too low based on additional options" do
      ENV['CURRENT_SALE'] = nil

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_200'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("unexpected_error")

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_150', 'extras' => true, 'donate' => true})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("150 not valid for type long_term_150")

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_305', 'extras' => true})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("unexpected_error")

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_175', 'extras' => true, 'donate' => true})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("175 not valid for type long_term_175")

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_295', 'extras' => false, 'donate' => true})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("unexpected_error")

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_200', 'extras' => true, 'donate' => true})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("200 not valid for type long_term_200")

      res = Purchasing.purchase_gift({}, {'type' => 'long_term_400', 'extras' => true, 'donate' => true})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("unexpected_error")
    end

    it "should allow discounts during a sale" do
      ENV['CURRENT_SALE'] = nil

      expect(Purchasing.active_sale?).to eq(false)
      res = Purchasing.purchase_gift({}, {'type' => 'long_term_100'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("100 not valid for type long_term_100")

      ENV['CURRENT_SALE'] = 2.weeks.from_now.to_i.to_s
      res = Purchasing.purchase_gift({}, {'type' => 'long_term_100'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("unexpected_error")

      ENV['CURRENT_SALE'] = nil
    end
    
    it "should gracefully handle API errors" do
      expect(Stripe::Charge).to receive(:create) { raise "no" }
      res = Purchasing.purchase_gift({}, {'type' => 'long_term_200'})
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq('unexpected_error')
      expect(res[:error_message]).to eq('no')
    end
    
    it "should generate a purchase object on success" do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 20000,
        :currency => 'usd',
        :receipt_email=>"bob@example.com",
        :source => 'token',
        :description => 'sponsored CoughDrop license',
        :metadata => {
          'giver_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'giver_email' => 'bob@example.com',
          'plan_id' => 'long_term_200'
        }
      }).and_return({
        'customer' => '12345',
        'id' => '23456'
      })
      g = GiftPurchase.new
      expect(GiftPurchase).to receive(:process_new).with({}, {
        'giver' => u,
        'email' => 'bob@example.com',
        'seconds' => 5.years.to_i
      }).and_return(g)
      res = Purchasing.purchase_gift({'id' => 'token'}, {'type' => 'long_term_200', 'user_id' => u.global_id, 'email' => 'bob@example.com'})
      expect(g.reload.settings).to eq({
        'customer_id' => '12345',
        'token_summary' => 'Unknown Card',
        'source_id' => 'stripe',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
      })
    end

    it "should generate a custom purchase object on success" do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 50000,
        :currency => 'usd',
        :source => 'token',
        :receipt_email=>"bob@example.com",
        :description => 'sponsored CoughDrop license',
        :metadata => {
          'giver_id' => u.global_id,
          'giver_email' => 'bob@example.com',
          'platform_source' => 'coughdrop',
          'plan_id' => 'long_term_custom_500'
        }
      }).and_return({
        'customer' => '12345',
        'id' => '23456'
      })
      g = GiftPurchase.new
      expect(GiftPurchase).to receive(:process_new).with({}, {
        'giver' => u,
        'email' => 'bob@example.com',
        'seconds' => 5.years.to_i
      }).and_return(g)
      res = Purchasing.purchase_gift({'id' => 'token'}, {'type' => 'long_term_custom_500', 'user_id' => u.global_id, 'email' => 'bob@example.com'})
      expect(res).to eq({:success => true, :type => 'long_term_custom_500'})
      expect(g.reload.settings).to eq({
        'customer_id' => '12345',
        'token_summary' => 'Unknown Card',
        'plan_id' => 'long_term_custom_500',
        'source_id' => 'stripe',
        'purchase_id' => '23456'
      })
    end

    it "should include additional options on gift if specified" do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 50000,
        :currency => 'usd',
        :source => 'token',
        :receipt_email=>"bob@example.com",
        :description => 'sponsored CoughDrop license',
        :metadata => {
          'giver_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'giver_email' => 'bob@example.com',
          'plan_id' => 'long_term_custom_500'
        }
      }).and_return({
        'customer' => '12345',
        'id' => '23456'
      })
      g = GiftPurchase.new
      expect(GiftPurchase).to receive(:process_new).with({}, {
        'giver' => u,
        'email' => 'bob@example.com',
        'seconds' => 5.years.to_i
      }).and_return(g)
      res = Purchasing.purchase_gift({'id' => 'token'}, {'type' => 'long_term_custom_500', 'extras' => true, 'donate' => true, 'user_id' => u.global_id, 'email' => 'bob@example.com'})
      expect(res).to eq({:success => true, :type => 'long_term_custom_500'})
      expect(g.reload.settings).to eq({
        'customer_id' => '12345',
        'token_summary' => 'Unknown Card',
        'source_id' => 'stripe',
        'plan_id' => 'long_term_custom_500',
        'purchase_id' => '23456',
        'include_extras' => true,
        'extra_donation' => true
      })
    end
    
    
    it "should trigger a notification on success" do
      u = User.create
      notifications = []
      expect(SubscriptionMailer).to receive(:schedule_delivery){ |type, id, action|
        notifications << type
        if type == :gift_created
          expect(id).to_not eq(nil)
          expect(action).to eq(nil)
        elsif type == :gift_updated
          expect(id).to_not eq(nil)
          expect(action).to eq('purchase')
        end
      }.exactly(2).times
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 20000,
        :currency => 'usd',
        :receipt_email=>"bob@example.com",
        :source => 'token',
        :description => 'sponsored CoughDrop license',
        :metadata => {
          'giver_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'giver_email' => 'bob@example.com',
          'plan_id' => 'long_term_200'
        }
      }).and_return({
        'customer' => '12345',
        'id' => '23456'
      })
      res = Purchasing.purchase_gift({'id' => 'token'}, {'type' => 'long_term_200', 'user_id' => u.global_id, 'email' => 'bob@example.com'})
      expect(res[:success]).to eq(true)
      g = GiftPurchase.last
      expect(g.settings['giver_id']).to eq(u.global_id)
      expect(g.settings['customer_id']).to eq('12345')
      expect(g.settings['purchase_id']).to eq('23456')
      expect(g.settings['plan_id']).to eq('long_term_200')
      expect(g.settings['token_summary']).to eq('Unknown Card')
      expect(g.settings['giver_email']).to eq('bob@example.com')
      expect(g.settings['seconds_to_add']).to eq(5.years.to_i)
      expect(notifications).to eq([:gift_created, :gift_updated])
    end
    
    it "should update an existing bulk purchase if defined" do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 50000,
        :currency => 'usd',
        :receipt_email=>"bob@example.com",
        :source => 'token',
        :description => '4 sponsored CoughDrop license(s), PO #12345',
        :metadata => {
          'giver_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'giver_email' => 'bob@example.com',
          'plan_id' => 'long_term_custom_500'
        }
      }).and_return({
        'customer' => '12345',
        'id' => '23456'
      })
      gift = GiftPurchase.create(settings: {
        'licenses' => 4,
        'amount' => 500,
        'memo' => 'PO #12345',
        'organization' => 'org name'
      })
      expect(gift.active).to eq(true)
      res = Purchasing.purchase_gift({'id' => 'token'}, {'type' => 'long_term_custom_500', 'user_id' => u.global_id, 'email' => 'bob@example.com', 'code' => gift.code})
      expect(res).to eq({:success => true, :type => 'long_term_custom_500'})
      expect(gift.reload.settings).to eq({
        'customer_id' => '12345',
        'plan_id' => 'long_term_custom_500',
        'purchase_id' => '23456',
        'token_summary' => 'Unknown Card',
        'code_length' => 20,
        'amount' => 500,
        'source_id' => 'stripe',
        'memo' => 'PO #12345',
        'licenses' => 4,
        'organization' => 'org name'
      })
      expect(gift.active).to eq(false)
    end
    
    it "should fail with the correct decline code" do
      u = User.create
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 50000,
        :currency => 'usd',
        :source => 'token',
        :receipt_email=>"bob@example.com",
        :description => 'sponsored CoughDrop license',
        :metadata => {
          'giver_id' => u.global_id,
          'platform_source' => 'coughdrop',
          'giver_email' => 'bob@example.com',
          'plan_id' => 'long_term_custom_500'
        }
      }).and_raise(FakeCardError.new({error: {code: 'no', decline_code: 'no way'}}))

      gift = GiftPurchase.create
      expect(gift.active).to eq(true)
      res = Purchasing.purchase_gift({'id' => 'token'}, {'type' => 'long_term_custom_500', 'user_id' => u.global_id, 'email' => 'bob@example.com', 'code' => gift.code})
      expect(res).to eq({:success => false, :error => 'no', :decline_code => 'no way'})
      expect(gift.reload.settings).to eq({})
      expect(gift.active).to eq(true)
    end
  end

  describe "redeem_gift" do
    it "should error gracefully when no user provided" do
      g = GiftPurchase.create
      res = Purchasing.redeem_gift(g.code, nil)
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("user required")
    end
    
    it "should error gracefully when no valid gift found" do
      g = GiftPurchase.create
      u = User.create
      res = Purchasing.redeem_gift(nil, u)
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("code doesn't match any available gifts")
      
      res = Purchasing.redeem_gift(g.code + "abc", u)
      expect(res[:success]).to eq(false)
      expect(res[:error]).to eq("code doesn't match any available gifts")
    end
    
    it "should deactivate the specified code" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 3.years.to_i})
      u = User.create
      res = Purchasing.redeem_gift(g.code, u)
      expect(res[:success]).to eq(true)
      g.reload
      expect(g.active).to eq(false)
    end
    
    it "should update the recipient's subscription" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 3.years.to_i})
      u = User.create
      exp = u.expires_at
      
      res = Purchasing.redeem_gift(g.code, u)
      expect(res[:success]).to eq(true)
      u.reload
      expect(u.expires_at).to eq(exp + 3.years.to_i)
    end

    it "should add extras for the user if specified on the gift" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 3.years.to_i, 'include_extras' => true})
      u = User.create
      exp = u.expires_at
      
      res = Purchasing.redeem_gift(g.code, u)
      expect(res[:success]).to eq(true)
      u.reload
      expect(u.expires_at).to eq(exp + 3.years.to_i)
      expect(u.subscription_hash['extras_enabled']).to eq(true)
    end

    it "should add extras for the user on a redeem code if specified" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 3.years.to_i, 'include_extras' => true})
      u = User.create
      exp = u.expires_at
      
      res = Purchasing.redeem_gift(g.code, u)
      expect(res[:success]).to eq(true)
      u.reload
      expect(u.expires_at).to eq(exp + 3.years.to_i)
      expect(u.subscription_hash['extras_enabled']).to eq(true)
    end

    it "should add extras for the user on a bulk redeem code if specified" do
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i, 'include_extras' => true})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(50)
      expect(g.reload.settings['codes'].to_a[0][1]).to eq(nil)
      code = g.settings['codes'].to_a[0][0]
      u = User.create
      exp = u.expires_at
      res = Purchasing.redeem_gift(code, u)
      expect(res[:success]).to eq(true)
      expect(res[:code]).to eq(code)
      u.reload
      expect(u.subscription_hash['extras_enabled']).to eq(true)
      expect(u.expires_at).to eq(exp + 4.years.to_i)
      expect(g.reload.settings['codes'].to_a[0][1]).to_not eq(nil)
      expect(g.reload.settings['codes'].to_a[0][1]['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['codes'].to_a[0][1]['redeemed_at']).to_not eq(nil)
    end

    it "should add supporter credits on a bulk redeem code if specified" do
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i, 'include_supporters' => 2})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(50)
      expect(g.reload.settings['codes'].to_a[0][1]).to eq(nil)
      code = g.settings['codes'].to_a[0][0]
      u = User.create
      exp = u.expires_at
      res = Purchasing.redeem_gift(code, u)
      expect(res[:success]).to eq(true)
      expect(res[:code]).to eq(code)
      u.reload
      expect(u.subscription_hash['extras_enabled']).to eq(nil)
      expect(u.premium_supporter_grants).to eq(2)
      expect(u.expires_at).to eq(exp + 4.years.to_i)
      expect(g.reload.settings['codes'].to_a[0][1]).to_not eq(nil)
      expect(g.reload.settings['codes'].to_a[0][1]['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['codes'].to_a[0][1]['redeemed_at']).to_not eq(nil)
    end

    it "should not add extras for the user if not specified on the gift" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 3.years.to_i})
      u = User.create
      exp = u.expires_at
      
      res = Purchasing.redeem_gift(g.code, u)
      expect(res[:success]).to eq(true)
      u.reload
      expect(u.expires_at).to eq(exp + 3.years.to_i)
      expect(u.subscription_hash['extras_enabled']).to eq(nil)
    end
    
    it "should trigger notifications for the recipient and giver" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 3.years.to_i})
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:gift_redeemed, g.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:gift_seconds_added, g.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:gift_updated, g.global_id, 'redeem')
      res = Purchasing.redeem_gift(g.code, u)
      expect(res[:success]).to eq(true)
      expect(res[:code]).to eq(g.code)
    end
    
    it "should redeem a sub-gift code" do
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(50)
      expect(g.reload.settings['codes'].to_a[0][1]).to eq(nil)
      code = g.settings['codes'].to_a[0][0]
      u = User.create
      exp = u.expires_at
      res = Purchasing.redeem_gift(code, u)
      expect(res[:success]).to eq(true)
      expect(res[:code]).to eq(code)
      u.reload
      expect(u.expires_at).to eq(exp + 4.years.to_i)
      expect(g.reload.settings['codes'].to_a[0][1]).to_not eq(nil)
      expect(g.reload.settings['codes'].to_a[0][1]['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['codes'].to_a[0][1]['redeemed_at']).to_not eq(nil)
    end
    
    it "should add a sub-gift code to an org if defined" do
      o = Organization.create
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i, 'org_id' => o.global_id})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(50)
      expect(g.reload.settings['codes'].to_a[0][1]).to eq(nil)
      code = g.settings['codes'].to_a[0][0]
      u = User.create
      exp = u.expires_at
      res = Purchasing.redeem_gift(code, u)
      expect(res[:success]).to eq(true)
      expect(res[:code]).to eq(code)
      u.reload
      expect(u.expires_at).to eq(exp + 4.years.to_i)
      expect(g.reload.settings['codes'].to_a[0][1]).to_not eq(nil)
      expect(g.reload.settings['codes'].to_a[0][1]['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['codes'].to_a[0][1]['redeemed_at']).to_not eq(nil)
      links = UserLink.links_for(u)
      expect(links.length).to eq(1)
      expect(links[0]['record_code']).to eq(Webhook.get_record_code(o))
      expect(links[0]['state']['pending']).to eq(false)
      expect(links[0]['state']['sponsored']).to eq(false)
      expect(links[0]['state']['eval']).to eq(false)
    end
  end
  
  describe "logging" do
    it "should log user events without erroring" do
      u = User.create(:settings => {'subscription' => {}})
      expect(Stripe::Charge).to receive(:create).with({
        :amount => 20000,
        :currency => 'usd',
        :source => 'token',
        :receipt_email => nil,
        :description => 'CoughDrop communicator license purchase',
        :metadata => {
          'user_id' => u.global_id,
          'plan_id' => 'long_term_200',
          'platform_source' => 'coughdrop',
          'type' => 'license'
        }
      }).and_return({
        'id' => '23456',
        'customer' => '45678'
      })
      expect(User).to receive(:subscription_event)
      Purchasing.purchase(u, {'id' => 'token'}, 'long_term_200')
      Worker.process_queues
      u.reload
      expect(u.subscription_events.length).to eq(4)
      expect(u.subscription_events.map{|e| e['log'] }).to eq(['purchase initiated', 'paid subscription', 'long-term - creating charge', 'persisting long-term purchase update'])
    end
  end
  
  it "should not clear subscription on modified second attempt with same token" do
    u = User.create
    Purchasing.purchase(u, {'id' => 'free'}, 'slp_monthly_free')
    expect(u.reload.subscription_events.length).to eq(2)
    expect(u.subscription_events[0]['log']).to eq('purchase initiated')
    expect(u.subscription_events[0]['token']).to eq('fre..ree')
    expect(u.subscription_events[1]['log']).to eq('subscription canceling')
    expect(u.subscription_events[1]['reason']).to eq('all')
    expect(u.billing_state).to eq(:modeling_only)
    expect(u.subscription_hash['active']).to eq(nil)
    expect(u.subscription_hash['expires']).to eq(nil)
    expect(u.subscription_hash['free_premium']).to eq(nil)
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['modeling_only']).to eq(true)
    expect(u.subscription_hash['plan_id']).to eq(nil)
    expect(u.subscription_hash['started']).to eq(nil)

    expect(Stripe::Charge).to receive(:create).with({
      :amount => 20000,
      :currency => 'usd',
      :source => 'tokenasdfasdf',
      :description => 'CoughDrop communicator license purchase',
      :receipt_email => nil,
      :metadata => {
        'user_id' => u.global_id,
        'platform_source' => 'coughdrop',
        'plan_id' => 'long_term_200',
        'type' => 'license'
      }
    }).and_return({
      'id' => 'asdf',
      'customer' => nil
    })
    Purchasing.purchase(u, {'id' => 'tokenasdfasdf'}, 'long_term_200')
    expect(u.reload.subscription_events.length).to eq(9)
    expect(u.reload.subscription_events[2]['log']).to eq('purchase initiated')
    expect(u.reload.subscription_events[2]['token']).to eq('tok..sdf')
    expect(u.reload.subscription_events[3]['log']).to eq('paid subscription')
    expect(u.reload.subscription_events[4]['log']).to eq('long-term - creating charge')
    expect(u.reload.subscription_events[5]['log']).to eq('persisting long-term purchase update')
    expect(u.reload.subscription_events[6]['log']).to eq('subscription event triggered remotely')
    expect(u.reload.subscription_events[6]['args'].except('seconds_to_add')).to eq({
      'customer_id' => nil,
      'discount_code' => nil,
      'plan_id' => 'long_term_200',
      'purchase' => true,
      'purchase_id' => 'asdf',
      'purchase_amount' => 200,
      'source' => 'new purchase',
      'source_id' => 'stripe',
      'token_summary' => 'Unknown Card',
      'user_id' => u.global_id
    })
    expect(u.reload.subscription_events[6]['args']['seconds_to_add']).to be >= 157784760
    expect(u.reload.subscription_events[6]['args']['seconds_to_add']).to be <= 157788000

    expect(u.reload.subscription_events[7]['log']).to eq('purchase notification triggered')
    expect(u.reload.subscription_events[8]['log']).to eq('subscription canceling')
    expect(u.reload.subscription_events[8]['reason']).to eq('all')
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['active']).to eq(true)
    expect(u.subscription_hash['purchased']).to eq(true)
    expect(u.subscription_hash['plan_id']).to eq('long_term_200')
    expect(u.billing_state).to eq(:long_term_active_communicator)
    expect(u.expires_at).to_not eq(nil)
    expect(u.subscription_hash['expires']).to_not eq(nil)

    req = stripe_event_request 'charge.succeeded', {
      'id' => 'asdf',
      'customer' => nil,
      'metadata' => {
        'user_id' => u.global_id,
        'plan_id' => 'long_term_200'
      }
    }
    Purchasing.subscription_event(req)
    expect(u.reload.subscription_events.length).to eq(10)
    expect(u.reload.subscription_events[9]['log']).to eq('subscription event triggered remotely')
    expect(u.reload.subscription_events[9]['args'].except('seconds_to_add')).to eq({
      'customer_id' => nil,
      'plan_id' => 'long_term_200',
      'purchase' => true,
      'purchase_id' => 'asdf',
      'source_id' => 'stripe',
      'source' => 'charge.succeeded',
      'user_id' => u.global_id
    })
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['active']).to eq(true)
    expect(u.subscription_hash['purchased']).to eq(true)
    expect(u.subscription_hash['plan_id']).to eq('long_term_200')
    expect(u.subscription_hash['expires']).to_not eq(nil)
    
    # TODO: trigger remote callback event charge.succeeded

    customer = OpenStruct.new({
      subscriptions: []
    })
    expect(Stripe::Customer).to receive(:create).with({
      :expand => ['subscriptions'],
      :metadata => {
        'user_id' => u.global_id,
        'platform_source' => 'coughdrop'
      },
      :email => nil
    }).and_return(customer)
    expect(customer.subscriptions).to receive(:create).with({
      :plan => 'price_1NQzXZBoyWVHHEVPoaYXBeyy',
      :source => 'tokenasdfasdf',
      :metadata => {:platform_source => 'coughdrop'},
      trial_end: (u.created_at + 60.days).to_i
    }).and_raise("You cannot use a Stripe token more than once")
    Purchasing.purchase(u, {'id' => 'tokenasdfasdf',}, 'monthly_6')
    expect(u.reload.subscription_events.length).to eq(16)
    expect(u.reload.subscription_events[10]['log']).to eq('purchase initiated')
    expect(u.reload.subscription_events[10]['token']).to eq('tok..sdf')
    expect(u.reload.subscription_events[11]['log']).to eq('paid subscription')
    expect(u.reload.subscription_events[12]['log']).to eq('monthly subscription')
    expect(u.reload.subscription_events[13]['log']).to eq('creating new customer')
    expect(u.reload.subscription_events[14]['log']).to eq('new subscription for existing customer')
    expect(u.reload.subscription_events[15]['error']).to eq('other_exception')
    expect(u.reload.subscription_events[15]['err']).to match('You cannot use a Stripe token more than once')
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['active']).to eq(true)
    expect(u.subscription_hash['purchased']).to eq(true)
    expect(u.subscription_hash['plan_id']).to eq('long_term_200')
    expect(u.subscription_hash['expires']).to_not eq(nil)
  end

  it "should not clear subscription on failed second attempt with same token" do
    u = User.create
    Purchasing.purchase(u, {'id' => 'free'}, 'slp_monthly_free')
    expect(u.reload.subscription_events.length).to eq(2)
    expect(u.subscription_events[0]['log']).to eq('purchase initiated')
    expect(u.subscription_events[0]['token']).to eq('fre..ree')
    expect(u.subscription_events[1]['log']).to eq('subscription canceling')
    expect(u.subscription_events[1]['reason']).to eq('all')
    expect(u.subscription_hash['active']).to eq(nil)
    expect(u.subscription_hash['expires']).to eq(nil)
    expect(u.subscription_hash['free_premium']).to eq(nil)
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['modeling_only']).to eq(true)
    expect(u.subscription_hash['started']).to eq(nil)

    expect(Stripe::Charge).to receive(:create).with({
      :amount => 20000,
      :currency => 'usd',
      :source => 'tokenasdfasdf',
      :description => 'CoughDrop communicator license purchase',
      :receipt_email => nil,
      :metadata => {
        'user_id' => u.global_id,
        'platform_source' => 'coughdrop',
        'plan_id' => 'long_term_200',
        'type' => 'license'
      }
    }).and_return({
      'id' => 'asdf',
      'customer' => 'asdf'
    })
    Purchasing.purchase(u, {'id' => 'tokenasdfasdf'}, 'long_term_200')
    expect(u.reload.subscription_events.length).to eq(9)
    expect(u.reload.subscription_events[2]['log']).to eq('purchase initiated')
    expect(u.reload.subscription_events[2]['token']).to eq('tok..sdf')
    expect(u.reload.subscription_events[3]['log']).to eq('paid subscription')
    expect(u.reload.subscription_events[4]['log']).to eq('long-term - creating charge')
    expect(u.reload.subscription_events[5]['log']).to eq('persisting long-term purchase update')
    expect(u.reload.subscription_events[6]['log']).to eq('subscription event triggered remotely')
    expect(u.reload.subscription_events[6]['args'].except('seconds_to_add')).to eq({
      'customer_id' => 'asdf',
      'discount_code' => nil,
      'plan_id' => 'long_term_200',
      'purchase' => true,
      'purchase_id' => 'asdf',
      'source_id' => 'stripe',
      'purchase_amount' => 200,
      'source' => 'new purchase',
      'token_summary' => 'Unknown Card',
      'user_id' => u.global_id
    })
    expect(u.reload.subscription_events[6]['args']['seconds_to_add']).to be >= 157784760
    expect(u.reload.subscription_events[6]['args']['seconds_to_add']).to be <= 157788000
   
    expect(u.reload.subscription_events[7]['log']).to eq('purchase notification triggered')
    expect(u.reload.subscription_events[8]['log']).to eq('subscription canceling')
    expect(u.reload.subscription_events[8]['reason']).to eq('all')
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['active']).to eq(true)
    expect(u.subscription_hash['purchased']).to eq(true)
    expect(u.subscription_hash['plan_id']).to eq('long_term_200')
    expect(u.subscription_hash['expires']).to_not eq(nil)
    
    expect(Stripe::Charge).to receive(:create).with({
      :amount => 14500,
      :currency => 'usd',
      :source => 'tokenasdfasdfjkl',
      :description => 'CoughDrop cloud extras re-purchase',
      :receipt_email => nil,
      :metadata => {
        'user_id' => u.global_id,
        'platform_source' => 'coughdrop',
        'plan_id' => 'refresh_long_term_200',
        'type' => 'license'
      }
    }).and_raise("You cannot use a Stripe token more than once")
    Purchasing.purchase(u, {'id' => 'tokenasdfasdfjkl'}, 'long_term_200')
    expect(u.reload.subscription_events.length).to eq(13)
    expect(u.reload.subscription_events[9]['log']).to eq('purchase initiated')
    expect(u.reload.subscription_events[9]['token']).to eq('tok..jkl')
    expect(u.reload.subscription_events[10]['log']).to eq('paid subscription')
    expect(u.reload.subscription_events[11]['log']).to eq('long-term - creating charge')
    # expect(u.reload.subscription_events[12]['log']).to eq('persisting long-term purchase update')
    # expect(u.reload.subscription_events[13]['log']).to eq('subscription event triggered remotely')
    # expect(u.reload.subscription_events[14]['log']).to eq('subscription canceling')
    expect(u.reload.subscription_events[12]['error']).to eq('other_exception')
    
    expect(u.subscription_hash['grace_period']).to eq(nil)
    expect(u.subscription_hash['active']).to eq(true)
    expect(u.subscription_hash['purchased']).to eq(true)
    expect(u.subscription_hash['plan_id']).to eq('long_term_200')
    expect(u.subscription_hash['expires']).to_not eq(nil)
  end
  
    describe "cancel_subscription" do
      it "should return false if no customer found" do
        u = User.create
        res = Purchasing.cancel_other_subscriptions(u, '2345')
        expect(res).to eq(false)
      
        expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_return(nil)
        res = Purchasing.cancel_subscription(u.global_id, '1234', '2345')
        expect(res).to eq(false)
      end
    
      it "should return false on error" do
        u = User.create
        expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}) { raise "no" }
        res = Purchasing.cancel_subscription(u.global_id, '1234', '2345')
        expect(res).to eq(false)
      end
    
      it "should retrieve the customer record" do
        u = User.create
        subs1 = {}
        expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_return(OpenStruct.new({
          subscriptions: subs1
        }))
        res = Purchasing.cancel_subscription(u.global_id, '1234', '2345')
        expect(res).to eq(false)
      end
      
      it "should not do anything if the customer metadata doesn't match the user" do
        u = User.create
        subs1 = {}
        expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_return(OpenStruct.new({
          subscriptions: subs1
        }))
        res = Purchasing.cancel_subscription(u.global_id, '1234', '2345')
        expect(res).to eq(false)
      end
    
      it "should cancel matching active subscriptions" do
        u = User.create
        a = {'id' => '3456'}
        b = {'id' => '6789', 'status' => 'active'}
        c = {'id' => '4567', 'status' => 'active'}
        all = [a, b, c]
        expect(a).not_to receive(:cancel)
        expect(b).to receive(:cancel)
        expect(c).not_to receive(:cancel)
        subs1 = {}
        expect(subs1).to receive(:auto_paging_each) do |&block|
          block.call(a)
          block.call(b)
          block.call(c)
        end
          expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          metadata: {'user_id' => u.global_id},
          subscriptions: subs1
        }))
        res = Purchasing.cancel_subscription(u.global_id, '2345', '6789')
        expect(res).to eq(true)
      end
    
      it "should not cancel on matching inactive subscriptions" do
        u = User.create
        a = {'id' => '3456'}
        b = {'id' => '6789', 'status' => 'canceled'}
        all = [a, b]
        expect(a).not_to receive(:cancel)
        expect(b).not_to receive(:cancel)
        subs1 = {}
        expect(subs1).to receive(:auto_paging_each) do |&block|
          block.call(a)
          block.call(b)
        end
          expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          metadata: {'user_id' => u.global_id},
          subscriptions: subs1
        }))
        res = Purchasing.cancel_subscription(u.global_id, '2345', '6789')
        expect(res).to eq(false)
      end
    
      it "should log subscription cancellations" do
        u = User.create
        a = {'id' => '3456'}
        b = {'id' => '6789'}
        c = {'id' => '4567', 'status' => 'active'}
        all = [a, b, c]
        expect(a).not_to receive(:cancel)
        expect(b).not_to receive(:cancel)
        expect(c).to receive(:cancel)
        subs1 = {}
        expect(subs1).to receive(:auto_paging_each) do |&block|
          block.call(a)
          block.call(b)
          block.call(c)
        end  
        expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          metadata: {'user_id' => u.global_id},
          subscriptions: subs1
        }))
        res = Purchasing.cancel_subscription(u.global_id, '2345', '4567')
        expect(res).to eq(true)
        Worker.process_queues
        u.reload
        expect(u.subscription_events).to_not eq(nil)
        expect(u.subscription_events[-1]['log']).to eq('subscription canceling success')
        expect(u.subscription_events[-1]['reason']).to eq('4567')
      end
    
      it "should log errors on failed cancellations" do
        u = User.create
        res = Purchasing.cancel_subscription(u, '1234', '1234')
        expect(res).to eq(false)
        expect(u.subscription_events.length).to eq(0)
      
        u = User.create({'settings' => {'subscription' => {'customer_id' => '1234'}}})
        expect(Stripe::Customer).to receive(:retrieve).with({id: '1234', expand: ['subscriptions']}).and_raise("no dice")
        res = Purchasing.cancel_subscription(u.global_id, '1234', '1234')
        expect(res).to eq(false)
        expect(u.subscription_events.length).to eq(1)
        expect(u.subscription_events.map{|e| e['log'] }).to eq(['subscription canceling error'])
        expect(u.subscription_events[0]['error']).to eq('no dice')

        u = User.create({'settings' => {'subscription' => {'customer_id' => '2345'}}})
        subscr = OpenStruct.new
        expect(subscr).to receive(:auto_paging_each).and_raise('naughty')
        expect(Stripe::Customer).to receive(:retrieve).with({id: '2345', expand: ['subscriptions']}).and_return(OpenStruct.new({
          metadata: {'user_id' => u.global_id},
          subscriptions: subscr
        }))
        res = Purchasing.cancel_subscription(u.global_id, '2345', '2345')
        expect(res).to eq(false)
        expect(u.subscription_events.length).to eq(1)
        expect(u.subscription_events.map{|e| e['log'] }).to eq(['subscription canceling error'])
        expect(u.subscription_events[0]['error']).to eq('naughty')
      
        u = User.create({'settings' => {'subscription' => {'customer_id' => '3456'}}})
        a = {'id' => '3456'}
        b = {'id' => '4567'}
        all = [a, b]
        subscr = OpenStruct.new
        expect(a).to receive(:cancel).and_raise('yipe')
        subs1 = {}
        expect(subs1).to receive(:auto_paging_each) do |&block|
          block.call(a)
          block.call(b)
        end
  
        expect(Stripe::Customer).to receive(:retrieve).with({id: '3456', expand: ['subscriptions']}).and_return(OpenStruct.new({
          metadata: {'user_id' => u.global_id},
          subscriptions: subs1
        }))
        res = Purchasing.cancel_subscription(u.global_id, '3456', '3456')
        expect(res).to eq(false)
        expect(u.subscription_events.length).to eq(1)
        expect(u.subscription_events.map{|e| e['log'] }).to eq(['subscription canceling error'])
        expect(u.subscription_events[0]['error']).to eq('yipe')
      end
    end


    
  describe "reconcile" do
    class Pager
      def initialize(type)
        @type = type
      end

      def auto_paging_each(&block)
        # a - nothing
        ua = User.create

        # b - long-term and recurring
        ub = User.create
        ub.expires_at = 6.months.from_now
        ub.settings['subscription'] = {'last_purchase_plan_id' => 'bbbbbb', 'customer_id' => 'bbb'}
        ub.save!
        raise "ub" unless ub.long_term_purchase?

        # c - multiple active subscriptions
        uc = User.create

        # d - long-term normal
        ud = User.create
        ud.expires_at = 6.months.from_now
        ud.settings['subscription'] = {'last_purchase_plan_id' => 'dddddd', 'customer_id' => 'ddd'}
        ud.save!
        raise "ud" unless ud.long_term_purchase?

        # e - recurring with matching customer_id, no active subs on the customer
        ue = User.create
        ue.settings['subscription'] = {'customer_id' => 'eee', 'started' => 5.weeks.ago.iso8601}
        ue.save!
        raise "ue" unless ue.recurring_subscription?

        # f - recurring with different customer_id, no active subs on the customer
        uf = User.create
        uf.settings['subscription'] = {'customer_id' => 'xxx', 'started' => 5.weeks.ago.iso8601}
        uf.save!
        raise "uf" unless uf.recurring_subscription?

        # g - not recurring on the user, no active subs on the customer
        ug = User.create
        ug.settings['subscription'] = {'customer_id' => 'ggg'}
        ug.save!
        raise "ug" if ug.recurring_subscription?

        # h - recurring and matching
        uh = User.create
        uh.settings['subscription'] = {'customer_id' => 'hhh', 'started' => 3.weeks.ago.iso8601}
        uh.save!

        # i - recurring and mismatched status
        ui = User.create
        ui.settings['subscription'] = {'customer_id' => 'iii', 'started' => 2.weeks.ago.iso8601}
        ui.save!

        # j - reucurring and mismatched customer_id
        uj = User.create
        uj.settings['subscription'] = {'customer_id' => 'www', 'started' => 2.weeks.ago.iso8601}
        uj.save!

        @users = [ua, ub, uc, ud, ue, uf, ug, uh, ui, uj]

        if @type == :customers
          [
            {'id' => 'aaa', 'email' => 'a@example.com', 'metadata' => {'user_id' => ua.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => []},
            {'id' => 'bbb', 'email' => 'b@example.com', 'metadata' => {'user_id' => ub.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => [{'status' => 'active'}]},
            {'id' => 'ccc', 'email' => 'c@example.com', 'metadata' => {'user_id' => uc.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => [{}, {}]},
            {'id' => 'ddd', 'email' => 'd@example.com', 'metadata' => {'user_id' => ud.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => []},
            {'id' => 'eee', 'email' => 'e@example.com', 'metadata' => {'user_id' => ue.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => []},
            {'id' => 'fff', 'email' => 'f@example.com', 'metadata' => {'user_id' => uf.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => []},
            {'id' => 'ggg', 'email' => 'g@example.com', 'metadata' => {'user_id' => ug.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => []},
            {'id' => 'hhh', 'email' => 'h@example.com', 'metadata' => {'user_id' => uh.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => [{'status' => 'active'}]},
            {'id' => 'iii', 'email' => 'i@example.com', 'metadata' => {'user_id' => ui.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => [{'status' => 'canceled'}]},
            {'id' => 'jjj', 'email' => 'j@example.com', 'metadata' => {'user_id' => uj.global_id}, 'created' => 12.months.ago.to_i, 'subscriptions' => [{'status' => 'trialing'}]},
          ].each{|u| block.call(u)}
        elsif @type == :subscriptions
          [
            {'customer' => 'aaa', 'canceled_at' => 6.weeks.ago.to_i},
            {'customer' => 'aaa', 'canceled_at' => 8.months.ago.to_i},
            {'customer' => 'bbb', 'canceled_at' => 4.days.ago.to_i},
            {'customer' => 'eee', 'canceled_at' => 4.weeks.ago.to_i},
            {'customer' => 'ggg', 'canceled_at' => 8.months.ago.to_i}
          ].each{|s| block.call(s)}
        end
      end
    end

    it "should make the correct calls" do
      outputs = []
      expect(Purchasing).to receive(:output) do |str|
        outputs << str
      end.at_least(1).times
      cust = Pager.new(:customers)
      expect(Stripe::Charge).to receive(:list).with(:limit => 20).and_return(OpenStruct.new)
      expect(Stripe::Customer).to receive(:list).with(:limit => 10).and_return(cust)
      expect(Stripe::Subscription).to receive(:list).with(:limit => 20, :status => 'canceled').and_return(Pager.new(:subscriptions))
      Purchasing.reconcile
      expect(outputs.length).to eq(28)
      problems = outputs.detect{|o| o.match(/^PROBLEM/)}
      expect(problems).to_not eq(nil)
      problems = problems.split(/\n/)
      users = cust.instance_variable_get('@users')
      expect(problems.length).to eq(8)
      expect(problems.detect{|p| p.match(users[0].global_id)}).to eq(nil)
      expect(problems.detect{|p| p.match(users[1].global_id)}).to match(/still has a lingering subscription/)
      expect(problems.detect{|p| p.match(users[2].global_id)}).to match(/too many subscriptions/)
      expect(problems.detect{|p| p.match(users[3].global_id)}).to eq(nil)
      expect(problems.detect{|p| p.match(users[4].global_id)}).to match(/FREELOADER/)
      expect(problems.detect{|p| p.match(users[5].global_id)}).to eq(nil)
      expect(problems.detect{|p| p.match(users[6].global_id)}).to eq(nil)
      expect(problems.detect{|p| p.match(users[7].global_id)}).to eq(nil)
      expect(problems.detect{|p| p.match(users[8].global_id)}).to match(/customer is canceled but user is subscribed/)
      expect(problems.detect{|p| p.match(users[9].global_id)}).to match(/tied to a different customer record www/)
    end
  end

  describe "verify_receipt" do
    # Sample receipt from the real world
    # {
    #   "type"=>"ios-appstore", 
    #   "id"=>"1000000548498647", 
    #   "appStoreReceipt"=>"MIIT6AYJKoZIhvcNAQcCoIIT2TCCE9UCAQExCzAJBg
    # }
    # Sample receipt response from the real world
    # {
    #   "receipt": {
    #     "receipt_type": "ProductionSandbox",
    #     "adam_id": 0,
    #     "app_item_id": 0,
    #     "bundle_id": "com.mycoughdrop.coughdrop",
    #     "application_version": "2019.07.18",
    #     "download_id": 0,
    #     "version_external_identifier": 0,
    #     "receipt_creation_date": "2019-07-18 18:28:26 Etc/GMT",
    #     "receipt_creation_date_ms": "1563474326000",
    #     "receipt_creation_date_pst": "2019-07-18 11:28:26 America/Los_Angeles",
    #     "request_date": "2019-07-18 18:37:31 Etc/GMT",
    #     "request_date_ms": "1563475731841",
    #     "request_date_pst": "2019-07-18 11:37:31 America/Los_Angeles",
    #     "original_purchase_date": "2013-08-01 07:00:00 Etc/GMT",
    #     "original_purchase_date_ms": "1375388800000",
    #     "original_purchase_date_pst": "2013-08-01 00:00:00 America/Los_Angeles",
    #     "original_application_version": "1.0",
    #     "in_app": [
    #       {
    #         "quantity": "1",
    #         "product_id": "LingoLinqiOSBundle",
    #         "transaction_id": "1000009318498647",
    #         "original_transaction_id": "1000009318498647",
    #         "purchase_date": "2019-07-18 18:28:26 Etc/GMT",
    #         "purchase_date_ms": "1563474934000",
    #         "purchase_date_pst": "2019-07-18 11:28:26 America/Los_Angeles",
    #         "original_purchase_date": "2019-07-18 18:28:26 Etc/GMT",
    #         "original_purchase_date_ms": "1563471096000",
    #         "original_purchase_date_pst": "2019-07-18 11:28:26 America/Los_Angeles",
    #         "is_trial_period": "false"
    #       }
    #     ]
    #   },
    #   "status": 0,
    #   "environment": "Sandbox"
    # }
    it "should error for non-iOS purchases" do
      res = Purchasing.verify_receipt(nil, {})
      expect(res['error']).to eq(true)
      expect(res['error_message']).to eq('unrecognized purchase type')
    end

    describe "iOS receipt validation" do
      it "should call the production endpoint" do
        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
      }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {status: 111}.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['error']).to eq(true)
        expect(res['error_message']).to eq("Error retrieving receipt, status 111")
      end

      it "should fall back to the development endpoint if instructed" do
        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {status: 21007}.to_json
        }))
        expect(Typhoeus).to receive(:post).with("https://sandbox.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {status: 999}.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['error']).to eq(true)
        expect(res['error_message']).to eq("Error retrieving receipt, status 999")
      end

      it "should error on non-success error codes" do
        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {status: 111}.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['error']).to eq(true)
        expect(res['error_message']).to eq("Error retrieving receipt, status 111")
      end

      it "should notify of pending expiration" do
        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2010').iso8601,
                is_trial_period: 'false',
                is_in_billing_retry_period: '1',
                expiration_intent: '3'
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2010-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(false)
        expect(res['billing_issue']).to eq(true)
        expect(res['reason']).to eq("Customer did not agree to a recent price increase.")
        expect(res['free_trial']).to eq(false)
      end

      it "should send correct expiration message" do
        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2010').iso8601,
                is_trial_period: 'false',
                is_in_billing_retry_period: '1',
                expiration_intent: '1'
              }]
            } 
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['reason']).to eq("Customer canceled their subscription.")

        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2010').iso8601,
                is_trial_period: 'false',
                is_in_billing_retry_period: '1',
                expiration_intent: '2'
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['reason']).to eq("Billing error; for example customer’s payment information was no longer valid.")

        u = User.create
        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2010').iso8601,
                is_trial_period: 'false',
                is_in_billing_retry_period: '1',
                expiration_intent: '4'
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['reason']).to eq("Product was not available for purchase at the time of renewal.")
      end

      it "should unsubscribe if expired" do
        u = User.create
        updated = User.subscription_event({
          'subscribe' => true,
          'user_id' => u.global_id,
          'subscription_id' => 'x984h3ag834g',
          'customer_id' => "ios.#{u.global_id}",
          'token_summary' => 'LingoLinqiOSMonthly',
          'plan_id' => 'monthly_ios',
          'cancel_others_on_update' => true,
          'source' => 'new iOS subscription'
        })        
        hash = u.reload.subscription_hash
        expect(hash['plan_id']).to eq('monthly_ios')
        expect(hash['active']).to eq(true)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                purchase_date_ms: '9',
                product_id: 'LingoLinqiOSMonthly',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
                is_trial_period: 'false',
                is_in_billing_retry_period: '0',
                expiration_intent: '3'
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(true)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq("Customer did not agree to a recent price increase.")
        expect(res['free_trial']).to eq(false)
        expect(res['canceled']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to_not eq(true)
      end

      it "should not unsubscribe if no longer on an ios subscription" do
        u = User.create
        updated = User.subscription_event({
          'subscribe' => true,
          'user_id' => u.global_id,
          'subscription_id' => 'x984h3ag834g',
          'customer_id' => "ios.#{u.global_id}",
          'token_summary' => 'LingoLinqiOSMonthly',
          'plan_id' => 'monthly_6',
          'cancel_others_on_update' => true,
          'source' => 'new iOS subscription'
        })        
        hash = u.reload.subscription_hash
        expect(hash['plan_id']).to eq('monthly_6')
        expect(hash['active']).to eq(true)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
                is_trial_period: 'false',
                is_in_billing_retry_period: '0',
                expiration_intent: '3'
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(true)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq("Customer did not agree to a recent price increase.")
        expect(res['free_trial']).to eq(false)
        expect(res['canceled']).to eq(false)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
      end

      it "should subscribe if specified" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3834g',
                original_transaction_id: 'x884h3ag834g',
                purchase_date_ms: '9',
                product_id: 'BadBacon',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
              }, {
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                purchase_date_ms: '10',
                product_id: 'LingoLinqiOSMonthly',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(false)
        expect(res['subscribed']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['plan_id']).to eq('monthly_ios')
      end

      it "should respond with already_subscribed if true" do
        u = User.create
        updated = User.subscription_event({
          'subscribe' => true,
          'user_id' => u.global_id,
          'subscription_id' => 'x984h3ag834g',
          'customer_id' => "ios.#{u.global_id}",
          'token_summary' => 'LingoLinqiOSMonthly',
          'plan_id' => 'monthly_ios',
          'cancel_others_on_update' => true,
          'source' => 'new iOS subscription'
        })        
        hash = u.reload.subscription_hash
        expect(hash['plan_id']).to eq('monthly_ios')
        expect(hash['active']).to eq(true)
        

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                purchase_date_ms: '9',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSMonthly',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(false)
        expect(res['subscribed']).to eq(true)
        expect(res['already_subscribed']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['plan_id']).to eq('monthly_ios')
      end

      it "should error if no in-app purchases listed" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: []
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to_not eq(true)
        expect(res['error']).to eq(true)
        expect(res['error_message']).to eq('Not a pre-purchase and no in-app receipts to validate')
      end

      it "should process one-time purchase if specified" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSBundle',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSBundle')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        hash = u.reload.subscription_hash
        expect(u.billing_state).to eq(:long_term_active_communicator)
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')
      end

      it "should process one-time eval purchase if specified" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSEval',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSEval')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        hash = u.reload.subscription_hash
        expect(u.billing_state).to eq(:eval_communicator)
        expect(hash['active']).to eq(true)
      end      

      it "should process one-time supporter purchase if specified" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSSLP',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSSLP')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        hash = u.reload.subscription_hash
        expect(u.billing_state).to eq(:premium_supporter)
        expect(hash['active']).to eq(true)
      end      

      it "should process pre-purchase if specified" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.paidcoughdrop',
              in_app: []
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'pre_purchase' => true, 'device_id' => 'asdfqwer', 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('AppPrePurchase')
        expect(res['transaction_id']).to eq('pre.asdfqwer')
        expect(res['subscription_id']).to eq(nil)
        expect(res['bundle_id']).to eq('com.mycoughdrop.paidcoughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq(nil)
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        u.reload
        expect(u.billing_state).to eq(:long_term_active_communicator)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')
      end

      it "should add extras for one-time purchase" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSBundle',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['extras']).to eq(true)
        Worker.process_queues
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSBundle')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        hash = u.reload.subscription_hash
        expect(u.billing_state).to eq(:long_term_active_communicator)
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')
        expect(hash['extras_enabled']).to eq(true)
        expect(u.settings['premium_voices']).to eq({"allowed"=>4, "claimed"=>[], "extra" => 2})
      end

      it "should add extras for subscription purchase" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3834g',
                original_transaction_id: 'x884h3ag834g',
                purchase_date_ms: '9',
                product_id: 'BadBacon',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
              }, {
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                purchase_date_ms: '10',
                product_id: 'LingoLinqiOSMonthly',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        Worker.process_queues
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSMonthly')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(nil)
        expect(res['subscription']).to eq(true)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(false)
        expect(res['subscribed']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['plan_id']).to eq('monthly_ios')
        expect(hash['extras_enabled']).to eq(true)
        expect(u.settings['premium_voices']).to eq(nil)
      end

      it "should not process pre-purchase for free app versions" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.mycoughdrop',
              in_app: []
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'pre_purchase' => true, 'device_id' => 'asdfqwer', 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to_not eq(true)
        expect(res['error']).to eq(true)
        expect(res['error_message']).to eq('Not a pre-purchase and no in-app receipts to validate')
      end

      it "should not allow purchasing for a different user than started with" do
        u = User.create
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(nil)

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSBundle',
                purchase_date_ms: '9',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        })).exactly(3).times
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSBundle')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(nil)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')

        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSBundle')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')

        u2 = User.create
        res = Purchasing.verify_receipt(u2, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(nil)
        expect(res['error']).to eq(true)
        expect(res['error_message']).to eq('That purchase has already been applied to a different user')
        hash = u2.reload.subscription_hash
        expect(hash['active']).to eq(nil)
        expect(hash['expires']).to be < 3.months.from_now.iso8601
        expect(hash['plan_id']).to eq(nil)
      end

      it "should respond with already_purchased if purchase token already used" do
        u = User.create
        User.subscription_event({
          'purchase' => true,
          'user_id' => u.global_id,
          'purchase_id' => '984h3ag834g',
          'customer_id' => "ios.#{u.global_id}",
          'token_summary' => 'LingoLinqiOSBundle',
          'plan_id' => 'long_term_ios',
          'seconds_to_add' => 5.years.to_i,
          'source' => 'new iOS purchase'
        })
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['plan_id']).to eq('long_term_ios')
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601

        expect(Typhoeus).to receive(:post).with("https://buy.itunes.apple.com/verifyReceipt", body: {
          'receipt-data' => 'asdf',
          'password' => ENV['IOS_RECEIPT_SECRET']
        }.to_json, timeout: 10, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}).and_return(OpenStruct.new({
          body: {
            status: 0,
            receipt: {
              bundle_id: 'com.mycoughdrop.coughdrop',
              in_app: [{
                quantity: 1,
                transaction_id: '984h3ag834g',
                purchase_date_ms: '9',
                original_transaction_id: 'x984h3ag834g',
                product_id: 'LingoLinqiOSBundle',
                expiration_date: Date.parse('Jan 2, 2020').iso8601,  
              }]
            }
          }.to_json
        }))
        res = Purchasing.verify_receipt(u, {'ios' => true, 'receipt' => {'appStoreReceipt' => 'asdf'}})
        expect(res['success']).to eq(true)
        expect(res['quantity']).to eq(1)
        expect(res['product_id']).to eq('LingoLinqiOSBundle')
        expect(res['transaction_id']).to eq('984h3ag834g')
        expect(res['subscription_id']).to eq('x984h3ag834g')
        expect(res['bundle_id']).to eq('com.mycoughdrop.coughdrop')
        expect(res['customer_id']).to eq("ios.#{u.global_id}")
        expect(res['expires']).to eq('2020-01-02')
        expect(res['one_time_purchase']).to eq(true)
        expect(res['subscription']).to eq(nil)
        expect(res['expired']).to eq(nil)
        expect(res['billing_issue']).to eq(nil)
        expect(res['reason']).to eq(nil)
        expect(res['free_trial']).to eq(nil)
        expect(res['purchased']).to eq(true)
        expect(res['already_purchased']).to eq(true)
        hash = u.reload.subscription_hash
        expect(hash['active']).to eq(true)
        expect(hash['expires']).to be > 4.years.from_now.iso8601
        expect(hash['expires']).to be < 6.years.from_now.iso8601
        expect(hash['plan_id']).to eq('long_term_ios')
      end
    end
  end
end
