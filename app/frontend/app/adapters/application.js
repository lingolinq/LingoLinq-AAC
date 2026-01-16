import DS from "ember-data";
import persistence from '../utils/persistence';
import ENV from '../config/environment';

var res = DS.RESTAdapter.extend({
  namespace: 'api/v1',
  // In development sandbox, use direct HTTPS API URL to avoid mixed content errors
  host: ENV.API_HOST || undefined
}, persistence.DSExtend);

export default res;
