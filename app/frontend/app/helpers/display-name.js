import { helper } from '@ember/component/helper';
import { display_name_for } from '../utils/display_name';

export function displayName([user]) {
  return display_name_for(user);
}

export default helper(displayName);
