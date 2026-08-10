import { helper } from '@ember/component/helper';
import { boardAttributionOwner } from '../utils/board_attribution';

export function boardAttributionOwnerHelper([board]) {
  return boardAttributionOwner(board);
}

export default helper(boardAttributionOwnerHelper);
