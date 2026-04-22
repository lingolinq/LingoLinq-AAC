import ApplicationAdapter from './application';

/**
 * Board / buttonset ids are often "username/board-slug" with a literal slash.
 * Ember Data encodes "/" as "%2F" in URL segments; Rails matches
 * `buttonsets/:id` with board_id_regex on decoded paths, and some stacks
 * treat %2F inconsistently. Use a single path segment with a real slash
 * so GET/POST /api/v1/buttonsets/... matches the same way as boards.
 */
export default ApplicationAdapter.extend({
  buildURL(modelName, id, snapshot, requestType, query) {
    var url = this._super(modelName, id, snapshot, requestType, query);
    if(typeof id === 'string' && id.indexOf('/') !== -1 && url.indexOf('%2F') !== -1) {
      return url.replace(/%2F/g, '/');
    }
    return url;
  }
});
