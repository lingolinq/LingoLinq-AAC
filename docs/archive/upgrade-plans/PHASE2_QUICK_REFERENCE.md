# Phase 2: Quick Reference Guide

## Common Conversion Patterns

### 1. Creating an Application Serializer

**File**: `app/frontend/app/serializers/application.js` (new file)

```javascript
import DS from 'ember-data';

export default DS.RESTSerializer.extend({
  // Add any common serialization logic here
  // This will be used as the default for all models
});
```

**Alternative**: Create type-specific serializers if needed:
- `app/frontend/app/serializers/user.js`
- `app/frontend/app/serializers/board.js`
- etc.

---

### 2. Replacing `didLoad()` Methods

**Pattern 1**: Move to `init()` hook
```javascript
// Old:
didLoad: function() {
  this.set('someProperty', this.calculateValue());
}

// New:
init() {
  this._super(...arguments);
  this.set('someProperty', this.calculateValue());
}
```

**Pattern 2**: Use computed property
```javascript
// Old:
didLoad: function() {
  this.set('formattedValue', this.format(this.get('value')));
}

// New:
formattedValue: computed('value', function() {
  return this.format(this.get('value'));
})
```

**Pattern 3**: Use observer (if reactive updates needed)
```javascript
// Old:
didLoad: function() {
  this.updateRelated();
}

// New:
updateRelated: observer('relatedProperty', function() {
  // Update logic here
})
```

---

### 3. Converting `sendAction()` to Closure Actions

**Component (sender)**:
```javascript
// Old:
actions: {
  handleClick() {
    this.sendAction('onClick', this.get('value'));
  }
}

// New:
actions: {
  handleClick() {
    if (this.onClick) {
      this.onClick(this.get('value'));
    }
  }
}
```

**Template (parent)**:
```handlebars
{{!-- Old --}}
{{my-component onClick="handleClick"}}

{{!-- New --}}
{{my-component onClick=(action "handleClick")}}
```

**Route/Controller (parent)**:
```javascript
// No change needed - action already exists
actions: {
  handleClick(value) {
    // Handle the action
  }
}
```

---

### 4. Fixing Record Query Issues

**Pattern**: Replace `findRecord()` with `queryRecord()`

```javascript
// Old (causes warning):
store.findRecord('user', 'self').then(user => {
  // user.id will be '1_1' but requested 'self'
});

// New:
store.queryRecord('user', { id: 'self' }).then(user => {
  // Correctly handles ID mismatch
});
```

**Or fix in adapter** (if 'self' should map to actual ID):
```javascript
// In adapter:
findRecord(store, type, id) {
  if (id === 'self') {
    // Handle special case
    return this.ajax(...);
  }
  return this._super(...arguments);
}
```

---

### 5. Fixing Style Bindings

**Pattern 1**: Move to CSS class
```handlebars
{{!-- Old --}}
<div style={{computedStyle}}>Content</div>

{{!-- New --}}
<div class={{computedClass}}>Content</div>
```

```javascript
// Component:
computedClass: computed('someProperty', function() {
  return this.get('someProperty') ? 'class-a' : 'class-b';
})
```

**Pattern 2**: Use `htmlSafe()` for dynamic styles (if necessary)
```javascript
import { htmlSafe } from '@ember/string';

computedStyle: computed('width', function() {
  return htmlSafe(`width: ${this.get('width')}px;`);
})
```

```handlebars
<div style={{computedStyle}}>Content</div>
```

---

## Testing Checklist

After each conversion:
- [ ] App boots without errors
- [ ] Feature still works as expected
- [ ] No new console errors
- [ ] Deprecation warning is gone (or reduced)
- [ ] Visual appearance unchanged (for UI changes)

## Common Pitfalls

1. **`didLoad()` timing**: Make sure replacement runs at the right time
   - `init()` runs when model is created
   - Computed properties run when accessed
   - Observers run when dependencies change

2. **`sendAction()` context**: Closure actions preserve `this` context automatically

3. **Serializer naming**: Must match model name exactly
   - Model: `user` → Serializer: `user.js` or `application.js`

4. **Query vs Find**: 
   - `findRecord()` expects ID to match
   - `queryRecord()` handles ID mismatches

## Useful Commands

```bash
# Find all sendAction usage
grep -r "sendAction" app/frontend/app

# Find all didLoad usage
grep -r "didLoad" app/frontend/app/models

# Find style bindings
grep -r "style={{.*}}" app/frontend/app/templates
```
