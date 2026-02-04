import ApplicationAdapter from './application';

/**
 * User adapter: queryRecord supports path-based lookups.
 * Pass query.path (e.g. user name or global_id) to look up a user by path.
 * Queries without query.path fall back to the parent adapter (standard query behavior).
 */
export default ApplicationAdapter.extend({
  queryRecord(store, type, query) {
    if (query.path) {
      var url = this.buildURL('user', query.path);
      var q = Object.assign({}, query);
      delete q.path;
      return this.ajax(url, 'GET', { data: q });
    }
    return this._super(...arguments);
  }
});
