require 'spec_helper'

describe Subscription, :type => :model do
  describe "never_expires?" do
    it "should return correct values" do
      u = User.new
      expect(u.never_expires?).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      expect(u.never_expires?).to eq(false)
      u.settings['subscription']['never_expires'] = true      
      expect(u.never_expires?).to eq(true)
    end
  end
  
  describe "grace_period?" do
    it "should return correct values" do
      u = User.new
      expect(u.grace_period?).to eq(false)
      u.expires_at = 2.weeks.from_now
      expect(u.grace_period?).to eq(true)
      u.settings = {}
      u.settings['subscription'] = {}
      u.settings['subscription']['never_expires'] = true
      expect(u.grace_period?).to eq(false)
      u.settings['subscription']['never_expires'] = false
      u.settings['managed_by'] = {'1_1' => {'pending' => false, 'sponsored' => true}}
      u.settings['subscription'] = {}
      expect(u).to receive(:org_sponsored?).and_return(true)
      expect(u.grace_period?).to eq(false)
      expect(u).to receive(:org_sponsored?).and_return(false).at_least(1).times
      u.settings['managed_by'] = nil
      u.settings['subscription'] = {}
      expect(u.grace_period?).to eq(true)
      u.settings['subscription']['customer_id'] = 'free'
      expect(u.grace_period?).to eq(true)
      u.settings['subscription']['last_purchase_plan_id'] = 'something'
      expect(u.grace_period?).to eq(false)
      u.settings['subscription']['last_purchase_plan_id'] = nil
      u.settings['subscription']['started'] = 12345
      expect(u.grace_period?).to eq(false)
      u.settings['subscription']['started'] = nil
      expect(u.grace_period?).to eq(true)
      u.settings['subscription']['plan_id'] = 'asdf'
      u.settings['subscription']['subscription_id'] = 'qwer'
      expect(u.grace_period?).to eq(true)
    end
  end
  
  it "should not check managed_by to get date data" do
    u = User.create
    o = Organization.create(:settings => {'total_licenses' => 2})
    u.update_subscription_organization(o.global_id, false, true)
    links = UserLink.links_for(u)
    expect(links).to eq([{
      'user_id' => u.global_id,
      'record_code' => Webhook.get_record_code(o),
      'type' => 'org_user',
      'state' => {
        'pending' => false,
        'sponsored' => true,
        'eval' => false,
        'added' => links[0]['state']['added']
      }
    }])
    link = UserLink.last
    
    added = Time.now - 2.years
    link.data['state']['added'] = added.iso8601
    link.save
    expect(u.reload.org_sponsored?).to eq(true)
    expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 100)
    expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 100)
  end
  
  describe "long_term_purchase?" do
    it "should return correct values" do
      u = User.new
      expect(u.long_term_purchase?).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      expect(u.long_term_purchase?).to eq(false)
      u.expires_at = 2.weeks.from_now
      expect(u.long_term_purchase?).to eq(false)
      u.settings['subscription']['last_purchase_plan_id'] = 'asdf'
      expect(u.long_term_purchase?).to eq(true)
    end
  end

  describe "recurring_subscription?" do
    it "should return correct values" do
      u = User.new
      expect(u.recurring_subscription?).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      expect(u.recurring_subscription?).to eq(false)
      u.settings['subscription']['started'] = 123
      expect(u.recurring_subscription?).to eq(true)
    end
  end
  
  describe "premium?" do
    it "should default to a 30-day free trial" do
      u = User.create
      expect(u.expires_at).to be > 29.days.from_now
      expect(u.any_premium_or_grace_period?).to eq(true)
    end
    
    it "should always return premium if set to never expire" do
      u = User.create(:settings => {'subscription' => {'never_expires' => true}})
      expect(u.any_premium_or_grace_period?).to eq(true)
      u.expires_at = 3.days.ago
      expect(u.any_premium_or_grace_period?).to eq(true)
    end
    
    it "should return premium? correctly based on date" do
      u = User.create(:expires_at => 3.days.ago)
      expect(u.any_premium_or_grace_period?).to eq(false)
      u.expires_at = Time.now + 5
      expect(u.any_premium_or_grace_period?).to eq(true)
    end
    
    it "should not return premium? with a free supporter-role subscription" do
      u = User.create(:expires_at => 3.days.ago)
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.supporter_role?).to eq(false)
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'slp_monthly_free'
      })
      expect(res).to eq(true)
      expect(u.modeling_only?).to eq(true)
      expect(u.supporter_role?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.any_premium_or_grace_period?).to eq(false)
    end
    
    it "should return premium if assigned to an organization" do
      u = User.create(:expires_at => 3.days.ago)
      expect(u.any_premium_or_grace_period?).to eq(false)
      o = Organization.create(settings: {:total_licenses => 1})
      o.add_user(u.user_name, false, true)
      u.reload
      expect(u.any_premium_or_grace_period?).to eq(true)
    end
  end
  
  describe "auto-expire" do
    it "should correctly auto-expire a supporter role into a free_premium role" do
      u = User.create(:settings => {'preferences' => {'role' => 'supporter'}})
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(true)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(false)
      expect(u.supporter_role?).to eq(true)
      expect(u.fully_purchased?).to eq(false)
      
      u.expires_at = 2.days.ago
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.modeling_only?).to eq(true)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(false)
      expect(u.supporter_role?).to eq(true)
      expect(u.fully_purchased?).to eq(false)
    end

    it "should no longer auto-expire a communicator signed up as a supporter role into a free_premium role" do
      u = User.create(:settings => {'preferences' => {'registration_type' => 'therapist'}})
      expect(u.communicator_role?).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(true)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.expires_at = 2.days.ago
      u.save!
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      Worker.process_queues
      u.reload
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
    end

    it "should not auto-expire a communicator signed up as a communicator role" do
      u = User.create(:settings => {'preferences' => {'registration_type' => 'communicator'}})
      expect(u.communicator_role?).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(true)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.expires_at = 2.days.ago
      u.save!
      expect(u.communicator_role?).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      Worker.process_queues
      u.reload
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
    end
  
    it "should correctly auto-expire a communicator role into needing a subscription" do
      u = User.create
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(true)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.expires_at = 2.days.ago
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
    end
    
    it "should give a communicator that has purchased the app and expires, ongoing limited permissions" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(true)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.expires_at = 2.days.ago
      expect(u.fully_purchased?).to eq(false)
      expect(u.fully_purchased?(true)).to eq(false)
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)

      u.settings['past_purchase_durations'] = [{'role' => 'communicator', 'duration' => 3.years.to_i}]
      expect(u.fully_purchased?).to eq(true)
      expect(u.fully_purchased?(true)).to eq(true)
      expect(u.any_premium_or_grace_period?(true)).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(true)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)

      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '234567',
        'seconds_to_add' => 2.years.to_i
      })
      expect(res).to eq(true)
      expect(u.reload.expires_at).to be >= 2.years.from_now - 1.week
      expect(Time).to receive(:now).and_return(3.years.from_now).at_least(1).times
      expect(u.fully_purchased?).to eq(true)
      expect(u.any_premium_or_grace_period?(true)).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(true)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
    end
    
    it "should give a communicator ongoing limited permissions only after they've subscribed for a while" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(true)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.settings['subscription']['started'] = 23.months.ago.iso8601
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(true)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.settings['subscription']['started'] = 2.years.ago.iso8601
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(true)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(true)
      
      res = u.update_subscription({
        'unsubscribe' => true,
        'subscription_id' => '12345'
      })
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.fully_purchased?).to eq(true)
      expect(u.grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)

      u.expires_at = 2.days.ago
      expect(u.any_premium_or_grace_period?(true)).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(false)
      expect(u.fully_purchased?).to eq(true)
      expect(u.grace_period?).to eq(false)
      expect(u.premium_supporter?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.lapsed_communicator?).to eq(true)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
    end
    
    it "should give a communicator that hasn't expired correct cloud extra permissions" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(true)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
    end
    
    it "should give a communicator that has a current subscription correct cloud extra permissions" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(true)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
    end
    
    it "should give a supporter that paid limited extra permissions, even after expiration" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'slp_long_term_50',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.expires_at).to_not eq(nil)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(false)
      expect(u.supporter_role?).to eq(true)
      expect(u.fully_purchased?).to eq(false)
      
      u.settings['past_purchase_durations'] = [{'role' => 'communicator', 'duration' => 3.years.to_i}]
      u.expires_at = 2.days.ago
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(false)
      expect(u.supporter_role?).to eq(true)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should do nothing when a paid supporter expires" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'slp_long_term_50',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.expires_at).to_not eq(nil)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(false)
      expect(u.supporter_role?).to eq(true)
      expect(u.fully_purchased?).to eq(false)
      
      u.settings['past_purchase_durations'] = [{'role' => 'communicator', 'duration' => 3.years.to_i}]
      u.expires_at = 2.days.ago
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(false)
      expect(u.supporter_role?).to eq(true)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should do nothing when a paid eval account expires" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'eval_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.expires_at).to_not eq(nil)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.eval_account?).to eq(true)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(false)
      
      u.settings['past_purchase_durations'] = [{'role' => 'communicator', 'duration' => 3.years.to_i}]
      u.expires_at = 2.days.ago
      expect(u.billing_state).to eq(:eval_communicator)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.premium_supporter?).to eq(false)
      expect(u.eval_account?).to eq(true)
      expect(u.lapsed_communicator?).to eq(false)
      expect(u.expired_communicator?).to eq(false)
      expect(u.modeling_only?).to eq(false)
      expect(u.org_sponsored?).to eq(false)
      expect(u.full_premium?).to eq(true)
      expect(u.never_expires?).to eq(false)
      expect(u.grace_period?).to eq(false)
      expect(u.long_term_purchase?).to eq(false)
      expect(u.recurring_subscription?).to eq(false)
      expect(u.communicator_role?).to eq(true)
      expect(u.supporter_role?).to eq(false)
      expect(u.fully_purchased?).to eq(true)
    end
  end

  describe "update_subscription_organization" do
    it "should send a notification when an organization is assigned" do
      u = User.create
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_assigned, u.global_id, nil)
      u.update_subscription_organization(-1)
    end
    
    it "should not notify when same org is re-assigned" do
      u = User.create
      o = Organization.create(settings: {:total_licenses => 1})
      o.add_user(u.user_name, false, true)
      u.reload
      expect(UserMailer).not_to receive(:schedule_delivery)
      u.update_subscription_organization(o.global_id)
    end
    
    it "should save any remaining subscription time when assigning to an organization" do
      u = User.create(:expires_at => 1000.seconds.from_now)
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_assigned, u.global_id, nil)
      u.update_subscription_organization(-1)
      expect(u.settings['subscription']['seconds_left']).to be > 995
      expect(u.settings['subscription']['seconds_left']).to be < 1001
    end
    
    it "should update settings when assigning to an org" do
      u = User.create
      o = Organization.create
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_assigned, u.global_id, o.global_id)
      u.update_subscription_organization(o.global_id)
      expect(u.settings['subscription']['added_to_organization']).to be > (Time.now - 5).iso8601
      expect(u.settings['subscription']['added_to_organization']).to be < (Time.now + 5).iso8601
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'process_subscription_token', 'arguments' => ['token', 'unsubscribe']})).to eq(true)
    end
    
    it "should notify when org is removed" do
      u = User.create
      o = Organization.create(settings: {:total_licenses => 1})
      o.add_user(u.user_name, false, true)
      u.reload
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_unassigned, u.global_id, o.global_id)
      expect(RemoteAction.where(action: 'notify_unassigned').count).to eq(0)
      u.update_subscription_organization("r#{o.global_id}")
      ra = RemoteAction.where(action: 'notify_unassigned').last
      expect(ra).to_not eq(nil)
      RemoteAction.where(id: ra.id).update_all(act_at: 5.seconds.ago)
      expect(ra.action).to eq('notify_unassigned')
      expect(ra.path).to eq("#{u.global_id}::#{o.global_id}")
      Uploader.remote_remove_batch
    end
    
    it "should not notify if no org set before or now" do
      u = User.create
      expect(UserMailer).not_to receive(:schedule_delivery)
      u.update_subscription_organization(nil)
    end
    
    it "should restore any remaining subscription time when removing from an org" do
      u = User.create(:settings => {'subscription' => {'seconds_left' => 12.weeks.to_i}})
      o = Organization.create(settings: {:total_licenses => 1})
      o.add_user(u.user_name, false, true)
      u.reload
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_unassigned, u.global_id, o.global_id)
      expect(Organization.sponsored?(u)).to eq(true)
      expect(RemoteAction.where(action: 'notify_unassigned').count).to eq(0)
      u.update_subscription_organization("r#{o.global_id}")
      expect(u.expires_at.to_i).to eq(12.weeks.from_now.to_i)
      ra = RemoteAction.where(action: 'notify_unassigned').last
      expect(ra).to_not eq(nil)
      RemoteAction.where(id: ra.id).update_all(act_at: 5.seconds.ago)
      expect(ra.action).to eq('notify_unassigned')
      expect(ra.path).to eq("#{u.global_id}::#{o.global_id}")
      Uploader.remote_remove_batch
    end
    
    it "should always give at least a grace period when removing from an org" do
      u = User.create(:settings => {'subscription' => {'seconds_left' => 10.minutes.to_i}}, :expires_at => 2.hours.from_now)
      o = Organization.create(settings: {:total_licenses => 1})
      o.add_user(u.user_name, false, true)
      u.reload
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_unassigned, u.global_id, o.global_id)
      expect(RemoteAction.where(action: 'notify_unassigned').count).to eq(0)
      u.update_subscription_organization("r#{o.global_id}")
      expect(u.expires_at.to_i).to be > (2.weeks.from_now.to_i - 10)
      expect(u.expires_at.to_i).to be < (2.weeks.from_now.to_i + 10)
      ra = RemoteAction.where(action: 'notify_unassigned').last
      expect(ra).to_not eq(nil)
      RemoteAction.where(id: ra.id).update_all(act_at: 5.seconds.ago)
      expect(ra.action).to eq('notify_unassigned')
      expect(ra.path).to eq("#{u.global_id}::#{o.global_id}")
      Uploader.remote_remove_batch
    end
    
    it "should update settings when removing from an org" do
      u = User.create(:settings => {'subscription' => {'started' => Time.now.iso8601, 'added_to_organization' => Time.now.iso8601}})
      o = Organization.create(settings: {:total_licenses => 1})
      o.add_user(u.user_name, false, true)
      u.reload
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_unassigned, u.global_id, o.global_id)
      expect(RemoteAction.where(action: 'notify_unassigned').count).to eq(0)
      u.update_subscription_organization("r#{o.global_id}")
      expect(u.expires_at.to_i).to be > (2.weeks.from_now.to_i - 10)
      # expect(u.expires_at.to_i).to be < (2.weeks.from_now.to_i + 10)
      expect(u.settings['subscription']['started']).to eq(nil)
      expect(u.settings['subscription']['added_to_organization']).to eq(nil)
      ra = RemoteAction.where(action: 'notify_unassigned').last
      expect(ra).to_not eq(nil)
      RemoteAction.where(id: ra.id).update_all(act_at: 5.seconds.ago)
      expect(ra.action).to eq('notify_unassigned')
      expect(ra.path).to eq("#{u.global_id}::#{o.global_id}")
      Uploader.remote_remove_batch
    end
    
    it "should allow adding a a pending user to an org" do
      u = User.create
      o = Organization.create
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_assigned, u.global_id, o.global_id)
      u.update_subscription_organization(o.global_id, true)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_user',
        'state' => {
          'pending' => true,
          'sponsored' => true,
          'eval' => false,
          'added' => links[0]['state']['added']
        }
      }])
      expect(u.expires_at).to eq(nil)
      expect(u.settings['subscription']['added_to_organization']).to eql(Time.now.iso8601)
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'subscription_token', 'arguments' => ['token', 'unsubscribe']})).to eq(false)
    end

    it "should allow adding an unsponsored user to an org" do
      u = User.create
      o = Organization.create
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_assigned, u.global_id, o.global_id)
      u.update_subscription_organization(o.global_id, false, false)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_user',
        'state' => {
          'pending' => false,
          'sponsored' => false,
          'eval' => false,
          'added' => links[0]['state']['added']
        }
      }])
      expect(u.expires_at).to_not eq(nil)
      expect(Time.parse(u.settings['subscription']['added_to_organization'])).to be > 5.seconds.ago
      expect(Time.parse(u.settings['subscription']['added_to_organization'])).to be < 5.seconds.from_now
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'subscription_token', 'arguments' => ['token', 'unsubscribe']})).to eq(false)
    end
    
    it "should cancel a user's monthly subscription when they accept an invitation to be sponsored by an org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      u.update_subscription_organization(o.global_id, false, true)
      expect(Worker.scheduled?(User, :perform_action, {
        'id' => u.id,
        'method' => 'process_subscription_token',
        'arguments' => ['token', 'unsubscribe']
      })).to eq(true)
    end
  
    it "should not cancel a user's monthly subscription when they are invited to be sponsored by an org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      u.update_subscription_organization(o.global_id, true, true)
      expect(Worker.scheduled?(User, :perform_action, {
        'id' => u.id,
        'method' => 'process_subscription_token',
        'arguments' => ['token', 'unsubscribe']
      })).to eq(false)
    end
  
    it "should not cancel a users's monthly subscription when they accept an unsponsored invitation to be added by an org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      u.update_subscription_organization(o.global_id, false, false)
      expect(Worker.scheduled?(User, :perform_action, {
        'id' => u.id,
        'method' => 'process_subscription_token',
        'arguments' => ['token', 'unsubscribe']
      })).to eq(false)
    end
    
    it "should set eval accounts as eval users" do
      u = User.create
      o = Organization.create(:settings => {'total_eval_licenses' => 1})
      o.add_user(u.user_name, false, true, true)
      expect(u.reload.eval_account?).to eq(true)
    end

    it "for a paid supporter who switches and purchases a communicator account, not double-extend expiration" do
      u = User.create
      u.expires_at = Time.now
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 5.years.to_i
      })
      expect(u.settings['preferences']['role']).to eq('supporter')
      expect(u.billing_state).to eq(:premium_supporter)      
      expect(u.expires_at).to be < 6.years.from_now
      expect(u.expires_at).to be > 4.years.from_now

      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '234567',
        'seconds_to_add' => 5.years.to_i
      })
      expect(u.settings['preferences']['role']).to eq('communicator')
      expect(u.billing_state).to eq(:long_term_active_communicator)      
      expect(u.expires_at).to be < 6.years.from_now
      expect(u.expires_at).to be > 4.years.from_now
    end
  end
  
  describe "update_subscription" do
    it "should ignore unrecognized messages" do
      u = User.create
      res = u.update_subscription({})
      expect(res).to eq(false)
      
      res = u.update_subscription({'jump' => true})
      expect(res).to eq(false)
    end
    
    it "should be idempotent" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(res).to eq(true)
      expect(u.settings['subscription']['started']).to be > (Time.now - 5).iso8601
      u.settings['subscription']['started'] = (Time.now - 1000).iso8601

      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(res).to eq(false)
      expect(u.settings['subscription']['started']).to be < 5.seconds.ago.iso8601
    end
    
    describe "subscribe" do    
      it "should parse subscribe events" do
        u = User.create
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'customer_id' => '23456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['customer_id']).to eq('23456')
        expect(u.settings['subscription']['plan_id']).to eq('monthly_6')
        expect(u.settings['subscription']['started']).to eq(Time.now.iso8601)
        expect(u.expires_at).to eq(nil)
      end
    
      it "should ignore repeat subscribe events" do
        u = User.create
        started = 6.months.ago.iso8601
        u.settings['subscription'] = {
          'subscription_id' => '12345',
          'customer_id' => '56789',
          'plan_id' => 'monthly_5',
          'started' => started
        }
        u.expires_at = nil
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'customer_id' => '23456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(false)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['customer_id']).to eq('56789')
        expect(u.settings['subscription']['plan_id']).to eq('monthly_5')
        expect(u.settings['subscription']['started']).to eq(started)
        expect(u.expires_at).to eq(nil)
      end
      
      it "should not fail without a customer_id whether or not it's a free plan" do
        u = User.create
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '123456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
      end
      
      it "should  fail if trying to parse the same subscription_id again" do
        u = User.create
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(false)
      end

      it "should remember old customer_ids" do
        u = User.create
        u.settings['subscription'] = {'customer_id' => '54321'}
        expect(u.settings['subscription']['prior_customer_ids']).to eq(nil)
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'customer_id' => '23456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['prior_customer_ids']).to eq(['54321'])
      end
    
      it "should save any remaining long-term purchase time when subscribing" do
        u = User.create(:expires_at => 3.months.from_now)
        time_diff = (3.months.from_now - Time.now).to_i
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'customer_id' => '23456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['customer_id']).to eq('23456')
        expect(u.settings['subscription']['plan_id']).to eq('monthly_6')
        expect(u.settings['subscription']['started']).to be > (Time.now - 2).iso8601
        expect(u.settings['subscription']['started']).to be < (Time.now + 2).iso8601
        expect(u.settings['subscription']['seconds_left']).to be > (time_diff - 100)
        expect(u.settings['subscription']['seconds_left']).to be < (time_diff + 100)
        expect(u.expires_at).to eq(nil)        
      end
      
      it "should not update anything on a repeat update" do
        u = User.create
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['started']).to be > (Time.now - 5).iso8601
        u.settings['subscription']['started'] = (Time.now - 1000).iso8601

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(false)
        expect(u.settings['subscription']['started']).to be < 5.seconds.ago.iso8601
      end
      
      it "should not update for an old update" do
        u = User.create
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345'])

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '123456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['subscription_id']).to eq('123456')
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345', '123456'])
        
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(false)
        expect(u.settings['subscription']['subscription_id']).to eq('123456')
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345', '123456'])
      end
      
      it "should not update for an old update when a purchase happened" do
        u = User.create
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['started']).to_not eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345'])

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '123456',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['started']).to_not eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq('123456')
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345', '123456'])

        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq('23456')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq([])
        expect(u.settings['subscription']['subscription_id']).to eq(nil)
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345', '123456'])
        expect(u.expires_at).to_not eq(nil)
        
        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(false)
        expect(u.expires_at).to_not eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq(nil)
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345', '123456'])
      end
    end
    
    describe "unsubscribe" do
      it "should parse unsubscribe events" do
        u = User.create
        u.settings['subscription'] = {
          'subscription_id' => '12345',
          'started' => 3.months.ago.iso8601,
          'plan_id' => 'monthly_8'
        }
        u.expires_at = nil
        
        res = u.update_subscription({
          'unsubscribe' => true,
          'subscription_id' => '12345'
        })
        
        expect(res).to eq(true)
        expect(u.settings['subscription']['subscription_id']).to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['plan_id']).to eq(nil)
        expect(u.expires_at.to_i).to be > (2.weeks.from_now.to_i - 5)
        expect(u.expires_at.to_i).to be < (2.weeks.from_now.to_i + 5)
      end
      
      it "should ignore if not for the currently-set subscription" do
        u = User.create
        u.settings['subscription'] = {
          'subscription_id' => '12345',
          'started' => 3.months.ago.iso8601,
          'plan_id' => 'monthly_8'
        }
        u.expires_at = nil
        
        res = u.update_subscription({
          'unsubscribe' => true,
          'subscription_id' => '123456'
        })
        
        expect(res).to eq(false)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['started']).to eq(3.months.ago.iso8601)
        expect(u.settings['subscription']['plan_id']).to eq('monthly_8')
        expect(u.expires_at).to eq(nil)
      end
      
      it "should always unsubscribe if subscription_id passed as 'all'" do
        u = User.create
        u.settings['subscription'] = {
          'subscription_id' => '12345',
          'started' => 3.months.ago.iso8601,
          'plan_id' => 'monthly_8'
        }
        u.expires_at = nil
        
        res = u.update_subscription({
          'unsubscribe' => true,
          'subscription_id' => 'all'
        })
        
        expect(res).to eq(true)
        expect(u.settings['subscription']['subscription_id']).to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['plan_id']).to eq(nil)
        expect(u.expires_at.to_i).to be > (2.weeks.from_now.to_i - 4)
        expect(u.expires_at.to_i).to be < (2.weeks.from_now.to_i + 4)
      end
      
      it "should restore any remaining time credits when unsubscribing" do
        u = User.create
        u.settings['subscription'] = {
          'subscription_id' => '12345',
          'started' => 3.months.ago.iso8601,
          'plan_id' => 'monthly_8',
          'seconds_left' => 8.weeks.to_i
        }
        u.expires_at = nil
        
        res = u.update_subscription({
          'unsubscribe' => true,
          'subscription_id' => '12345'
        })
        
        expect(res).to eq(true)
        expect(u.expires_at.to_i).to eq(8.weeks.from_now.to_i)
      end
      
      it "should always leave at least a window of time to handle re-subscribing" do
        u = User.create
        u.settings['subscription'] = {
          'subscription_id' => '12345',
          'started' => 3.months.ago.iso8601,
          'plan_id' => 'monthly_8'
        }
        u.expires_at = nil
        
        res = u.update_subscription({
          'unsubscribe' => true,
          'subscription_id' => '12345'
        })
        
        expect(res).to eq(true)
        expect(u.expires_at.to_i).to eq(2.weeks.from_now.to_i)      
      end
    end
    
    describe "purchase" do
      it "should parse purchase events" do
        u = User.create
        u.expires_at = nil
        u.settings['subscription'] = {'started' => 3.weeks.ago.iso8601}
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['customer_id']).to eq('12345')
        expect(u.settings['subscription']['last_purchase_plan_id']).to eq('long_term_200')
        expect(u.settings['subscription']['last_purchase_id']).to eq('23456')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq([])
        expect(u.expires_at.to_i).to eq(8.weeks.from_now.to_i)
      end
      
      it "should not re-procress already-handled purchase_ids" do
        u = User.create
        u.expires_at = nil
        u.settings['subscription'] = {'started' => 3.weeks.ago.iso8601}
        u.settings['subscription']['prior_purchase_ids'] = ['23456']
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        
        expect(res).to eq(false)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.expires_at).to eq(nil)
      end
      
      it "should not fail without a customer_id whether or not it's a free plan" do
        u = User.create
        u.expires_at = nil
        u.settings['subscription'] = {'started' => 3.weeks.ago.iso8601}
        res = u.update_subscription({
          'purchase' => true,
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        
        u = User.create
        u.expires_at = nil
        u.settings['subscription'] = {'started' => 3.weeks.ago.iso8601}
        res = u.update_subscription({
          'purchase' => true,
          'plan_id' => 'slp_long_term_free',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
      end

      it "should remember prior customer_ids" do
        u = User.create
        u.expires_at = nil
        u.settings['subscription'] = {'started' => 3.weeks.ago.iso8601, 'customer_id' => '54321'}
        expect(u.settings['subscription']['prior_customer_ids']).to eq(nil)
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['prior_customer_ids']).to eq(['54321'])
      end

      it "should not update anything on a repeat update" do
        u = User.create
        u.expires_at = nil
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq('23456')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq([])
        expect(u.expires_at).to_not eq(nil)

        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(false)
      end
      
      it "should not update for an old update" do
        u = User.create
        u.expires_at = nil
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq('23456')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq([])
        expect(u.expires_at).to_not eq(nil)

        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '234567',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq('234567')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq(['23456'])
        expect(u.expires_at).to_not eq(nil)

        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(false)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq('234567')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq(['23456'])
        expect(u.expires_at).to_not eq(nil)
      end

      it "should not update for an old update after switching to recurring" do
        u = User.create
        u.expires_at = nil
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).to eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq('23456')
        expect(u.settings['subscription']['prior_purchase_ids']).to eq([])
        expect(u.expires_at).to_not eq(nil)

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)
        expect(u.settings['subscription']['started']).to_not eq(nil)
        expect(u.settings['subscription']['subscription_id']).to eq('12345')
        expect(u.settings['subscription']['prior_subscription_ids']).to eq(['12345'])
        expect(u.settings['subscription']['last_purchase_id']).to eq(nil)
        expect(u.settings['subscription']['prior_purchase_ids']).to eq(['23456'])
        expect(u.expires_at).to eq(nil)

        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(false)
        expect(u.settings['subscription']).not_to eq(nil)
        expect(u.settings['subscription']['started']).to_not eq(nil)
        expect(u.settings['subscription']['last_purchase_id']).to eq(nil)
        expect(u.settings['subscription']['prior_purchase_ids']).to eq(['23456'])
        expect(u.expires_at).to eq(nil)
      end

      it "should allow re-purchasing for fully_purchased users" do
        u = User.create
        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_200',
          'purchase_id' => '23456',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)

        res = u.update_subscription({
          'subscribe' => true,
          'subscription_id' => '12345',
          'plan_id' => 'monthly_6'
        })
        expect(res).to eq(true)

        res = u.update_subscription({
          'purchase' => true,
          'customer_id' => '12345',
          'plan_id' => 'long_term_50',
          'purchase_id' => '234567',
          'seconds_to_add' => 8.weeks.to_i
        })
        expect(res).to eq(true)
      end
    end
  end
  
  describe "subscription_event" do
    it "should not error on unfound user" do
      u = User.create
      expect(User.subscription_event({'user_id' => 'asdf'})).to eq(false)
      expect(User.subscription_event({'user_id' => u.global_id})).to eq(true)
    end
    
    it "should send a notification for bounced subscription attempts" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_bounced, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'purchase_failed' => true})
    end
    
    it "should send a notification for successful purchases" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'purchase' => true, 'purchase_id' => '1234', 'customer_id' => '2345', 'plan_id' => 'long_term_200', 'seconds_to_add' => 3.weeks.to_i})
    end

    it "should send a notification for successful supporter purchases" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:supporter_purchase_confirmed, u.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'purchase' => true, 'purchase_id' => '1234', 'customer_id' => '2345', 'plan_id' => 'slp_long_term_25', 'seconds_to_add' => 3.weeks.to_i})
    end

    it "should send a notification for successful eval account purchases" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:eval_purchase_confirmed, u.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'purchase' => true, 'purchase_id' => '1234', 'customer_id' => '2345', 'plan_id' => 'eval_long_term_25', 'seconds_to_add' => 3.weeks.to_i})
    end
    
    it "should properly update the user settings depending on the purchase type" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
      t = u.expires_at + 15.weeks
      # TODO: the update is ignoring time left on expires_at and just using now instead
      expect(u.expires_at).to be > 2.weeks.from_now
      User.subscription_event({'user_id' => u.global_id, 'purchase' => true, 'purchase_id' => '1234', 'customer_id' => '2345', 'plan_id' => 'long_term_200', 'seconds_to_add' => 15.weeks.to_i})
      u.reload
      expect(u.settings['subscription']).not_to eq(nil)
      expect(u.settings['subscription']['started']).to eq(nil)
      expect(u.expires_at).to eq(t)

      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:new_subscription, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'subscribe' => true, 'subscription_id' => '1234', 'customer_id' => '2345', 'plan_id' => 'monthly_6'})
      u.reload
      expect(u.settings['subscription']).not_to eq(nil)
      expect(u.settings['subscription']['started']).not_to eq(nil)
      expect(Time.parse(u.settings['subscription']['started'])).to be > 1.minute.ago
    end
    
    it "should not send multiple purchase_confirmed notifications" do
      u = User.create
      u.settings['subscription'] = {'prior_purchase_ids' => ['1234']}
      u.save
      expect(SubscriptionMailer).not_to receive(:schedule_delivery).with(:purchase_confirmed, u.global_id)
      expect(SubscriptionMailer).not_to receive(:schedule_delivery).with(:new_subscription, u.global_id)
      t = u.expires_at + 8.weeks
      User.subscription_event({'user_id' => u.global_id, 'purchase' => true, 'purchase_id' => '1234', 'customer_id' => '2345', 'plan_id' => 'long_term_200', 'seconds_to_add' => 8.weeks.to_i})
    end
    
    it "should not send multiple unsubscribe notifications" do
    end
    
    it "should handle unsubscribe event" do
      u = User.create
      u.settings['subscription'] = {
        'subscription_id' => '12345',
        'started' => 3.months.ago.iso8601,
        'plan_id' => 'monthly_8'
      }
      u.expires_at = nil
      u.save

      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:subscription_expiring, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'unsubscribe' => true, 'subscription_id' => '12345'})
    end
    
    it "should handle chargeback event" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:chargeback_created, u.global_id)
      User.subscription_event({'user_id' => u.global_id, 'chargeback_created' => true})
    end
  end  
  
  describe "process_subscription_token" do
    it "should call purchasing code" do
      u = User.create
      expect(Purchasing).to receive(:purchase).with(u, 'asdf', 'qwer', nil)
      u.process_subscription_token('asdf', 'qwer')
    end
    
    it "should call unsubscribe if specified" do
      u = User.create
      expect(Purchasing).to receive(:unsubscribe).with(u)
      u.process_subscription_token('token', 'unsubscribe')
    end

    it 'should support extras purchases' do
      u = User.create
      expect(Purchasing).to receive(:purchase_symbol_extras).with('token', {'user_id' => u.global_id})
      u.process_subscription_token('token', 'extras')
    end
  end

  describe "verify_receipt" do
    it "should call purchasing code" do
      u = User.create
      expect(Purchasing).to receive(:verify_receipt).with(u, {'a' => 1, 'b' => 'asdf', 'c' => true})
      u.verify_receipt({'a' => 1, 'b' => 'asdf', 'c' => true})
    end
  end

  describe 'purchase_extras' do
    it 'should error no invalid user' do
      expect { User.purchase_extras({}) }.to raise_error('user not found')
    end

    it 'should update user extras information' do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something', 'purchase_id' => '123', 'customer_id' => '234'})
      expect(u.reload.settings['subscription']['extras'].except('sources')).to eq({
        'enabled' => true,
        'purchase_id' => '123',
        'customer_id' => '234',
        'source' => 'something'
      })
      expect(u.subscription_hash['extras_enabled']).to eq(true)
    end

    it 'should save previous extras information events' do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something', 'purchase_id' => '123', 'customer_id' => '234'})
      extras = u.reload.settings['subscription']['extras']
      expect(extras['sources'].length).to eq(1)
      extras.delete('sources')
      expect(extras).to eq({
        'enabled' => true,
        'purchase_id' => '123',
        'customer_id' => '234',
        'source' => 'something'
      })

      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something.else', 'purchase_id' => '234'})
      expect(u.reload.settings['subscription']['extras'].except('sources')).to eq({
        'enabled' => true,
        'purchase_id' => '234',
        'customer_id' => nil,
        'source' => 'something.else'
      })
      expect(u.settings['subscription']['extras']['sources'].map{|s| s['source'] }).to eq(['something', 'something.else'])
    end

    it 'should create an audit event' do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something', 'purchase_id' => '123', 'customer_id' => '234'})
      expect(u.reload.settings['subscription']['extras'].except('sources')).to eq({
        'enabled' => true,
        'purchase_id' => '123',
        'customer_id' => '234',
        'source' => 'something'
      })
      ae = AuditEvent.last
      expect(ae.event_type).to eq('extras_added')
      expect(ae.data['source']).to eq('something')
    end

    it 'should notify if specified and has changed' do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:extras_purchased, u.global_id)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something', 'purchase_id' => '123', 'customer_id' => '234', 'notify' => true})
      ae = AuditEvent.last
      expect(ae).to_not eq(nil)
      expect(ae.event_type).to eq('extras_added')
      expect(ae.created_at).to be > 5.seconds.ago
    end

    it 'should not notify if specified but not changed' do
      u = User.create
      u.settings['subscription'] = {'extras' => {'enabled' => true}}
      u.save
      expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:extras_purchased, u.global_id)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something', 'purchase_id' => '123', 'customer_id' => '234', 'notify' => true})
      ae = AuditEvent.last
      expect(ae).to eq(nil)
    end

    it 'should not notify if not specified but changed' do
      u = User.create
      expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:extras_purchased, u.global_id)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'something', 'purchase_id' => '123', 'customer_id' => '234'})
      ae = AuditEvent.last
      expect(ae).to_not eq(nil)
      expect(ae.event_type).to eq('extras_added')
      expect(ae.created_at).to be > 5.seconds.ago
   end

    it "should mark org_id if specified" do
      u = User.create
      expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:extras_purchased, u.global_id)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'org_added', 'org_id' => 'asdf', 'notify' => true})
      expect(u.reload.settings['subscription']['extras']['enabled']).to eq(true)
      expect(u.reload.settings['subscription']['extras']['org_id']).to eq('asdf')
    end

    it "should mark as first_enabling if true" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:extras_purchased, u.global_id)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'org_added', 'org_id' => 'asdf', 'notify' => true, 'new_activation' => true})
      expect(u.reload.settings['subscription']['extras']['enabled']).to eq(true)
      expect(u.reload.settings['subscription']['extras']['org_id']).to eq('asdf')
    end

    it "should error when trying to add extras from an org but the user has already purchased" do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'coolness'})
      expect { User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'org_added', 'org_id' => 'asdf'}) }.to raise_error("extras already activated for user")
    end

    it "should allow adding supporters" do
      u = User.create
      User.purchase_extras({'premium_supporters' => 5, 'user_id' => u.global_id, 'source' => 'coolness'})
      expect(u.reload.settings['subscription']['extras']).to eq(nil)
      expect(u.premium_supporter_grants).to eq(5)
    end

    it "should not add supporters unless specified" do
      u = User.create
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:extras_purchased, u.global_id)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id, 'source' => 'org_added', 'org_id' => 'asdf', 'notify' => true, 'new_activation' => true})
      expect(u.reload.settings['subscription']['extras']['enabled']).to eq(true)
      expect(u.reload.settings['subscription']['extras']['org_id']).to eq('asdf')
      expect(u.premium_supporter_grants).to eq(0)
    end

    it "should add supporters multiple times if called multiple times with different purchase_ids" do
      u = User.create
      User.purchase_extras({'purchase_id' => 'part1', 'premium_supporters' => 5, 'user_id' => u.global_id, 'source' => 'coolness'})
      expect(u.reload.settings['subscription']['extras']).to eq(nil)
      expect(u.premium_supporter_grants).to eq(5)
      User.purchase_extras({'purchase_id' => 'part2', 'premium_supporters' => 5, 'user_id' => u.global_id, 'source' => 'coolness'})
      expect(u.reload.settings['subscription']['extras']).to eq(nil)
      expect(u.premium_supporter_grants).to eq(10)
    end

    it "should not add supporters multiple times if called multiple times with the same purchase_id" do
      u = User.create
      User.purchase_extras({'purchase_id' => 'part1', 'premium_supporters' => 5, 'user_id' => u.global_id, 'source' => 'coolness'})
      expect(u.reload.settings['subscription']['extras']).to eq(nil)
      expect(u.premium_supporter_grants).to eq(5)
      User.purchase_extras({'purchase_id' => 'part1', 'premium_supporters' => 5, 'user_id' => u.global_id, 'source' => 'coolness'})
      expect(u.reload.settings['subscription']['extras']).to eq(nil)
      expect(u.premium_supporter_grants).to eq(5)
    end
  end

  describe "deactivate_extras" do
    it "should raise error with invalid on unpurchased user id" do
      u = User.create
      expect { User.deactivate_extras({'user_id' => 'asdf'}) }.to raise_error("extras not activated")
      u = User.create
      expect { User.deactivate_extras({'user_id' => u.global_id}) }.to raise_error("extras not activated")
    end

    it "should raise error if not org-added extras" do
      u = User.create
      u.settings['subscription'] = {'extras' => {'enabled' => true}}
      u.save
      expect { User.deactivate_extras({'user_id' => u.global_id}) }.to raise_error("only org-added extras can be deactivated")
    end

    it "should raise error if deactivating from the wrong org" do
      u = User.create
      o = Organization.create
      u.settings['subscription'] = {'extras' => {'enabled' => true, 'source' => 'org_added', 'org_id' => 'asdf'}}
      u.save
      expect { User.deactivate_extras({'user_id' => u.global_id, 'org_id' => o.global_id}) }.to raise_error("deactivating from the wrong org")
    end

    it "should disable the extras if everything checks out" do
      u = User.create
      o = Organization.create
      u.settings['subscription'] = {'extras' => {'enabled' => true, 'source' => 'org_added', 'org_id' => o.global_id}}
      u.save
      User.deactivate_extras({'user_id' => u.global_id, 'org_id' => o.global_id})
      expect(u.reload.settings['subscription']['extras']['enabled']).to eq(false)
    end
  end

  describe "billing_state" do
    it "for a paid supporter who switches to a communicator, set as expired" do
      u = User.create
      u.expires_at = Time.now
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 5.years.to_i
      })
      expect(u.settings['preferences']['role']).to eq('supporter')
      expect(u.billing_state).to eq(:premium_supporter)      

      u.settings['preferences']['role'] = 'communicator'
      u.save
      expect(u.billing_state).to eq(:expired_communicator)
    end
  end

  describe "subscription_hash" do
    it "should correctly identify long-term subscription entries" do
      u = User.new
      u.settings = {}
      u.expires_at = 2.weeks.from_now
      u.settings['subscription'] = {"token_summary"=>nil, "last_purchase_plan_id"=>"long_term_300", "free_premium"=>false, "prior_purchase_ids"=>["aaa", "bbb"]}
      expect(u.subscription_hash).not_to eq(nil)
      expect(u.subscription_hash['active']).to eq(true)
      expect(u.subscription_hash['plan_id']).to eq('long_term_300')
      expect(u.subscription_hash['purchased']).to eq(true)
      expect(u.subscription_hash['grace_period']).to eq(nil)
    end

    it "should not change when a premium_supporter expires" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash

      u.expires_at = 2.days.ago
      u.settings['subscription']['last_purchased'] = 3.years.ago.iso8601
      hash2 = u.subscription_hash

      # timestamp is set by Time.now on each call; compare meaningful fields only
      expect(hash.except('timestamp')).to eq(hash2.except('timestamp'))
    end

    it "should change when a paid communicator expires" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'long_term_200',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash
      expect(hash['billing_state']).to eq(:long_term_active_communicator)
      expect(hash['active']).to eq(true)
      expect(hash['plan_id']).to eq('long_term_200')
      expect(hash['expires']).to_not eq(nil)

      u.expires_at = 2.days.ago
      u.settings['subscription']['last_purchased'] = 3.years.ago.iso8601
      hash2 = u.subscription_hash
      expect(hash2['billing_state']).to eq(:lapsed_communicator)
      expect(hash2['active']).to eq(nil)
      expect(hash2['plan_id']).to eq(nil)
      expect(hash2['expires']).to eq(nil)
    end

    it "should change when a free trial ends without purchase" do
      u = User.create
      hash = u.subscription_hash
      expect(hash['billing_state']).to eq(:trialing_communicator)
      expect(hash['grace_period']).to eq(true)
      expect(hash['active']).to eq(nil)
      expect(hash['expires']).to_not eq(nil)

      u.expires_at = 2.days.ago
      hash2 = u.subscription_hash
      expect(hash2['billing_state']).to eq(:expired_communicator)
      expect(hash2['active']).to eq(nil)
      expect(hash2['grace_period']).to eq(nil)
      expect(hash2['expires']).to eq(nil)
    end

    it "should not change then an eval account expires" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'eval_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash

      u.expires_at = 2.days.ago
      u.settings['subscription']['last_purchased'] = 3.years.ago.iso8601
      hash2 = u.subscription_hash

      expect(hash).to eq(hash2)
    end

    it "should change when an active subscription is canceled" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'customer_id' => '1234',
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(res).to eq(true)
      expect(u.recurring_subscription?).to eq(true)
      hash = u.subscription_hash
      expect(hash['billing_state']).to eq(:subscribed_communicator)
      expect(hash['grace_period']).to eq(nil)
      expect(hash['active']).to eq(true)
      expect(hash['plan_id']).to eq('monthly_6')
      expect(u.settings['subscription']['expiration_source']).to eq('subscribe')

      res = u.update_subscription({
        'unsubscribe' => true,
        'subscription_id' => '12345'
      })
      expect(res).to eq(true)
      hash2 = u.reload.subscription_hash
      expect(hash2['billing_state']).to eq(:grace_period_communicator)
      expect(hash2['grace_period']).to eq(true)
      expect(hash2['active']).to eq(nil)
      expect(hash2['plan_id']).to eq(nil)
    end

    it "should change when a modeling_only account finishes its free trial" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_free',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash

      u.expires_at = 2.days.ago
      u.settings['subscription']['last_purchased'] = 3.years.ago.iso8601
      hash2 = u.subscription_hash

      expect(hash).to eq(hash2)
    end

    it "should change when a paid communicator switches to supporter" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'long_term_200',
        'seconds_to_add' => 5.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash
      expect(hash['billing_state']).to eq(:long_term_active_communicator)
      expect(hash['premium_supporter_plus_communicator']).to eq(nil)

      u.settings['preferences']['role'] = 'supporter'
      hash2 = u.subscription_hash

      expect(hash).to_not eq(hash2)
      expect(hash2['billing_state']).to eq(:premium_supporter)
      expect(hash2['premium_supporter_plus_communicator']).to eq(true)
    end

    it "should not allow a paid supporter to switch to an eval communicator??" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'seconds_to_add' => 5.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash
      expect(hash['billing_state']).to eq(:premium_supporter)

      u.settings['preferences']['role'] = 'communicator'
      hash2 = u.subscription_hash

      expect(hash).to_not eq(hash2)
      expect(hash2['billing_state']).to eq(:expired_communicator)
    end

    it "should allow an eval account to switch to a paid supporter??" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'eval_long_term_25',
        'seconds_to_add' => 5.years.to_i
      })
      expect(res).to eq(true)
      hash = u.subscription_hash
      expect(hash['billing_state']).to eq(:eval_communicator)

      u.settings['preferences']['role'] = 'supporter'
      hash2 = u.subscription_hash

      expect(hash).to_not eq(hash2)
      expect(hash2['billing_state']).to eq(:premium_supporter)
    end
  end
  
  describe "check_for_subscription_updates" do
    it "should return a tally result" do
      res = User.check_for_subscription_updates
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(0)
      expect(res[:expired]).to eq(0)
    end
    
    it "should find expiring users" do
      u1 = User.create(:expires_at => 2.weeks.from_now)
      u2 = User.create(:expires_at => 6.days.from_now)
      u3 = User.create(:expires_at => 25.hours.from_now)
      u4 = User.create(:expires_at => 5.minutes.from_now)
      res = User.check_for_subscription_updates
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(2)
    end
    
    it "should find recently-expired users" do
      u1 = User.create(:expires_at => 2.weeks.from_now)
      u2 = User.create(:expires_at => 6.days.from_now)
      u3 = User.create(:expires_at => 1.minute.ago)
      u4 = User.create(:expires_at => 2.days.ago)
      u4 = User.create(:expires_at => 9.days.ago)
      res = User.check_for_subscription_updates
      expect(res).not_to eq(nil)
      expect(res[:expired]).to eq(2)
    end
    
    it "should notify nearly-expiring users" do
      u1 = User.create(:expires_at => 6.days.from_now)
      u2 = User.create(:expires_at => 25.hours.from_now)
      u3 = User.create(:expires_at => 2.days.from_now)
      expect(SubscriptionMailer).to receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(3)
      expect(res[:upcoming_emailed]).to eq(2)
    end

    it "should not notify nearly-expiring users of a paid supported account" do
      u1 = User.create(:expires_at => 6.days.from_now, settings: {preferences: {role: 'supporter'}})
      u2 = User.create(:expires_at => 25.hours.from_now, settings: {preferences: {role: 'supporter'}})
      u3 = User.create(:expires_at => 2.days.from_now, settings: {preferences: {role: 'supporter'}})
      u1.settings['preferences']['role'] = 'supporter'
      u1.save
      u2.settings['preferences']['role'] = 'supporter'
      u2.save
      u3.settings['preferences']['role'] = 'supporter'
      u3.save
      expect(u1.communicator_role?).to eq(false)
      expect(u2.communicator_role?).to eq(false)
      expect(u3.communicator_role?).to eq(false)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(0)
      expect(res[:upcoming_emailed]).to eq(0)
    end

    it "should not notify nearly-expiring users of a paid eval account" do
      u1 = User.create(:expires_at => 6.days.from_now, settings: {preferences: {role: 'supporter'}})
      u2 = User.create(:expires_at => 25.hours.from_now, settings: {preferences: {role: 'supporter'}})
      u3 = User.create(:expires_at => 2.days.from_now, settings: {preferences: {role: 'supporter'}})
      u1.settings['subscription']['eval_account'] = true
      u1.save
      u2.settings['subscription']['eval_account'] = true
      u2.save
      u3.settings['subscription']['eval_account'] = true
      u3.save
      expect(u1.communicator_role?).to eq(true)
      expect(u2.communicator_role?).to eq(true)
      expect(u3.communicator_role?).to eq(true)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(0)
      expect(res[:upcoming_emailed]).to eq(0)
    end

    it "should not notify nearly-expiring users more than once" do
      u1 = User.create(:expires_at => 6.days.from_now)
      u2 = User.create(:expires_at => 25.hours.from_now)
      u3 = User.create(:expires_at => 6.days.from_now, :settings => {'subscription' => {'last_expiring_week_notification' => Time.now.iso8601}})
      u4 = User.create(:expires_at => 25.hours.from_now, :settings => {'subscription' => {'last_expiring_day_notification' => 3.days.ago.iso8601}})
      expect(SubscriptionMailer).to receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(4)
      expect(res[:upcoming_emailed]).to eq(2)
    end
    
    it "should notify recently-expired users" do
      u1 = User.create(:expires_at => 1.hour.ago)
      u2 = User.create(:expires_at => 5.days.ago)
      expect(SubscriptionMailer).to receive(:deliver_message).with(:subscription_expired, u1.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:expired]).to eq(1)
      expect(res[:expired_emailed]).to eq(1)
    end
    
    it "should not notify recently-expired users more than once" do
      u1 = User.create(:expires_at => 1.hour.ago)
      u2 = User.create(:expires_at => 1.hour.ago, :settings => {'subscription' => {'last_expired_notification' => Time.now.iso8601}})
      expect(SubscriptionMailer).to receive(:deliver_message).with(:subscription_expired, u1.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:expired]).to eq(2)
      expect(res[:expired_emailed]).to eq(1)
    end
    
    it "should not notify supervisors that are tied to an org" do
      u1 = User.create(:expires_at => 6.days.from_now)
      u2 = User.create(:expires_at => 25.hours.from_now)
      u3 = User.create(:expires_at => 2.days.from_now)
      o = Organization.create(:settings => {'total_licenses' => 2})
      o.add_supervisor(u1.user_name, false)
      o.add_manager(u2.user_name, true)
      
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(1)
      expect(res[:upcoming_emailed]).to eq(0)
    end
    
    it "should not notify communicators that are tied to an org" do
      u1 = User.create(:expires_at => 6.days.from_now)
      u2 = User.create(:expires_at => 25.hours.from_now)
      u3 = User.create(:expires_at => 2.days.from_now)
      o = Organization.create(:settings => {'total_licenses' => 2})
      u1.update_subscription_organization(o.global_id, true, true)
      u2.update_subscription_organization(o.global_id, true, true)
      
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(1)
      expect(res[:upcoming_emailed]).to eq(0)
    end
    
    it "should not notify supervisors" do
      u1 = User.create(:expires_at => 6.days.from_now, :settings => {'preferences' => {'role' => 'supporter'}})
      u2 = User.create(:expires_at => 25.hours.from_now, :settings => {'preferences' => {'role' => 'supporter'}})
      u3 = User.create(:expires_at => 2.days.from_now)
      expect(u1.communicator_role?).to eq(false)
      expect(u2.communicator_role?).to eq(false)
      expect(u3.communicator_role?).to eq(true)
      
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_week_until_expiration, u1.global_id)
      expect(SubscriptionMailer).to_not receive(:deliver_message).with(:one_day_until_expiration, u2.global_id)
      res = User.check_for_subscription_updates
      
      expect(res).not_to eq(nil)
      expect(res[:upcoming]).to eq(1)
      expect(res[:upcoming_emailed]).to eq(0)
    end
    
    it "should notify recently-created inactive users" do
      u1 = User.create
      b = Board.create(:user => u1, :public => true)
      u2 = User.process_new({'preferences' => {'logging' => true}})
      u3 = User.process_new({'preferences' => {'logging' => true, 'home_board' => {'id' => b.global_id}, 'role' => 'supporter'}})
      u4 = User.process_new({'preferences' => {'logging' => true, 'home_board' => {'id' => b.global_id}}})
      d4 = Device.create(:user => u4)
      u5 = User.process_new({'preferences' => {'logging' => true, 'home_board' => {'id' => b.global_id}}})
      d5 = Device.create(:user => u5)
      Device.where({:user_id => u5.id}).update_all({:updated_at => 10.days.ago})
      u6 = User.create
      u7 = User.process_new({'preferences' => {'logging' => true, 'home_board' => {'id' => b.global_id}, 'role' => 'supporter'}})
      d7 = Device.create(:user => u7)
      User.link_supervisor_to_user(u7, u6)
      User.where({:id => [u1.id, u2.id, u3.id, u4.id, u5.id, u6.id, u7.id]}).update_all({:created_at => 7.days.ago})
      
      ids = []
      expect(UserMailer).to receive(:deliver_message){|message, id|
        ids << id if message == :usage_reminder
      }.at_least(1).times
      res = User.check_for_subscription_updates
      expect(ids.sort).to eq([u1.global_id, u2.global_id, u3.global_id, u5.global_id, u6.global_id])
      expect(res[:recent_less_active]).to eq(5)
    end

    it "should not notify recently-created inactive users more than once" do
      u1 = User.create
      User.where({:id => u1.id}).update_all({:created_at => 7.days.ago})

      expect(UserMailer).to receive(:deliver_message).with(:usage_reminder, u1.global_id)
      res = User.check_for_subscription_updates
      expect(res[:recent_less_active]).to eq(1)
      
      expect(UserMailer).not_to receive(:deliver_message)
      res = User.check_for_subscription_updates
      expect(res[:recent_less_active]).to eq(0)
    end
    
    it "should notify users whose expiration is approaching" do
      u1 = User.create(:expires_at => 3.months.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u1.reload.billing_state).to eq(:long_term_active_communicator)
      u2 = User.create(:expires_at => 3.months.from_now + 2.days, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u2.reload.billing_state).to eq(:long_term_active_communicator)
      u3 = User.create(:expires_at => 2.months.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u3.reload.billing_state).to eq(:long_term_active_communicator)
      u4 = User.create(:expires_at => 1.month.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u4.reload.billing_state).to eq(:long_term_active_communicator)
      u5 = User.create(:expires_at => 1.month.from_now)
      expect(u5.reload.billing_state).to eq(:trialing_communicator)
      
      expect(SubscriptionMailer).to receive(:deliver_message).with(:expiration_approaching, u1.global_id)
      expect(SubscriptionMailer).to receive(:deliver_message).with(:expiration_approaching, u4.global_id)
      res = User.check_for_subscription_updates
      expect(res[:approaching]).to eq(2)
      expect(res[:approaching_emailed]).to eq(2)
    end
    
    it "should not notify users whose expiration is approaching more than once" do
      u1 = User.create(:expires_at => 3.months.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      u1.settings['subscription']['last_approaching_notification'] = 2.days.ago.iso8601
      u1.save
      expect(u1.reload.billing_state).to eq(:long_term_active_communicator)
      u2 = User.create(:expires_at => 3.months.from_now + 2.days, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u2.reload.billing_state).to eq(:long_term_active_communicator)
      u3 = User.create(:expires_at => 2.months.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u3.reload.billing_state).to eq(:long_term_active_communicator)
      u4 = User.create(:expires_at => 1.month.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      u4.settings['subscription']['last_approaching_notification'] = 2.months.ago.iso8601
      u4.save
      expect(u4.reload.billing_state).to eq(:long_term_active_communicator)
      u5 = User.create(:expires_at => 1.month.from_now)
      expect(u5.reload.billing_state).to eq(:trialing_communicator)
      u6 = User.create(:expires_at => 1.month.from_now, :settings => {'subscription' => {'expiration_source' => 'purchase', 'last_purchase_plan_id' => 'asdf'}})
      expect(u6.reload.billing_state).to eq(:long_term_active_communicator)
      u7 = User.create(:expires_at => 1.month.from_now, :settings => {'subscription' => {'started' => 'sometime'}})
      expect(u7.reload.billing_state).to eq(:subscribed_communicator)
      
      expect(SubscriptionMailer).to receive(:deliver_message).with(:expiration_approaching, u4.global_id)
      expect(SubscriptionMailer).to receive(:deliver_message).with(:expiration_approaching, u6.global_id)
      res = User.check_for_subscription_updates
      expect(res[:approaching]).to eq(3)
      expect(res[:approaching_emailed]).to eq(2)

      res = User.check_for_subscription_updates
      expect(res[:approaching]).to eq(3)
      expect(res[:approaching_emailed]).to eq(0)
    end

    it "should not notify org-sponsored supervisors" do
      o = Organization.create
      u1 = User.create(:expires_at => 1.months.from_now, :settings => {'preferences' => {'role' => 'supporter'}, 'subscription' => {'expiration_source' => 'grace'}})
      expect(u1.reload.billing_state).to eq(:grace_period_supporter)
      o.add_supervisor(u1.user_name, false)
      expect(u1.reload.billing_state).to eq(:org_supporter)
      u2 = User.create(:expires_at => 3.months.from_now + 2.days, :settings => {'subscription' => {'started' => 'sometime'}})
      expect(u2.billing_state).to eq(:subscribed_communicator)
      u3 = User.create(:expires_at => 2.months.from_now, :settings => {'subscription' => {'started' => 'sometime'}})
      expect(u3.billing_state).to eq(:subscribed_communicator)
      u4 = User.create(:expires_at => 1.month.from_now, :settings => {'subscription' => {'started' => 'sometime'}})
      expect(u4.billing_state).to eq(:subscribed_communicator)
      u5 = User.create(:expires_at => 1.month.from_now)
      expect(u5.billing_state).to eq(:trialing_communicator)
      
      expect(SubscriptionMailer).to_not receive(:deliver_message)
      res = User.check_for_subscription_updates
      expect(res[:approaching]).to eq(0)
      expect(res[:approaching_emailed]).to eq(0)
    end

    it "should handle org-sponsored premium supporters correctly" do
      o = Organization.create(settings: {'total_supervisor_licenses' => 5})
      u1 = User.create(:expires_at => 1.months.from_now, :settings => {'preferences' => {'role' => 'supporter'}, 'subscription' => {'expiration_source' => 'grace'}})
      expect(u1.reload.billing_state).to eq(:grace_period_supporter)
      o.add_supervisor(u1.user_name, false, true)
      expect(u1.reload.billing_state).to eq(:org_sponsored_supporter)
    end
  end
  
  describe "subscription_override" do
    it "should update for never_expires" do
      u = User.create
      expect(u.subscription_override('never_expires')).to eq(true)
      expect(u.never_expires?).to eq(true)
    end
    
    it "should update for eval type" do
      u = User.create
      expect(u.subscription_override('eval')).to eq(true)
      expect(u.settings['subscription']['eval_account']).to eq(true)
      expect(u.settings['subscription']['limited_premium_purchase']).to eq(false)
      expect(u.settings['subscription']['plan_id']).to eq('eval_monthly_granted')
      expect(u.billing_state).to eq(:eval_communicator)
    end
    
    it "should update for modeler type" do
      u = User.create
      expect(u.subscription_override('manual_modeler')).to eq(true)
      expect(u.billing_state).to eq(:modeling_only)
    end

    it "should return false for unrecognized type" do
      u = User.new
      expect(u.subscription_override('bacon')).to eq(false)
      expect(u.subscription_override('slp_monthly_free')).to eq(false)
    end
    
    it "should update to communicator type" do
      u = User.create
      expect(u.subscription_override('communicator_trial')).to eq(true)
      expect(u.grace_period?).to eq(true)
      expect(u.billing_state).to eq(:trialing_communicator)
      
      u = User.create
      u.subscription_override('eval')
      expect(u.subscription_override('communicator_trial')).to eq(true)
      expect(u.grace_period?).to eq(true)
      expect(u.billing_state).to eq(:trialing_communicator)
      
      u = User.create
      u.subscription_override('manual_supporter')
      expect(u.subscription_override('communicator_trial')).to eq(true)
      expect(u.grace_period?).to eq(true)
      expect(u.billing_state).to eq(:trialing_communicator)
    end
    
    it "should allow adding a voice" do
      u = User.create
      expect(u.settings['premium_voices']).to eq(nil)
      expect(u.subscription_override('add_voice')).to eq(true)
      expect(u.settings['premium_voices']).to_not eq(nil)
      expect(u.settings['premium_voices']['allowed']).to eq(1)
    end

    it "should allow forcing logouts" do
      u = User.create
      d = Device.create(:user => u)
      d.generate_token!
      d2 = Device.create(:user => u)
      d.generate_token!
      expect(d.reload.settings['keys']).to_not eq([])
      expect(d2.reload.settings['keys']).to_not eq([])
      expect(u.subscription_override('force_logout')).to eq(true)
      expect(d.reload.settings['keys']).to eq([])
      expect(d2.reload.settings['keys']).to eq([])
    end
    
    it "should cancel existing subscription when setting to eval account" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'customer_id' => '1234',
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(u.recurring_subscription?).to eq(true)
      
      expect(u.subscription_override('eval')).to eq(true)

      expect(Worker.scheduled?(Purchasing, :cancel_subscription, u.global_id, '1234', '12345')).to eq(true)
    end

    it "should restore purchase duration after accidentally setting to free supervisor" do
      u = User.create
      u.expires_at = Time.now
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
        'seconds_to_add' => 13.weeks.to_i
      })
      expect(u.full_premium?).to eq(true)
      expect(u.fully_purchased?).to eq(false)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.expires_at).to be > 12.weeks.from_now
      expect(u.expires_at).to be < 14.weeks.from_now
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'slp_long_term_free'
      })
      expect(u.reload.modeling_only?).to eq(true)
      expect(u.fully_purchased?).to eq(false)
      expect(u.full_premium?).to eq(false)
      expect(u.settings['subscription']['seconds_left']).to be > 12.weeks.to_i
      expect(u.settings['subscription']['seconds_left']).to be < 14.weeks.to_i
      expect(u.expires_at).to be < 12.weeks.from_now
      expect(u.reload.full_premium?).to eq(false)
      expect(u.reload.premium_supporter?).to eq(false)
      expect(u.reload.any_premium_or_grace_period?).to eq(false)

      expect(u.subscription_override('restore')).to eq(true)
      
      expect(u.reload.any_premium_or_grace_period?).to eq(true)
      expect(u.full_premium?).to eq(true)
      expect(u.reload.modeling_only?).to eq(false)
      expect(u.expires_at).to be > 12.weeks.from_now
      expect(u.expires_at).to be < 14.weeks.from_now
      expect(u.reload.premium_supporter?).to eq(false)
    end

    it "should restore fully_purchased status if a lapsed communicator switches to supervisor and then back to communicator" do
      u = User.create
      u.expires_at = Time.now
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
        'seconds_to_add' => 3.years.to_i
      })
      expect(u.full_premium?).to eq(true)
      expect(u.fully_purchased?).to eq(true)
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect(u.billing_state).to eq(:long_term_active_communicator)

      u.expires_at = 2.days.ago
      u.settings['subscription']['last_purchased'] = 3.years.ago.iso8601
      u.save
      expect(u.fully_purchased?).to eq(true)
      expect(u.billing_state).to eq(:lapsed_communicator)

      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'slp_long_term_free'
      })

      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.reload.modeling_only?).to eq(false)
      expect(u.fully_purchased?).to eq(true)
      expect(u.full_premium?).to eq(false)
      expect(u.settings['subscription']['seconds_left']).to eq(nil)
      expect(u.expires_at).to be < 12.weeks.from_now
      expect(u.reload.full_premium?).to eq(false)
      expect(u.reload.premium_supporter?).to eq(true)
      expect(u.reload.any_premium_or_grace_period?).to eq(true)

      expect(u.subscription_override('restore')).to eq(true)
      
      expect(u.reload.any_premium_or_grace_period?(true)).to eq(true)
      expect(u.reload.any_premium_or_grace_period?).to eq(false)
      expect(u.reload.billing_state).to eq(:lapsed_communicator)
      expect(u.full_premium?).to eq(false)
      expect(u.reload.modeling_only?).to eq(false)
      expect(u.reload.premium_supporter?).to eq(false)
      expect(u.expires_at).to be < 12.weeks.from_now
    end
    
    it "should cancel existing subscription when setting to communicator trial" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'customer_id' => '1234',
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(u.recurring_subscription?).to eq(true)
      
      expect(u.subscription_override('communicator_trial')).to eq(true)

      expect(Worker.scheduled?(Purchasing, :cancel_subscription, u.global_id, '1234', '12345')).to eq(true)
    end
    
    it "should cancel existing subscription when setting to manual supporter" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'customer_id' => '1234',
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(u.billing_state).to eq(:subscribed_communicator)
      expect(u.recurring_subscription?).to eq(true)
      
      expect(u.subscription_override('manual_supporter')).to eq(true)
      expect(u.billing_state).to eq(:premium_supporter)

      expect(Worker.scheduled?(Purchasing, :cancel_subscription, u.global_id, '1234', '12345')).to eq(true)
    end
  end

  describe "fully_purchased?" do
    it "should return true for a purchased communicator" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'long_term_200',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:long_term_active_communicator)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should not return true for a free trial user" do
      u = User.create
      expect(u.billing_state).to eq(:trialing_communicator)
      expect(u.fully_purchased?).to eq(false)
    end

    it "should return true for a never-expires user" do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a purchased eval account" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'eval_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:eval_communicator)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for an eval account changed to a supervisor" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'eval_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:eval_communicator)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'supporter'
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a purchase communicator who has passed the threshold with their current purchase" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'long_term_200',
        'seconds_to_add' => 3.years.to_i
      })
      u.settings['subscription']['last_purchased'] = 3.years.ago.to_i
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:long_term_active_communicator)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a purchase communicator with a future expires_at" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'long_term_200',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:long_term_active_communicator)
      expect(u.fully_purchased?).to eq(true)
    end


    it "should not return true for a gift code communicator who doesn't pass the threshold" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'gift_code',
        'gift_id' => '12345',
        'code' => 'asdf',
        'source_id' => 'gift',
        'seconds_to_add' => 6.months.to_i
      })
      expect(res).to eq(true)
      expect(u.fully_purchased?).to eq(false)
    end

    it "should return true for a gift code communicator who does pass the threshold" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'gift_code',
        'gift_id' => '12345',
        'code' => 'asdf',
        'source_id' => 'gift',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.expires_at).to be > 2.years.from_now
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a subscription that has passed the threshold" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:subscribed_communicator)
      expect(u.fully_purchased?).to eq(false)
      u.settings['subscription']['started'] = 3.years.ago.iso8601
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a long-enough past subscription" do
      u = User.create
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:subscribed_communicator)
      expect(u.fully_purchased?).to eq(false)
      u.settings['subscription']['started'] = 3.years.ago.iso8601
      expect(u.fully_purchased?).to eq(true)
      res = u.update_subscription({
        'unsubscribe' => true,
        'subscription_id' => '12345'
      })
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a long-enough org sponsorship" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      u.update_subscription_organization(o.global_id, false, true)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_user',
        'state' => {
          'pending' => false,
          'sponsored' => true,
          'eval' => false,
          'added' => links[0]['state']['added']
        }
      }])
      link = UserLink.last
      
      added = Time.now - 3.years
      link.data['state']['added'] = added.iso8601
      link.save
      expect(u.reload.org_sponsored?).to eq(true)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 5)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 5)
      expect(u.fully_purchased?).to eq(true)
      expect(Organization.managed?(u)).to eq(true)
      o.reload.remove_user(u.user_name)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 5)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 5)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for a long-enough org supporter" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      expect(u.supporter_role?).to eq(false)
      o.add_supervisor(u.user_name, false)
      expect(u.reload.supporter_role?).to eq(true)
      expect(u.billing_state).to eq(:org_supporter)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_supervisor',
        'state' => {
          'pending' => false,
          'premium' => false,
          'added' => links[0]['state']['added']
        }
      }])
      link = UserLink.last
      
      added = Time.now - 3.years
      link.data['state']['added'] = added.iso8601
      link.save
      expect(u.supporter_role?).to eq(true)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.org_supporter?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 5)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 5)
      expect(u.fully_purchased?).to eq(true)
      o.reload.remove_supervisor(u.user_name)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 5)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 5)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'communicator'
      expect(u.fully_purchased?).to eq(false)
    end

    it "should not return true for a long-enough org supporter changed to a communicator" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      expect(u.supporter_role?).to eq(false)
      o.add_supervisor(u.user_name, false)
      expect(u.reload.supporter_role?).to eq(true)
      expect(u.billing_state).to eq(:org_supporter)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_supervisor',
        'state' => {
          'pending' => false,
          'premium' => false,
          'added' => links[0]['state']['added']
        }
      }])
      link = UserLink.last
      
      added = Time.now - 3.years
      link.data['state']['added'] = added.iso8601
      link.save
      expect(u.supporter_role?).to eq(true)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.org_supporter?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 5)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 5)
      expect(u.fully_purchased?).to eq(true)
      o.reload.remove_supervisor(u.user_name)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 5)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 5)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'communicator'
      expect(u.fully_purchased?).to eq(false)
    end

    it "should return true for a long-enough removed org sponsorship" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      expect(u.supporter_role?).to eq(false)
      o.add_supervisor(u.user_name, false)
      expect(u.reload.supporter_role?).to eq(true)
      expect(u.billing_state).to eq(:org_supporter)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_supervisor',
        'state' => {
          'pending' => false,
          'premium' => false,
          'added' => links[0]['state']['added']
        }
      }])
      link = UserLink.last
      
      added = Time.now - 3.years
      link.data['state']['added'] = added.iso8601
      link.save
      expect(u.supporter_role?).to eq(true)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.org_supporter?).to eq(true)
      expect(u.premium_supporter?).to eq(true)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 100)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 100)
      expect(u.fully_purchased?).to eq(true)
      o.reload.remove_supervisor(u.user_name)
      expect(u.reload.org_sponsored?).to eq(false)
      expect(u.purchase_credit_duration).to be > ((Time.now - added).to_i - 100)
      expect(u.purchase_credit_duration).to be < ((Time.now - added).to_i + 100)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'communicator'
      expect(u.fully_purchased?).to eq(false)
    end

    it "should return true for a purchased supervisor" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'communicator'
      expect(u.fully_purchased?).to eq(false)
    end

    it "should not return true for a purchased supervisor who changed their role to communicator" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'communicator'
      expect(u.fully_purchased?).to eq(false)
      expect(u.billing_state).to eq(:expired_communicator)
    end

    it "should return true for a purchased communicator who changed their role to supervisor" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'long_term_200',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:long_term_active_communicator)
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'supporter'
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.fully_purchased?).to eq(true)
    end

    it "should return true for an expired purchased supervisor" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.fully_purchased?).to eq(true)
      u.settings['subscription']['last_purchased'] = 3.years.ago.iso8601
      u.expires_at = 2.days.ago
      expect(u.fully_purchased?).to eq(true)
      u.settings['preferences']['role'] = 'communicator'
      expect(u.fully_purchased?).to eq(false)
    end

    it "should not return true for an expired purchased supervisor that didn't pass the threshold" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'purchase_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'seconds_to_add' => 3.years.to_i
      })
      expect(res).to eq(true)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u.fully_purchased?).to eq(true)
      u.settings['subscription']['last_purchased'] = 1.years.ago.iso8601
      u.expires_at = 2.days.ago
      expect(u.fully_purchased?).to eq(false)
    end

    it "should not return true for a modeling_only account" do
      u = User.create
      u.settings['preferences']['role'] = 'supporter'
      u.expires_at = 2.days.ago
      expect(u.billing_state).to eq(:modeling_only)
      expect(u.fully_purchased?).to eq(false)
    end
  end
  describe "transfer_subscription_to" do
    it "should move attributes from one user to another" do
      u1 = User.create
      u2 = User.create
      u1.settings['subscription'] = {
        'bacon' => '1234',
        'started' => 1234,
        'token_summary' => 'asdfjkl',
        'never_expires' => true,
        'last_purchase_plan_id' => 'asdf'
      }
      u1.transfer_subscription_to(u2)
      ts = u1.settings['subscription']['transfer_ts']
      expect(ts).to be_within(2).of(Time.now.to_i)
      expect(u1.settings['subscription']).to eq({
        'expiration_source' => 'grace_period',
        'transfer_ts' => ts,
        'transferred_to' => [u2.global_id],
        'bacon' => '1234'
      })
      expect(u2.settings['subscription']).to eq({
        'started' => 1234,
        'token_summary' => 'asdfjkl',
        'expiration_source' => nil,
        'never_expires' => true, 
        'transferred_from' => [u1.global_id],
        'last_purchase_plan_id' => 'asdf'
      })
    end
    
    it "should update the metadata on the subscription customer if there is one" do
      u1 = User.create
      u2 = User.create
      u1.settings['subscription'] = {
        'bacon' => '1234',
        'started' => 1234,
        'token_summary' => 'asdfjkl',
        'never_expires' => true,
        'customer_id' => '222222'
      }
      expect(Purchasing).to receive(:change_user_id).with('222222', u1.global_id, u2.global_id)
      u1.transfer_subscription_to(u2)
      ts = u1.settings['subscription']['transfer_ts']
      expect(ts).to be_within(2).of(Time.now.to_i)
      expect(u1.settings['subscription']).to eq({
        'expiration_source' => 'grace_period',
        'transfer_ts' => ts,
        'transferred_to' => [u2.global_id],
        'bacon' => '1234'
      })
      expect(u2.settings['subscription']).to eq({
        'expiration_source' => nil,
        'started' => 1234,
        'customer_id' => '222222',
        'token_summary' => 'asdfjkl',
        'never_expires' => true, 
        'transferred_from' => [u1.global_id]
      })
    end
  end
  
  describe "reset_eval" do
    it "should clear and store old preferences" do
      u = User.create
      u.settings['preferences'] = {'a' => 1, 'b' => 2}
      u.save
      d = Device.create(user: u)
      u.settings['subscription'] = {'eval_account' => true}
      expect(u.settings['last_preferences']).to eq(nil)
      expect(u.reset_eval(d.global_id)).to eq(true)
      u.reload
      expect(u.settings['preferences']['a']).to eq(nil)
      expect(u.settings['preferences']['b']).to eq(nil)
      expect(u.settings['last_preferences']).to_not eq(nil)
      expect(u.settings['last_preferences']['a']).to eq(1)
      expect(u.settings['last_preferences']['b']).to eq(2)
    end
    
    it "should do nothing if not an eval account" do
      u = User.create
      d = Device.create(user: u)
      expect(u.eval_account?).to eq(false)
      expect(u.reset_eval(d.global_id)).to eq(false)
      expect(u.eval_account?).to eq(false)
    end
    
    it "should restart the eval clock" do
      u = User.create
      u.settings['subscription'] = {'eval_started' => 2.weeks.ago.iso8601, 'eval_expires' => 1.week.ago.iso8601}
      u.save
      d = Device.create(user: u)
      u.settings['subscription'] = {'eval_account' => true}
      u.reset_eval(d.global_id)
      expect(u.settings['subscription']['eval_started']).to be > 1.day.ago.iso8601
      expect(u.settings['subscription']['eval_expires']).to be > 1.week.from_now.iso8601
    end

    it "should delete all devices but the current device" do
      u = User.create
      d = Device.create(user: u)
      10.times{|i| Device.create(user: u) }
      expect(u.devices.count).to eq(11)
      u.settings['subscription'] = {'eval_account' => true}
      u.reset_eval(d.global_id)
      expect(u.reload.devices.count).to eq(1)
      expect(u.devices[0]).to eq(d)
    end
    
    it "should enable logging" do
      u = User.create
      d = Device.create(user: u)
      u.settings['subscription'] = {'eval_account' => true}
      expect(u.billing_state).to eq(:eval_communicator)
      expect(u.eval_account?).to eq(true)
      expect(u.settings['preferences']['logging']).to eq(false)
      expect(u.reset_eval(d.global_id)).to eq(true)
      expect(u.settings['preferences']['logging']).to eq(true)
    end
    
    it "should flush existing logs" do
      u = User.create
      d = Device.create(user: u)
      5.times{|i| LogSession.create!(user: u, device: d, author: u) }
      expect(u.reload.log_sessions.count).to eq(5)
      u.settings['subscription'] = {'eval_account' => true}
      expect(u.reset_eval(d.global_id)).to eq(true)
      Worker.process_queues
      expect(u.reload.log_sessions.count).to eq(0)
    end
    
    it "should call flush_user_content" do
      u = User.create
      d = Device.create(user: u)
      5.times{|i| LogSession.create!(user: u, device: d, author: u) }
      expect(u.reload.log_sessions.count).to eq(5)
      u.settings['subscription'] = {'eval_account' => true}
      expect(Flusher).to receive(:flush_user_content).with(u.global_id, u.user_name, d, true)
      expect(u.reset_eval(d.global_id)).to eq(true)
      Worker.process_queues
    end

    it "should set a new password for the account if specified" do
      u = User.create
      u.settings['subscription'] = {'eval_started' => 2.weeks.ago.iso8601, 'eval_expires' => 1.week.ago.iso8601}
      u.save
      d = Device.create(user: u)
      u.settings['subscription'] = {'eval_account' => true}
      u.reset_eval(d.global_id, {'password' => 'bacon'})
      expect(u.valid_password?('bacon')).to eq(true)
    end

  
    it "should create a copy of the specified home board if public" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2, public: true)
      b2 = Board.create(user: u2, public: true)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {'home_board_key' => b2.key})
      expect(u.settings['preferences']['home_board']).to_not eq(nil)
      brd = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(brd).to_not eq(nil)
      expect(brd).to_not eq(b)
      expect(brd).to_not eq(b2)
      expect(brd.parent_board).to eq(b2)
      expect(brd.user).to eq(u)
    end

    it "should not create a copy if home board set to 'none'" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2, public: true)
      b2 = Board.create(user: u2, public: true)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {'home_board_key' => 'none'})
      expect(u.settings['preferences']['home_board']).to eq(nil)
    end

    it "should create a copy of the org default home board if nothing specified" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2, public: true)
      b2 = Board.create(user: u2, public: true)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {})
      expect(u.settings['preferences']['home_board']).to_not eq(nil)
      brd = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(brd).to_not eq(nil)
      expect(brd).to_not eq(b)
      expect(brd).to_not eq(b2)
      expect(brd.parent_board).to eq(b)
      expect(brd.user).to eq(u)
    end

    it "should create a copy with the specified symbols" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2, public: true)
      b2 = Board.create(user: u2, public: true)
      bi = ButtonImage.create
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save

      b2.settings['buttons'] = [{'id' => 'a', 'image_id' => bi.global_id, 'label' => 'frog'}]
      b2.save

      expect(Uploader).to receive(:default_images).with('twemoji', ['frog'], 'en', u, true, false).and_return({
        'frog' => {'lingolinq_image_id' => bi.global_id}
      })

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {'home_board_key' => b2.key, 'symbol_library' => 'twemoji'})
      expect(u.settings['preferences']['home_board']).to_not eq(nil)
      brd = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(brd).to_not eq(nil)
      expect(brd).to_not eq(b)
      expect(brd).to_not eq(b2)
      expect(brd.parent_board).to eq(b2)
      expect(brd.user).to eq(u)
      expect(brd.settings['swapped_library']).to eq('twemoji')
    end

    it "should fall back to the org-specified default symbols when copying" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2, public: true)
      b2 = Board.create(user: u2, public: true)
      bi = ButtonImage.create
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.settings['preferred_symbols'] = 'twemoji'
      o.save

      b2.settings['buttons'] = [{'id' => 'a', 'image_id' => bi.global_id, 'label' => 'frog'}]
      b2.save

      expect(Uploader).to receive(:default_images).with('twemoji', ['frog'], 'en', u, true, false).and_return({
        'frog' => {'lingolinq_image_id' => bi.global_id}
      })

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {'home_board_key' => b2.key})
      expect(u.settings['preferences']['home_board']).to_not eq(nil)
      brd = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(brd).to_not eq(nil)
      expect(brd).to_not eq(b)
      expect(brd).to_not eq(b2)
      expect(brd.parent_board).to eq(b2)
      expect(brd.user).to eq(u)
      expect(brd.settings['swapped_library']).to eq('twemoji')
    end

    it "should create a copy of the specified home board if an org board" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2)
      b2 = Board.create(user: u2)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {'home_board_key' => b.key})
      expect(u.settings['preferences']['home_board']).to_not eq(nil)
      brd = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(brd).to_not eq(nil)
      expect(brd).to_not eq(b)
      expect(brd).to_not eq(b2)
      expect(brd.parent_board).to eq(b)
      expect(brd.user).to eq(u)
    end

    it "should not create a copy of the specified home board if not managed by the org" do
      o = Organization.create(settings: {'total_eval_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true, true)
      u.reload
      u2 = User.create
      d = Device.create(user: u)
      b = Board.create(user: u2)
      b2 = Board.create(user: u2)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save

      u.settings['subscription'] = {'eval_account' => true}
      u.save
      u.reset_eval(d.global_id, {'home_board_key' => b2.key})
      expect(u.settings['preferences']['home_board']).to eq(nil)
    end
  end  

  describe "grant_premium_supporter" do
    it "should return false if no grants available" do
      u = User.create
      expect(u.grant_premium_supporter(u)).to eq(false)
    end

    it "should set role to supporter" do
      u1 = User.create
      u1.settings['subscription']['purchased_supporters'] = 2
      u2 = User.create
      expect(u2.supporter_role?).to eq(false)
      expect(u1.grant_premium_supporter(u2)).to eq(true)
      expect(u2.supporter_role?).to eq(true)
    end

    it "should do nothing if already a premium supporter" do
      u1 = User.create
      u1.settings['subscription']['purchased_supporters'] = 2
      u2 = User.create
      u2.subscription_override('granted_supporter')
      expect(u2.billing_state).to eq(:premium_supporter)
      expect(u1.grant_premium_supporter(u2)).to eq(false)
      expect(u2.billing_state).to eq(:premium_supporter)
    end

    it "should grant credit and decrement available grants" do
      u1 = User.create
      u1.settings['subscription']['purchased_supporters'] = 2
      expect(u1.premium_supporter_grants).to eq(2)
      u2 = User.create
      expect(u2.billing_state).to_not eq(:premium_supporter)
      expect(u1.grant_premium_supporter(u2)).to eq(true)
      expect(u2.billing_state).to eq(:premium_supporter)
      expect(u1.premium_supporter_grants).to eq(1)
    end
  end

  describe "transfer_eval_to" do
    it "should transfer logs to the new user" do
      u = User.create
      u.subscription_override('eval')
      expect(u.eval_account?).to eq(true)
      d = Device.create(user: u, developer_key_id: 999)
      u2 = User.create
      s1 = LogSession.create(user: u, author: u, device: d, log_type: 'session')
      s2 = LogSession.create(user: u, author: u, device: d, log_type: 'bacon')
      s3 = LogSession.create(user: u, author: u, device: d, log_type: 'note')
      s4 = LogSession.create(user: u, author: u, device: d, log_type: 'assessment')
      s5 = LogSession.create(user: u, author: u, device: d, log_type: 'session')
      LogSession.where(id: [s1.id, s2.id, s3.id, s4.id]).update_all(started_at: 12.hours.from_now)
      LogSession.where(id: [s5.id]).update_all(started_at: 6.months.ago)
      expect(s1.reload.user_id).to eq(u.id)
      expect(s2.reload.user_id).to eq(u.id)
      expect(s3.reload.user_id).to eq(u.id)
      expect(s4.reload.user_id).to eq(u.id)
      expect(s5.reload.user_id).to eq(u.id)

      u.transfer_eval_to(u2.global_id, d.global_id)
      expect(s1.reload.user_id).to eq(u2.id)
      expect(s2.reload.user_id).to eq(u2.id)
      expect(s3.reload.user_id).to eq(u2.id)
      expect(s4.reload.user_id).to eq(u2.id)
      expect{ s5.reload }.to raise_error(ActiveRecord::RecordNotFound)
    end
    
    it "should transfer preferences to the new user" do
      u = User.create
      u.subscription_override('eval')
      expect(u.eval_account?).to eq(true)
      d = Device.create(user: u, developer_key_id: 999)
      u2 = User.create
      u.settings['preferences'] = {a: 1}
      u.save
      u2.settings['preferences'] = {b: 1}
      u2.save
      expect(u.transfer_eval_to(u2.global_id, d.global_id)).to eq(true)
      expect(u2.reload.settings['preferences']['a']).to eq(1)
      expect(u2.reload.settings['preferences']['b']).to eq(1)
    end
    
    it "should keep any device preferences already set for the new user" do
      u = User.create
      u.subscription_override('eval')
      expect(u.eval_account?).to eq(true)
      u2 = User.create
      d = Device.create(user: u, developer_key_id: 999, device_key: 'asdf1234')
      key = d.unique_device_key
      u.settings['preferences']['devices'][key] = {'a' => 1}
      u.save!
      u2.settings['preferences']['devices'][key] = {'b': 1}
      u2.save
      u.transfer_eval_to(u2.global_id, d.global_id)
      expect(u2.reload.settings['preferences']['devices'][key]['a']).to eq(1)
      expect(u2.reload.settings['preferences']['devices'][key]['b']).to eq(nil)
    end
    
    it "should call reset_eval" do
      u = User.create
      u.subscription_override('eval')
      expect(u.eval_account?).to eq(true)
      u2 = User.create
      d = Device.create(user: u, developer_key_id: 999)
      expect(u).to receive(:reset_eval).with(d.global_id).and_return(true)
      expect(u.transfer_eval_to(u2.global_id, d.global_id, true)).to eq(true)
    end

    it "should call transfer_user_content" do
      u = User.create
      u.subscription_override('eval')
      expect(u.eval_account?).to eq(true)
      u2 = User.create
      d = Device.create(user: u, developer_key_id: 999)
      expect(Flusher).to receive(:transfer_user_content).with(u.global_id, u.user_name, u2.global_id, u2.user_name)
      u.transfer_eval_to(u2.global_id, d.global_id)
    end

    it "should call reset_eval if specified" do
      u = User.create
      u.subscription_override('eval')
      expect(u.eval_account?).to eq(true)
      u2 = User.create
      d = Device.create(user: u, developer_key_id: 999)
      expect(Flusher).to receive(:transfer_user_content).with(u.global_id, u.user_name, u2.global_id, u2.user_name)
      expect(Flusher).to receive(:flush_user_content).with(u.global_id, u.user_name, d, true)
      u.transfer_eval_to(u2.global_id, d.global_id, true)
    end
  end

  describe "extend_eval" do
    it "should do nothing if not an eval account" do
      u = User.create
      expect(u.extend_eval('asdf', u)).to eq(false)
    end

    it "should allow self-extending if not managed" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'eval_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.reload.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.reload.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
      u.settings['subscription']['eval_expires'] = 6.days.from_now.to_date.iso8601
      u.save
      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 20.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 40.days.from_now.iso8601
    end

    it "should limit self-extending to 1 week if managed" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'eval_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      expect(u.reload.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.reload.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
      u.settings['subscription']['eval_expires'] = 6.days.from_now.to_date.iso8601
      u.save
      expect(u.settings['subscription']['eval_extended']).to eq(nil)
      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 12.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 14.days.from_now.iso8601
      expect(u.settings['subscription']['eval_extended']).to eq(true)

      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 12.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 14.days.from_now.iso8601
      expect(u.settings['subscription']['eval_extended']).to eq(true)
    end

    it "should only allow self-extending once if managed" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'eval_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      expect(u.reload.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.reload.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
      u.settings['subscription']['eval_expires'] = 6.days.from_now.to_date.iso8601
      u.save
      expect(u.settings['subscription']['eval_extended']).to eq(nil)
      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 12.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 14.days.from_now.iso8601
      expect(u.settings['subscription']['eval_extended']).to eq(true)

      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 12.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 14.days.from_now.iso8601
      expect(u.settings['subscription']['eval_extended']).to eq(true)
    end

    it "should allow supervisors to extend indefinitely" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'eval_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      expect(u.reload.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.reload.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
      u.settings['subscription']['eval_expires'] = 6.days.from_now.to_date.iso8601
      u.save
      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u2)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 20.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 40.days.from_now.iso8601
    end

    it "should allow org managers to extend indefinitely" do
      u = User.create
      o = Organization.create(:settings => {'total_eval_licenses' => 2})
      u2 = User.create
      o.add_user(u.user_name, false, true, true)
      o.add_manager(u2.user_name, true)
      expect(u.reload.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.reload.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
      u.settings['subscription']['eval_expires'] = 6.days.from_now.to_date.iso8601
      u.save
      expect(u.extend_eval(30.days.from_now.to_date.iso8601, u2)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 20.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 40.days.from_now.iso8601
    end

    it "should not allow extending beyong the extend limit" do
      u = User.create
      res = u.update_subscription({
        'purchase' => true,
        'plan_id' => 'eval_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      expect(u.reload.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.reload.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
      u.settings['subscription']['eval_expires'] = 6.days.from_now.to_date.iso8601
      u.save
      expect(u.extend_eval(200.days.from_now.to_date.iso8601, u2)).to_not eq(false)
      expect(u.settings['subscription']['eval_expires']).to be > 80.days.from_now.iso8601
      expect(u.settings['subscription']['eval_expires']).to be < 100.days.from_now.iso8601
    end
  end
  
  describe "purchase_credit_duration" do
    it "should be zero by default" do
      u = User.create
      expect(u.purchase_credit_duration).to eq(0)
    end
    
    it "should include past durations" do
      u = User.create
      u.settings['past_purchase_durations'] = [{'role' => 'communicator', 'duration' => 100}, {'role' => 'communicator', 'duration' => 50}]
      expect(u.purchase_credit_duration).to eq(150)
    end

    it "should not include supervisor durations if checking for a communicator role" do
      u = User.create
      u.settings['past_purchase_durations'] = [{'role' => 'supporter', 'duration' => 100}, {'role' => 'communicator', 'duration' => 50}]
      expect(u.purchase_credit_duration).to eq(50)
    end
    
    it "should include the current subscription if active" do
      u = User.new
      expect(u.recurring_subscription?).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      u.settings['subscription']['started'] = 9.weeks.ago.iso8601
      expect(u.recurring_subscription?).to eq(true)
      expect(u.purchase_credit_duration).to be > (8.weeks.to_i)
      expect(u.purchase_credit_duration).to be < (10.weeks.to_i)
    end
    
    it "should include the current long-term purchase" do
      u = User.new
      expect(u.long_term_purchase?).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      u.expires_at = 2.weeks.from_now
      u.settings['subscription']['last_purchase_plan_id'] = 'long_term_asssdf'
      cutoff = 3.weeks
      u.settings['subscription']['last_purchased'] = (Time.now - cutoff).iso8601
      expect(u.long_term_purchase?).to eq(true)
      expect(u.purchase_credit_duration).to be <= (5.weeks.to_i + 3600)
      expect(u.purchase_credit_duration).to be >= (5.weeks.to_i - 3600)
    end
    
    it "should include org sponsorship" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 2})
      u.update_subscription_organization(o.global_id, false, true)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_user',
        'state' => {
          'pending' => false,
          'sponsored' => true,
          'eval' => false,
          'added' => links[0]['state']['added']
        }
      }])
      link = UserLink.last
      
      added = Time.now - 2.years
      link.data['state']['added'] = added.iso8601
      link.save
      expect(u.reload.org_sponsored?).to eq(true)
      expect(u.purchase_credit_duration).to be_within(2).of((Time.now - added).to_i)
    end
    
    it "should count recently-expired long-term-purchase in calculation" do
      u = User.new
      expect(u.long_term_purchase?).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      u.expires_at = 2.weeks.ago
      u.settings['subscription']['last_purchase_plan_id'] = 'asdf'
      cutoff = 3.weeks
      u.settings['subscription']['last_purchased'] = (Time.now - cutoff).iso8601
      expect(u.purchase_credit_duration).to be >= (1.week.to_i - 3600)
      expect(u.purchase_credit_duration).to be <= (1.week.to_i + 3600)
    end
  end

  describe "extras_for_org?" do
    it "should specify whether extras are enabled from an org source" do
      u = User.new
      o = Organization.create
      expect(u.extras_for_org?(o)).to eq(false)
      u.settings = {}
      u.settings['subscription'] = {}
      expect(u.extras_for_org?(o)).to eq(false)
      u.settings['subscription']['extras'] = {'enabled' => true}
      expect(u.extras_for_org?(o)).to eq(false)
      u.settings['subscription']['extras']['source'] = 'org_added'
      expect(u.extras_for_org?(o)).to eq(false)
      u.settings['subscription']['extras']['org_id'] = o.global_id
      expect(u.extras_for_org?(o)).to eq(true)
    end
  end
end
