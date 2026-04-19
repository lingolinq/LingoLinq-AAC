class Api::WordsController < ApplicationController
  before_action :require_api_token, :except => [:reachable_core, :lang, :predict]
  
  def index
    return unless allowed?(@api_user, 'admin_support_actions')
    words = WordData.where(locale: params['locale']).where(['priority > ?', 0])
    if params['word']
      words = words.order(ActiveRecord::Base.send(:sanitize_sql_for_conditions, ['(word = ?) DESC, (updated_at < ?) DESC, reviews ASC, priority DESC, word', params['word'], 24.hours.ago]))
    else
      words = words.where(['updated_at < ?', 24.hours.ago]).order('reviews ASC, priority DESC, word')
    end
    render json: JsonApi::Word.paginate(params, words)
  end

  def lang
    return api_error(400, {error: "locale required"}) if params['locale'].blank?
    rules = Setting.get_cached("rules/" + params['locale'])
    if !rules && params['locale'].match(/-|_/)
      rules = Setting.get_cached("rules/" + params['locale'].split(/-|_/)[0])
    end
    if rules
      render json: {
        _locale: params['locale'],
        rules: rules['rules'],
        default_contractions: rules['default_contractions'],
        contractions: rules['contractions'],
        inflection_locations: rules['inflection_locations']
      }
    else
      render json: { _locale: params['locale'] }
    end
  end

  def reachable_core
    user = User.find_by_path(params['user_id'])
    return unless exists?(user, params['user_id'])
    if user.settings['preferences']['utterance_core_access'] != false && params['utterance_id']
      utterance_id, reply_code = params['utterance_id'].split(/x/)
      utterance = Utterance.find_by_global_id(utterance_id)
      return unless exists?(utterance, utterance_id)
      return unless allowed?(utterance, 'view')
      if !utterance.accessible_for?(reply_code, false)
        return allowed?(utterance, 'never_allow')
      end
    else
      return unless allowed?(user, 'supervise')
    end
    render json: {words: WordData.reachable_core_list_for(user)}
  end
  
  def predict
    sentence = params['sentence'].to_s.strip
    return api_error(400, {error: "sentence required"}) if sentence.blank?

    locale = params['locale'] || 'en'
    count = [(params['count'] || 4).to_i, 8].min

    require_relative '../../lib/ai_word_predictor' unless defined?(AiWordPredictor)
    words = AiWordPredictor.predict(sentence: sentence, locale: locale, count: count)

    render json: { words: words }
  end

  def update
    word = WordData.find_by_global_id(params['id'])
    return unless allowed?(@api_user, 'admin_support_actions')
    return unless exists?(word, params['id'])
    word_data = params['word']
    word_data = word_data.permit! if word_data.is_a?(ActionController::Parameters)
    if word_data && word_data['skip']
      word_data = word_data.slice('skip')
    end
    if word.process(word_data, {updater: @api_user})
      render json: JsonApi::Word.as_json(word, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "word update failed", errors: word.processing_errors})
    end
  end
end
