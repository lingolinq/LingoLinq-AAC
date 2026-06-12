import i18n from './i18n';

export function sync_current_board_state(controller, appState) {
  var model_id = controller.get('model.id');
  if(!model_id) { return; }
  var board_id = controller.get('model.global_id') || model_id;
  if(appState.get('currentBoardState.id') !== board_id) { return; }
  appState.setProperties({
    'currentBoardState.integration_name': controller.get('model.integration') && controller.get('model.integration_name'),
    'currentBoardState.text_direction': i18n.text_direction(controller.get('model.locale')),
    'currentBoardState.translatable': (controller.get('model.locales') || []).length > 1
  });
}
