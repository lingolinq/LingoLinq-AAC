# LingoLinq-AAC Advanced LLM/ML Integration Plan

## Overview

This document outlines the integration of Large Language Models (LLMs) and Machine Learning capabilities into LingoLinq-AAC, building upon the existing grammar/inflection system and expanding into comprehensive language support, content generation, and intelligent AAC assistance.

## Current State Analysis

### Existing Language Features
Based on codebase analysis, LingoLinq-AAC currently includes:

- ✅ **Google Translate Integration**: Basic translation capabilities
- ✅ **English Grammar/Inflection**: Compass direction-based parts of speech
- ✅ **Focus Word Feature**: CSV input for word highlighting
- ✅ **Create Board Feature**: CSV input for board generation
- ✅ **Word Data Management**: Core word suggestions and management
- ✅ **Utterance Generation**: Speech synthesis and sentence building

### Current Architecture Points of Integration
```ruby
# Key files for LLM integration
app/models/word_data.rb           # Word management and suggestions
app/controllers/api/words_controller.rb  # Word API endpoints
lib/converters/utils.rb           # Language processing utilities
app/frontend/app/utils/word_suggestions.js  # Frontend word logic
```

## Phase 1: Subject-Based Word Generation (Weeks 13-16)

### Core Feature: LLM-Powered Word Lists

Replace CSV input with natural language prompts for generating contextual word lists.

#### Current Workflow
```
User Input: Upload CSV with words
System: Import words → Create board/highlight words
```

#### Enhanced LLM Workflow
```
User Input: "Fox in socks" or "The playground"
LLM: Generate contextual core words
System: Feed into existing Focus Word/Create Board features
```

### Technical Implementation

#### 1. LLM Service Layer
```javascript
// services/wordGeneration.js
class WordGenerationService {
  constructor() {
    this.llm = new LocalLLMClient({
      model: 'llama3.1:70b',
      endpoint: process.env.LLM_ENDPOINT || 'http://localhost:11434'
    });
  }

  async generateCoreWords(subject, options = {}) {
    const prompt = this.buildWordGenerationPrompt(subject, options);
    
    const response = await this.llm.generate({
      prompt,
      max_tokens: 200,
      temperature: 0.3,
      format: 'json'
    });

    return this.parseWordResponse(response, subject);
  }

  buildWordGenerationPrompt(subject, options) {
    const { 
      wordCount = 30, 
      ageGroup = 'elementary',
      communicationLevel = 'basic',
      includePartsOfSpeech = true 
    } = options;

    return `Generate ${wordCount} core vocabulary words for AAC communication about "${subject}".

Requirements:
- Age-appropriate for ${ageGroup} level
- Include high-frequency words relevant to the topic
- Mix of nouns, verbs, adjectives, and function words
- Consider communication needs and context
${includePartsOfSpeech ? '- Include part of speech for each word' : ''}

Format as JSON:
{
  "subject": "${subject}",
  "words": [
    {
      "word": "fox",
      "partOfSpeech": "noun",
      "relevance": "high",
      "frequency": "medium"
    }
  ]
}`;
  }

  parseWordResponse(response, subject) {
    try {
      const data = JSON.parse(response.text);
      return {
        subject: subject,
        generatedWords: data.words.map(w => ({
          word: w.word,
          partOfSpeech: w.partOfSpeech || 'unknown',
          relevance: w.relevance || 'medium',
          compass_direction: this.mapToCompassDirection(w.partOfSpeech)
        })),
        metadata: {
          generatedAt: new Date(),
          model: 'llama3.1:70b',
          totalWords: data.words.length
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
  }

  mapToCompassDirection(partOfSpeech) {
    // Map to existing compass direction system
    const mappings = {
      'noun': 'north',
      'verb': 'south', 
      'adjective': 'east',
      'adverb': 'west',
      'pronoun': 'northeast',
      'preposition': 'northwest',
      'conjunction': 'southeast',
      'interjection': 'southwest'
    };
    return mappings[partOfSpeech.toLowerCase()] || 'center';
  }
}
```

