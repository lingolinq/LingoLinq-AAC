import RESTSerializer from '@ember-data/serializer/rest';

var EMBER_DATA_INTERNAL_KEYS = [
  'currentState', 'isSaving', 'isError', 'isDirty', 'adapterError', 'errors'
];

function stripEmberDataInternalKeys(hash) {
  if (!hash || typeof hash !== 'object') {
    return hash;
  }
  EMBER_DATA_INTERNAL_KEYS.forEach(function(key) {
    delete hash[key];
  });
  return hash;
}

/**
 * Application Serializer
 * 
 * This serializer serves as the default serializer for all models.
 * It fixes the deprecation warning about using adapter.defaultSerializer.
 * 
 * Models can override this by creating type-specific serializers if needed.
 */
export default RESTSerializer.extend({
  normalize(typeClass, hash) {
    if (hash && typeof hash === 'object') {
      hash = Object.assign({}, hash);
      stripEmberDataInternalKeys(hash);
    }
    return this._super(typeClass, hash);
  },
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
    // id.endsWith(':self') is safe: backend user IDs use global_id format (e.g. 1_42) and never end with ':self'.
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

    // store.query expects an array; keyed board lookups may return a single object.
    if (primaryModelClass.modelName === 'board' && requestType === 'query' && payload && payload.board && !Array.isArray(payload.board)) {
      payload = Object.assign({}, payload, { board: [payload.board] });
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

    // Button set is requested by board path (e.g. example/yesno) but JsonApi::ButtonSet uses
    // board.shallow_id as id (e.g. 1_4). Align primary id with the findRecord request to avoid
    // RecordIdentifier / findRecord mismatch warnings; keep backend id on _actual_id (see buttonset model).
    if (primaryModelClass.modelName === 'buttonset' && requestType === 'findRecord' && payload && payload.buttonset) {
      var buttonsetData = payload.buttonset;
      var buttonsetPayloadId = buttonsetData.id;
      if (buttonsetPayloadId != null && String(buttonsetPayloadId) !== String(id)) {
        payload = Object.assign({}, payload, {
          buttonset: Object.assign({}, buttonsetData, { id: id, _actual_id: buttonsetPayloadId })
        });
      }
    }

    // Board save/fetch responses include sideloaded images[] and sounds[].
    // Strip them so they aren't pushed (board tracks image URLs via image_urls hash).
    if (primaryModelClass.modelName === 'board' && payload) {
      if (payload.images) { delete payload.images; }
      if (payload.sounds) { delete payload.sounds; }
      if (payload.image) { delete payload.image; }
      if (payload.sound) { delete payload.sound; }
    }

    // When the server deduplicates an image or sound on createRecord, it may return
    // an ID that already exists in the store. Unload ALL records of that type with
    // that ID — including records in isSaving state — by destroying them first.
    if (requestType === 'createRecord' &&
      (primaryModelClass.modelName === 'image' || primaryModelClass.modelName === 'sound')) {
      var mediaKey = primaryModelClass.modelName;
      var mediaData = payload[mediaKey];
      if (mediaData && mediaData.id) {
        var conflictId = String(mediaData.id);
        try {
          // Snapshot before unload — avoid mutating the live RecordArray mid-loop.
          var allRecs = store.peekAll(mediaKey).slice();
          for (var mi = 0; mi < allRecs.length; mi++) {
            if (String(allRecs[mi].get('id')) === conflictId) {
              // Roll back in-flight attrs so unload works (ED 5: currentState is not settable via .set())
              try {
                if (allRecs[mi].rollbackAttributes) {
                  allRecs[mi].rollbackAttributes();
                }
              } catch (eRoll) {}
              try {
                store.unloadRecord(allRecs[mi]);
              } catch (eUn) {}
            }
          }
        } catch(eAll) {}
      }
    }

    // Call the parent normalizeResponse (pass payload in case we replaced it for user 'self')
    return this._super(store, primaryModelClass, payload, id, requestType);
  }
});
