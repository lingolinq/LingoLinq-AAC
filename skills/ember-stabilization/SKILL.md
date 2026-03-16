# Ember Stabilization Skill

## Purpose
Audit the Ember.js frontend for deprecated APIs, addon incompatibilities, and migration issues when upgrading from Ember 3.12 to 3.28.

## Scan Scope
- `app/` (Ember app directory)
- `addon/` (if any in-repo addons)
- `tests/` (Ember test files)
- `ember-cli-build.js`
- `config/environment.js`
- `config/targets.js`
- `package.json` (Ember-related dependencies)
- `.ember-cli`
- `app/templates/**/*.hbs`
- `app/components/**/*.js`
- `app/routes/**/*.js`
- `app/controllers/**/*.js`
- `app/helpers/**/*.js`
- `app/mixins/**/*.js`

## Checklist

### Deprecated API Detection (3.12 -> 3.28)
- [ ] `this.get()` / `this.set()` usage (use native getters/setters)
- [ ] `Ember.computed` vs `@tracked` properties
- [ ] Classic component patterns vs Glimmer components
- [ ] `sendAction` usage (deprecated, use closure actions)
- [ ] `{{action}}` modifier (use `{{on}}` + `{{fn}}`)
- [ ] `observer` usage (remove or convert)
- [ ] `Ember.ArrayController` / `Ember.ObjectController` usage
- [ ] `this._super()` calls in native classes
- [ ] `Ember.String` utilities (moving to standalone package)
- [ ] `Ember.assign` (use Object.assign)
- [ ] jQuery dependency and `this.$()` usage
- [ ] `targetObject` property usage
- [ ] Implicit injections (removing in 4.0)

### Addon Compatibility
- [ ] List all addons from package.json
- [ ] Check each addon has a version compatible with Ember 3.28
- [ ] Identify abandoned/unmaintained addons
- [ ] Check for addons that use deprecated Ember APIs internally

### Blueprint Drift
- [ ] Project structure matches ember-cli 3.28 blueprints
- [ ] `ember-cli-build.js` uses current API
- [ ] `config/environment.js` has expected structure
- [ ] Resolver configuration is correct
- [ ] Module unification status

### Template/Runtime Errors
- [ ] Template compilation with 3.28 compiler
- [ ] Named blocks usage compatibility
- [ ] Angle bracket component invocation vs curly
- [ ] `{{yield}}` usage patterns
- [ ] Helper invocation syntax

## Output Format
```json
{
  "skill": "ember-stabilization",
  "findings": [
    {
      "id": "EMB-001",
      "severity": "critical|high|medium|low|info",
      "category": "deprecated-api|addon-compat|blueprint-drift|template-error",
      "title": "Short description",
      "description": "Detailed finding",
      "file": "path/to/file",
      "line": null,
      "deprecated_api": "the.deprecated.thing",
      "replacement": "the.new.thing",
      "ember_version_removed": "3.X / 4.0"
    }
  ],
  "addon_matrix": [
    { "name": "addon-name", "current": "1.0", "compatible": "2.0", "status": "ok|upgrade|replace|remove" }
  ],
  "migration_effort": "low|medium|high|extreme"
}
```