#### 2. Rails API Integration
```ruby
# app/controllers/api/word_generation_controller.rb
class Api::WordGenerationController < ApplicationController
  before_action :require_api_token
  
  def generate_words
    subject = params[:subject]
    options = {
      word_count: params[:word_count] || 30,
      age_group: params[:age_group] || 'elementary',
      communication_level: params[:communication_level] || 'basic'
    }
    
    begin
      # Call LLM service
      result = WordGenerationService.new.generate_core_words(subject, options)
      
      # Log generation for analytics
      log_word_generation(subject, result, @api_user)
      
      render json: {
        success: true,
        subject: subject,
        words: result[:generated_words],
        metadata: result[:metadata]
      }
    rescue => e
      Rails.logger.error "Word generation failed: #{e.message}"
      render json: { 
        error: "Failed to generate words for subject: #{subject}",
        details: e.message 
      }, status: 500
    end
  end
  
  private
  
  def log_word_generation(subject, result, user)
    ApiCall.create!(
      user: user,
      request_type: 'word_generation',
      request_data: { subject: subject },
      response_data: result[:metadata],
      created_at: Time.current
    )
  end
end
```

#### 3. Frontend Integration
```javascript
// app/frontend/app/components/smart-word-generator.js
import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class SmartWordGeneratorComponent extends Component {
  @service store;
  @service ajax;
  
  @tracked subject = '';
  @tracked generatedWords = [];
  @tracked isGenerating = false;
  @tracked error = null;

  @action
  async generateWords() {
    if (!this.subject.trim()) return;
    
    this.isGenerating = true;
    this.error = null;
    
    try {
      const response = await this.ajax.request('/api/v1/word_generation', {
        method: 'POST',
        data: {
          subject: this.subject,
          word_count: this.args.wordCount || 30,
          age_group: this.args.ageGroup || 'elementary'
        }
      });
      
      this.generatedWords = response.words;
      
      // Integrate with existing Focus Word feature
      if (this.args.onWordsGenerated) {
        this.args.onWordsGenerated(response.words);
      }
      
    } catch (error) {
      this.error = `Failed to generate words: ${error.message}`;
    } finally {
      this.isGenerating = false;
    }
  }

  @action
  updateSubject(event) {
    this.subject = event.target.value;
  }

  @action
  useForFocusWords() {
    // Convert to CSV format for existing system
    const csvData = this.generatedWords.map(w => w.word).join('\n');
    this.args.onCsvGenerated?.(csvData);
  }

  @action
  createBoardFromWords() {
    // Use existing Create Board feature
    this.args.onCreateBoard?.(this.generatedWords);
  }
}
```

## Phase 2: Enhanced Grammar and Multilingual Support (Weeks 17-20)

### Extending Compass Direction System

#### Current System Analysis
The existing system uses compass directions for parts of speech. We'll extend this with LLM-powered grammar rules for multiple languages.

#### Multi-Language Grammar Service
```javascript
// services/grammarService.js
class GrammarService {
  constructor() {
    this.llm = new LocalLLMClient();
    this.grammarRules = new Map(); // Cache for language rules
  }

  async getLanguageRules(language) {
    if (this.grammarRules.has(language)) {
      return this.grammarRules.get(language);
    }

    const prompt = `Provide comprehensive grammar rules for ${language} suitable for AAC communication.

Focus on:
1. Word order patterns (SOV, SVO, etc.)
2. Common verb conjugations
3. Adjective placement
4. Question formation
5. Negation patterns
6. Plural formations

Format as JSON with examples:
{
  "language": "${language}",
  "wordOrder": "SVO",
  "rules": [
    {
      "type": "verb_conjugation",
      "description": "Present tense conjugation",
      "pattern": "{stem} + {ending}",
      "examples": ["I walk", "you walk", "he walks"]
    }
  ]
}`;

    const response = await this.llm.generate({ prompt });
    const rules = JSON.parse(response.text);
    this.grammarRules.set(language, rules);
    return rules;
  }

  async conjugateVerb(verb, tense, person, language = 'en') {
    const rules = await this.getLanguageRules(language);
    
    const prompt = `Conjugate the ${language} verb "${verb}" for:
- Tense: ${tense}
- Person: ${person}
- Language: ${language}

Use these grammar rules: ${JSON.stringify(rules.rules)}

