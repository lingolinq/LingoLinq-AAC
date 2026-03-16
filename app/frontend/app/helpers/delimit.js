import { helper } from '@ember/component/helper';
import templateHelpers from '../utils/template_helpers';

export default helper(function(params) {
  return templateHelpers.delimit(params[0], params[1]);
});
