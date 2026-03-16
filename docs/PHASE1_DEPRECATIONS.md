# Phase 1: Runtime Deprecations & Warnings

## Summary
The app is **running successfully** on Ember 3.16! All deprecations below are non-blocking and can be addressed in Phase 2.

## Ember Data Deprecations

### 1. Default Serializer Deprecation
**Deprecation ID**: `ember-data:default-serializer`

**Issue**: Store is resolving serializers via deprecated `adapter.defaultSerializer` property.

**Affected Models**:
- `user`
- `board`
- `badge`
- `log`

**Solution** (Phase 2):
- Create explicit serializers for each model type
- Or create an application serializer
- See: https://deprecations.emberjs.com/ember-data/v3.x#toc_ember-data:default-serializers

**Files to Check**:
- `app/frontend/app/adapters/application.js` (no explicit serializers defined)
- **No serializers directory exists** - need to create: `app/frontend/app/serializers/`
- Create application serializer: `app/frontend/app/serializers/application.js`
- Or create type-specific serializers for: `user`, `board`, `badge`, `log`, etc.

### 2. Record Lifecycle Event Methods
**Deprecation ID**: `ember-data:record-lifecycle-event-methods`

**Issue**: Using deprecated lifecycle methods like `didLoad()` on models.

**Affected Models** (11 total using `didLoad`):
- `user`
- `log`
- `gift`
- `video`
- `image`
- `lesson`
- `goal`
- `sound`
- `organization`
- `profile`
- `board`

**Solution** (Phase 2):
- Replace `didLoad()` with computed properties or observers
- Or use `@ember-data/model` hooks if available
- See: https://deprecations.emberjs.com/ember-data/v3.x#toc_record-lifecycle-event-methods

**Files to Check**:
- All 11 model files listed above
- Each needs `didLoad()` replaced with modern alternatives

### 3. Record Identifier ID Updates
**Warning**: The 'id' for a RecordIdentifier should not be updated once it has been set.

**Issue**: Attempted to set id for 'user:self (@ember-data:lid-user-self)' to '1_1'.

**Solution** (Phase 2):
- Review how `user:self` is being handled
- May need to use `queryRecord()` instead of `findRecord()` when IDs don't match

### 4. Query Record vs Find Record
**Warning**: You requested a record of type 'user' with id 'self' but the adapter returned a payload with primary data having an id of '1_1'.

**Issue**: Using `findRecord()` when `queryRecord()` should be used.

**Solution** (Phase 2):
- Change `store.findRecord('user', 'self')` to `store.queryRecord('user', { id: 'self' })`
- Or fix the adapter to return the correct ID

**Files to Check**:
- Routes/controllers that fetch user with id 'self'
- Adapter configuration

## Ember Template Warnings

### 5. Style Attribute Binding
**Warning**: Binding style attributes may introduce cross-site scripting vulnerabilities.

**Issue**: Using `style={{computedStyle}}` in templates.

**Affected Styles**:
- `"line-height: 70px; vertical-align: middle; margin-right: 15px; font-size: 30px; color: #aaa;"`
- `"float: right; margin-right: 5px;"`
- `"touch-action: manipulation;"`
- `"margin-left: 10px;"`

**Solution** (Phase 2):
- Move inline styles to CSS classes
- Use `htmlSafe()` helper if dynamic styles are necessary
- See: https://emberjs.com/deprecations/v1.x/#toc_binding-style-attributes

**Files to Check**:
- Templates using `style={{...}}` bindings
- Components with computed style properties

## Priority for Phase 2

### High Priority (Blocking for 3.28+)
1. ✅ Default Serializer deprecation (will break in future versions)
2. ✅ Record lifecycle methods (will break in future versions)

### Medium Priority (Should fix)
3. ⚠️ Record identifier ID updates (may cause issues)
4. ⚠️ Query record vs find record (code quality)

### Low Priority (Code quality)
5. ℹ️ Style attribute bindings (security warning, but app works)

## Notes

- All deprecations are **non-blocking** for Phase 1
- App runs successfully despite these warnings
- These should be addressed in Phase 2 before upgrading to 3.28
- Some may become breaking changes in Ember 4.0

## Next Steps

1. Document all locations where these patterns are used
2. Create Phase 2 task list for fixing deprecations
3. Prioritize based on which will break in 3.28 vs 4.0
