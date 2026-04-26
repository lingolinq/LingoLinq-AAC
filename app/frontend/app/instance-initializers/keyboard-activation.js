// App-wide keyboard activation: ensures Spacebar AND Enter trigger a click
// on any keyboard-focused interactive element, including custom non-native
// interactive elements (divs/spans with role="button", or with tabindex).
//
// Native <button> elements already respond to both keys natively — this
// initializer is for the ~99 audited offenders where {{action ...}} is bound
// to a non-native element. It fills the gap without requiring template-by-
// template refactoring.
//
// Skips:
//   - Native form elements (BUTTON, INPUT, SELECT, TEXTAREA, contentEditable)
//     because those have their own native handling.
//   - Elements not flagged as actionable (must be <a href>, role="button",
//     role="link", or have tabindex).
//
// This was previously scoped to the landing-alt route only
// (routes/landing-alt.js#_installSpaceActivation). Globalizing it.

export function initialize() {
  if (typeof document === 'undefined') { return; }

  function isActionable(el) {
    if (!el) { return false; }
    var tag = el.tagName;
    // Skip native form elements (they handle keys natively)
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
        tag === 'TEXTAREA' || el.isContentEditable) {
      return false;
    }
    return (tag === 'A' && el.hasAttribute('href')) ||
           el.getAttribute('role') === 'button' ||
           el.getAttribute('role') === 'link' ||
           el.hasAttribute('tabindex');
  }

  function handler(e) {
    var key = e.key;
    var keyCode = e.keyCode || e.which;
    var isSpace = key === ' ' || e.code === 'Space' || keyCode === 32;
    var isEnter = key === 'Enter' || keyCode === 13;
    if (!isSpace && !isEnter) { return; }

    var el = document.activeElement || e.target;
    if (!el || el === document.body) { return; }
    if (!isActionable(el)) { return; }

    // For <a href> elements, Enter already works natively (via the browser).
    // We only need to step in for Spacebar on links, OR for any custom element
    // (role=button, role=link, tabindex) on either key.
    if (isEnter && el.tagName === 'A' && el.hasAttribute('href')) {
      return; // let browser native behavior handle it
    }

    e.preventDefault();
    el.click();
  }

  document.addEventListener('keydown', handler);
}

export default {
  name: 'keyboard-activation',
  initialize: initialize
};
