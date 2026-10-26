import ApplicationAdapter from './application';

// The device's IANA time zone (e.g. "Europe/Berlin"), or null where Intl cannot say.
function device_time_zone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch(e) {
    return null;
  }
}

/**
 * Goal adapter: a goal's own request sends the device's time zone, so the server
 * groups the goal's days, weeks and months at the viewer's midnight (#1196,
 * UserGoal#stats_in_zone). Lists and other requests are unchanged.
 */
export default ApplicationAdapter.extend({
  urlForFindRecord() {
    var url = this._super(...arguments);
    var zone = device_time_zone();
    if(!zone) { return url; }
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'tz=' + encodeURIComponent(zone);
  }
});
