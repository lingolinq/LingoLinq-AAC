import { helper } from '@ember/component/helper';
import { capsLockHighlight } from '../utils/special_vocalization';

export default helper(function isCapsLockOn([vocalization, capsLockOn]) {
  return capsLockHighlight(vocalization, capsLockOn);
});
