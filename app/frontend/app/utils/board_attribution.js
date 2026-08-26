import { get as emberGet } from '@ember/object';
import i18n from './i18n';
import { boardOwnerName } from './board-roots';

/* Human-readable owner credit for board tiles and list rows. Maps the
   canonical lingolinq publisher slug to the OpenAAC brand; otherwise
   prefers user_name, then the owner prefix of key. Accepts Ember Data
   models and plain { key, user_name } objects. */
export function boardAttributionOwner(board) {
  if (!board) { return ''; }
  var slug = boardOwnerName(board);
  var userName = emberGet(board, 'user_name') || board.user_name || '';
  if (slug === 'lingolinq' || (userName && userName.toLowerCase() === 'lingolinq')) {
    return i18n.t('board_attribution_openaac', "OpenAAC");
  }
  if (userName) { return userName; }
  return slug;
}
