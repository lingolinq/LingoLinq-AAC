import ApplicationSerializer from './application';

/**
 * COPPA + EU registration: send coppa_under_13 / parent_consent_email (under-13
 * account activation only), plus country and under_16 (EU AI prefer-gate flags).
 *
 * We merge from snapshot.attributes() after super.serialize() so values match the
 * live record (register route sets them immediately before save). Patching only
 * serializeIntoHash proved unreliable across Ember Data versions/paths.
 */
export default ApplicationSerializer.extend({
  // Server sets these on responses; never send on create/update (was defaulting to false and looked like a COPPA bug).
  attrs: {
    coppa_parental_consent_pending: { serialize: false },
    eu_under_16: { serialize: false },
    eu_ai_parental_consent_pending: { serialize: false },
    eu_ai_parental_consent_active: { serialize: false },
    eu_ai_parental_consent_parent_email: { serialize: false },
  },
  serialize(snapshot, options) {
    var json = this._super(snapshot, options);
    if (!json || typeof json !== 'object' || !snapshot) {
      return json;
    }
    // Response-only flags; never POST them (new records default DS.attr('boolean') to false).
    delete json.coppa_parental_consent_pending;
    delete json.eu_under_16;
    delete json.eu_ai_parental_consent_pending;
    delete json.eu_ai_parental_consent_active;
    delete json.eu_ai_parental_consent_parent_email;
    // Prefer live record values so createRecord().save() always sends fields the server expects.
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
      var country = record.get('country');
      if (country != null && country !== '') {
        json.country = country;
      }
      var u16 = record.get('under_16');
      if (u16 === true) {
        json.under_16 = true;
      } else if (u16 === false) {
        json.under_16 = false;
      }
    }
    return json;
  },
});
