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

export function offline_sync_seeds(user) {
  var seeds = [];
  if(!user || typeof user.get !== 'function') { return seeds; }
  var home = user.get('preferences.home_board');
  if(home && home.id) {
    seeds.push(Object.assign({}, home, {depth: 0, visit_source: "home board"}));
  }
  (user.get('preferences.sidebar_boards') || []).forEach(function(b) {
    if(b && b.key) {
      seeds.push({key: b.key, depth: 1, image: b.image, visit_source: "sidebar board"});
    }
  });
  var sync_all = user.get('preferences.sync_starred_boards') === true;
  (user.get('stats.starred_board_refs') || []).forEach(function(ref) {
    if(!ref || (ref.suggested && !sync_all)) { return; }
    if(ref.style && ref.style.options) {
      ref.style.options.forEach(function(opt) {
        if(opt && opt.key) { seeds.push({key: opt.key, depth: 1, image: opt.url || ref.image_url, visit_source: "suggested board"}); }
      });
    } else if(ref.key) {
      seeds.push({key: ref.key, depth: 1, image: ref.image_url, visit_source: ref.suggested ? "suggested board" : "starred board"});
    }
  });
  if(!seeds.some(function(s) { return is_crisis(s.key); })) {
    seeds.push({key: CRISIS_VOCABULARY_KEY, depth: 1, visit_source: "crisis vocabulary"});
  }
  return seeds;
}

export default { seeds: offline_sync_seeds };
