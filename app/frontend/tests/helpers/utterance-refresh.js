import utterance from 'frontend/utils/utterance';

// utterance.set_button_list (and everything that rebuilds the sentence: add_button, clear, speak-mode
// changes, activating a button) schedules a suggestion refresh 100 ms later (app/utils/utterance.js,
// utterance.suggestion_refresh_scheduled). A test that ends first leaves it to fire in the next test,
// where owner_gone skips it and the harness reports it as late work. These wait for it.

export function utteranceRefreshPending() {
  return !!utterance.suggestion_refresh_scheduled;
}

// For QUnit tests and hooks. Bounded: a refresh that never fires is not this helper's to hide; the
// late-work report shows it.
export async function waitForUtteranceRefresh(maxWaitMs = 2000) {
  const deadline = Date.now() + maxWaitMs;
  while (utteranceRefreshPending() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
