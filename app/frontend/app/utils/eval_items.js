/*
 * Item bank loader for the eval flow.
 *
 * Phase 1A: returns curated item lists for each population profile + subtest.
 * Future: load remote item banks via persistence layer, allow SLP-authored
 * protocols to override.
 *
 * Items are intentionally small and human-readable JS so reviewers can audit
 * what runs during an eval. Each item carries a stable id so log events stay
 * meaningful across protocol versions.
 */

const ITEM_BANK = {
  'peds-emerging': {
    stage_probe: [
      { id: 'pe_stage_01', kind: 'choice',  prompt: 'choice_pair_food',     targets: 2 },
      { id: 'pe_stage_02', kind: 'match',   prompt: 'symbol_match_ball',    targets: 3 },
      { id: 'pe_stage_03', kind: 'match',   prompt: 'symbol_match_drink',   targets: 3 },
      { id: 'pe_stage_04', kind: 'category', prompt: 'category_animals',    targets: 4 }
    ],
    access_snapshot: [
      { id: 'pe_access_01', grid: [1, 3], target: 1 },
      { id: 'pe_access_02', grid: [2, 3], target: 4 },
      { id: 'pe_access_03', grid: [3, 3], target: 7 },
      { id: 'pe_access_04', grid: [3, 4], target: 6 },
      { id: 'pe_access_05', grid: [4, 4], target: 11 },
      { id: 'pe_access_06', grid: [4, 6], target: 17 }
    ],
    library_compare: [
      { id: 'pe_lib_01', word: 'eat',   library: 'a' },
      { id: 'pe_lib_02', word: 'eat',   library: 'b' },
      { id: 'pe_lib_03', word: 'play',  library: 'a' },
      { id: 'pe_lib_04', word: 'play',  library: 'b' },
      { id: 'pe_lib_05', word: 'help',  library: 'a' },
      { id: 'pe_lib_06', word: 'help',  library: 'b' }
    ],
    vocab_probe: [
      { id: 'pe_vocab_01', word: 'I',       part_of_speech: 'pronoun' },
      { id: 'pe_vocab_02', word: 'cookie',  part_of_speech: 'noun' },
      { id: 'pe_vocab_03', word: 'animals', part_of_speech: 'category' }
    ]
  },
  'early-comm': {
    stage_probe: [
      { id: 'ec_stage_01', kind: 'cause_effect', prompt: 'big_button_animation' },
      { id: 'ec_stage_02', kind: 'choice',       prompt: 'choice_pair_objects', targets: 2 },
      { id: 'ec_stage_03', kind: 'match',        prompt: 'symbol_match_object', targets: 2 },
      { id: 'ec_stage_04', kind: 'attention',    prompt: 'joint_attention' }
    ],
    access_snapshot: [
      { id: 'ec_access_01', grid: [1, 1], target: 0 },
      { id: 'ec_access_02', grid: [1, 2], target: 1 },
      { id: 'ec_access_03', grid: [2, 2], target: 2 },
      { id: 'ec_access_04', grid: [2, 3], target: 3 },
      { id: 'ec_access_05', grid: [3, 3], target: 4 },
      { id: 'ec_access_06', grid: [3, 4], target: 6 }
    ],
    choice_probe: [
      { id: 'ec_choice_01', kind: 'preferred_object' },
      { id: 'ec_choice_02', kind: 'preferred_activity' },
      { id: 'ec_choice_03', kind: 'reject' },
      { id: 'ec_choice_04', kind: 'request_more' }
    ]
  }
};

function forSubtest(profile, subtest) {
  const bank = ITEM_BANK[profile] || ITEM_BANK['peds-emerging'];
  return (bank && bank[subtest]) || [];
}

function listProfiles() {
  return Object.keys(ITEM_BANK);
}

export default {
  forSubtest: forSubtest,
  listProfiles: listProfiles,
  ITEM_BANK: ITEM_BANK
};
