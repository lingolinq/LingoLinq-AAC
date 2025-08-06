# Developer Brief: LLM-Enhanced Inflections Feature

## 🎯 **What We're Building**

Enhance LingoLinq AAC's **long-press inflections** feature (the word alternatives that appear when you hold down a button) with AI-powered grammar instead of hard-coded rules.

### **Current Problem**
- Existing inflections use rule-based logic in `app/frontend/app/utils/i18n.js`
- Limited accuracy (~70%) for complex English grammar
- Very basic support for other languages
- Hard to maintain and extend

### **Proposed Solution** 
- Add optional LLM-powered inflections via local AI models
- Fall back gracefully to existing system if LLM unavailable
- Support multiple languages with context awareness
- Privacy-first approach using local models (no data leaves our servers)

## 🏗️ **Technical Overview**

### **Architecture**
```
User Long Press → Frontend (llm_inflections.js) → API (/api/v1/inflections) → LLM Service → Ollama/Local AI → Response
                              ↓ (if LLM fails)
                         Fallback to existing i18n.js rules
```

### **Key Files Added** (in `feature/llm-enhanced-inflections` branch)
- `lib/llm_inflections.rb` - Core LLM integration (200 lines)
- `app/controllers/api/inflections_controller.rb` - REST API (100 lines)
- `app/frontend/app/utils/llm_inflections.js` - Frontend integration (150 lines)
- Updated routing and feature flags

### **No Breaking Changes**
- Existing inflection system remains untouched as fallback
- Feature is behind a flag (`llm_inflections`) - disabled by default
- Premium users only (configurable)
- Zero impact if LLM service is unavailable

## 🔒 **Privacy & Security**

### **Local AI Models (Recommended)**
- Uses Ollama with models like `llama3.2:1b` (1GB) or `qwen2.5:3b` (2GB)
- All processing happens on our servers
- No user data sent to external services
- GDPR compliant

### **Performance**
- Small models respond in ~200-500ms
- Cached results for common words
- Graceful degradation if slow/unavailable

## 🌍 **Language Support**

| Language | Current System | With LLM | Example Improvements |
|----------|---------------|----------|---------------------|
| English | Basic rules | 85-95% accuracy | Better irregular plurals, tenses |
| Spanish | Very limited | Gender, conjugations | "gato" → "gata" (feminine) |
| French | None | Planned | Gender agreements, liaisons |
| German | None | Planned | Case declensions |

## 💻 **Developer Testing**

### **Quick Test Setup** (Optional - feature works without this)
```bash
# Install Ollama (if you want to test LLM features)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:1b
ollama serve

# Enable feature flag for testing
rails console
> user = User.find_by(user_name: 'your_username')
> user.settings['feature_flags'] ||= {}
> user.settings['feature_flags']['llm_inflections'] = true
> user.save
```

### **Test Without LLM Setup**
The feature gracefully falls back to existing inflection logic, so you can review the code and architecture without setting up Ollama.

## 🚀 **Rollout Plan**

1. **Phase 1**: Code review and merge to main (with feature disabled)
2. **Phase 2**: Enable for internal testing accounts
3. **Phase 3**: Gradual rollout to premium users
4. **Phase 4**: Performance monitoring and user feedback collection

## 📊 **Business Impact**

### **User Experience**
- More natural and accurate word suggestions
- Better support for non-English users
- Contextual inflections (considers sentence structure)

### **Technical Benefits**
- Extensible to new languages without coding grammar rules
- User feedback loop improves accuracy over time
- Modern AI architecture for future enhancements

## 🔍 **Code Review Focus Areas**

1. **Integration Safety**: Does it properly fall back to existing system?
2. **Performance**: Are API calls properly cached/optimized?
3. **Security**: Input sanitization, rate limiting, auth checks
4. **Architecture**: Clean separation of concerns, testable
5. **Configuration**: Feature flags, environment variables properly handled

## 📁 **Key Files to Review**

### **Backend (Ruby)**
- `lib/llm_inflections.rb` - Core LLM integration service
- `app/controllers/api/inflections_controller.rb` - API endpoints and auth

### **Frontend (JavaScript)**
- `app/frontend/app/utils/llm_inflections.js` - Client-side integration

### **Configuration**
- `lib/feature_flags.rb` - Feature flag definition
- `config/routes.rb` - API routes

## ❓ **Questions for Review**

1. **Architecture**: Does the fallback strategy look solid?
2. **Performance**: Any concerns about API response times?
3. **Security**: Input validation and auth look correct?
4. **Deployment**: Any infrastructure concerns for optional Ollama?
5. **Testing**: What additional test coverage would you like?

---

**Full technical details**: See `docs/LLM_INFLECTIONS_SETUP.md` for complete setup instructions, model recommendations, and deployment configurations.

**Branch**: `feature/llm-enhanced-inflections`  
**Status**: Ready for code review and testing