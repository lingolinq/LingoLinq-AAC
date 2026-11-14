import { helper } from '@ember/component/helper';
import { LIKED_BOARDS_KEPT } from '../utils/like_limit';

// The number of liked boards a sync keeps on the device, for strings that say so (`{{t ... limit=(liked-boards-kept)}}`).
export default helper(function() { return LIKED_BOARDS_KEPT; });
