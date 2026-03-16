require "spec_helper"

describe SubscriptionMailer, :type => :mailer do
  def long_ordinal_date(date)
    return '' unless date
    "#{date.strftime('%B')} #{date.day.ordinalize}, #{date.strftime('%Y')}"
  end

  after(:each) do
    JsonApi::Json.load_domain("default")
  end

  describe "one_day_until_expiration" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.one_day_until_expiration(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Trial Ending")
      
      html = message_body(m, :html)
      expect(html).to match(/set to expire/)
      expect(html).to match(/#{Regexp.escape(long_ordinal_date(u.expires_at))}/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/set to expire/)
      expect(text).to match(/#{Regexp.escape(long_ordinal_date(u.expires_at))}/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end
  end
  
  describe "expiration_approaching" do
    it "should generate the correct message" do
      u = User.create(:expires_at => Date.parse('June 1, 2015'), :settings => {'email' => 'fred@example.com'})
      m = SubscriptionMailer.expiration_approaching(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Billing Notice")
      
      html = message_body(m, :html)
      expect(html).to match(/#{u.user_name}/)
      expect(html).to match(/#{Regexp.escape(long_ordinal_date(u.expires_at))}/)
      expect(html).to match(/to be updated soon/)
      
      text = message_body(m, :text)
      expect(text).to match(/#{u.user_name}/)
      expect(text).to match(/#{Regexp.escape(long_ordinal_date(u.expires_at))}/)
      expect(text).to match(/to be updated soon/)
    end
  end
  
  describe "one_week_until_expiration" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.one_week_until_expiration(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Trial Ending")
      
      html = message_body(m, :html)
      expect(html).to match(/will conclude soon/)
      expect(html).to match(/#{Regexp.escape(long_ordinal_date(u.expires_at))}/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/about to expire/)
      expect(text).to match(/#{Regexp.escape(long_ordinal_date(u.expires_at))}/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end
  end
  
  describe "purchase_bounced" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.purchase_bounced(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Problem with your Subscription")
      
      html = message_body(m, :html)
      expect(html).to match(/there was an unexpected problem/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/there was an unexpected problem/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end  end
  
  describe "purchase_confirmed" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.purchase_confirmed(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Purchase Confirmed")
      
      html = message_body(m, :html)
      expect(html).to match(/Thank you for purchasing LingoLinq/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/Thank you for purchasing LingoLinq/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end  end
  
  describe "subscription_expired" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.subscription_expired(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Subscription Expired")
      
      html = message_body(m, :html)
      expect(html).to match(/account will no longer have premium account access/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/account will no longer have premium account access/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end
  end
  
  describe "new_subscription" do
    it "should generate the correct message" do
      ENV['NEW_REGISTRATION_EMAIL'] = "nobody@example.com"
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.new_subscription(u.global_id)
      expect(m.to).to eq(["nobody@example.com"])
      expect(m.subject).to eq("LingoLinq - New Subscription")
      
      html = m.body.to_s
      expect(html).to match(/just updated their LingoLinq billing information/)
      expect(html).to match(/#{u.user_name}<\/a>/)
    end  
  end
 
  describe "subscription_pause_failed" do
    it "should generate the correct message" do
      ENV['SYSTEM_ERROR_EMAIL'] = "nobody@example.com"
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.subscription_pause_failed(u.global_id)
      expect(m.to).to eq(["nobody@example.com"])
      expect(m.subject).to eq("LingoLinq - Subscription Pause Failed")
      
      html = message_body(m, :html)
      expect(html).to match(/problem trying to pause the subscription/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/problem trying to pause the subscription/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end  
  end
  
  describe "subscription_resume_failed" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.subscription_resume_failed(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Subscription Needs Attention")
      
      html = message_body(m, :html)
      expect(html).to match(/tried to auto-resume the subscription/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/tried to auto-resume the subscription/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end
  end
  
  describe "chargeback_created" do
    it "should generate the correct message" do
      ENV['SYSTEM_ERROR_EMAIL'] = "nobody@example.com"
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.chargeback_created(u.global_id)
      expect(m.to).to eq(["nobody@example.com"])
      expect(m.subject).to eq("LingoLinq - Chargeback Created")
      
      html = message_body(m, :html)
      expect(html).to match(/chargeback event for a purchase triggered/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/chargeback event for a purchase triggered/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end
  end
  
  describe "subscription_expiring" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.subscription_expiring(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Subscription Needs Attention")
      
      html = message_body(m, :html)
      expect(html).to match(/an error handling the current billing information/)
      expect(html).to match(/<b>#{u.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/an error handling the current billing information/)
      expect(text).to match(/"#{u.settings['name']}"/)
    end
  end

  describe "gift_created" do
    it "should generate the correct message" do
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      gift = GiftPurchase.process_new({}, {
        'giver' => giver,
        'email' => 'bob@example.com',
        'seconds' => 2.years.to_i
      })
      expect(gift.bulk_purchase?).to eq(false)
      expect(gift.settings['giver_email']).to eq('bob@example.com')
      m = SubscriptionMailer.gift_created(gift.global_id)
      expect(m.to).to eq(['bob@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Created")

      html = message_body(m, :html)
      expect(html).to match(/purchasing LingoLinq as a gift for someone else/)
      expect(html).to match(/<b>#{gift.code}<\/b>/)
      expect(html).to match(/2 years/)
      
      text = message_body(m, :text)
      expect(text).to match(/purchasing LingoLinq as a gift for someone else/)
      expect(text).to match(/"#{gift.code}"/)
      expect(text).to match(/2 years/)
    end

    it "should generate a bulk purchase message if appropriate" do
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      gift = GiftPurchase.process_new({
        'licenses' => 4,
        'amount' => '1234',
        'organization' => 'org name',
        'email' => 'bob@example.com',
      }, {
        'giver' => giver,        
      })
      expect(gift.bulk_purchase?).to eq(true)
      expect(gift.settings['giver_email']).to eq('fred@example.com')
      m = SubscriptionMailer.gift_created(gift.global_id)
      expect(m.to).to eq(['bob@example.com'])
      expect(m.subject).to eq("LingoLinq - Bulk Purchase")

      html = message_body(m, :html)
      expect(html).to match(/Below are the details of your purchase:/)
      expect(html).to match(/Organization: org name/)
      expect(html).to match(/Email: bob@example.com/)
      expect(html).to match(/Purchase Amount: \$1234/)
      expect(html).to match(/Licenses: 4/)
      
      text = message_body(m, :text)
      expect(text).to match(/Below are the details of your purchase:/)
      expect(text).to match(/Organization: org name/)
      expect(text).to match(/Email: bob@example.com/)
      expect(text).to match(/Purchase Amount: \$1234/)
      expect(text).to match(/Licenses: 4/)
    end
  end
  
  describe "gift_redeemed" do
    it "should generate the correct message" do
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({}, {
        'giver' => giver,
        'email' => 'bob@example.com',
        'seconds' => 4.years.to_i
      })
      gift.settings['receiver_id'] = recipient.global_id
      gift.save
      
      m = SubscriptionMailer.gift_redeemed(gift.global_id)
      expect(m.to).to eq(['bob@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Redeemed")

      html = message_body(m, :html)
      expect(html).to match(/notice that the gift you purchased/)
      expect(html).to match(/<b>#{gift.code}<\/b>/)
      expect(html).to match(/4 years/)
      
      text = message_body(m, :text)
      expect(text).to match(/notice that the gift you purchased/)
      expect(text).to match(/"#{gift.code}"/)
      expect(text).to match(/4 years/)
    end

    it "should skip delivery for non-full domain overrides" do
      o = Organization.create(custom_domain: true)
      o.settings['hosts'] = ['cheddar.org']
      o.settings['host_settings'] = {}
      o.settings['host_settings']['admin_email'] = "Admin <admin@example.com>"
      o.settings['host_settings']['app_name'] = "Cheddar"
      o.save
      Worker.process_queues
      JsonApi::Json.load_domain('cheddar.org')
      expect(JsonApi::Json.current_domain['settings']['admin_email']).to eq("Admin <admin@example.com>")

      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({}, {
        'giver' => giver,
        'email' => 'bob@example.com',
        'seconds' => 4.years.to_i
      })
      gift.settings['receiver_id'] = recipient.global_id
      gift.save
      
      m = SubscriptionMailer.gift_redeemed(gift.global_id)
      expect(m.to).to eq(nil)
    end
  end
  
  describe "gift_seconds_added" do
    it "should generate the correct message" do
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({}, {
        'giver' => giver,
        'email' => 'bob@example.com',
        'seconds' => 3.years.to_i
      })
      gift.settings['receiver_id'] = recipient.global_id
      gift.save
      
      m = SubscriptionMailer.gift_seconds_added(gift.global_id)
      expect(m.to).to eq(['susan@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Purchase Received")

      html = message_body(m, :html)
      expect(html).to match(/you recently redeemed a gift code/)
      expect(html).to match(/<b>#{gift.code}<\/b>/)
      expect(html).to match(/3 years/)
      
      text = message_body(m, :text)
      expect(text).to match(/you recently redeemed a gift code/)
      expect(text).to match(/"#{gift.code}"/)
      expect(text).to match(/3 years/)
    end
  end
  
  describe "gift_updated" do
    it "should generate the creation message when specified" do
      ENV['NEW_REGISTRATION_EMAIL'] = "nobody@example.com"
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({}, {
        'giver' => giver,
        'email' => 'bob@example.com',
        'seconds' => 3.years.to_i
      })
      gift.save
      
      m = SubscriptionMailer.gift_updated(gift.global_id, 'purchase')
      expect(m.to).to eq(['nobody@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Purchased")

      html = m.body.to_s
      expect(html).to match(/Giver: #{giver.user_name}/)
      expect(html).to_not match(/Recipient:/)
      expect(html).to match(/<b>#{gift.code}<\/b>/)
      expect(html).to match(/Cloud Extras For: 3 years/)
    end
    
    it "should generate the redeemed message when specified" do
      ENV['NEW_REGISTRATION_EMAIL'] = "nobody@example.com"
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({
        'gift_name' => 'good one'
      }, {
        'email' => 'bob@example.com',
        'seconds' => 3.years.to_i
      })
      gift.settings['receiver_id'] = recipient.global_id
      gift.save
      expect(gift.reload.settings['gift_name']).to eq('good one')
      
      m = SubscriptionMailer.gift_updated(gift.global_id, 'redeem')
      expect(m.to).to eq(['nobody@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Redeemed")

      html = m.body.to_s
      expect(html).to match(/Name: good one/)
      expect(html).to match(/Giver: bob@example.com/)
      expect(html).to match(/Recipient: #{recipient.user_name}/)
      expect(html).to match(/<b>#{gift.code}<\/b>/)
      expect(html).to match(/Cloud Extras For: 3 years/)
    end
    
    it "should generate the bulk purchase message if specified" do
      ENV['NEW_REGISTRATION_EMAIL'] = "nobody@example.com"
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({
        'licenses' => 4,
        'amount' => 12345,
        'organization' => 'org name',
        'email' => 'org@example.com'
      }, {
      })
      gift.settings['receiver_id'] = recipient.global_id
      gift.save
      
      m = SubscriptionMailer.gift_updated(gift.global_id, 'redeem')
      expect(m.to).to eq(['nobody@example.com'])
      expect(m.subject).to eq("LingoLinq - Bulk Purchase")

      html = m.body.to_s
      expect(html).to match(/Email: org@example.com/)
      expect(html).to match(/Licenses: 4/)
      expect(html).to match(/Amount: \$12345/)
      expect(html).to_not match(gift.code)
    end

    it "should specify additional options only if defined on the gift" do
      ENV['NEW_REGISTRATION_EMAIL'] = "nobody@example.com"
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      recipient = User.create(:settings => {'email' => 'susan@example.com'})
      
      gift = GiftPurchase.process_new({}, {
        'giver' => giver,
        'email' => 'bob@example.com',
        'seconds' => 3.years.to_i,
      })
      gift.save
      
      m = SubscriptionMailer.gift_updated(gift.global_id, 'purchase')
      expect(m.to).to eq(['nobody@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Purchased")

      html = m.body.to_s
      expect(html).to match(/Giver: #{giver.user_name}/)
      expect(html).to_not match(/Extras:/)


      gift.settings['include_extras'] = true
      gift.settings['extra_donation'] = true
      gift.save
      m = SubscriptionMailer.gift_updated(gift.global_id, 'purchase')
      expect(m.to).to eq(['nobody@example.com'])
      expect(m.subject).to eq("LingoLinq - Gift Purchased")

      html = m.body.to_s
      expect(html).to match(/Giver: #{giver.user_name}/)
      expect(html).to match(/Extras: Premium Symbols Included/)
      expect(html).to match(/Extras: Donated Additional License/)
    end
  end

  describe "deletion_warning" do
    it "should generate the correct first warning" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.deletion_warning(u.global_id, 1)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Account Deletion Notice")
      
      html = message_body(m, :html)
      expect(html).to match(/inactive for a long time/)
      expect(html).to match(/first warning/)
      expect(html).to match(/"#{u.user_name}"/)
      
      text = message_body(m, :text)
      expect(text).to match(/inactive for a long time/)
      expect(text).to match(/first warning/)
      expect(text).to match(/"#{u.user_name}"/)
    end

    it "should generate the correct final warning" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.deletion_warning(u.global_id, 2)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Account Deletion Notice")
      
      html = message_body(m, :html)
      expect(html).to match(/inactive for a long time/)
      expect(html).to match(/final warning/)
      expect(html).to match(/"#{u.user_name}"/)
      
      text = message_body(m, :text)
      expect(text).to match(/inactive for a long time/)
      expect(text).to match(/final warning/)
      expect(text).to match(/"#{u.user_name}"/)
    end
  end

  describe "account_deleted" do
    it "should generate the correct warning" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      m = SubscriptionMailer.account_deleted(u.global_id)
      expect(m.to).to eq([u.settings['email']])
      expect(m.subject).to eq("LingoLinq - Account Deleted")
      
      html = message_body(m, :html)
      expect(html).to match(/has been deleted/)
      expect(html).to match(/"#{u.user_name}"/)
      
      text = message_body(m, :text)
      expect(text).to match(/has been deleted/)
      expect(text).to match(/"#{u.user_name}"/)
    end
  end

  describe "unsubscribe_reason" do
    it "should generate the correct data" do
      u = User.create
      u.settings['subscription'] = {}
      u.save
      m = SubscriptionMailer.unsubscribe_reason(u.global_id, 'bacon is good')
      expect(m.to).to eq([ENV['SYSTEM_ERROR_EMAIL']])
      expect(m.subject).to eq('LingoLinq - User Unsubscribed')
      html = m.body.to_s
      expect(html).to match(/#{u.user_name}/)
      expect(html).to match(/bacon is good/)
    end

    it "should generate the correct data" do
      u = User.create
      u.settings['subscription'] = {'unsubscribe_reason' => 'too many cool things'}
      u.save
      m = SubscriptionMailer.unsubscribe_reason(u.global_id)
      expect(m.to).to eq([ENV['SYSTEM_ERROR_EMAIL']])
      expect(m.subject).to eq('LingoLinq - User Unsubscribed')

      html = m.body.to_s
      expect(html).to match(/#{u.user_name}/)
      expect(html).to match(/too many cool things/)
    end

    it "should get triggered on user unsubscribe with a reason" do
      u = User.create
      u.settings['subscription'] = {
        'subscription_id' => 'asdf1234',
        'unsubscribe_reason' => 'super awesome'
      }
      u.save
      expect(u.long_term_purchase?).to eq(false)
      expect(u.settings['subscription']['unsubscribe_reason']).to_not eq(nil)
      expect(SubscriptionMailer).to receive(:schedule_delivery).with(:unsubscribe_reason, u.global_id)
      u.update_subscription({'unsubscribe' => true, 'subscription_id' => 'asdf1234'})
    end

    it "should not get triggered on user unsubscribe without a reason" do
      u = User.create
      u.settings['subscription'] = {
        'subscription_id' => 'asdf1234'
      }
      u.save
      expect(SubscriptionMailer).to_not receive(:schedule_delivery).with(:unsubscribe_reason, u.global_id)
      u.update_subscription({'unsubscribe' => true, 'subscription_id' => 'asdf1234'})
    end
  end
end