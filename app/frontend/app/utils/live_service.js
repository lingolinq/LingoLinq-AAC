/* A service reference held in a module-level slot (a util singleton's field or a global) outlives
   the app instance that owns it: when that instance is torn down the slot keeps a DESTROYED
   service. Readers of such slots go through this, so a destroyed service counts as absent and the
   caller falls back to its live alternative. In production the app instance is never torn down, so
   this only passes values through; it matters where instances come and go (tests).
   A leaf module with no imports, so any util can use it without joining an import cycle. */
export function live_service(svc) {
  if(svc && (svc.isDestroyed || svc.isDestroying)) { return null; }
  return svc;
}

/* The test a deferred-work guard uses: true only when an owner WAS captured and has since been torn
   down. Nothing captured (an undefined or null owner) is not "gone": the work runs, as it did before
   the guards existed. `if(!live_service(owner)) return;` also returned for a missing owner, which
   stopped switch scanning restarting after a selection (scanner.appState is unset when the
   highlight controller set the scanner up). */
export function owner_gone(owner) {
  return !!owner && !live_service(owner);
}
