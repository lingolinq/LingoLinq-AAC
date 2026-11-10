import { save_listed_preferences } from '../preference_save';

/* Record `key` as true in one guided-tour progress map (`map` is 'guided_tours_completed' or
   'guided_tours_autoshown', both under preferences.progress) and save just that map
   (utils/preference_save.js); the server merges it with the stored map (app/models/user.rb), so a
   device with an old copy cannot drop a tour recorded elsewhere. Best effort: a failed save is
   ignored. Uses FRESH object copies at every level (prefs, progress, map) so Ember Data sees a real
   reference change and serializes it: an in-place nested mutation leaves hasDirtyAttributes false.
   Returns false when there was nothing to record. Used by components/guided-tour.js and
   utils/tours/tour_offer.js. */
export function mark_tour_progress(user, map, key) {
  if (!user || !user.get || !key) { return false; }
  var prefs = Object.assign({}, user.get('preferences') || {});
  var progress = Object.assign({}, prefs.progress || {});
  var entries = Object.assign({}, progress[map] || {});
  if (entries[key]) { return false; }
  entries[key] = true;
  progress[map] = entries;
  prefs.progress = progress;
  user.set('preferences', prefs);
  if (user.save) { save_listed_preferences(user, ['progress.' + map]).then(null, function() { /* best-effort */ }); }
  return true;
}
