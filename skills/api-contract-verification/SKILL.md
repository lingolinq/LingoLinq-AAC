# API Contract Verification Skill

## Purpose
Verify that Ember Data models and Rails serializers/controllers agree on API payload shapes, field names, casing conventions, pagination format, and error responses.

## Scan Scope
- Ember side:
  - `app/models/**/*.js` (Ember Data models)
  - `app/adapters/**/*.js` (API adapters)
  - `app/serializers/**/*.js` (Ember serializers)
- Rails side:
  - `app/serializers/**/*.rb` (ActiveModel Serializers or similar)
  - `app/controllers/api/**/*.rb` (API controllers)
  - `config/routes.rb` (API routes)
  - `app/models/**/*.rb` (for relationship verification)

## Checklist

### Model <-> Serializer Alignment
- [ ] Every Ember Data model has a corresponding Rails serializer
- [ ] All attributes in Ember models exist in Rails serializers
- [ ] All relationships in Ember models are serialized by Rails
- [ ] No orphaned serializers (Rails serializer with no Ember model)

### Field Naming / Casing
- [ ] Consistent casing convention (camelCase vs snake_case)
- [ ] Adapter/serializer handles case transformation
- [ ] No manual case conversion scattered in code
- [ ] ID field format consistency (string vs integer)

### Pagination
- [ ] Pagination format agreed (page-based vs cursor-based)
- [ ] Meta fields match between Ember adapter and Rails response
- [ ] Default page size defined and consistent
- [ ] Total count / has_more fields present

### Error Responses
- [ ] Error format follows JSON:API or consistent custom format
- [ ] Validation errors include field-level detail
- [ ] HTTP status codes used correctly
- [ ] Ember Data error handling matches Rails error format

### Endpoint Coverage
- [ ] All Ember Data model CRUD operations have matching routes
- [ ] Custom actions have matching endpoints
- [ ] Nested routes match relationship definitions

## Output Format
```json
{
  "skill": "api-contract-verification",
  "findings": [
    {
      "id": "API-001",
      "severity": "critical|high|medium|low|info",
      "category": "model-mismatch|casing|pagination|error-format|coverage",
      "title": "Short description",
      "ember_file": "app/models/user.js",
      "rails_file": "app/serializers/user_serializer.rb",
      "ember_expects": "what Ember expects",
      "rails_provides": "what Rails sends",
      "recommendation": "How to fix"
    }
  ],
  "coverage": {
    "models_matched": "X/Y",
    "endpoints_covered": "X/Y",
    "mismatches": 0
  }
}
```
