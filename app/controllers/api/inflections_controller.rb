class Api::InflectionsController < ApplicationController
  before_action :require_api_token, :except => [:index]

  def index
    # Get LLM-enhanced inflections for a word
    word = params['word']&.downcase
    language = params['locale'] || params['language'] || 'en'
    context = params['context'] # Optional sentence context
    
    return unless word
    return unless word.length < 100 # Safety check
    
    # Check if user has premium features for LLM inflections
    allow_llm = @api_user&.premium_supporter? || 
                (@api_user&.full_premium? && FeatureFlags.user_created_after?(@api_user, 'inflections_llm')) ||
                Rails.env.development?

    result = if allow_llm
      # Try LLM-enhanced inflections first
      llm_inflections = LlmInflections.enhance_word_inflections(word, language, context)
      
      if llm_inflections&.any?
        # Merge with existing inflections as fallback
        existing_inflections = get_existing_inflections(word, language)
        existing_inflections.merge(llm_inflections)
      else
        # Fall back to existing system
        get_existing_inflections(word, language)
      end
    else
      # Use existing rule-based system
      get_existing_inflections(word, language)
    end

    render json: {
      word: word,
      language: language,
      inflections: result,
      source: allow_llm && result.keys.any? ? 'llm_enhanced' : 'rule_based',
      context: context
    }
  end

  def create
    # Allow users to submit inflection corrections/feedback
    return unless @api_user
    
    word = params['word']&.downcase
    language = params['locale'] || params['language'] || 'en' 
    inflections = params['inflections'] || {}
    user_context = params['context']

    return api_error(400, 'Missing word') unless word
    return api_error(400, 'Invalid inflections') unless inflections.is_a?(Hash)

    # Store user feedback for future model training
    word_data = WordData.find_or_create_by(word: word, locale: language)
    word_data.data ||= {}
    word_data.data['user_feedback'] ||= []
    
    feedback_entry = {
      user_id: @api_user.global_id,
      timestamp: Time.now.iso8601,
      inflections: inflections.select { |k, v| v.present? },
      context: user_context,
      source: 'user_correction'
    }
    
    word_data.data['user_feedback'] << feedback_entry
    
    # Keep only last 10 feedback entries to prevent data bloat
    word_data.data['user_feedback'] = word_data.data['user_feedback'].last(10)
    
    if word_data.save
      render json: { success: true, word: word }
    else
      api_error(500, 'Save failed')
    end
  end

  private

  def get_existing_inflections(word, language)
    # This would integrate with existing WordData and i18n.js logic
    word_data = WordData.find_by(word: word, locale: language)
    
    inflections = {}
    
    if word_data&.data&.dig('inflection_overrides')
      inflections.merge!(word_data.data['inflection_overrides'])
    end
    
    # For now, return basic inflections - would need to port i18n.js logic
    # or call frontend i18n functions
    case language
    when 'en'
      inflections['plural'] ||= simple_english_plural(word)
      inflections['past_tense'] ||= simple_english_past(word) 
    end
    
    inflections
  end

  def simple_english_plural(word)
    # Very basic English pluralization - i18n.js has much more sophisticated logic
    return word + 's' unless word.end_with?('s', 'sh', 'ch', 'x', 'z')
    word + 'es'
  end

  def simple_english_past(word)
    # Very basic past tense - i18n.js has much more sophisticated logic  
    return word + 'd' if word.end_with?('e')
    return word + 'ied' if word.end_with?('y')
    word + 'ed'
  end
end