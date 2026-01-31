import ApplicationAdapter from './application';

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
