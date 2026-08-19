require 'spec_helper'

describe Api::WordsController, :type => :controller do
  describe "get 'reachable_core'" do
    it "should not require an api token" do
      get 'reachable_core', params: {'user_id' => 'aaa', 'utterance_id' => 'qqq'}
      assert_not_found('aaa')
    end

    it "should require a valid user" do
      get 'reachable_core', params: {'user_id' => 'aaa', 'utterance_id' => 'qqq'}
      assert_not_found('aaa')
    end

    it "should allow supervisor access" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      expect(WordData).to receive(:reachable_core_list_for).with(u).and_return({a: 1})
      get 'reachable_core', params: {'user_id' => u.global_id}
      json = assert_success_json
      expect(json).to eq({'words' => {'a' => 1}})
    end

    it "should error with neither supervisor nor utterance_core_access" do
      u = User.create
      u.settings['preferences']['utterance_core_access'] = false
      u.save
      get 'reachable_core', params: {'user_id' => u.global_id, 'utterance_id' => 'qqq'}
      assert_unauthorized
    end

    it "should error without valid utterance" do
      u = User.create
      get 'reachable_core', params: {'user_id' => u.global_id, 'utterance_id' => 'qqq'}
      assert_not_found('qqq')
    end

    it "should error without valid reply code" do
      u = User.create
      utt = Utterance.create(user: u)
      get 'reachable_core', params: {'user_id' => u.global_id, 'utterance_id' => "#{utt.global_id}x000"}
      assert_unauthorized
    end

    it "should error without valid reply code" do
      u = User.create
      utt = Utterance.create(user: u)
      expect(WordData).to receive(:reachable_core_list_for).with(u).and_return({a: 1})
      get 'reachable_core', params: {'user_id' => u.global_id, 'utterance_id' => "#{utt.global_id}x#{utt.reply_nonce}ZA"}
      json = assert_success_json
      expect(json).to eq({'words' => {'a' => 1}})
    end
  end

  describe "get 'lang'" do
    it "should not require an api token" do
      get 'lang', params: {'locale' => ''}
      assert_error('locale required')
    end

    it "should return a blank result by deafult" do
      RedisInit.default.del("setting/rules/xx")
      RedisInit.default.del("setting/rules/xx-xx")
      get 'lang', params: {'locale' => 'xx'}
      json = assert_success_json
      expect(json).to include('_locale' => 'xx')
      expect(json.except('_locale')).to eq({})
    end

    it "should return cached settings if available" do
      RedisInit.default.del("setting/rules/xx")
      RedisInit.default.del("setting/rules/xx-xx")
      Setting.set("rules/xx-xx", {
        rules: 'asdf3',
        default_contractions: 'qwer3',
        inflection_locations: 'zxcv3'
      }, true)
      get 'lang', params: {'locale' => 'xx-xx'}
      json = assert_success_json
      expect(json).to include(
        '_locale' => 'xx-xx',
        'rules' => 'asdf3',
        'default_contractions' => 'qwer3',
        'contractions' => nil,
        'inflection_locations' => 'zxcv3'
      )
    end

    it "should fall back to the base language if not for sub-language" do
      RedisInit.default.del("setting/rules/xx")
      RedisInit.default.del("setting/rules/xx-xx")
      Setting.set("rules/xx", {
        rules: 'asdf4',
        default_contractions: 'qwer4',
        contractions: 'yuio4',
        inflection_locations: 'zxcv4'
      }, true)
      get 'lang', params: {'locale' => 'xx-xx'}
      json = assert_success_json
      expect(json).to include(
        '_locale' => 'xx-xx',
        'rules' => 'asdf4',
        'default_contractions' => 'qwer4',
        'contractions' => 'yuio4',
        'inflection_locations' => 'zxcv4'
      )
    end
  end

  describe "post 'predict'" do
    it "should reject unauthenticated prediction requests" do
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      expect(AiWordPredictor).not_to receive(:predict)

      post 'predict', params: { 'sentence' => 'I want to' }
      assert_error('Authentication required', 401)
      expect(response.status).to eq(401)
      expect(@error_json['unauthorized']).to eq(true)
    end

    it "should require a sentence" do
      token_user
      post 'predict', params: { 'sentence' => '' }
      assert_error('sentence required')
    end

    it "should reject when ai_word_prediction is disabled for the user" do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(false)
      post 'predict', params: { 'sentence' => 'I want to' }
      assert_error('ai_word_prediction is not enabled for this user')
    end

    it "should reject when COPPA gate blocks the user" do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(true)
      post 'predict', params: { 'sentence' => 'I want to' }
      expect(response.status).to eq(403)
    end

    it "should call AiWordPredictor.predict with the api user" do
      token_user
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      expect(AiWordPredictor).to receive(:predict).with(hash_including(
        sentence: 'I want to',
        locale: 'en',
        count: 4,
        user: @user
      )).and_return(%w[play go eat help])

      post 'predict', params: { 'sentence' => 'I want to' }
      json = assert_success_json
      expect(json).to eq({ 'words' => %w[play go eat help] })
    end

    describe "article_50_disclosure backstop (LL-6723438462)" do
      it "proceeds normally with the flag NOT enabled, regardless of jurisdiction or acknowledgement" do
        token_user
        allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        expect(AiWordPredictor).to receive(:predict).and_return(%w[play go])

        post 'predict', params: { 'sentence' => 'I want to' }
        expect(response).to be_successful
      end

      it "returns 403 with a distinguishable error code and never calls the predictor when the flag is enabled, in scope, and unacknowledged" do
        token_user
        allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', anything).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
        allow(FeatureFlags).to receive(:feature_enabled_for?).with('article_50_disclosure', anything).and_return(true)
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        expect(AiWordPredictor).not_to receive(:predict)

        post 'predict', params: { 'sentence' => 'I want to' }
        expect(response.status).to eq(403)
        assert_error('article_50_disclosure_required', 403)
      end
    end
  end
end
