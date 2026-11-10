import ApplicationAdapter from './application';

// The device's IANA time zone (e.g. "Europe/Berlin"), or null where Intl cannot say.
function device_time_zone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch(e) {
    return null;
  }
}

function with_time_zone(url) {
  var zone = device_time_zone();
  if(!zone) { return url; }
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'tz=' + encodeURIComponent(zone);
}

/**
 * Goal adapter: a goal's own request sends the device's time zone, so the server
 * groups the goal's days, weeks and months at the viewer's midnight (#1196,
 * UserGoal#stats_in_zone), and so does its save. Lists and other requests are unchanged.
 */
export default ApplicationAdapter.extend({
  urlForFindRecord() {
    return with_time_zone(this._super(...arguments));
  },
  // A save on the goal page returns the goal too; without the zone its stats would fall back
  // to the stored UTC grouping and the page's charts would disagree.
  urlForUpdateRecord() {
    return with_time_zone(this._super(...arguments));
  }
});
