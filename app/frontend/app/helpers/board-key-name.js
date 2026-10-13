import { helper } from '@ember/component/helper';
import templateHelpers from '../utils/template_helpers';

export default helper(function(params) {
  return templateHelpers.board_key_name(params[0]);
});
