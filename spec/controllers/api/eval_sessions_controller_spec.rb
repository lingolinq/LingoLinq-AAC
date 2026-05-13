require 'spec_helper'

describe Api::EvalSessionsController, type: :controller do
  before do
    allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
    allow(FeatureFlags).to receive(:feature_enabled_for?).with('quick_screen_eval', anything).and_return(true)
  end

  describe 'recommend' do
    it 'requires an access token' do
      post :recommend, params: {user_id: 'asdf'}
      assert_missing_token
    end

    it 'requires the target user to exist' do
      token_user
      post :recommend, params: {user_id: 'no-such-user'}
      assert_not_found('no-such-user')
    end

    it 'requires supervise permission' do
      token_user
      other = User.create
      post :recommend, params: {user_id: other.global_id, intake: {}, events: []}
      assert_unauthorized
    end

    it 'returns a recommendation and matched profile for the supervising user themselves' do
      token_user
      post :recommend, params: {
        user_id: @user.global_id,
        intake: {age_band: '6-12', current_comm: 'single_symbol', etiology: 'developmental', suspected_access: 'touch'},
        events: [
          {subtest: 'access_snapshot', response: 'correct', grid: [3, 3], latency_ms: 1500, access_method: 'touch'},
          {subtest: 'access_snapshot', response: 'correct', grid: [4, 4], latency_ms: 2200, access_method: 'touch'},
          {subtest: 'library_compare', response: 'correct', library: 'symbolstix', latency_ms: 1100},
          {subtest: 'library_compare', response: 'incorrect', library: 'arasaac', latency_ms: 1900},
          {subtest: 'stage_probe', response: 'correct'},
          {subtest: 'vocab_probe', response: 'correct'}
        ]
      }
      json = assert_success_json
      expect(json['recommendation']).to be_a(Hash)
      expect(json['recommendation']).to include('access_method', 'grid_size', 'library', 'communicator_stage', 'confidence', 'next_action')
      expect(json['protocol_profile']).to eq('peds-emerging')
    end

    it 'aborts with 400 when the feature flag is off' do
      allow(FeatureFlags).to receive(:feature_enabled_for?).with('quick_screen_eval', anything).and_return(false)
      token_user
      post :recommend, params: {user_id: @user.global_id, intake: {}, events: []}
      expect(response.code.to_i).to eq(400)
      expect(JSON.parse(response.body)['error']).to eq('feature not enabled')
    end
  end
end