Return only the conjugated form.`;

    const response = await this.llm.generate({ prompt, max_tokens: 50 });
    return response.text.trim();
  }

  async buildSentence(words, language = 'en') {
    const rules = await this.getLanguageRules(language);
    
    const prompt = `Arrange these words into a grammatically correct sentence in ${language}:
Words: ${words.join(', ')}

Grammar rules: ${JSON.stringify(rules)}
Word order: ${rules.wordOrder}

Return only the corrected sentence.`;

    const response = await this.llm.generate({ prompt, max_tokens: 100 });
    return response.text.trim();
  }
}
```

## Phase 3: Advanced AAC Intelligence (Weeks 21-24)

### Predictive Communication Features

#### 1. Context-Aware Word Prediction
```javascript
// services/contextualPrediction.js
class ContextualPredictionService {
  async predictNextWords(utteranceHistory, currentContext, userProfile) {
    const prompt = `Based on this AAC user's communication pattern, predict the most likely next words:

Recent utterances: ${utteranceHistory.slice(-5).join(' | ')}
Current context: ${currentContext}
User profile: ${JSON.stringify(userProfile)}

Consider:
- Communication patterns
- Frequently used phrases
- Context relevance
- User's vocabulary level

Return top 5 predictions with confidence scores:
{
  "predictions": [
    {"word": "want", "confidence": 0.85, "reason": "frequently follows 'I'"},
    {"word": "go", "confidence": 0.72, "reason": "common action word"}
  ]
}`;

    const response = await this.llm.generate({ prompt });
    return JSON.parse(response.text);
  }
}
```

#### 2. Intelligent Board Suggestions
```javascript
// services/boardIntelligence.js
class BoardIntelligenceService {
  async suggestBoardImprovements(boardData, usageAnalytics) {
    const prompt = `Analyze this AAC board and suggest improvements:

Board layout: ${JSON.stringify(boardData.buttons)}
Usage statistics: ${JSON.stringify(usageAnalytics)}

Suggest:
1. Button repositioning for better access
2. Missing words that could improve communication
3. Button groupings that make sense
4. Difficulty level adjustments

Format as actionable suggestions with reasoning.`;

    const response = await this.llm.generate({ prompt });
    return this.parseImprovementSuggestions(response.text);
  }

  async generateAccessibilityReport(boardData) {
    const prompt = `Evaluate this AAC board for accessibility issues:

Board data: ${JSON.stringify(boardData)}

Check for:
- Button size consistency
- Color contrast ratios
- Symbol clarity
- Navigation patterns
- Motor skill requirements

Provide accessibility score and specific recommendations.`;

    const response = await this.llm.generate({ prompt });
    return JSON.parse(response.text);
  }
}
```

## Phase 4: Educational Integration Features (Weeks 25-28)

### Google Classroom Style Interface

#### 1. Assignment and Progress Tracking
```javascript
// components/classroom-dashboard.js
class ClassroomDashboardComponent extends Component {
  @service llmAnalytics;
  
  async generateProgressReport(studentId, timeframe) {
    const usageData = await this.store.query('log-session', {
      user_id: studentId,
      start_date: timeframe.start,
      end_date: timeframe.end
    });

    const analysis = await this.llmAnalytics.analyzeProgress({
      studentId,
      sessions: usageData,
      goals: await this.store.query('goal', { user_id: studentId })
    });

    return analysis;
  }

  async generateLessonPlan(topic, studentProfile) {
    const plan = await this.llmAnalytics.generateLessonPlan({
      topic,
      studentLevel: studentProfile.communicationLevel,
      preferences: studentProfile.preferences,
      currentVocabulary: studentProfile.knownWords
    });

    return plan;
  }
}
```

#### 2. SSO Integration
```ruby
# config/initializers/omniauth.rb
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2, 
    ENV['GOOGLE_CLIENT_ID'],
    ENV['GOOGLE_CLIENT_SECRET'],
    {
      scope: 'email,profile,classroom.courses.readonly,classroom.rosters.readonly'
    }
  
  provider :microsoft_graph,
    ENV['AZURE_CLIENT_ID'],
    ENV['AZURE_CLIENT_SECRET']
end
```

## Open Source LLM Deployment Strategy

### Local LLM Infrastructure

