require 'spec_helper'

describe Api::Internal::AiApiLogsController, :type => :controller do
  let(:token) { 'test-internal-token-abc123' }

  before do
    @prev_token = ENV['INTERNAL_API_TOKEN']
    ENV['INTERNAL_API_TOKEN'] = token
  end

  after do
    ENV['INTERNAL_API_TOKEN'] = @prev_token
  end

  describe 'GET daily_summary' do
    it 'returns 401 without the token header' do
      get :daily_summary
      expect(response.status).to eq(401)
      expect(JSON.parse(response.body)['error']).to eq('unauthorized')
    end

    it 'returns 401 with a wrong token' do
      request.headers['X-Internal-Token'] = 'nope'
      get :daily_summary
      expect(response.status).to eq(401)
    end

    it 'returns 503 if INTERNAL_API_TOKEN is not configured' do
      ENV['INTERNAL_API_TOKEN'] = nil
      request.headers['X-Internal-Token'] = 'anything'
      get :daily_summary
      expect(response.status).to eq(503)
    end

    it 'returns 200 and yesterday\'s rollup with the right token' do
      yesterday = Date.current - 1
      log = AiApiLog.create!(
        ai_provider: 'claude',
        request_type: 'board_generation',
        tokens_sent: 100,
        tokens_received: 200,
        success: true
      )
      log.update_column(:created_at, yesterday.beginning_of_day + 2.hours)

      request.headers['X-Internal-Token'] = token
      get :daily_summary

      expect(response.status).to eq(200)
      body = JSON.parse(response.body)
      expect(body['date']).to eq(yesterday.iso8601)
      expect(body['total_calls']).to eq(1)
      expect(body['total_tokens_sent']).to eq(100)
      expect(body['by_provider'].length).to eq(1)
      expect(body['by_provider'].first['provider']).to eq('claude')
    end

    it 'accepts a date param' do
      target = Date.current - 5
      log = AiApiLog.create!(ai_provider: 'gemini', request_type: 'word_suggestion')
      log.update_column(:created_at, target.beginning_of_day + 1.hour)

      request.headers['X-Internal-Token'] = token
      get :daily_summary, params: { date: target.iso8601 }

      expect(response.status).to eq(200)
      body = JSON.parse(response.body)
      expect(body['date']).to eq(target.iso8601)
      expect(body['total_calls']).to eq(1)
    end

    it 'returns 400 for an invalid date' do
      request.headers['X-Internal-Token'] = token
      get :daily_summary, params: { date: 'not-a-date' }
      expect(response.status).to eq(400)
    end
  end
end
