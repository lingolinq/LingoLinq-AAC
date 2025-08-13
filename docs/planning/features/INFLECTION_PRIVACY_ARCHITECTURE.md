# Inflection Privacy Architecture Options

## Current Implementation (Shared)

### How it Works
- **Single AI Model**: One Ollama instance serves all users
- **Shared Cache**: WordData stores inflections for all users to share
- **Universal Grammar**: Basic inflections like "run" → "running" are the same for everyone

```ruby
# Current: Shared inflection lookup
word_data = WordData.find_by(word: "run", locale: "en")
# Same result for all users
```

### Data Flow
```
User Request → LLM Service → WordData Cache (Shared) → All Users Benefit
```

## Future: Layered Privacy Model

### Three-Tier System

#### **Tier 1: Universal Grammar (Shared)**
Basic linguistic rules that apply to everyone:
```ruby
# Shared across all users - no privacy concerns
{ 
  word: "run", 
  past_tense: "ran", 
  present_participle: "running",
  source: "universal_grammar"
}
```

#### **Tier 2: Personalized Preferences (Private)**
User-specific customizations and corrections:
```ruby
# Stored per-user for personalization
UserWordPreference.create(
  user: current_user,
  word: "schedule", 
  preferred_inflection: "scheduled" # vs "schedulled"
  context: "medical appointments"
)
```

#### **Tier 3: Sensitive Context (Encrypted)**
Private, contextual, or sensitive inflections:
```ruby
# Encrypted storage for sensitive data
PrivateInflection.create(
  user: current_user,
  encrypted_data: encrypt({
    word: "medication",
    context: "user's specific medical terms",
    custom_inflections: {...}
  })
)
```

## Implementation Strategy

### Phase 1: Current Shared Model (Basic Inflections)
- **Scope**: Standard grammatical inflections
- **Privacy**: Minimal - basic grammar rules
- **Storage**: Shared WordData
- **Use Case**: "run" → "running", "happy" → "happier"

### Phase 2: Add User Preferences Layer
- **Scope**: Personal corrections and preferences  
- **Privacy**: User-specific but not encrypted
- **Storage**: UserWordPreference model
- **Use Case**: User prefers "dived" over "dove"

### Phase 3: Encrypted Personal Context
- **Scope**: Sensitive, contextual, or private inflections
- **Privacy**: Encrypted, never shared
- **Storage**: EncryptedUserData with per-user keys
- **Use Case**: Medical terms, personal names, private vocabulary

## Database Design

### Current (Shared)
```ruby
# word_data table (existing)
create_table :word_data do |t|
  t.string :word
  t.string :locale  
  t.json :data  # Contains inflections
end
```

### Extended (Mixed Privacy)
```ruby
# Add user-specific overrides
create_table :user_word_preferences do |t|
  t.references :user, null: false
  t.string :word, null: false
  t.string :locale, null: false
  t.json :preferred_inflections
  t.string :privacy_level # 'personal', 'sensitive', 'encrypted'
end

# For highly sensitive data
create_table :encrypted_inflections do |t|
  t.references :user, null: false
  t.text :encrypted_data  # Encrypted JSON
  t.string :encryption_key_id
end
```

## Lookup Priority

```ruby
def get_inflections(word, user, context = nil)
  # 1. Check encrypted personal data (if sensitive context)
  if sensitive_context?(context)
    encrypted = EncryptedInflection.for_user(user).decrypt
    return encrypted[word] if encrypted[word]
  end
  
  # 2. Check user preferences (personalization)
  personal = UserWordPreference.find_by(
    user: user, word: word, locale: current_locale
  )
  return personal.preferred_inflections if personal
  
  # 3. Fall back to shared universal grammar
  shared = WordData.find_by(word: word, locale: current_locale)
  return shared.inflections if shared
  
  # 4. Generate with LLM and cache appropriately
  llm_result = LlmInflections.generate(word, context)
  cache_result(llm_result, user, sensitivity_level)
  llm_result
end
```

## Privacy Controls

### User Settings
```javascript
// Frontend user preferences
{
  "inflection_privacy": {
    "share_corrections": true,        // Contribute to shared grammar
    "personalize_suggestions": true,  // Store personal preferences  
    "context_aware": false,          // Use sensitive context (encrypted)
    "medical_terms": "encrypted"     // Special handling for medical vocabulary
  }
}
```

### Admin Configuration
```ruby
# Feature flags for different privacy levels
class InflectionPrivacySettings
  PRIVACY_LEVELS = {
    shared: "Basic inflections shared across users",
    personal: "User-specific preferences stored privately", 
    encrypted: "Sensitive data encrypted with user keys"
  }
end
```

## Future Extensions

### Medical/Therapy Context (High Privacy)
- Encrypted storage for therapy-related vocabulary
- Context-aware suggestions for medical appointments
- HIPAA-compliant data handling

### Educational Customization (Medium Privacy)  
- Personalized learning vocabulary
- Student-specific inflection patterns
- Progress tracking without sharing sensitive data

### Family/Cultural Terms (User Choice)
- Personal names and cultural terms
- Family-specific vocabulary
- User controls sharing level

## Migration Path

### Step 1: Current Implementation (No Changes)
- Continue with shared WordData
- Monitor for privacy concerns

### Step 2: Add User Preferences Layer
- Create UserWordPreference model
- Allow personal corrections and overrides
- Maintain backward compatibility

### Step 3: Add Encrypted Layer (When Needed)
- Implement for sensitive future features
- User-controlled privacy levels
- End-to-end encryption for sensitive contexts

## Recommendation

**For Basic Inflections**: Continue with shared model - it's efficient and appropriate for universal grammar rules.

**For Future Privacy-Sensitive Features**: Implement the layered approach so users can choose their privacy level based on the sensitivity of their data.

This gives you maximum flexibility for future features while keeping the current implementation simple and efficient.