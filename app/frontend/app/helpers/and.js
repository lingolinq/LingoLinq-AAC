import { helper } from '@ember/component/helper';

// Variadic logical AND. Returns a boolean (unlike `or`, which returns the
// first truthy VALUE for class-name interpolation) because every call site
// uses it in a boolean position: {{#if (and ...)}} or disabled={{and ...}}.
//
// The previous form was `function([a, b]) { return !!a && !!b; }`, which
// silently ignored every argument past the second — so {{#if (and a b c)}}
// quietly evaluated as `a && b` and rendered whenever the first two were
// truthy, regardless of the third. Same bug class already fixed in `or`.
export function and(args) {
  for(var i = 0; i < args.length; i++) {
    if(!args[i]) { return false; }
  }
  return true;
}

export default helper(and);
