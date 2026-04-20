import ApplicationSerializer from './application';

/**
 * COPPA signup: always send coppa_under_13 and parent_consent_email in the POST body.
 *
 * We merge from snapshot.attributes() after super.serialize() so values match the
 * live record (register route sets them immediately before save). Patching only
 * serializeIntoHash proved unreliable across Ember Data versions/paths.
 */
export default ApplicationSerializer.extend({
  // Server sets this on responses; never send on create/update (was defaulting to false and looked like a COPPA bug).
  attrs: {
    coppa_parental_consent_pending: { serialize: false },
  },
  serialize(snapshot, options) {
    var json = this._super(snapshot, options);
    if (!json || typeof json !== 'object' || !snapshot) {
      return json;
    }
    // Response-only flag; never POST it (new records default DS.attr('boolean') to false).
    delete json.coppa_parental_consent_pending;
    // Prefer live record values so createRecord().save() always sends COPPA fields the server expects.
    var record = snapshot.record;
    if (record && typeof record.get === 'function') {
      var u13 = record.get('coppa_under_13');
      if (u13 === true) {
        json.coppa_under_13 = true;
      } else if (u13 === false) {
        json.coppa_under_13 = false;
      }
      var pe = record.get('parent_consent_email');
      if (pe != null && pe !== '') {
        json.parent_consent_email = pe;
      }
    }
    return json;
  },
});
