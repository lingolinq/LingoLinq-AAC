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
        {'narrative' => 'drafted', 'ai_generated' => nil}
      end
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      expect(captured_user).to be_a(User)
      expect(captured_user.global_id).to eq(@user.global_id)
    end

    it 'returns the drafted narrative for the supervising user' do
      token_user
      allow(EvalNarrator).to receive(:draft_narrative).and_return({'narrative' => 'A drafted narrative.', 'ai_generated' => nil})
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      json = assert_success_json
      expect(json['narrative']).to eq('A drafted narrative.')
    end

    it 'returns the AI-generated marker to the frontend when the narrator mints one' do
      token_user
      marker = Art50Marker.build(provider: 'claude', model: 'claude-opus-4-7')
      allow(EvalNarrator).to receive(:draft_narrative).and_return({'narrative' => 'AI drafted.', 'ai_generated' => marker})
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      json = assert_success_json
      expect(json['ai_generated']).to eq(marker)
    end

    it 'returns a nil ai_generated marker for the deterministic template draft' do
      token_user
      allow(EvalNarrator).to receive(:draft_narrative).and_return({'narrative' => 'template draft', 'ai_generated' => nil})
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      json = assert_success_json
      expect(json['ai_generated']).to be_nil
    end

    it 'passes the client opt-in flag through to the narrator as a strict boolean' do
      token_user
      captured_payload = nil
      allow(EvalNarrator).to receive(:draft_narrative) do |payload, user:|
        captured_payload = payload
        {'narrative' => 'drafted', 'ai_generated' => nil}
      end
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id, use_anthropic: true}
      expect(captured_payload['use_anthropic']).to eq(true)
    end

    it 'defaults the opt-in flag to false when the request omits use_anthropic' do
      token_user
      captured_payload = nil
      allow(EvalNarrator).to receive(:draft_narrative) do |payload, user:|
        captured_payload = payload
        {'narrative' => 'drafted', 'ai_generated' => nil}
      end
      post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
      expect(captured_payload['use_anthropic']).to eq(false)
    end

    it 'does not treat ambiguous opt-in values as true (no/off/False stay no-egress)' do
      token_user
      captured = {}
      allow(EvalNarrator).to receive(:draft_narrative) do |payload, user:|
        captured[payload['use_anthropic']] = true
        {'narrative' => 'drafted', 'ai_generated' => nil}
      end
      ['no', 'off', 'False', '2', 'maybe'].each do |val|
        post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id, use_anthropic: val}
      end
      # Every ambiguous string resolves to a single false key; true is never set.
      expect(captured.keys).to eq([false])
    end

    it 'still drafts (template fallback) when no user_id is supplied' do
      token_user
      captured_user = :unset
      allow(EvalNarrator).to receive(:draft_narrative) do |_payload, user:|
        captured_user = user
        {'narrative' => 'template draft', 'ai_generated' => nil}
      end
      post :narrate, params: {eval_session: eval_payload}
      expect(assert_success_json['narrative']).to eq('template draft')
      expect(captured_user).to be_nil
    end

    # PN-01 / D-02 REGRESSION LOCK (the mandatory data-subject test). This is the layer a
    # future refactor that resolved jurisdiction from current_user/@api_user would regress:
    # the authenticated clinician is NON-EU, the supervised student is in the EU, and the
    # PERSISTED AiApiLog row must stamp jurisdiction 'EU' -- the stamp follows the STUDENT
    # data subject the controller selects (user_id -> find_by_path), not the caller.
    it 'stamps jurisdiction "EU" from the EU student when a non-EU clinician narrates (PN-01/D-02)' do
      old_key = ENV['ANTHROPIC_API_KEY']
      ENV['ANTHROPIC_API_KEY'] = 'test-anthropic-key'
      token_user
      # The authenticated clinician (@user) is explicitly NON-EU -- the stamp must NOT follow them.
      @user.settings ||= {}
      @user.settings['preferences'] = {'jurisdiction' => 'US'}
      @user.save
      # The supervised student is in the EU (the data subject).
      eu_student = User.create
      eu_student.settings ||= {}
      eu_student.settings['preferences'] = {'jurisdiction' => 'FR'}
      eu_student.save
      User.link_supervisor_to_user(@user, eu_student)

      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
      allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
      allow(EvalNarrator).to receive(:anthropic_configured?).and_return(true)
      resp = double('anthropic_response',
                    content: [double('block', type: 'text', text: 'Drafted narrative.')],
                    usage: double('usage', input_tokens: 10, output_tokens: 20))
      allow(EvalNarrator).to receive(:call_anthropic).and_return(resp)

      expect {
        post :narrate, params: {eval_session: eval_payload, user_id: eu_student.global_id, use_anthropic: true}
      }.to change(AiApiLog, :count).by(1)

      log = AiApiLog.order(:created_at).last
      expect(log.request_type).to eq('eval_narration')
      expect(log.jurisdiction).to eq('EU')
    ensure
      ENV['ANTHROPIC_API_KEY'] = old_key
    end

    describe "article_50_disclosure backstop (LL-6723438462)" do
      it "proceeds normally with the flag NOT enabled, regardless of jurisdiction or acknowledgement" do
        token_user
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        allow(EvalNarrator).to receive(:draft_narrative).and_return({'narrative' => 'drafted', 'ai_generated' => nil})

        post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id, use_anthropic: true}
        expect(response).to be_successful
        expect(EvalNarrator).to have_received(:draft_narrative)
      end

      it "returns 403 and never calls the narrator when the flag is enabled, in scope, unacknowledged, and use_anthropic is true" do
        token_user
        allow(FeatureFlags).to receive(:feature_enabled_for?).with('article_50_disclosure', anything).and_return(true)
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        expect(EvalNarrator).not_to receive(:draft_narrative)

        post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id, use_anthropic: true}
        expect(response.status).to eq(403)
        expect(JSON.parse(response.body)['error']).to eq('article_50_disclosure_required')
      end

      it "does not gate the deterministic-template path (use_anthropic omitted) even when the flag is enabled and unacknowledged" do
        token_user
        allow(FeatureFlags).to receive(:feature_enabled_for?).with('article_50_disclosure', anything).and_return(true)
        allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
        allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
        allow(EvalNarrator).to receive(:draft_narrative).and_return({'narrative' => 'template draft', 'ai_generated' => nil})

        post :narrate, params: {eval_session: eval_payload, user_id: @user.global_id}
        expect(response).to be_successful
        expect(EvalNarrator).to have_received(:draft_narrative)
      end
    end
  end
end
