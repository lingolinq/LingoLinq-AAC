import { helper } from '@ember/component/helper';
import templateHelpers from '../utils/template_helpers';

export default helper(function(params, hash) {
  return templateHelpers.is_equal(params[0], params[1]);
});
