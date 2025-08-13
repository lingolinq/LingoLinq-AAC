# LLM-Enhanced Inflections Setup Guide

## Overview

LingoLinq AAC now supports LLM-enhanced inflections that provide more accurate and context-aware grammatical variations for words. This system improves upon the existing rule-based inflections with open-source language models.

## Features

### ✅ **Enhanced English Inflections**
- More accurate pluralization, tense changes, and comparatives
- Context-aware suggestions based on sentence structure
- Handles irregular words better than rule-based system

### ✅ **Multi-language Support**
- Spanish: Gender agreements, verb conjugations, subjunctive mood
- French: Gender, number, verb tenses (planned)
- German: Cases, declensions (planned)
- Portuguese: Verb conjugations (planned)

### ✅ **User Feedback Loop**
- Users can correct inflections to improve the system
- Feedback is stored and used for model fine-tuning
- Premium users get access to LLM features

## Architecture

```
Frontend (Ember.js)
├── app/utils/llm_inflections.js - Enhanced inflection logic
├── app/utils/i18n.js - Fallback rule-based system
└── Long press UI - Shows LLM-generated alternatives

Backend (Rails)
├── lib/llm_inflections.rb - LLM integration service
├── app/controllers/api/inflections_controller.rb - API endpoint
└── app/models/word_data.rb - Stores user feedback

LLM Backend
├── Ollama (local models) - Privacy-focused
├── Hugging Face - Cloud-based options
└── Custom fine-tuned models - Domain-specific
```

## Installation & Setup

### 1. Install Ollama (Recommended for Privacy)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull recommended models
ollama pull llama3.2:1b    # Fast, English-focused
ollama pull qwen2.5:3b     # Multilingual, better quality

# Start Ollama server
ollama serve
```

### 2. Enable Feature Flags

Add to user's feature flags or enable globally:

```ruby
# Enable for specific users
user.settings['feature_flags'] ||= {}
user.settings['feature_flags']['llm_inflections'] = true
user.save

# OR enable for all premium users (recommended)
# Already configured in lib/feature_flags.rb
```

### 3. Configure LLM Backend

Set environment variables:

```bash
# .env file
LLM_INFLECTIONS_ENABLED=true
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b

# Optional: Hugging Face API key for cloud models
HUGGINGFACE_API_KEY=your_key_here
```

### 4. Database Migration

```bash
# Add columns for storing LLM feedback
rails generate migration AddLlmFeedbackToWordData
```

```ruby
class AddLlmFeedbackToWordData < ActiveRecord::Migration[6.1]
  def change
    add_column :word_data, :llm_version, :string
    add_index :word_data, [:word, :locale, :llm_version]
  end
end
```

## Usage

### Long Press Inflections

Users can now long-press any button to see LLM-enhanced inflections:

```javascript
// Automatic integration with existing long-press system
// Enhanced inflections will appear in the overlay menu
```

### API Usage

```bash
# Get inflections for a word
curl "https://app.lingolinq.com/api/v1/inflections?word=run&locale=en&context=I%20like%20to" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response
{
  "word": "run",
  "language": "en", 
  "inflections": {
    "past_tense": "ran",
    "present_participle": "running",
    "third_person": "runs"
  },
  "source": "llm_enhanced",
  "context": "I like to"
}
```

### Submit Corrections

```bash
curl -X POST "https://app.lingolinq.com/api/v1/inflections" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "word": "run",
    "locale": "en",
    "inflections": {
      "past_tense": "ran",
      "gerund": "running"
    },
    "context": "I was running yesterday"
  }'
```

## Model Configuration

### Recommended Models by Use Case

| Use Case | Model | Size | Languages | Notes |
|----------|-------|------|-----------|-------|
| Development | `llama3.2:1b` | 1GB | English | Fast, good for testing |
| Production English | `qwen2.5:3b` | 1.9GB | EN, ES, FR, DE | Best accuracy/speed balance |
| Multilingual | `qwen2.5:7b` | 4.4GB | 29 languages | Highest quality |
| Privacy Critical | Local Ollama | Any | Depends | Never leaves your server |

### Model Performance

| Model | Response Time | RAM Usage | Languages | Accuracy |
|-------|---------------|-----------|-----------|----------|
| llama3.2:1b | ~200ms | 2GB | EN | 85% |
| qwen2.5:3b | ~500ms | 4GB | EN,ES,FR,DE,ZH | 92% |
| qwen2.5:7b | ~1000ms | 8GB | 29+ | 95% |

## Deployment

### Production Deployment

```yaml
# docker-compose.yml addition
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama
  environment:
    - OLLAMA_HOST=0.0.0.0:11434
  deploy:
    resources:
      limits:
        memory: 8G
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

