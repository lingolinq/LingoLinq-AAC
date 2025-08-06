import LingoLinqAAC from '../app';
import i18n from './i18n';
import capabilities from './capabilities';

var llm_inflections = {
  // Cache for LLM-generated inflections to avoid repeated API calls
  cache: {},
  
  // Enhanced inflection generation using LLM backend
  enhanced_inflections: function(word, options) {
    options = options || {};
    var language = options.language || options.locale || i18n.get_current_locale() || 'en';
    var context = options.context || options.sentence; // Sentence context for better inflections
    
    // Return cached result if available
    var cache_key = word + '_' + language + '_' + (context || '');
    if(this.cache[cache_key]) {
      return this.cache[cache_key];
    }
    
    var promise = new Promise((resolve, reject) => {
      // Check if user has access to LLM features
      var user = LingoLinqAAC.get('currentUser');
      var allow_llm = user && (user.get('premium_supporter') || user.get('full_premium'));
      
      if(!allow_llm || !capabilities.api_host) {
        // Fall back to existing i18n system
        resolve(this.fallback_inflections(word, options));
        return;
      }
      
      // Build API request
      var api_url = capabilities.api_host + '/api/v1/inflections';
      var params = new URLSearchParams({
        word: word,
        locale: language
      });
      
      if(context) {
        params.append('context', context);
      }
      
      // Make API request
      fetch(api_url + '?' + params.toString(), {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + LingoLinqAAC.get('session.access_token'),
          'Content-Type': 'application/json'
        }
      }).then(response => {
        if(!response.ok) {
          throw new Error('API request failed');
        }
        return response.json();
      }).then(data => {
        var inflections = this.process_api_response(data, word, language);
        
        // Cache successful results
        this.cache[cache_key] = inflections;
        
        resolve(inflections);
      }).catch(error => {
        console.warn('LLM inflections failed, falling back:', error);
        resolve(this.fallback_inflections(word, options));
      });
    });
    
    return promise;
  },
  
  process_api_response: function(data, word, language) {
    if(!data || !data.inflections) {
      return this.fallback_inflections(word, {language: language});
    }
    
    var inflections = data.inflections;
    var result = {
      base: word,
      source: data.source || 'unknown',
      language: language
    };
    
    // Process common inflection types
    if(inflections.plural) result.plural = inflections.plural;
    if(inflections.past_tense) result.past = inflections.past_tense;
    if(inflections.present_participle) result.present_participle = inflections.present_participle;
    if(inflections.comparative) result.comparative = inflections.comparative;
    if(inflections.superlative) result.superlative = inflections.superlative;
    if(inflections.possessive) result.possessive = inflections.possessive;
    if(inflections.negation) result.negation = inflections.negation;
    
    // Language-specific inflections
    if(language === 'es') {
      if(inflections.feminine) result.feminine = inflections.feminine;
      if(inflections.masculine) result.masculine = inflections.masculine;
      if(inflections.preterite) result.preterite = inflections.preterite;
      if(inflections.imperfect) result.imperfect = inflections.imperfect;
      if(inflections.subjunctive) result.subjunctive = inflections.subjunctive;
    }
    
    return result;
  },
  
  fallback_inflections: function(word, options) {
    options = options || {};
    var result = {
      base: word,
      source: 'rule_based',
      language: options.language || options.locale || 'en'
    };
    
    // Use existing i18n.js logic
    try {
      result.plural = i18n.pluralize(word);
      result.past = i18n.tense(word, {simple_past: true});
      result.present_participle = i18n.tense(word, {present_participle: true});
      result.comparative = i18n.comparative(word);
      result.superlative = i18n.superlative(word);
      result.possessive = i18n.possessive(word);
      result.negation = i18n.negation(word);
    } catch(e) {
      console.warn('Fallback inflections failed:', e);
    }
    
    return Promise.resolve(result);
  },
  
  // Submit user corrections to improve the system
  submit_correction: function(word, corrected_inflections, context) {
    var user = LingoLinqAAC.get('currentUser');
    if(!user || !capabilities.api_host) return;
    
    var api_url = capabilities.api_host + '/api/v1/inflections';
    var language = i18n.get_current_locale() || 'en';
    
    var payload = {
      word: word,
      locale: language,
      inflections: corrected_inflections,
      context: context
    };
    
    fetch(api_url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + LingoLinqAAC.get('session.access_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(response => {
      if(response.ok) {
        // Clear cache to force fresh lookup
        var cache_key = word + '_' + language + '_' + (context || '');
        delete this.cache[cache_key];
        console.log('Inflection correction submitted successfully');
      }
    }).catch(error => {
      console.warn('Failed to submit inflection correction:', error);
    });
  },
  
  // Clear cache (useful for development/testing)
  clear_cache: function() {
    this.cache = {};
  }
};

export default llm_inflections;