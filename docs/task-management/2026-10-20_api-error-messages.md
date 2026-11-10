# Show the server error instead of the generic fallback

GitHub #1058 / KAN-110. Report fetch, report load-more, and the telemetry panel show the server sentence. The Quick Screen starter board keeps a translated message.

## Fact sheet

(a) READ. `organization/reports.js` fetch and load-more store `{error: apiErrorMessage(...)}`. The template renders `results.error.error`. `organization/telemetry.js` stores the string from `apiErrorMessage` and `telemetry.hbs` renders `telemetry.error`. `eval-quick-report.js` `buildStarterBoard` sets the translated `eval_build_board_failed` string and does not read the server body. `persistence.ajax` rejects with `{fakeXHR, message, result}` (`utils/extras.js`). The server string is `fakeXHR.responseJSON.error`. `err.error` is only set on the offline short-circuit.

(b) SHAPES. HTTP error: `{fakeXHR, message, result}`, no top-level `error`. Offline short-circuit: `{offline: true, error: 'not online'}`. 200 with an error body: `result.error`.

(c) The eval narration handler maps one known server reason to a translated string and otherwise keeps a translated fallback. It is not part of this change. The starter board works the same way.

Server strings these calls can return include `unrecognized report:` plus the report name (`organizations_controller.rb`), `Not authorized` (`application_controller.rb:290`, and `boards_controller.rb` when the eval payload has no `parent_board_id`), `User not found` (`boards_controller.rb`), `Record not found` (`application_controller.rb:332`), and the access-token errors `Access token required for this endpoint: missing token`, `Access token required for this endpoint: couldn't find matching device`, and `Access token required for this endpoint: couldn't find matching user` (`application_controller.rb:269-273`). `board creation failed` and `report parameter required` are also possible. `board key already in use` is nearly unreachable on the starter-board path because the eval payload sends no `key`. `apiErrorMessage` returns only the `error` string.

## Test

`api-error-message-handlers-test.js` stubs `$.realAjax`. Without this fix, the three handler tests (report fetch, load-more, telemetry) time out in `waitUntil` because `err.error` is never set. The reports render test shows `[object Object]`. The starter-board test passes on develop by design: that handler already shows the translated message when `err.error` is absent.
