require 'spec_helper'

# #1063: a supervisor speaking as a communicator sends the communicator's sentence. The client
# names the communicator (user_id), and the communicator's own AI block applies on top of the
# signed-in person's, so a stale client copy of a blocked child cannot reach AI.
describe 'AI word prediction for the communicator being spoken for', :type => :controller do
  def handed_back_child
    u = User.create
    u.settings['school_authorization_ended'] = {'basis' => 'school_official', 'ended_at' => Time.now.utc.iso8601}
    u.save!
    expect(u.school_handoff_blocks_ai?).to eq(true)
    u
  end

  def allow_ai_for_supervisor
    allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', @user).and_return(true)
  end

  describe Api::WordsController do
    it 'refuses when the child spoken for is blocked, without calling AI' do
      token_user
      child = handed_back_child
      User.link_supervisor_to_user(@user, child)
      allow_ai_for_supervisor
      expect(AiWordPredictor).not_to receive(:predict)

      post 'predict', params: { 'sentence' => 'I want to', 'user_id' => child.global_id }
      expect(response.status).to eq(403)
      expect(JSON.parse(response.body)['error']).to eq('parental consent required')
    end

    it 'refuses an EU under-16 spoken for without EU parental consent' do
      token_user
      child = User.create
      child.settings['registration'] = {'eu_under_16' => true}
      child.save!
      expect(FeatureFlags.eu_under16_blocks_ai_for?(child)).to eq(true)
      User.link_supervisor_to_user(@user, child)
      allow_ai_for_supervisor
      expect(AiWordPredictor).not_to receive(:predict)

      post 'predict', params: { 'sentence' => 'I want to', 'user_id' => child.global_id }
      expect(response.status).to eq(403)
    end

    it 'predicts for an unblocked child spoken for' do
      token_user
      child = User.create
      User.link_supervisor_to_user(@user, child)
      allow_ai_for_supervisor
      expect(AiWordPredictor).to receive(:predict).with(hash_including(sentence: 'I want to', user: @user)).and_return(['eat'])

      post 'predict', params: { 'sentence' => 'I want to', 'user_id' => child.global_id }
      expect(response.status).to eq(200)
      expect(JSON.parse(response.body)['words']).to eq(['eat'])
    end

    it 'refuses a communicator the signed-in person cannot speak for' do
      token_user
      other = User.create
      allow_ai_for_supervisor
      expect(AiWordPredictor).not_to receive(:predict)

      post 'predict', params: { 'sentence' => 'I want to', 'user_id' => other.global_id }
      expect(response.status).not_to eq(200)
    end
  end

  describe Api::WordSuggestionsController do
    it 'refuses when the child spoken for is blocked, without calling AI' do
      token_user
      child = handed_back_child
      User.link_supervisor_to_user(@user, child)
      allow_ai_for_supervisor
      expect(AiWordPredictor).not_to receive(:predict_from_tokens)

      post 'create', params: { 'words' => ['I', 'want'], 'user_id' => child.global_id }
      expect(response.status).to eq(403)
      expect(JSON.parse(response.body)['words']).to eq([])
    end
  end
end
