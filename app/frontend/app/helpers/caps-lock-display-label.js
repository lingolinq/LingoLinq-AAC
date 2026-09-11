import { helper } from '@ember/component/helper';
import { capsLockDisplayLabel } from '../utils/special_vocalization';

export default helper(function([label, vocalization, capsLockOn]) {
  return capsLockDisplayLabel(label, vocalization, capsLockOn);
});