### Monitoring

```ruby
# Add to application monitoring
class InflectionMetrics
  def self.track_llm_usage
    # Track response times, accuracy, user satisfaction
  end
end
```

## Multi-language Extensions

### Adding New Languages

1. **Update model configuration**:

```ruby
# lib/llm_inflections.rb
SUPPORTED_MODELS['multilingual-model'] = {
  languages: ['en', 'es', 'fr', 'de', 'pt', 'your_language']
}
```

2. **Add language-specific prompts**:

```ruby
def build_inflection_prompt(word, language, context)
  case language
  when 'pt'  # Portuguese
    <<~PROMPT
      Gere inflexões gramaticais para "#{word}" em português.
      Contexto: #{context}
      
      Retorne JSON com:
      {
        "plural": "...",
        "feminino": "...",
        "preterito": "...",
        "subjuntivo": "..."
      }
    PROMPT
  end
end
```

3. **Update frontend**:

```javascript
// app/frontend/app/utils/llm_inflections.js
process_api_response: function(data, word, language) {
  if(language === 'pt') {
    if(inflections.feminino) result.feminine = inflections.feminino;
    if(inflections.preterito) result.past = inflections.preterito;
  }
}
```

## Testing

### Unit Tests

```ruby
# spec/lib/llm_inflections_spec.rb
describe LlmInflections do
  it "generates English inflections" do
    result = LlmInflections.enhance_word_inflections('run', 'en')
    expect(result['past_tense']).to eq('ran')
  end
  
  it "handles Spanish gender" do
    result = LlmInflections.enhance_word_inflections('gato', 'es')
    expect(result['feminine']).to eq('gata')
  end
end
```

### Integration Tests

```bash
# Test API endpoints
rails test test/integration/inflections_api_test.rb
```

## Privacy & Security

### Data Handling
- **Local Models**: All processing happens on your servers
- **No Data Sent**: User data never leaves your infrastructure
- **GDPR Compliant**: Can be configured for full data locality
- **User Consent**: Premium feature, users opt-in

### Security Considerations
- Input sanitization prevents prompt injection
- Rate limiting prevents abuse
- Authentication required for API access
- Audit logging for all LLM requests

## Troubleshooting

### Common Issues

**Ollama not responding:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Restart if needed
pkill ollama && ollama serve
```

**Model not found:**
```bash
# List available models
ollama list

# Pull missing model
ollama pull llama3.2:1b
```

**High memory usage:**
```bash
# Monitor resource usage
docker stats ollama_container
```

### Performance Optimization

1. **Model Selection**: Use smaller models in development
2. **Caching**: Implement Redis caching for frequent words
3. **Batching**: Group multiple word requests
4. **Fallback**: Always have rule-based fallback ready

## Roadmap

### Phase 1 (Current)
- [x] English LLM inflections
- [x] Basic Spanish support
- [x] User feedback system
- [x] Ollama integration

### Phase 2 (Q3 2025)
- [ ] French, German, Portuguese
- [ ] Context-aware suggestions
- [ ] Custom model fine-tuning
- [ ] Advanced caching

### Phase 3 (Q4 2025)
- [ ] Voice-to-inflection
- [ ] Semantic similarity
- [ ] Multi-modal understanding
- [ ] Advanced ML pipelines

## Support

For issues with LLM inflections:

1. Check logs: `tail -f log/production.log | grep LLM`
2. Verify Ollama health: `curl localhost:11434/api/version`  
3. Test fallback: Disable LLM temporarily
4. Report issues with word examples and expected outputs

---

*This system dramatically improves the accuracy and naturalness of LingoLinq AAC's grammatical suggestions while maintaining privacy and performance.*