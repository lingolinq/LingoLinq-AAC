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

  describe 'narrate' do
    let(:eval_payload) { {eval_mode: 'comprehensive', intake: {}, recommendation: {}, sett: {}, slp_notes: ''} }

    before do
      # Endpoint gate now uses ai_feature_enabled_for? so the org-level AI
      # opt-out is honored. Stub it on for the happy-path tests.
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('comprehensive_eval_ai', anything).and_return(true)
    end

    it 'requires an access token' do
      post :narrate, params: {eval_session: eval_payload}
      assert_missing_token
    end

    it 'aborts with 400 when the AI feature is disabled (flag off or org opted out)' do
      allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('comprehensive_eval_ai', anything).and_return(false)
      token_user
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      expect(response.code.to_i).to eq(400)
      expect(JSON.parse(response.body)['error']).to eq('comprehensive_eval_ai feature not enabled')
    end

    it 'requires the target user to exist when a user_id is given' do
      token_user
      post :narrate, params: {eval_session: eval_payload, user_id: 'no-such-user'}
      assert_not_found('no-such-user')
    end

    it 'requires supervise permission on the target user' do
      token_user
      other = User.create
      post :narrate, params: {eval_session: eval_payload, user_id: other.global_id}
      assert_unauthorized
    end

    it 'aborts with 400 when the eval_session payload is missing' do
      token_user
      post :narrate, params: {user_id: @user.global_id}
      expect(response.code.to_i).to eq(400)
      expect(JSON.parse(response.body)['error']).to eq('eval_session payload required')
    end

    it 'resolves the evaluated student and hands it to the narrator for gating' do
      token_user
      captured_user = :unset
      allow(EvalNarrator).to receive(:draft_narrative) do |_payload, user:|
        captured_user = user
        'drafted'
      end
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      expect(captured_user).to be_a(User)
      expect(captured_user.global_id).to eq(@user.global_id)
    end

    it 'returns the drafted narrative for the supervising user' do
      token_user
      allow(EvalNarrator).to receive(:draft_narrative).and_return('A drafted narrative.')
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      json = assert_success_json
      expect(json['narrative']).to eq('A drafted narrative.')
    end

    it 'passes the client opt-in flag through to the narrator as a strict boolean' do
      token_user
      captured_payload = nil
      allow(EvalNarrator).to receive(:draft_narrative) do |payload, user:|
        captured_payload = payload
        'drafted'
      end
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id, use_anthropic: true}
      expect(captured_payload['use_anthropic']).to eq(true)
    end

    it 'defaults the opt-in flag to false when the request omits use_anthropic' do
      token_user
      captured_payload = nil
      allow(EvalNarrator).to receive(:draft_narrative) do |payload, user:|
        captured_payload = payload
        'drafted'
      end
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      expect(captured_payload['use_anthropic']).to eq(false)
    end

    it 'still drafts (template fallback) when no user_id is supplied' do
      token_user
      captured_user = :unset
      allow(EvalNarrator).to receive(:draft_narrative) do |_payload, user:|
        captured_user = user
        'template draft'
      end
      post :narrate, params: {eval_session: eval_payload}
      expect(assert_success_json['narrative']).to eq('template draft')
      expect(captured_user).to be_nil
    end
  end
end
