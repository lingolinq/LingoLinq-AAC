import { helper } from '@ember/component/helper';
import templateHelpers from '../utils/template_helpers';

export default helper(function(params, hash) {
  return templateHelpers.round(params[0]);
});
