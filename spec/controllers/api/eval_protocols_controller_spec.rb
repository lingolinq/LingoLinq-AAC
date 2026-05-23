require 'spec_helper'

describe Api::EvalProtocolsController, type: :controller do
  before do
    allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
    allow(FeatureFlags).to receive(:feature_enabled_for?).with('quick_screen_eval', anything).and_return(true)
  end

  describe 'index' do
    it 'requires an access token' do
      get :index
      assert_missing_token
    end

    it 'returns the static templates by default' do
      token_user
      get :index
      json = assert_success_json
      expect(json).to be_a(Array)
      codes = json.map {|p| p['protocol']['public_protocol_id'] || p['public_protocol_id'] }
      expect(codes & EvalProtocol::STATIC_PROFILES).to match_array(EvalProtocol::STATIC_PROFILES)
    end

    it 'requires supervise permission when scoped to a user' do
      token_user
      other = User.create
      get :index, params: {user_id: other.global_id}
      assert_unauthorized
    end

    it 'aborts with 400 when the feature flag is off' do
      allow(FeatureFlags).to receive(:feature_enabled_for?).with('quick_screen_eval', anything).and_return(false)
      token_user
      get :index
      expect(response.code.to_i).to eq(400)
      expect(JSON.parse(response.body)['error']).to eq('feature not enabled')
    end
  end

  describe 'show' do
    it 'requires an access token' do
      get :show, params: {id: 'peds-emerging'}
      assert_missing_token
    end

    it 'returns a static template by code' do
      token_user
      get :show, params: {id: 'peds-emerging'}
      json = assert_success_json
      # JsonApi::EvalProtocol uses TYPE_KEY 'eval_protocol' as the
      # wrapper. The inner :protocol key holds the protocol body.
      expect(json['eval_protocol']['public_protocol_id']).to eq('peds-emerging')
    end

    it 'returns 404 for unknown codes' do
      token_user
      get :show, params: {id: 'no-such-protocol'}
      assert_not_found('no-such-protocol')
    end
  end
end
