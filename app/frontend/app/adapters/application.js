import RESTAdapter from '@ember-data/adapter/rest';
import persistence from '../utils/persistence';
import $ from 'jquery';

var res = RESTAdapter.extend({
  namespace: 'api/v1',

  // Keep the jQuery transport rather than fetch: extras.js patches `$.ajax` to
  // attach the Authorization header, and that patch is the only thing
  // authenticating these requests. With `useFetch` left at its default (true),
  // `ajaxOptions` returns a fetch-shaped hash (`body`, not `data`), which is not
  // what `$.ajax` below consumes — the body would go out form-encoded while the
  // header claimed JSON, and Rails would reject it as unparseable.
  //
  // Assigned in `init`, NOT as an `extend({useFetch: false})` property: upstream
  // declares it as a native class field (`useFetch = true`), and field
  // initializers run on the instance after the prototype is set up, so a
  // property passed to `extend` is overwritten before the first request. `init`
  // runs after both.
  init() {
    this._super(...arguments);
    this.useFetch = false;
  },

  // Send the request through `$.ajax` (for the auth header) while still building
  // the request the way Ember Data intends.
  //
  // `ajaxOptions` is what sets `contentType: application/json`, `dataType:
  // 'json'` and `data = JSON.stringify(data)`. The previous version of this
  // override called `$.ajax(options)` with Ember Data's raw options object,
  // skipping `ajaxOptions` entirely — so jQuery fell back to form-encoding every
  // POST/PUT body. That is silently lossy in ways the API cannot recover from:
  //
  //   * arrays become index-keyed objects — Rails parses `log[events][0][type]`
  //     as {'events' => {'0' => …}}, not an Array, and every consumer of
  //     `params['events']` iterates it as an Array;
  //   * numbers become strings — `event['window_width'] > 0` raises
  //     "comparison of String with 0 failed";
  //   * booleans become strings — `correct: false` arrives as "false", which is
  //     truthy in both Ruby and JS, so a failed eval trial would read as passed.
  //
  // The practical effect was that no log push from the web app has been able to
  // persist since the override was introduced (248150d15, 2026-01-18): the POST
  // answered 200, the background job then died, and nothing said so.
  ajax: function(url, type, options) {
    return $.ajax(this.ajaxOptions(url, type, options || {}));
  }
}, persistence.DSExtend);

export default res;
