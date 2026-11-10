import { CATALOG_ACCOUNT } from './board_prefetch_planner';

// The boards an offline sync starts from (issue #1221, Traci's decision 2026-11-08). The sync then follows
// each one's folders.
//
// - the home board;
// - the sidebar boards (the person's own copies where they have them, json_api/user.rb);
// - starred boards, the ones a person starred (the system's suggestions only with "Make my Home Board a list
//   of all my liked boards", preferences.sync_starred_boards);
// - Crisis Vocabulary, always: the sidebar normally carries it, but not when the whole sidebar was replaced
//   (User.merge_missing_default_sidebar_boards).
//
// Not the person's other boards, the starter copies made at sign-up, or public and library boards: to have a
// board on the device, star it (or make it the home board or a sidebar board). The background board
// prefetch setting no longer widens this; it only warms boards in memory for browsing online
// (utils/board_detail_cache.js).
export var CRISIS_VOCABULARY_KEY = CATALOG_ACCOUNT + '/crisis-vocabulary';

function is_crisis(key) {
  return !!key && key.split('/').pop() === 'crisis-vocabulary';
}

// Every board a sync starts from gets its button set checked and loaded (the list Find a Button and word
// suggestions read offline); a board reached through a link does not get its own. The sync asks this of each
// board it visits (services/persistence.js and utils/persistence.js, "force a reload of the buttonset").
export function gets_button_set(next) {
  return !!(next && next.button_set === true);
}

export function offline_sync_seeds(user) {
  var seeds = [];
  if(!user || typeof user.get !== 'function') { return seeds; }
  var add = function(seed) { seeds.push(Object.assign(seed, {button_set: true})); };
  var home = user.get('preferences.home_board');
  if(home && home.id) {
    add(Object.assign({}, home, {depth: 0, visit_source: "home board"}));
  }
  // A liked board that is also the home board is already a seed: the sync tells boards apart by id, or by key
  // when a seed has no id, so a second seed with only the key would visit it twice.
  var is_home = function(ref_or_key) {
    if(!home || !home.id || !ref_or_key) { return false; }
    return (!!ref_or_key.id && ref_or_key.id == home.id) || (!!home.key && (ref_or_key.key || ref_or_key) == home.key);
  };
  (user.get('preferences.sidebar_boards') || []).forEach(function(b) {
    if(b && b.key) {
      add({key: b.key, depth: 1, image: b.image, visit_source: "sidebar board"});
    }
  });
  var sync_all = user.get('preferences.sync_starred_boards') === true;
  (user.get('stats.starred_board_refs') || []).forEach(function(ref) {
    if(!ref || (ref.suggested && !sync_all)) { return; }
    if(ref.style && ref.style.options) {
      ref.style.options.forEach(function(opt) {
        if(opt && opt.key && !is_home(opt.key)) { add({key: opt.key, depth: 1, image: opt.url || ref.image_url, visit_source: "suggested board"}); }
      });
    } else if(ref.key && !is_home(ref)) {
      add({key: ref.key, depth: 1, image: ref.image_url, visit_source: ref.suggested ? "suggested board" : "starred board"});
    }
  });
  if(!seeds.some(function(s) { return is_crisis(s.key); })) {
    add({key: CRISIS_VOCABULARY_KEY, depth: 1, visit_source: "crisis vocabulary"});
  }
  return seeds;
}

export default { seeds: offline_sync_seeds, gets_button_set: gets_button_set };
