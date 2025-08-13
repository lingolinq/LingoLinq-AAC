# OpenAAC Standard Integration for LingoLinq Inflections

## 🎯 **Perfect Alignment with LingoLinq Goals**

The OpenAAC word forms and inflection rules specification aligns perfectly with our LLM-enhanced inflection system:

### **What OpenAAC Provides:**
- **Standardized Format**: `words-{locale}.json` + `rules-{locale}.json` 
- **Professional Quality**: Documented, tested inflection rules
- **Multi-language Ready**: Language-agnostic architecture
- **CSV Tools**: Easy contribution workflow for non-technical users
- **Cardinal Direction Mapping**: Perfect for long-press UI (N, NE, E, SE, S, SW, W, NW)

### **What LingoLinq Adds:**
- **LLM Enhancement**: AI improves OpenAAC rules for edge cases
- **User Customization**: Personal overrides and preferences
- **Real-time Context**: Context-aware suggestions
- **Community Contributions**: Users can improve the shared dataset

## 🏗️ **Enhanced Architecture**

### **Layer 1: OpenAAC Foundation**
```ruby
# Import and cache OpenAAC standard files
class OpenAACImporter
  def self.import_language(locale)
    words = fetch_openaac_file("words-#{locale}.json")
    rules = fetch_openaac_file("rules-#{locale}.json")
    
    # Store in our database for fast lookup
    words.each do |word, data|
      OpenAACWord.create(
        word: word,
        locale: locale,
        types: data['types'],
        antonyms: data['antonyms'] || [],
        inflections: data['inflections'],
        regulars: data['regulars'] || []
      )
    end
    
    # Store rules for contextual inflections
    rules['rules'].each do |rule|
      OpenAACRule.create(
        rule_id: rule['id'],
        locale: locale,
        rule_type: rule['type'],
        lookback: rule['lookback'],
        inflection: rule['inflection'],
        location: rule['location'],
        overrides: rule['overrides']
      )
    end
  end
end
```

### **Layer 2: LLM Enhancement of OpenAAC Base**
```ruby
# Enhance OpenAAC rules with LLM intelligence
class OpenAACEnhancer
  def self.enhance_word(word, locale, context = nil)
    # Get OpenAAC base inflections
    openaac_word = OpenAACWord.find_by(word: word, locale: locale)
    return nil unless openaac_word
    
    base_inflections = openaac_word.inflections
    
    # Use LLM to enhance for edge cases and context
    if context || needs_llm_enhancement?(word, base_inflections)
      llm_enhanced = LlmInflections.enhance_openaac_base(
        word: word,
        base_inflections: base_inflections,
        types: openaac_word.types,
        context: context,
        locale: locale
      )
      
      # Merge intelligently (OpenAAC base + LLM improvements)
      return merge_inflections(base_inflections, llm_enhanced)
    end
    
    base_inflections
  end
  
  private
  
  def self.needs_llm_enhancement?(word, inflections)
    # Use LLM for newer words not in OpenAAC dataset
    # Or words with incomplete inflections
    inflections.empty? || 
    word.length > 12 ||  # Likely compound/technical term
    inflections.keys.length < expected_inflection_count(word)
  end
end
```

### **Layer 3: Cardinal Direction Mapping** 
```ruby
# Map OpenAAC cardinal directions to UI positions
class CardinalInflectionMapper
  # OpenAAC uses: N, NE, E, SE, S, SW, W, NW, C (center)
  DIRECTION_MAP = {
    'n' => 'north',      # Top
    'ne' => 'northeast', # Top-right  
    'e' => 'east',       # Right
    'se' => 'southeast', # Bottom-right
    's' => 'south',      # Bottom
    'sw' => 'southwest', # Bottom-left
    'w' => 'west',       # Left
    'nw' => 'northwest', # Top-left
    'c' => 'center'      # Center (base form)
  }
  
  def self.map_for_word(word, word_type, locale)
    rules = OpenAACInflectionLocation.for_type(word_type, locale)
    inflections = OpenAACEnhancer.enhance_word(word, locale)
    
    direction_map = {}
    
    rules.each do |rule|
      direction = rule['location']
      inflection_type = rule['inflection']
      
      if inflections[inflection_type]
        direction_map[DIRECTION_MAP[direction]] = {
          text: inflections[inflection_type],
          type: inflection_type,
          direction: direction
        }
      end
    end
    
    direction_map
  end
end
```

