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
  // Note: When using findRecord('user', 'self'), the API returns a different ID
  // (e.g., '1_1') than requested ('self'). This causes a harmless warning from
  // Ember Data, but the functionality works correctly. The warning cannot be
  // suppressed without changing the API behavior, and queryRecord() doesn't work
  // with this API endpoint structure.
});
