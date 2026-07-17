# frozen_string_literal: true

require 'spec_helper'

describe Api::PredictionEntriesController, type: :controller do
  describe 'GET index' do
    it 'requires an api token' do
      get :index, params: { prefix: 'i want' }
      assert_missing_token
    end

    it 'returns entries for a prefix' do
      token_user
      PredictionEntry.create!(
        user_id: @user.id,
        locale: 'en',
        prefix: 'i want',
        next_word: 'to',
        score: 3.0,
        source: 'selection'
      )

      get :index, params: { prefix: 'i want', locale: 'en' }
      json = assert_success_json
      expect(json['entries'].length).to eq(1)
      expect(json['entries'][0]['next_word']).to eq('to')
    end
  end

  describe 'POST sync' do
    it 'requires an api token' do
      post :sync, params: { prediction_entries: [{ prefix: 'i', next_word: 'want' }] }
      assert_missing_token
    end

    it 'creates and increments prediction entries' do
      token_user
      post :sync, params: {
        prediction_entries: [
          { locale: 'en', prefix: 'i', next_word: 'want', delta: 1, source: 'selection' },
          { locale: 'en', prefix: 'i', next_word: 'want', delta: 2, source: 'selection' }
        ]
      }
      json = assert_success_json
      expect(json['prediction_entries']['count']).to eq(2)
      entry = PredictionEntry.find_by(user_id: @user.id, locale: 'en', prefix: 'i', next_word: 'want')
      expect(entry.score).to eq(3.0)
    end
  end
end
