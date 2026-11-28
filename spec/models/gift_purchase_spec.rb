require 'spec_helper'

describe GiftPurchase, :type => :model do
  it "should generate defaults" do
    g = GiftPurchase.new
    g.generate_defaults
    expect(g.active).to eq(true)
    expect(g.settings).to eq({})
  end
  
  it "should generate a unique code on create" do
    expect(GoSecure).to receive(:nonce).with('gift_code').and_return('abcdefghij').at_least(3).times
    g = GiftPurchase.create
    expect(g.code).to eq('abcdefgh')
    g2 = GiftPurchase.create
    expect(g2.code).to eq('abcdefghi')
  end
  
  it "should trigger a notification on create with a giver specified" do
    methods = []
    expect(SubscriptionMailer).to receive(:schedule_delivery){|method, id, action|
      methods << method
      if method == :gift_created
        expect(id).to_not be_nil
        expect(action).to be_nil
      elsif method == :gift_updated
        expect(id).to_not be_nil
        expect(action).to eq('purchase')
      end
    }.exactly(2).times
    g = GiftPurchase.create
    g2 = GiftPurchase.create(:settings => {'giver_email' => 'bob@example.com'})
    expect(methods).to eq([])
    g2.notify_of_creation
    expect(methods).to eq([:gift_created, :gift_updated])
  end
  
  describe "duration" do
    it "should return a reasonable message when no duration available" do
      g = GiftPurchase.new
      expect(g.duration).to eq("no time specified")
    end
    
    it "should return a multi-year duration clearly" do
      g = GiftPurchase.new(:settings => {'seconds_to_add' => 5.years.to_i})
      expect(g.duration).to eq('5 years')
    end
    
    it "should return a complex duration clearly" do
      g = GiftPurchase.new(:settings => {'seconds_to_add' => 2.years.to_i + 3.weeks.to_i + 2.days.to_i + 8.hours.to_i + 12.minutes.to_i + 99.seconds.to_i})
      expect(g.duration).to eq('2 years, 23 days, 8 hours, 13 minutes')
    end
  end
  
  it "should return the receiving user" do
    u = User.create
    g = GiftPurchase.new
    expect(g.receiver).to eq(nil)
    
    g.settings = {'receiver_id' => u.global_id}
    expect(g.receiver).to eq(u)
  end
  
  it "should return the giving user" do
    u = User.create
    g = GiftPurchase.new
    expect(g.receiver).to eq(nil)
    
    g.settings = {'giver_id' => u.global_id}
    expect(g.giver).to eq(u)
  end
  
  it "should generate correctly from provided parameters" do
    u = User.create
    g = GiftPurchase.process_new({}, {
      'giver' => u, 
      'email' => 'bob@example.com',
      'customer_id' => '12345',
      'token_summary' => 'no card',
      'plan_id' => 'long_term_200',
      'purchase_id' => '23456',
      'bacon' => '1234'
    })
    expect(g.settings['giver_id']).to eq(u.global_id)
    expect(g.settings['giver_email']).to eq('bob@example.com')
    expect(g.settings['customer_id']).to eq('12345')
    expect(g.settings['token_summary']).to eq('no card')
    expect(g.settings['plan_id']).to eq('long_term_200')
    expect(g.settings['purchase_id']).to eq('23456')
    expect(g.settings['bacon']).to eq(nil)
    
    g = GiftPurchase.process_new({
      'email' => 'fred@example.com'
    }, {
      'token_summary' => 'no card',
      'plan_id' => 'long_term_200',
      'purchase_id' => '23456',
      'bacon' => '1234'
    })
    expect(g.settings['giver_id']).to eq(nil)
    expect(g.settings['giver_email']).to eq('fred@example.com')
    expect(g.settings['customer_id']).to eq(nil)
    expect(g.settings['token_summary']).to eq('no card')
    expect(g.settings['plan_id']).to eq('long_term_200')
    expect(g.settings['purchase_id']).to eq('23456')
    expect(g.settings['bacon']).to eq(nil)
  end

  it "should force the giver email for bulk purchases" do
    giver = User.create(:settings => {'email' => 'fred@example.com'})
    gift = GiftPurchase.process_new({
      'licenses' => 4,
      'amount' => '1234',
      'organization' => 'org name',
      'email' => 'bob@example.com',
    }, {
      'giver' => giver, 
      'email' => 'stan@example.com'       
    })
    expect(gift.bulk_purchase?).to eq(true)
    expect(gift.settings['giver_email']).to eq('fred@example.com')
    expect(gift.settings['email']).to eq('bob@example.com')
  end
  
  it "should process bulk purchase settings" do
    g = GiftPurchase.process_new({
      'licenses' => 4,
      'amount' => 234,
      'organization' => 'asdf',
      'email' => 'bob@example.com'
    }, {
    })
    expect(g.settings['licenses']).to eq(4)
    expect(g.settings['amount']).to eq(234)
    expect(g.settings['organization']).to eq('asdf')
    expect(g.settings['email']).to eq('bob@example.com')
  end
  
  it "should return correct value for purchased?" do
    g = GiftPurchase.new(settings: {})
    expect(g.purchased?).to eq(false)
    g.settings['purchase_id']  = 'asdf'
    expect(g.purchased?).to eq(true)
  end
  
  it "should return correct value for bulk_purchase?" do
    g = GiftPurchase.process_new({
      'licenses' => 4,
      'amount' => 234,
      'organization' => 'asdf',
      'email' => 'bob@example.com'
    }, {
    })
    expect(g.settings['licenses']).to eq(4)
    expect(g.settings['amount']).to eq(234)
    expect(g.settings['organization']).to eq('asdf')
    expect(g.settings['email']).to eq('bob@example.com')
    expect(g.bulk_purchase?).to eq(true)
    g = GiftPurchase.new
    expect(g.bulk_purchase?).to eq(false)
  end
  
  it "should inactivate bulk purchases when redeemed" do
    g = GiftPurchase.create
    g.settings['licenses'] = 4
    g.save
    expect(g.active).to eq(true)
    g.settings['purchase_id'] = 'asdf'
    g.save
    expect(g.active).to eq(false)
  end
  
  describe "redeem_code!" do
    it "should redeem from a multi-code gift" do
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(50)
      expect(g.reload.settings['codes'].to_a[0][1]).to eq(nil)
      expect(g.active).to eq(true)
      code = g.settings['codes'].to_a[0][0]
      u = User.create
      exp = u.expires_at
      g.redeem_code!(code, u)
      u.reload
      expect(g.reload.settings['codes'].to_a[0][1]).to_not eq(nil)
      expect(g.reload.settings['codes'].to_a[0][1]['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['codes'].to_a[0][1]['redeemed_at']).to_not eq(nil)
      expect(g.active).to eq(true)
    end
    
    it "should redeem from a single-code gift" do
      g = GiftPurchase.create(:settings => {'seconds_to_add' => 4.years.to_i})
      expect(g.settings['codes']).to eq(nil)
      expect(g.active).to eq(true)
      code = g.code
      u = User.create
      exp = u.expires_at
      g.redeem_code!(code, u)
      u.reload
      expect(g.reload.settings['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['redeemed_at']).to_not eq(nil)
      expect(g.active).to eq(false)
    end
    
    it "should close the gift when all codes have been redeemed" do
      g = GiftPurchase.create(:settings => {'total_codes' => 25, 'seconds_to_add' => 4.years.to_i})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(25)
      g.settings['codes'].to_a.each do |code, val|
        expect(g.reload.active).to eq(true)
        expect(val).to eq(nil)
        u = User.create
        g.redeem_code!(code, u)
        u.reload
        expect(g.reload.settings['codes'][code]).to_not eq(nil)
        expect(g.reload.settings['codes'][code]['receiver_id']).to eq(u.global_id)
        expect(g.reload.settings['codes'][code]['redeemed_at']).to_not eq(nil)
      end
      expect(g.reload.active).to eq(false)
    end
    
    it "should not redeem a multi-code gift with the gift's full code" do
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i})
      u = User.create
      expect { g.redeem_code!(g.code, u) }.to raise_error("invalid code")
    end
    
    it "should add to an org if specified" do
      o = Organization.create
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i, 'org_id' => o.global_id})
      expect(g.settings['codes']).to_not eq(nil)
      expect(g.settings['codes'].keys.length).to eq(50)
      expect(g.reload.settings['codes'].to_a[0][1]).to eq(nil)
      code = g.settings['codes'].to_a[0][0]
      u = User.create
      exp = u.expires_at
      g.redeem_code!(code, u)
      expect(g.reload.settings['codes'].to_a[0][1]).to_not eq(nil)
      expect(g.reload.settings['codes'].to_a[0][1]['receiver_id']).to eq(u.global_id)
      expect(g.reload.settings['codes'].to_a[0][1]['redeemed_at']).to_not eq(nil)
      links = UserLink.links_for(u.reload)
      expect(links.length).to eq(1)
      expect(links[0]['record_code']).to eq(Webhook.get_record_code(o))
      expect(links[0]['state']['pending']).to eq(false)
      expect(links[0]['state']['sponsored']).to eq(false)
      expect(links[0]['state']['eval']).to eq(false)
      expect(g.active).to eq(true)
    end

    include ActiveSupport::Testing::TimeHelpers

    # redeem_code! stamps activated_at with Time.now and saves before the expected value reads the
    # clock again; a fixed instant keeps a second boundary from falling between them.
    it "should handle discount percents" do
      travel_to(Time.utc(2026, 6, 15, 12, 0, 30)) do
        g = GiftPurchase.create(settings: {'discount' => 0.5})
        u = User.create
        g.redeem_code!(g.code, u)
        expect(g.settings['activations']).to eq([
          {'receiver_id' => u.global_id, 'activated_at' => Time.now.utc.iso8601}
        ])
      end
    end
  end

  describe 'gift_type' do
    it "should return the correct type" do
      g = GiftPurchase.new
      expect(g.gift_type).to eq('user_gift')
      g.settings = {'total_codes' => 1}
      expect(g.gift_type).to eq('multi_code')
      g.settings = {'licenses' => 1}
      expect(g.gift_type).to eq('bulk_purchase')
      g.settings = {'discount' => 0.1}
      expect(g.gift_type).to eq('discount')
    end
  end

  describe 'redemption_state' do
    it 'should handle multi_code stats' do
      g = GiftPurchase.create(settings: {'total_codes' => 5})
      expect(g.redemption_state(g.code)).to eq({error: 'invalid code'})
      expect(g.redemption_state(g.settings['codes'].keys[0])).to eq({valid: true})
      g.active = false
      expect(g.redemption_state(g.settings['codes'].keys[0])).to eq({error: 'code already redeemed'})
      g.active = true
      g.settings['codes'][g.settings['codes'].keys[0]] = {}
      expect(g.redemption_state(g.settings['codes'].keys[0])).to eq({error: 'code already redeemed'})
    end

    it 'should handle discount states' do
      g = GiftPurchase.create(settings: {'discount' => 0.1})
      expect(g.redemption_state(g.code)).to eq({valid: true})
      expect(g.redemption_state('bacon')).to eq({error: 'invalid code'})
      g.settings['limit'] = 0
      expect(g.redemption_state(g.code)).to eq({error: 'discount limit passed'})
      g.settings['limit'] = 1
      expect(g.redemption_state(g.code)).to eq({valid: true})
      g.settings['activations'] = [{}, {}]
      expect(g.redemption_state(g.code)).to eq({error: 'discount limit passed'})
      g.settings['limit'] = 100
      g.settings['expires'] = 24.hours.from_now.iso8601
      expect(g.redemption_state(g.code)).to eq({valid: true})
      expect(g.active).to eq(true)
      g.settings['expires'] = 6.days.ago.to_date.iso8601
      expect(g.redemption_state(g.code)).to eq({error: 'discount expired', })
      expect(g.active).to eq(false)
      g.settings['expires'] = 2.days.from_now.to_date.iso8601
      expect(g.redemption_state(g.code)).to eq({error: 'all codes redeemed'})
      
    end

    it 'should gift codes' do
      g = GiftPurchase.create
      expect(g.redemption_state(g.code)).to eq({valid: true})
      expect(g.redemption_state('bacon')).to eq({error: 'invalid code'})
      g.active = false
      expect(g.redemption_state(g.code)).to eq({error: 'already redeemed'})
    end

    it 'should fail for other code types' do
      g = GiftPurchase.create(settings: {'licenses' => 1})
      expect(g.redemption_state(g.code)).to eq({error: 'invalid code'})
    end
  end

  describe 'discount_percent' do
    it 'should return the correct value' do
      g = GiftPurchase.create(settings: {'discount' => 0.5})
      expect(g.discount_percent).to eq(0.5)
      g.settings['discount'] = nil
      expect(g.discount_percent).to eq(1.0)
      g.settings['discount'] = 20
      expect(g.discount_percent).to eq(1.0)
      g.settings['discount'] = -0.1
      expect(g.discount_percent).to eq(0.0)
    end
  end

  describe 'find_by_code' do
    it 'should find basic gifts' do
      g = GiftPurchase.create
      expect(GiftPurchase.find_by_code(g.code)).to eq(g)
    end

    it 'should not find inactive gifts' do
      g = GiftPurchase.create
      g.active = false
      g.save
      expect(GiftPurchase.find_by_code(g.code)).to eq(nil)
    end

    it 'should find inactive gifts if allowed' do
      g = GiftPurchase.create
      g.active = false
      g.save
      expect(GiftPurchase.find_by_code(g.code, true)).to eq(g)
    end

    it 'should find multi-code gifts' do
      g = GiftPurchase.create(:settings => {'total_codes' => 50, 'seconds_to_add' => 4.years.to_i})
      code = g.settings['codes'].keys[0]
      expect(GiftPurchase.find_by_code(code)).to eq(g)
    end

    it 'should find bulk purchase gifts' do
      giver = User.create(:settings => {'email' => 'fred@example.com'})
      gift = GiftPurchase.process_new({
        'licenses' => 4,
        'amount' => '1234',
        'organization' => 'org name',
        'email' => 'bob@example.com',
      }, {
        'giver' => giver, 
        'email' => 'stan@example.com'       
      })
      expect(GiftPurchase.find_by_code(gift.code)).to eq(gift)
    end

    it 'should find redemption discount gifts' do
      g = GiftPurchase.create(settings: {'discount' => 0.5})
      expect(GiftPurchase.find_by_code(g.code)).to eq(g)
    end
  end
end
