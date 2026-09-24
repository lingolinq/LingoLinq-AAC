// The server's error text from a request rejected by the app's $.ajax wrapper
// (utils/extras.js): it rejects with {fakeXHR, message, result}, where an HTTP error
// keeps the JSON body on fakeXHR.responseJSON, and a 200 carrying `error` puts the
// body in `result`. persistence.ajax's offline short-circuit rejects with
// {offline: true, error: 'not online'}. Returns `fallback` when none holds a message.
export default function apiErrorMessage(err, fallback) {
  if (!err) { return fallback; }
  var json = err.fakeXHR && err.fakeXHR.responseJSON;
  if (json && typeof json.error === 'string' && json.error) { return json.error; }
  if (err.result && typeof err.result.error === 'string' && err.result.error) { return err.result.error; }
  if (typeof err.error === 'string' && err.error) { return err.error; }
  return fallback;
}
