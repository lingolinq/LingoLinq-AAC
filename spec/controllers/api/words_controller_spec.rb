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
end
