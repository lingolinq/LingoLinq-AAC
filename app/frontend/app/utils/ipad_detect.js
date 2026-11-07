// Since iPadOS 13 an iPad reports a Mac user agent, in Safari and in app web views. A Mac has no multi-touch
// screen, so the touch points tell them apart.
export function is_ipad_with_mac_agent(nav) {
  return !!(nav && /macintosh/i.test(nav.userAgent || '') && nav.maxTouchPoints > 1);
}
