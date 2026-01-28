import DS from "ember-data";
import persistence from '../utils/persistence';
import $ from 'jquery';

var res = DS.RESTAdapter.extend({
  namespace: 'api/v1',
  // Override ajax to use $.ajax which is overridden by extras.js to add Authorization headers
  // Note: We directly call $.ajax (not this._super) to ensure the extras.js override is used
  // The extras.js override adds Authorization headers and handles other request processing
  ajax: function(url, type, options) {
    // Merge options to preserve all properties (headers, data, dataType, etc.)
    // This ensures we don't lose any configuration that Ember Data may pass in
    options = Object.assign({}, options || {}, {
      type: type,
      url: url
    });
    // Directly call $.ajax which is overridden by extras.js to handle Authorization headers
    // This bypasses the base adapter's ajax but ensures the Authorization header is added
    return $.ajax(options);
  }
}, persistence.DSExtend);

export default res;
