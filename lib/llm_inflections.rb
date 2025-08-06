# LLM-powered inflection enhancement service
class LlmInflections
  
  # Configuration for different LLM backends
  SUPPORTED_MODELS = {
    # Local models via Ollama
    'llama3.2-1b' => { 
      type: 'ollama', 
      endpoint: 'http://localhost:11434',
      size: 'small',
      languages: ['en'],
      good_for: ['basic_inflections', 'fast_response']
    },
    'qwen2.5-3b' => { 
      type: 'ollama', 
      endpoint: 'http://localhost:11434',
      size: 'medium', 
      languages: ['en', 'es', 'fr', 'de', 'zh'],
      good_for: ['multilingual', 'grammar_aware']
    },
    # Hugging Face transformers
    'microsoft/DialoGPT-medium' => {
      type: 'huggingface',
      size: 'medium',
      languages: ['en'],
      good_for: ['context_aware_inflections']
    }
  }.freeze

  def self.enhance_word_inflections(word, language = 'en', context = nil)
    model = select_model_for_language(language)
    
    prompt = build_inflection_prompt(word, language, context)
    
    case model[:type]
    when 'ollama'
      generate_with_ollama(model, prompt)
    when 'huggingface'  
      generate_with_huggingface(model, prompt)
    else
      fallback_to_existing_system(word, language)
    end
  end

  private

  def self.select_model_for_language(language)
    # Prefer local models for privacy and speed
    SUPPORTED_MODELS.find { |name, config| 
      config[:languages].include?(language) && config[:type] == 'ollama' 
    }&.last || SUPPORTED_MODELS.find { |name, config| 
      config[:languages].include?(language) 
    }&.last || SUPPORTED_MODELS['llama3.2-1b']
  end

  def self.build_inflection_prompt(word, language, context)
    base_prompt = case language
    when 'en'
      <<~PROMPT
        Generate grammatical inflections for the word "#{word}" in English.
        #{context ? "Context: #{context}" : ""}
        
        Return JSON with these inflections where applicable:
        {
          "plural": "...",
          "past_tense": "...", 
          "present_participle": "...",
          "comparative": "...",
          "superlative": "...",
          "possessive": "...",
          "negation": "..."
        }
        
        Only include forms that are grammatically correct. If unsure, omit the field.
      PROMPT
    when 'es'
      <<~PROMPT
        Genera inflexiones gramaticales para la palabra "#{word}" en español.
        #{context ? "Contexto: #{context}" : ""}
        
        Devuelve JSON con estas inflexiones cuando corresponda:
        {
          "plural": "...",
          "feminine": "...",
          "masculine": "...", 
          "preterite": "...",
          "imperfect": "...",
          "subjunctive": "..."
        }
      PROMPT
    else
      # Generic multilingual prompt
      <<~PROMPT
        Generate grammatical inflections for "#{word}" in #{language}.
        Return only valid grammatical forms as JSON.
        Context: #{context}
      PROMPT
    end

    base_prompt
  end

  def self.generate_with_ollama(model, prompt)
    require 'net/http'
    require 'json'
    
    begin
      uri = URI("#{model[:endpoint]}/api/generate")
      
      request_body = {
        model: model_name_from_config(model),
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3, # Lower for more consistent grammar
          top_p: 0.8,
          max_tokens: 200
        }
      }

      response = Net::HTTP.post(uri, request_body.to_json, {
        'Content-Type' => 'application/json'
      })

      if response.code == '200'
        result = JSON.parse(response.body)
        parse_llm_inflections(result['response'])
      else
        Rails.logger.warn "Ollama request failed: #{response.code}"
        nil
      end
    rescue => e
      Rails.logger.error "LLM inflection error: #{e.message}"
      nil
    end
  end

  def self.generate_with_huggingface(model, prompt)
    # Implementation for Hugging Face models
    # Could use transformers library or HF inference API
    nil
  end

  def self.parse_llm_inflections(response_text)
    # Extract JSON from LLM response, handling various formats
    begin
      # Try to find JSON block in response
      json_match = response_text.match(/\{[\s\S]*\}/)
      return nil unless json_match
      
      inflections = JSON.parse(json_match[0])
      
      # Validate inflections are reasonable
      return nil if inflections.empty?
      
      # Clean up any obviously wrong inflections
      inflections.select { |key, value| 
        value.is_a?(String) && value.length > 0 && value.length < 50 
      }
    rescue JSON::ParserError
      Rails.logger.warn "Failed to parse LLM inflection response: #{response_text}"
      nil
    end
  end

  def self.fallback_to_existing_system(word, language)
    # Fall back to existing i18n.js logic
    # This would need to be extracted into Ruby
    {}
  end

  def self.model_name_from_config(model_config)
    # Map internal config to actual model names
    case model_config[:size]
    when 'small'
      'llama3.2:1b'
    when 'medium'  
      'qwen2.5:3b'
    else
      'llama3.2:1b'
    end
  end
end