## 🗄️ **Database Schema for OpenAAC Integration**

```ruby
# Store OpenAAC words data
create_table :openaac_words do |t|
  t.string :word, null: false
  t.string :locale, null: false, limit: 10
  t.json :types                    # ["noun", "verb"]
  t.json :antonyms                 # ["bad", "awful"] 
  t.json :inflections              # {"plural": "dogs", "past": "ran"}
  t.json :regulars                 # ["present_participle"] - use default rules
  t.string :openaac_version        # Track dataset version
  t.timestamp :imported_at
  
  t.index [:word, :locale], unique: true
  t.index [:locale, :types], using: 'gin'
end

# Store OpenAAC inflection rules
create_table :openaac_rules do |t|
  t.string :rule_id, null: false
  t.string :locale, null: false
  t.string :rule_type              # "verb", "noun", "override"
  t.json :lookback                 # Match criteria
  t.string :inflection             # Target inflection type
  t.string :location               # Cardinal direction (n, ne, e, etc.)
  t.json :overrides                # For override-type rules
  t.json :tests                    # Validation tests
  
  t.index [:locale, :rule_type]
  t.index [:rule_id, :locale], unique: true
end

# Store inflection location mappings (cardinal directions)
create_table :openaac_inflection_locations do |t|
  t.string :locale, null: false
  t.string :part_of_speech         # "verb", "noun", "adjective"
  t.string :location               # "n", "ne", "e", "se", "s", "sw", "w", "nw", "c"
  t.string :inflection_type        # "plural", "past", "comparative"
  t.json :conditions               # {"required": ["inflection_type"], "type": "adjective"}
  t.integer :priority, default: 0  # Order of application
  
  t.index [:locale, :part_of_speech]
end

# User customizations (Layer 3)
create_table :user_inflection_overrides do |t|
  t.references :user, null: false, foreign_key: true
  t.string :word, null: false
  t.string :locale, null: false
  t.string :inflection_type        # "plural", "past_tense", etc.
  t.string :custom_value           # User's preferred inflection
  t.text :reasoning                # Why they changed it
  t.boolean :share_with_community, default: false
  
  t.index [:user_id, :word, :locale, :inflection_type], 
          name: 'user_word_inflection_unique',
          unique: true
end
```

## 🔄 **Integration with Long-Press UI**

### **Frontend Integration**
```javascript
// app/frontend/app/utils/openaac_inflections.js
import llm_inflections from './llm_inflections';

var openaac_inflections = {
  // Get cardinal direction layout for long-press
  get_cardinal_inflections: function(word, word_type, locale, context) {
    var api_url = '/api/v1/inflections/cardinal';
    var params = new URLSearchParams({
      word: word,
      word_type: word_type,
      locale: locale || 'en'
    });
    
    if (context) {
      params.append('context', context);
    }
    
    return fetch(api_url + '?' + params.toString(), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + LingoLinqAAC.get('session.access_token')
      }
    }).then(response => response.json())
    .then(data => {
      // Returns mapping like:
      // {
      //   "north": {"text": "running", "type": "present_participle"},
      //   "east": {"text": "runs", "type": "simple_present"}, 
      //   "south": {"text": "ran", "type": "simple_past"},
      //   "center": {"text": "run", "type": "base"}
      // }
      return this.process_cardinal_response(data);
    });
  },
  
  process_cardinal_response: function(data) {
    // Convert to format expected by existing long-press UI
    var inflections = {};
    
    Object.keys(data.cardinal_map || {}).forEach(direction => {
      var inflection = data.cardinal_map[direction];
      inflections[direction] = {
        text: inflection.text,
        label: this.get_direction_label(direction),
        type: inflection.type,
        source: data.source || 'openaac'
      };
    });
    
    return inflections;
  }
};

export default openaac_inflections;
```

