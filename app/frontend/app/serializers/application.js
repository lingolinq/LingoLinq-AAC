import DS from 'ember-data';

/**
 * Application Serializer
 * 
 * This serializer serves as the default serializer for all models.
 * It fixes the deprecation warning about using adapter.defaultSerializer.
 * 
 * Models can override this by creating type-specific serializers if needed.
 */
export default DS.RESTSerializer.extend({
  /**
   * Normalize the response to handle the 'self' user ID mismatch.
   * When requesting 'user' with id 'self', the API returns a user with a different ID.
   * We normalize the response to use 'self' as the ID to match the request,
   * which prevents Ember Data warnings about ID mismatches.
   */
  normalizeResponse(store, primaryModelClass, payload, id, requestType) {
    // Handle the case where we request 'user' with id 'self' but get back a different ID.
    // fetch-manager passes snapshot.id (e.g. 'self') and operation (e.g. 'updateRecord') to
    // normalizeResponse. For user 'self', snapshot.id is 'self'.
    // Pass a copy with id forced to 'self' so Ember Data never tries to update the RecordIdentifier.
    var userSelfRequestTypes = ['findRecord', 'updateRecord'];
    var idIndicatesSelf = id === 'self' || id === 'user:self' || (typeof id === 'string' && id.endsWith(':self'));
    if (primaryModelClass.modelName === 'user' &&
      userSelfRequestTypes.indexOf(requestType) !== -1 &&
      payload &&
      idIndicatesSelf) {
      var userData = payload.user || payload;
      if (userData && userData.id && userData.id !== 'self') {
        var actualId = userData.id;
        if (payload.user) {
          payload = Object.assign({}, payload, {
            user: Object.assign({}, userData, { id: 'self', _actual_id: actualId })
          });
        } else {
          payload = Object.assign({}, userData, { id: 'self', _actual_id: actualId });
        }
      }
    }

    // Handle board findRecord when API returns a list (meta + board array) instead of a single board.
    // This can happen if the wrong endpoint is hit or the response shape is a list. Extract the
    // matching board so the board route gets a single record and the board page can render.
    if (primaryModelClass.modelName === 'board' && requestType === 'findRecord' && payload && Array.isArray(payload.board)) {
      var requestedId = id;
      var match = payload.board.find(function (b) {
        return b && (String(b.id) === String(requestedId) || String(b.key) === String(requestedId));
      });
      if (match) {
        payload.board = match;
      }
    }

    // When we request a board by key (e.g. findRecord('board', 'example/winter')), the API returns
    // the board with global_id as id (e.g. '1_10'). Ember Data then tries to update the
    // RecordIdentifier from 'example/winter' to '1_10', which triggers "The 'id' for a
    // RecordIdentifier should not be updated once it has been set." Normalize so the primary
    // data id matches the request; store the backend id as _actual_id for comparisons/API.
    if (primaryModelClass.modelName === 'board' && requestType === 'findRecord' && payload && payload.board) {
      var boardData = payload.board;
      var boardId = boardData.id;
      if (boardId != null && String(boardId) !== String(id)) {
        payload = Object.assign({}, payload, {
          board: Object.assign({}, boardData, { id: id, _actual_id: boardId })
        });
      }
    }

    // Call the parent normalizeResponse (pass payload in case we replaced it for user 'self')
    return this._super(store, primaryModelClass, payload, id, requestType);
  }
});
