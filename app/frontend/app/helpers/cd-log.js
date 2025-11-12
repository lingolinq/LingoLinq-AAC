import LingoLinq from '../app';

import { helper } from '@ember/component/helper';

export default helper(function(params, hash) {
  if(LingoLinq.log.started) {
    LingoLinq.log.track(params[0]);
  } else {
    console.log(params[0]);
  }
  return "";
});
