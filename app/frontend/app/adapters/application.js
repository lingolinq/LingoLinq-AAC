import DS from "ember-data";
import persistence from '../utils/persistence';
import capabilities from '../utils/capabilities';

var res = DS.RESTAdapter.extend({
  namespace: 'api/v1',

  // Override ajax() to inject access token into all API requests
  ajax: function(url, type, options) {
    options = options || {};

    // Inject access token as query parameter if it exists
    if(capabilities && capabilities.access_token) {
      var separator = url.indexOf('?') > -1 ? '&' : '?';
      url = url + separator + 'access_token=' + encodeURIComponent(capabilities.access_token);
    }

    // Call the parent ajax implementation
    return this._super(url, type, options);
  }
}, persistence.DSExtend);

export default res;
