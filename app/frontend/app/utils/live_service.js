/* A service reference held in a module-level slot (a util singleton's field or a global) outlives
   the app instance that owns it: when that instance is torn down the slot keeps a DESTROYED
   service. Readers of such slots go through this, so a destroyed service counts as absent and the
   caller falls back to its live alternative. In production the app instance is never torn down, so
   this only ever passes values through; it matters where instances come and go (tests).
   A leaf module with no imports, so any util can use it without joining an import cycle. */
export function live_service(svc) {
  if(svc && (svc.isDestroyed || svc.isDestroying)) { return null; }
  return svc;
}
