import { helper } from '@ember/component/helper';

// Variadic first-truthy, like JS `||`. Returns the first argument that
// is truthy, or the last argument if none are. Lets templates write
// {{or btn.part_of_speech btn.painted_part_of_speech 'default'}} to get
// the actual string value for class-name interpolation, instead of the
// previous `!!a || !!b` which (a) returned a boolean and (b) ignored
// args beyond the second.
export default helper(function(args) {
  for(var i = 0; i < args.length; i++) {
    if(args[i]) { return args[i]; }
  }
  return args[args.length - 1];
});
