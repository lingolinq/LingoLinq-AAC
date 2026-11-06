export function reload_on_connect(controller, persistenceService) {
  if(!controller || typeof controller.get !== 'function') { return; }
  if(!persistenceService || typeof persistenceService.get !== 'function') { return; }
  if(!persistenceService.get('online')) { return; }
  // A device copy (routes/user/board-detail.js) is replaced once the server is back, unless the
  // communicator is mid-sentence on it; it refreshes on their next board.
  var device_copy = controller.get('served_from_device') && !controller.get('app_state.speak_mode');
  if(controller.get('model.id') && !device_copy) { return; }
  try {
    controller.send('refreshData');
  } catch(e) { /* route may have been torn down */ }
}
