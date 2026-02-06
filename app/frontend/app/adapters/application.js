import DS from "ember-data";
import persistence from '../utils/persistence';
import $ from 'jquery';

var res = DS.RESTAdapter.extend({
  namespace: 'api/v1',
  // Override ajax to use $.ajax which is overridden by extras.js to add Authorization headers
  // Note: We directly call $.ajax (not this._super) to ensure the extras.js override is used
  // The extras.js override adds Authorization headers and handles other request processing
  ajax: function(url, type, options) {
    // Base is options (preserves Ember Data request config: data, headers, dataType, etc.);
    // then override only type and url so we don't silently drop request properties.
    options = Object.assign({}, options || {}, { type: type, url: url });
    // Directly call $.ajax which is overridden by extras.js to handle Authorization headers
    // This bypasses the base adapter's ajax but ensures the Authorization header is added
    return $.ajax(options);
  }
}, persistence.DSExtend);

export default res;
