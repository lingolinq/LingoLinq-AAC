export function reload_on_connect(controller, persistenceService) {
  if(!controller || typeof controller.get !== 'function') { return; }
  if(!persistenceService || typeof persistenceService.get !== 'function') { return; }
  if(!persistenceService.get('online')) { return; }
  if(controller.get('model.id')) { return; }
  try {
    controller.send('refreshData');
  } catch(e) { /* route may have been torn down */ }
}
