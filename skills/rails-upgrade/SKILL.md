# Rails Upgrade Skill

## Purpose
Audit the Rails backend for upgrade readiness, deprecated APIs, gem compatibility, and security vulnerabilities.

## Scan Scope
- `Gemfile` and `Gemfile.lock`
- `config/` (all Rails config files)
- `app/models/**/*.rb`
- `app/controllers/**/*.rb`
- `app/serializers/**/*.rb`
- `app/jobs/**/*.rb`
- `app/mailers/**/*.rb`
- `app/services/**/*.rb`
- `db/migrate/**/*.rb`
- `db/schema.rb`
- `config/routes.rb`
- `spec/` or `test/`
- `lib/`
- `bin/`

## Checklist

### Gem Compatibility Matrix
- [ ] Identify current Rails version
- [ ] List all gems and their Rails version constraints
- [ ] Flag gems with no recent releases (>1 year)
- [ ] Flag gems with known incompatibilities
- [ ] Identify gems that need major version bumps

### Deprecated API Detection
- [ ] `before_filter` -> `before_action`
- [ ] `render :text` -> `render :plain`
- [ ] `ActiveRecord::Base` vs `ApplicationRecord`
- [ ] `update_attributes` -> `update`
- [ ] `find_by_*` dynamic finders
- [ ] `protect_from_forgery` placement
- [ ] `silence_stream` and `capture`
- [ ] Hash conditions in ActiveRecord
- [ ] `attr_accessible` (if pre-StrongParams)
- [ ] Positional arguments in `ActiveRecord::Base#find`

### Security Vulnerabilities
- [ ] Known CVEs in current gem versions
- [ ] SQL injection patterns (raw SQL, `find_by_sql`)
- [ ] Mass assignment vulnerabilities
- [ ] CSRF protection enabled
- [ ] Content Security Policy headers
- [ ] Secrets management (credentials vs secrets.yml)
- [ ] Brakeman-detectable issues

### Migration Blockers
- [ ] Database compatibility (PostgreSQL version)
- [ ] Ruby version requirements for target Rails
- [ ] Initializer compatibility
- [ ] Middleware stack changes
- [ ] Asset pipeline vs Webpacker vs importmap

## Output Format
```json
{
  "skill": "rails-upgrade",
  "current_version": "X.Y.Z",
  "target_version": "X.Y.Z",
  "findings": [
    {
      "id": "RAIL-001",
      "severity": "critical|high|medium|low|info",
      "category": "gem-compat|deprecated-api|security|migration-blocker",
      "title": "Short description",
      "description": "Detailed finding",
      "file": "path/to/file",
      "line": null,
      "recommendation": "How to fix"
    }
  ],
  "gem_matrix": [
    { "name": "gem-name", "current": "1.0", "target": "2.0", "status": "ok|upgrade|replace|remove", "notes": "" }
  ],
  "blocker_count": 0,
  "estimated_effort": "low|medium|high|extreme"
}
```
