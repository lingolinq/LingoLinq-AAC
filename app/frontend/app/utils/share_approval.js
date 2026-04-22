import modal from './modal';

export function check_for_share_approval(controller, appState) {
  var board_id = controller.get('model.id');
  if(!board_id || !appState.get('currentBoardState')) { return; }
  var shares = appState.get('currentUser.pending_board_shares') || [];
  var matching_shares = shares.filter(function(s) { return s.board_id && s.board_id == board_id; });
  if(matching_shares.length === 0) { return; }
  if(!(appState.get('default_mode') ||
       (appState.get('speak_mode') && controller.stashes.get('boardHistory.length') > 0))) { return; }
  var already = (appState.get('speak_mode') && controller.get('already_checked_boards')) || {};
  if(already[board_id]) { return; }
  already[board_id] = true;
  controller.set('already_checked_boards', already);
  modal.open('approve-board-share', { board: controller.get('model'), shares: matching_shares });
}
