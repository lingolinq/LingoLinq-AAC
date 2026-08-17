import ApplicationSerializer from './application';

/**
 * COPPA + EU registration: send coppa_under_13 / parent_consent_email (under-13
 * account activation only), plus country and under_16 (EU AI prefer-gate flags).
 *
 * We merge from snapshot.attributes() after super.serialize() so values match the
 * live record (register route sets them immediately before save). Patching only
 * serializeIntoHash proved unreliable across Ember Data versions/paths.
 */
/*
 * `_actual_id` is deliberately NOT listed in `attrs` below as `serialize: false`,
 * even though it is a response-only field and looks exactly like the five that
 * ARE listed. Traced before deciding, because the obvious cleanup is wrong:
 *
 *   - `serialize: false` takes effect in `serialize()`, which is reached by
 *     `serializeIntoHash` -> `persistence#convert_model_to_json`
 *     (services/persistence.js:3691 — the LIVE copy; utils/persistence.js:3713
 *     mirrors it and differs only in the receiver of `temporary_id()`).
 *   - That function is used by the OFFLINE branches of createRecord /
 *     updateRecord / deleteRecord (services/persistence.js:4701, 4740, 4765) to
 *     write the record into local storage. It is the only writer of the local
 *     copy when a save happens offline.
 *   - The session user is keyed 'self' (serializers/application.js), so a local
 *     copy WITHOUT `_actual_id` has no usable backend id at all — exactly the
 *     state that locked the eval's own author out of their workbook, and what
 *     `models/user.js#global_id` exists to resolve.
 *
 * So dropping it from serialization would reintroduce that bug for anyone who
 * saves while offline. Sending it to the server is harmless by comparison:
 * `User#process_params` is a whitelist with no mass-assignment, so the server
 * reads the key nowhere and discards it. (The ONLINE fetch path stores the raw
 * network response via store_eventually, not serializer output, which is why
 * this only bites the offline-save case.)
 *
 * Verified rather than assumed — see PR #807, where this was deferred as
 * untraced, and the follow-up branch that traced it.
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
