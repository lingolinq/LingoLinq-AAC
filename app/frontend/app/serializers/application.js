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
    // Handle the case where we request 'user' with id 'self' but get back a different ID
    if (primaryModelClass.modelName === 'user' && id === 'self' && payload) {
      // The payload structure might be {user: {...}} or just the user object
      var userData = payload.user || payload;
      if (userData && userData.id && userData.id !== 'self') {
        // Store the actual ID before normalizing
        var actualId = userData.id;
        // Normalize the ID to 'self' to match the request
        // This prevents Ember Data from trying to update the identifier
        userData.id = 'self';
        // Store the actual ID for reference if needed (though it's not currently used)
        if (payload.user) {
          payload.user._actual_id = actualId;
        } else {
          payload._actual_id = actualId;
        }
      }
    }
    
    // Call the parent normalizeResponse
    return this._super(...arguments);
  }
});
