require 'spec_helper'

describe Api::PurchasingController, :type => :controller do
  describe "event" do
    it "should call the purchasing library and return the result" do
      expect(Purchasing).to receive(:subscription_event){|req|
        expect(req.params[:a]).to eq('1')
        expect(req.params[:b]).to eq('asdf')
      }.and_return({
        :status => 200,
        :data => {:a => 1}
      })
      post :event, params: {:a => 1, :b => 'asdf'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['a']).to eq(1)
    end
  end
  
  describe "purchase_gift" do
    it "should call the purchasing library and return a progress object" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(GiftPurchase, :process_subscription_token, {'id' => 'abc'}, {'type' => 'long_term_200', 'email' => nil, 'user_id' => @user.global_id, 'code' => nil, 'extras' => false, 'supporters' => 0, 'donate' => false}, for_user: @user).and_return(p)
      post :purchase_gift, params: {:token => {'id' => 'abc'}, :type => 'long_term_200'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end
    
    it "should pass the code if specified" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(GiftPurchase, :process_subscription_token, {'id' => 'abc'}, {'type' => 'long_term_200', 'email' => nil, 'user_id' => @user.global_id, 'code' => 'asdfasdf', 'extras' => false, 'supporters' => 0, 'donate' => false}, for_user: @user).and_return(p)
      post :purchase_gift, params: {:token => {'id' => 'abc'}, :type => 'long_term_200', :code => 'asdfasdf'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end

    it "should pass extra options if specified" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(GiftPurchase, :process_subscription_token, {'id' => 'abc'}, {'type' => 'long_term_200', 'email' => nil, 'user_id' => @user.global_id, 'code' => 'asdfasdf', 'extras' => true, 'supporters' => 0, 'donate' => true}, for_user: @user).and_return(p)
      post :purchase_gift, params: {:token => {'id' => 'abc'}, :type => 'long_term_200', :code => 'asdfasdf', 'extras' => true, 'donate' => true}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['progress']).not_to eq(nil)
    end
  end
  describe "code_check" do
    it "should require valid gift" do
      get :code_check, params: {code: 'asdf'}
      assert_error('code not recognized', 400)
    end

    it "should require valid gift type" do
      g = GiftPurchase.create(settings: {'licenses' => 4})
      expect(g.gift_type).to eq('bulk_purchase')
      get :code_check, params: {code: g.code}
      assert_error('invalid code')
    end

    it "should error on invalid redemption state" do
      g = GiftPurchase.create
      expect(GiftPurchase).to receive(:find_by_code).with('bacon').and_return(g)
      expect(g).to receive(:redemption_state).with('bacon').and_return({valid: false, error: 'no no no'})
      get :code_check, params: {code: 'bacon'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['valid']).to eq(false)
      expect(json['error']).to eq('no no no')
    end

    it "should succeed on valid redemption state" do
      g = GiftPurchase.create
      expect(GiftPurchase).to receive(:find_by_code).with('bacon').and_return(g)
      expect(g).to receive(:redemption_state).with('bacon').and_return({valid: true})
      get :code_check, params: {code: 'bacon'}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['valid']).to eq(true)
      expect(json['type']).to eq('user_gift')
      expect(json['discount_percent']).to eq(1.0)
    end
  end
end
