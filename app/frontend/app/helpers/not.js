import { helper } from '@ember/component/helper';

// Boolean negation for templates. This app does not depend on
// ember-truth-helpers, so `not` has to be defined locally like `and` and `or`.
// Without this file Ember throws "Attempted to resolve `not`, which was
// expected to be a helper, but nothing was found" the moment a template using
// {{not ...}} renders — a runtime failure, so the build stays green and only
// the affected screen breaks.
//
// Variadic, matching ember-truth-helpers: true only when EVERY argument is
// falsy. Deliberately not written as `function([value])`, because the
// single-argument form would silently ignore extra arguments — the exact bug
// the `and` and `or` helpers in this directory were already fixed for.
export function not(args) {
  for(var i = 0; i < args.length; i++) {
    if(args[i]) { return false; }
  }
  return true;
}

export default helper(not);
