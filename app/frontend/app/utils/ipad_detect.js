// Since iPadOS 13 an iPad reports a Mac user agent, in Safari and in app web views. A Mac has no multi-touch
// screen, so the touch points tell them apart.
// In the native app the platform says so directly, which is the more reliable signal.
export function is_ipad_with_mac_agent(nav, win) {
  if(!nav || !/macintosh/i.test(nav.userAgent || '')) { return false; }
  var native = win && win.Capacitor && typeof win.Capacitor.getPlatform === 'function' && win.Capacitor.getPlatform();
  return native === 'ios' || nav.maxTouchPoints > 1;
}