### **API Endpoint for Cardinal Inflections**
```ruby
# app/controllers/api/inflections_controller.rb (enhanced)
class Api::InflectionsController < ApplicationController
  def cardinal
    word = params['word']&.downcase
    word_type = params['word_type']
    language = params['locale'] || 'en'
    context = params['context']
    
    return api_error(400, 'Missing word') unless word
    
    # Get user's personal overrides first
    user_overrides = get_user_overrides(word, language) if @api_user
    
    # Get OpenAAC + LLM enhanced cardinal mapping
    cardinal_map = CardinalInflectionMapper.map_for_word(
      word, word_type, language
    )
    
    # Apply user customizations
    cardinal_map = apply_user_overrides(cardinal_map, user_overrides)
    
    render json: {
      word: word,
      language: language,
      word_type: word_type,
      cardinal_map: cardinal_map,
      source: determine_source(cardinal_map),
      context: context
    }
  end
end
```

## 🚀 **Community Contribution Workflow**

### **Phase 1: CSV Import/Export for Users**
```ruby
# Allow users to download their customizations as CSV (OpenAAC format)
class UserInflectionCSVExporter
  def self.export_user_words(user, locale)
    # Export user's customizations in OpenAAC CSV format
    # So they can edit in Excel/Sheets and re-import
    
    CSV.generate(headers: true) do |csv|
      csv << ['word', 'type1', 'type2', 'type3', 'antonym1', 'antonym2', 'base', 
              'plural', 'possessive', 'infinitive', 'simple_past', 'present_participle']
      
      user.inflection_overrides.where(locale: locale).each do |override|
        # Build CSV row with user's customizations
        openaac_word = OpenAACWord.find_by(word: override.word, locale: locale)
        csv << build_csv_row(override, openaac_word)
      end
    end
  end
end
```

### **Phase 2: Contribution Submission**
```ruby
# Users can submit improvements back to OpenAAC
class OpenAACContributor
  def self.prepare_contribution(user_improvements)
    # Package user improvements for OpenAAC submission
    {
      contributor: "LingoLinq User Community",
      language: user_improvements.first.locale,
      improvements: user_improvements.map(&:to_openaac_format),
      test_cases: generate_test_cases(user_improvements),
      reasoning: "Community-submitted improvements from LingoLinq users"
    }
  end
  
  def self.submit_to_openaac(contribution_data)
    # Could be GitHub PR, API submission, or email format
    # depending on OpenAAC's preferred contribution method
  end
end
```

## 🎯 **Implementation Phases**

### **Phase 1: OpenAAC Foundation** ✅ Ready to Build
```ruby
# Import OpenAAC datasets
bundle exec rake openaac:import:english
bundle exec rake openaac:import:spanish

# Test integration
OpenAACEnhancer.enhance_word('run', 'en') 
# => {"past": "ran", "present_participle": "running", ...}
```

### **Phase 2: Cardinal Direction UI** ✅ Leverage Existing
```javascript
// Existing long-press UI can use cardinal data directly
button.get_inflection_alternatives('run', 'verb', 'en')
// Returns north/south/east/west mapped inflections
```

### **Phase 3: User Customization** ✅ Database Ready
```ruby
# Users can override any OpenAAC inflection
user.inflection_overrides.create(
  word: 'schedule',
  inflection_type: 'past',
  custom_value: 'scheduled'  # vs OpenAAC's 'schedulled'
)
```

### **Phase 4: Community Contributions** 🔄 Future Enhancement
```ruby
# Batch export user improvements for OpenAAC submission
LingoLinqCommunityContributions.export_monthly_improvements
```

## 💡 **Key Benefits of This Integration**

### **For LingoLinq:**
- **Professional Foundation**: Built on documented, tested standards
- **Immediate Multi-language**: Leverage existing OpenAAC datasets
- **Perfect UI Fit**: Cardinal directions = existing long-press interface
- **Community Credibility**: Contributing back to open-source AAC ecosystem

### **For Users:**
- **Reliable Base**: OpenAAC professional-quality rules
- **AI Enhancement**: LLM handles edge cases and context
- **Personal Control**: Customize anything to their preferences
- **Easy Contributions**: CSV format for non-technical improvements

### **For OpenAAC Partnership:**
- **Real-world Testing**: LingoLinq usage validates rule quality
- **Community Feedback**: User improvements flow back to OpenAAC
- **Broader Adoption**: More AAC systems using the standard
- **Innovation Sharing**: LLM enhancements can inspire improvements

This architecture perfectly marries the OpenAAC standard with your LLM enhancements and user customization goals. The cardinal direction mapping is especially perfect for your existing long-press UI!

Should we update the current implementation to integrate with OpenAAC as the foundation layer?