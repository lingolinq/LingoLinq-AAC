# Show the server error instead of the generic fallback

GitHub #1058 / KAN-110. Four handlers only.

## Fact sheet

(a) READ. `organization/reports.js` fetch and load-more, `organization/telemetry.js`, and `eval-quick-report.js` `buildStarterBoard` read `err.error`. `persistence.ajax` rejects with the `$.ajax` wrapper object `{fakeXHR, message, result}` (`utils/extras.js`). The server string is `fakeXHR.responseJSON.error`. `apiErrorMessage` already reads that.

(b) SHAPES. HTTP error: `{fakeXHR, message, result}`, no top-level `error`. Offline short-circuit: `{offline: true, error: 'not online'}`. 200 with an error body: `result.error`.

(c) The eval narration handler was already changed. It maps one known server reason to a translated string and otherwise keeps a translated fallback, with a comment that the raw server string must not be shown. It is not part of this change.

Server strings shown for these four calls are fixed admin or board-create literals (`Not authorized`, `report parameter required`, `board key already in use`, `board creation failed`). `apiErrorMessage` returns only the `error` string, not sibling fields such as `for_user_id` or `errors`.

## Test

`api-error-message-handlers-test.js` stubs `$.realAjax`. Before the fix the report and load-more tests timed out because the server text never landed. Mutation: put `err.error` back.
