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
  },
  'peds-established': {
    // Phrase-level+ kids (6-21). Items emphasize categories, simple
    // syntax targets, and a literacy probe per protocol definition.
    stage_probe: [
      { id: 'ps_stage_01', kind: 'category',  prompt: 'category_food',     targets: 6 },
      { id: 'ps_stage_02', kind: 'syntax',    prompt: 'two_word_request',  targets: 4 },
      { id: 'ps_stage_03', kind: 'attribute', prompt: 'attribute_color',   targets: 4 }
    ],
    access_snapshot: [
      { id: 'ps_access_01', grid: [3, 3], target: 4 },
      { id: 'ps_access_02', grid: [3, 4], target: 6 },
      { id: 'ps_access_03', grid: [4, 6], target: 14 },
      { id: 'ps_access_04', grid: [4, 6], target: 19 },
      { id: 'ps_access_05', grid: [6, 8], target: 23 },
      { id: 'ps_access_06', grid: [6, 10], target: 41 }
    ],
    library_compare: [
      { id: 'ps_lib_01', word: 'happy',    library: 'a' },
      { id: 'ps_lib_02', word: 'happy',    library: 'b' },
      { id: 'ps_lib_03', word: 'school',   library: 'a' },
      { id: 'ps_lib_04', word: 'school',   library: 'b' },
      { id: 'ps_lib_05', word: 'because',  library: 'a' },
      { id: 'ps_lib_06', word: 'because',  library: 'b' }
    ],
    vocab_probe: [
      { id: 'ps_vocab_01', word: 'they',     part_of_speech: 'pronoun' },
      { id: 'ps_vocab_02', word: 'because',  part_of_speech: 'conjunction' },
      { id: 'ps_vocab_03', word: 'feelings', part_of_speech: 'category' },
      { id: 'ps_vocab_04', word: 'remember', part_of_speech: 'verb' }
    ],
    literacy_probe: [
      { id: 'ps_lit_01', kind: 'word_to_picture',  prompt: 'literacy_word_picture',  targets: 4 },
      { id: 'ps_lit_02', kind: 'first_letter',     prompt: 'literacy_first_letter',  targets: 4 }
    ]
  },
  'adult-motor': {
    // Adult acquired (stroke, TBI). Multi-access weighted; adds a
    // fast cognitive probe (orientation/recognition) and skips the
    // pediatric stage probe.
    access_snapshot: [
      { id: 'am_access_01', grid: [2, 3], target: 1 },
      { id: 'am_access_02', grid: [3, 3], target: 4 },
      { id: 'am_access_03', grid: [3, 4], target: 7 },
      { id: 'am_access_04', grid: [4, 4], target: 10 },
      { id: 'am_access_05', grid: [4, 6], target: 14 },
      { id: 'am_access_06', grid: [4, 6], target: 21 },
      { id: 'am_access_07', grid: [6, 8], target: 23 },
      { id: 'am_access_08', grid: [6, 10], target: 35 }
    ],
    cognitive_probe: [
      { id: 'am_cog_01', kind: 'orientation',   prompt: 'cognitive_today_is',     targets: 3 },
      { id: 'am_cog_02', kind: 'recognition',   prompt: 'cognitive_familiar_face', targets: 4 },
      { id: 'am_cog_03', kind: 'sequencing',    prompt: 'cognitive_three_step',    targets: 3 },
      { id: 'am_cog_04', kind: 'category',      prompt: 'cognitive_belongs_with',  targets: 4 }
    ],
    library_compare: [
      { id: 'am_lib_01', word: 'pain',  library: 'a' },
      { id: 'am_lib_02', word: 'pain',  library: 'b' },
      { id: 'am_lib_03', word: 'help',  library: 'a' },
      { id: 'am_lib_04', word: 'help',  library: 'b' }
    ],
    vocab_probe: [
      { id: 'am_vocab_01', word: 'help',     part_of_speech: 'verb' },
      { id: 'am_vocab_02', word: 'family',   part_of_speech: 'noun' },
      { id: 'am_vocab_03', word: 'feelings', part_of_speech: 'category' }
    ]
  },
  'adult-progressive': {
    // Progressive etiology (ALS, MND). Gaze-first multi-access — the
    // grid widths stay manageable for dwell selection. Cognitive
    // probe is light because progressive AAC users typically retain
    // intact cognition. Vocab leans toward life-participation
    // (caregiving, comfort, identity).
    access_snapshot: [
      { id: 'ap_access_01', grid: [2, 3], target: 1 },
      { id: 'ap_access_02', grid: [3, 3], target: 4 },
      { id: 'ap_access_03', grid: [3, 4], target: 5 },
      { id: 'ap_access_04', grid: [3, 4], target: 9 },
      { id: 'ap_access_05', grid: [4, 4], target: 10 },
      { id: 'ap_access_06', grid: [4, 6], target: 13 },
      { id: 'ap_access_07', grid: [4, 6], target: 17 },
      { id: 'ap_access_08', grid: [4, 6], target: 22 },
      { id: 'ap_access_09', grid: [6, 8], target: 25 },
      { id: 'ap_access_10', grid: [6, 8], target: 41 }
    ],
    cognitive_probe: [
      { id: 'ap_cog_01', kind: 'recognition',  prompt: 'cognitive_familiar_face', targets: 4 },
      { id: 'ap_cog_02', kind: 'category',     prompt: 'cognitive_belongs_with',  targets: 4 },
      { id: 'ap_cog_03', kind: 'attribute',    prompt: 'cognitive_attribute',     targets: 4 },
      { id: 'ap_cog_04', kind: 'sequencing',   prompt: 'cognitive_three_step',    targets: 3 }
    ],
    vocab_probe: [
      { id: 'ap_vocab_01', word: 'comfortable', part_of_speech: 'adjective' },
      { id: 'ap_vocab_02', word: 'caregiver',   part_of_speech: 'noun' },
      { id: 'ap_vocab_03', word: 'I',           part_of_speech: 'pronoun' },
      { id: 'ap_vocab_04', word: 'feelings',    part_of_speech: 'category' }
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
