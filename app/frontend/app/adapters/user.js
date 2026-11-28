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
      delete q.one_try;
      // `one_try` is the wait in ms for one attempt that ends itself (utils/extras.js retries only
      // while attempt <= 2). The board routes use it so a hung server does not hold a board back.
      var limit = query.one_try ? { timeout: query.one_try, attempt: 3 } : {};
      return this.ajax(url, 'GET', Object.assign({ data: q }, limit));
    }
    return this._super(...arguments);
  }
});
