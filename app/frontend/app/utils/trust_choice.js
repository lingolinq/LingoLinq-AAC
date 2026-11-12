/* THE PERSON'S OWN TRUST ANSWER (pass 2 of the final review of #1268, Traci 2026-11-11).
 *
 * Sets the device's trust (`preferences.device.long_token`) together with the time of the explicit choice. The
 * server records an owner's choice only when that stamp is fresh and the save is the person's own, on their own
 * device (app/models/user.rb process_device); only then does a trusted browser device drop the organization's idle
 * timeout (app/models/device.rb clean_old_keys). Called by the "Trust this Device" question
 * (components/login-form.js) and by Preferences when the person changes "Keep me logged in on this private device"
 * (controllers/user/preferences.js). A supervisor's save sets the value as before; the server does not count it as
 * the owner's choice. The server strips the stamp, so it is never stored; a replay of an older save carries a stale
 * one and is not counted either.
 */
export function record_trust_choice(user, choice, now) {
  user.set('preferences.device.long_token', !!choice);
  user.set('preferences.device.long_token_chosen_at', Math.round((now || Date.now()) / 1000));
}

export default record_trust_choice;