#### 1. Ollama Setup for Production
```docker
# docker-compose.yml
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ./ollama-data:/root/.ollama
    environment:
      - OLLAMA_MODELS=llama3.1:70b,mistral:7b
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

#### 2. Cost Comparison
```javascript
// Cost analysis for different deployment options
const costAnalysis = {
  openai: {
    monthly_cost: 2000, // $2000/month for expected usage
    per_request: 0.03,
    scaling: 'automatic',
    latency: '200ms average'
  },
  
  local_llama: {
    monthly_cost: 200, // VPS with GPU
    per_request: 0, // No per-request costs
    scaling: 'manual',
    latency: '500ms average',
    savings_percent: 90
  },
  
  hybrid: {
    monthly_cost: 600, // Local + OpenAI fallback
    per_request: 0.01, // Reduced API usage
    scaling: 'semi-automatic',
    latency: '300ms average',
    savings_percent: 70
  }
};
```

### Model Selection Matrix

| Model | Use Case | Performance | Cost | Deployment |
|-------|----------|-------------|------|------------|
| **Llama 3.1 70B** | Grammar/Translation | Excellent | Low | Local GPU |
| **Mistral 7B** | Word Generation | Good | Very Low | CPU/Small GPU |
| **Phi-4** | Quick Responses | Good | Very Low | CPU |
| **Command R+** | Reasoning Tasks | Excellent | Low | Local GPU |

## Integration with Existing Architecture

### Database Schema Extensions
```ruby
# New migration for LLM features
class AddLlmFeatures < ActiveRecord::Migration[7.0]
  def change
    create_table :llm_interactions do |t|
      t.references :user, null: false
      t.string :interaction_type # word_generation, grammar_check, etc.
      t.text :prompt
      t.text :response
      t.string :model_used
      t.decimal :processing_time
      t.json :metadata
      t.timestamps
    end

    create_table :generated_word_lists do |t|
      t.references :user, null: false
      t.string :subject
      t.json :words_data
      t.string :generation_method # llm, csv, manual
      t.timestamps
    end

    add_column :word_data, :llm_generated, :boolean, default: false
    add_column :word_data, :context_tags, :text, array: true, default: []
  end
end
```

### API Extensions
```ruby
# config/routes.rb
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      # Existing routes...
      
      # New LLM routes
      resources :word_generation, only: [:create] do
        post :generate_from_subject, on: :collection
        post :enhance_word_list, on: :collection
      end
      
      resources :grammar_assistance, only: [:create] do
        post :check_sentence, on: :collection
        post :conjugate_verb, on: :collection
        post :translate_phrase, on: :collection
      end
      
      resources :intelligent_suggestions, only: [:create] do
        post :predict_words, on: :collection
        post :analyze_board, on: :collection
        post :generate_lesson_plan, on: :collection
      end
    end
  end
end
```

## Future AAC + LLM Innovations

### Emerging Applications
1. **Real-time Translation**: Live conversation translation for multilingual environments
2. **Emotion Recognition**: LLM analysis of communication patterns for emotional state
3. **Adaptive Interfaces**: AI-driven interface modifications based on user behavior
4. **Voice Cloning**: Personalized synthetic voices using small speech samples
5. **Gesture Recognition**: Combined with computer vision for multimodal AAC
6. **Caregiver Insights**: AI-powered reports for therapists and families

### Codebase Growth Considerations

#### Architecture Strengths for LLM Integration
✅ **Modular Design**: Easy to add new services and features  
✅ **API-First**: Well-structured for LLM service integration  
✅ **Extensible Models**: Word data and user models ready for enhancement  
✅ **Component Architecture**: Frontend components can be enhanced individually  

#### Recommended Improvements
🔧 **Service Layer**: Add dedicated LLM service layer  
🔧 **Caching Strategy**: Redis caching for LLM responses  
🔧 **Queue System**: Background processing for heavy LLM tasks  
🔧 **Configuration Management**: Environment-based LLM model selection  

---
**Status**: 📋 Ready for Implementation  
**Prerequisites**: MVP Modernization (Phase 1)  
**Estimated Timeline**: 16 weeks (Phases 1-4)  
**Key Benefits**: Enhanced user experience, multilingual support, intelligent assistance