/*
 * Item bank loader for the eval flow.
 *
 * Phase 1B: each item now carries enough content for an in-app
 * renderer to present it directly to the communicator (prompt text,
 * options with a target marker, sequencing hints, etc.) — no more
 * SLP-administers-offline workflow for kinds where the platform can
 * deliver the item itself.
 *
 * Schema by kind:
 *   cause_effect: { prompt_default, reward_default, button_label }
 *   choice / match / category / attribute / recognition / orientation
 *     / word_to_picture / first_letter:
 *     { prompt_default, options: [{ label, is_target }] }
 *   syntax / sequencing:
 *     { prompt_default, options: [{ label, sequence | distractor }] }
 *   attention / joint_attention / preferred_*:
 *     { prompt_default, observe: true } — manual SLP scoring
 *   access_snapshot grid items: { grid: [r,c], target: idx, prompt_default }
 *   library_compare: { word, library, prompt_default }
 *   vocab_probe: { word, part_of_speech, options: [{ label, is_target }] }
 *
 * `prompt` (i18n key) is preserved for translators; the in-app
 * renderer falls back to `prompt_default` when no translation exists.
 * Option labels are plain English in v1 — they're core vocabulary
 * (apple, cup, etc.) and the screen administers in English. Locale
 * coverage of option labels is on the post-1B roadmap.
 */

const ITEM_BANK = {
  'peds-emerging': {
    stage_probe: [
      { id: 'pe_stage_01', kind: 'choice',  prompt: 'choice_pair_food', targets: 2,
        prompt_default: 'Pick the food.',
        options: [
          { label: 'Apple',  is_target: true },
          { label: 'Cup',    is_target: false }
        ] },
      { id: 'pe_stage_02', kind: 'match',   prompt: 'symbol_match_ball', targets: 3,
        prompt_default: 'Show me the ball.',
        options: [
          { label: 'Ball', is_target: true },
          { label: 'Cup',  is_target: false },
          { label: 'Hat',  is_target: false }
        ] },
      { id: 'pe_stage_03', kind: 'match',   prompt: 'symbol_match_drink', targets: 3,
        prompt_default: 'Show me a drink.',
        options: [
          { label: 'Juice', is_target: true },
          { label: 'Shoe',  is_target: false },
          { label: 'Book',  is_target: false }
        ] },
      { id: 'pe_stage_04', kind: 'category', prompt: 'category_animals', targets: 4,
        prompt_default: 'Tap any animal.',
        options: [
          { label: 'Dog',   is_target: true  },
          { label: 'Cat',   is_target: true  },
          { label: 'Truck', is_target: false },
          { label: 'Apple', is_target: false }
        ] }
    ],
    access_snapshot: [
      { id: 'pe_access_01', grid: [1, 3], target: 1, prompt_default: 'Tap the highlighted target.' },
      { id: 'pe_access_02', grid: [2, 3], target: 4, prompt_default: 'Tap the highlighted target.' },
      { id: 'pe_access_03', grid: [3, 3], target: 7, prompt_default: 'Tap the highlighted target.' },
      { id: 'pe_access_04', grid: [3, 4], target: 6, prompt_default: 'Tap the highlighted target.' },
      { id: 'pe_access_05', grid: [4, 4], target: 11, prompt_default: 'Tap the highlighted target.' },
      { id: 'pe_access_06', grid: [4, 6], target: 17, prompt_default: 'Tap the highlighted target.' }
    ],
    // 3-way library bake-off. Each trial shows the same word in three
    // different symbol libraries side-by-side; the user picks the
    // one that's clearest. Tally per library across trials drives
    // the recommendation engine's library winner. Assets live at
    // public/images/eval-lib-{word}-{a|b|c}.{ext}.
    //   a = Mulberry        (illustrated, CC BY-SA)
    //   b = ARASAAC         (flat pictogram, CC BY-NC-SA)
    //   c = Twemoji         (emoji-style, CC BY 4.0)
    library_compare: [
      { id: 'pe_lib_01', word: 'eat',  prompt_default: 'Tap the picture that best shows "eat".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-eat-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-eat-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-eat-c.svg' }
        ] },
      { id: 'pe_lib_02', word: 'play', prompt_default: 'Tap the picture that best shows "play".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-play-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-play-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-play-c.svg' }
        ] },
      { id: 'pe_lib_03', word: 'help', prompt_default: 'Tap the picture that best shows "help".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-help-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-help-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-help-c.svg' }
        ] },
      { id: 'pe_lib_04', word: 'more', prompt_default: 'Tap the picture that best shows "more".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-more-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-more-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-more-c.svg' }
        ] }
    ],
    vocab_probe: [
      { id: 'pe_vocab_01', word: 'I',       part_of_speech: 'pronoun',
        prompt_default: 'Find "I".',
        options: [
          { label: 'I',    is_target: true },
          { label: 'You',  is_target: false },
          { label: 'They', is_target: false },
          { label: 'It',   is_target: false }
        ] },
      { id: 'pe_vocab_02', word: 'cookie',  part_of_speech: 'noun',
        prompt_default: 'Find "cookie".',
        options: [
          { label: 'Cookie', is_target: true },
          { label: 'Apple',  is_target: false },
          { label: 'Bread',  is_target: false },
          { label: 'Cup',    is_target: false }
        ] },
      { id: 'pe_vocab_03', word: 'animals', part_of_speech: 'category',
        prompt_default: 'Tap any animal.',
        options: [
          { label: 'Dog',   is_target: true  },
          { label: 'Cat',   is_target: true  },
          { label: 'Plate', is_target: false },
          { label: 'Sock',  is_target: false }
        ] }
    ]
  },
  'early-comm': {
    stage_probe: [
      { id: 'ec_stage_01', kind: 'cause_effect', prompt: 'big_button_animation',
        prompt_default: 'Press the big button.',
        button_label: 'Tap me!',
        reward_default: 'Yay!' },
      { id: 'ec_stage_02', kind: 'choice', prompt: 'choice_pair_objects', targets: 2,
        prompt_default: 'Pick one.',
        options: [
          { label: 'Toy',  is_target: true },
          { label: 'Cup',  is_target: false }
        ] },
      { id: 'ec_stage_03', kind: 'match',  prompt: 'symbol_match_object', targets: 2,
        prompt_default: 'Tap the same picture.',
        options: [
          { label: 'Ball',  is_target: true },
          { label: 'Spoon', is_target: false }
        ] },
      { id: 'ec_stage_04', kind: 'attention', prompt: 'joint_attention', observe: true,
        prompt_default: 'Direct the communicator\'s attention to a shared object (point, gaze, vocalize). Score whether they engage.' }
    ],
    access_snapshot: [
      { id: 'ec_access_01', grid: [1, 1], target: 0, prompt_default: 'Tap the highlighted target.' },
      { id: 'ec_access_02', grid: [1, 2], target: 1, prompt_default: 'Tap the highlighted target.' },
      { id: 'ec_access_03', grid: [2, 2], target: 2, prompt_default: 'Tap the highlighted target.' },
      { id: 'ec_access_04', grid: [2, 3], target: 3, prompt_default: 'Tap the highlighted target.' },
      { id: 'ec_access_05', grid: [3, 3], target: 4, prompt_default: 'Tap the highlighted target.' },
      { id: 'ec_access_06', grid: [3, 4], target: 6, prompt_default: 'Tap the highlighted target.' }
    ],
    choice_probe: [
      { id: 'ec_choice_01', kind: 'preferred_object', observe: true,
        prompt_default: 'Offer 3 preferred objects. Note any reach, look, or vocalization toward one.' },
      { id: 'ec_choice_02', kind: 'preferred_activity', observe: true,
        prompt_default: 'Offer 3 short activities (book, song, bubbles). Note engagement signals.' },
      { id: 'ec_choice_03', kind: 'reject', observe: true,
        prompt_default: 'Offer a non-preferred item. Note any rejection signal (push away, head turn, "no").' },
      { id: 'ec_choice_04', kind: 'request_more', observe: true,
        prompt_default: 'Pause a preferred activity. Note any request-for-more signal (gesture, vocalization, gaze).' }
    ]
  },
  'peds-established': {
    stage_probe: [
      { id: 'ps_stage_01', kind: 'category',  prompt: 'category_food',    targets: 6,
        prompt_default: 'Tap any food.',
        options: [
          { label: 'Apple',   is_target: true  },
          { label: 'Bread',   is_target: true  },
          { label: 'Pasta',   is_target: true  },
          { label: 'Pencil',  is_target: false },
          { label: 'Shoe',    is_target: false },
          { label: 'Phone',   is_target: false }
        ] },
      { id: 'ps_stage_02', kind: 'syntax',    prompt: 'two_word_request', targets: 4,
        prompt_default: 'Build "more drink" — tap "more" then "drink".',
        options: [
          { label: 'More',   sequence: 1 },
          { label: 'Drink',  sequence: 2 },
          { label: 'Big',    distractor: true },
          { label: 'Happy',  distractor: true }
        ] },
      { id: 'ps_stage_03', kind: 'attribute', prompt: 'attribute_color',  targets: 4,
        prompt_default: 'Which one is red?',
        options: [
          { label: 'Red apple',   is_target: true  },
          { label: 'Green leaf',  is_target: false },
          { label: 'Blue ball',   is_target: false },
          { label: 'Yellow sun',  is_target: false }
        ] }
    ],
    access_snapshot: [
      { id: 'ps_access_01', grid: [3, 3], target: 4,  prompt_default: 'Tap the highlighted target.' },
      { id: 'ps_access_02', grid: [3, 4], target: 6,  prompt_default: 'Tap the highlighted target.' },
      { id: 'ps_access_03', grid: [4, 6], target: 14, prompt_default: 'Tap the highlighted target.' },
      { id: 'ps_access_04', grid: [4, 6], target: 19, prompt_default: 'Tap the highlighted target.' },
      { id: 'ps_access_05', grid: [6, 8], target: 23, prompt_default: 'Tap the highlighted target.' },
      { id: 'ps_access_06', grid: [6, 10], target: 41, prompt_default: 'Tap the highlighted target.' }
    ],
    // peds-established 3-way bake-off. "happy" and "school" have
    // assets in all 3 libraries; "because" has no clean Mulberry
    // representation, so it falls back to the legacy single-tile
    // path (template handles both shapes).
    library_compare: [
      { id: 'ps_lib_01', word: 'happy', prompt_default: 'Tap the picture that best shows "happy".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-happy-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-happy-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-happy-c.svg' }
        ] },
      { id: 'ps_lib_02', word: 'school', prompt_default: 'Tap the picture that best shows "school".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-school-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-school-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-school-c.svg' }
        ] },
      { id: 'ps_lib_03', word: 'because', prompt_default: 'Tap the symbol that means "because".' }
    ],
    vocab_probe: [
      { id: 'ps_vocab_01', word: 'they',     part_of_speech: 'pronoun',
        prompt_default: 'Find "they".',
        options: [
          { label: 'They',  is_target: true  },
          { label: 'I',     is_target: false },
          { label: 'You',   is_target: false },
          { label: 'It',    is_target: false }
        ] },
      { id: 'ps_vocab_02', word: 'because',  part_of_speech: 'conjunction',
        prompt_default: 'Find "because".',
        options: [
          { label: 'Because', is_target: true  },
          { label: 'And',     is_target: false },
          { label: 'But',     is_target: false },
          { label: 'So',      is_target: false }
        ] },
      { id: 'ps_vocab_03', word: 'feelings', part_of_speech: 'category',
        prompt_default: 'Find a feeling word.',
        options: [
          { label: 'Happy',  is_target: true  },
          { label: 'Sad',    is_target: true  },
          { label: 'Run',    is_target: false },
          { label: 'Eat',    is_target: false }
        ] },
      { id: 'ps_vocab_04', word: 'remember', part_of_speech: 'verb',
        prompt_default: 'Find "remember".',
        options: [
          { label: 'Remember', is_target: true  },
          { label: 'Forget',   is_target: false },
          { label: 'Eat',      is_target: false },
          { label: 'Sleep',    is_target: false }
        ] }
    ],
    literacy_probe: [
      { id: 'ps_lit_01', kind: 'word_to_picture', prompt: 'literacy_word_picture', targets: 4,
        prompt_default: 'Match "dog" to its picture.',
        options: [
          { label: '🐕 dog',   is_target: true  },
          { label: '🐈 cat',   is_target: false },
          { label: '🚗 car',   is_target: false },
          { label: '🍎 apple', is_target: false }
        ] },
      { id: 'ps_lit_02', kind: 'first_letter',    prompt: 'literacy_first_letter', targets: 4,
        prompt_default: 'What letter does "ball" start with?',
        options: [
          { label: 'B', is_target: true  },
          { label: 'D', is_target: false },
          { label: 'M', is_target: false },
          { label: 'P', is_target: false }
        ] }
    ]
  },
  'adult-motor': {
    access_snapshot: [
      { id: 'am_access_01', grid: [2, 3], target: 1,  prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_02', grid: [3, 3], target: 4,  prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_03', grid: [3, 4], target: 7,  prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_04', grid: [4, 4], target: 10, prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_05', grid: [4, 6], target: 14, prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_06', grid: [4, 6], target: 21, prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_07', grid: [6, 8], target: 23, prompt_default: 'Tap the highlighted target.' },
      { id: 'am_access_08', grid: [6, 10], target: 35, prompt_default: 'Tap the highlighted target.' }
    ],
    cognitive_probe: [
      { id: 'am_cog_01', kind: 'choice',  prompt: 'cognitive_when_sleep',   targets: 3,
        prompt_default: 'When do people sleep?',
        options: [
          { label: 'Bedtime',   is_target: true  },
          { label: 'Morning',   is_target: false },
          { label: 'Daytime',   is_target: false }
        ] },
      { id: 'am_cog_02', kind: 'recognition',  prompt: 'cognitive_familiar_face', targets: 4,
        prompt_default: 'Show a familiar photo. Which one is family?',
        options: [
          { label: 'My family',     is_target: true  },
          { label: 'A stranger',    is_target: false },
          { label: 'A pet',         is_target: false },
          { label: 'A landmark',    is_target: false }
        ] },
      { id: 'am_cog_03', kind: 'sequencing',   prompt: 'cognitive_three_step',    targets: 3,
        prompt_default: 'Tap in order: 1, 2, 3.',
        options: [
          { label: '1', sequence: 1 },
          { label: '2', sequence: 2 },
          { label: '3', sequence: 3 }
        ] },
      { id: 'am_cog_04', kind: 'category',     prompt: 'cognitive_belongs_with',  targets: 4,
        prompt_default: 'Which one belongs with "fork"?',
        options: [
          { label: 'Spoon',  is_target: true  },
          { label: 'Hammer', is_target: false },
          { label: 'Tree',   is_target: false },
          { label: 'Cloud',  is_target: false }
        ] }
    ],
    // adult-motor 3-way bake-off. Reuses the eat/play/help/more
    // assets where the word matches; pain has its own asset set.
    // Mulberry "headache" stands in as the most readable Mulberry
    // approximation of pain (Mulberry doesn't have a direct "pain"
    // pictogram — see eval-lib-pain-a.svg).
    library_compare: [
      { id: 'am_lib_01', word: 'pain', prompt_default: 'Tap the picture that best shows "pain".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-pain-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-pain-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-pain-c.svg' }
        ] },
      { id: 'am_lib_02', word: 'help', prompt_default: 'Tap the picture that best shows "help".',
        library_options: [
          { library: 'mulberry', image: '/images/eval-lib-help-a.svg' },
          { library: 'arasaac',  image: '/images/eval-lib-help-b.png' },
          { library: 'twemoji',  image: '/images/eval-lib-help-c.svg' }
        ] }
    ],
    vocab_probe: [
      { id: 'am_vocab_01', word: 'help',     part_of_speech: 'verb',
        prompt_default: 'Find "help".',
        options: [
          { label: 'Help',    is_target: true  },
          { label: 'Stop',    is_target: false },
          { label: 'Yes',     is_target: false },
          { label: 'No',      is_target: false }
        ] },
      { id: 'am_vocab_02', word: 'family',   part_of_speech: 'noun',
        prompt_default: 'Find "family".',
        options: [
          { label: 'Family',  is_target: true  },
          { label: 'Friend',  is_target: false },
          { label: 'Doctor',  is_target: false },
          { label: 'Stranger', is_target: false }
        ] },
      { id: 'am_vocab_03', word: 'feelings', part_of_speech: 'category',
        prompt_default: 'Find a feeling word.',
        options: [
          { label: 'Tired', is_target: true  },
          { label: 'Happy', is_target: true  },
          { label: 'Walk',  is_target: false },
          { label: 'Drink', is_target: false }
        ] }
    ]
  },
  'adult-progressive': {
    access_snapshot: [
      { id: 'ap_access_01', grid: [2, 3], target: 1,  prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_02', grid: [3, 3], target: 4,  prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_03', grid: [3, 4], target: 5,  prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_04', grid: [3, 4], target: 9,  prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_05', grid: [4, 4], target: 10, prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_06', grid: [4, 6], target: 13, prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_07', grid: [4, 6], target: 17, prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_08', grid: [4, 6], target: 22, prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_09', grid: [6, 8], target: 25, prompt_default: 'Tap the highlighted target.' },
      { id: 'ap_access_10', grid: [6, 8], target: 41, prompt_default: 'Tap the highlighted target.' }
    ],
    cognitive_probe: [
      { id: 'ap_cog_01', kind: 'recognition', prompt: 'cognitive_familiar_face', targets: 4,
        prompt_default: 'Show a familiar photo. Which one is your caregiver?',
        options: [
          { label: 'My caregiver', is_target: true  },
          { label: 'A stranger',   is_target: false },
          { label: 'A pet',        is_target: false },
          { label: 'A landmark',   is_target: false }
        ] },
      { id: 'ap_cog_02', kind: 'category',    prompt: 'cognitive_belongs_with',  targets: 4,
        prompt_default: 'Which one belongs with "comfortable"?',
        options: [
          { label: 'Pillow', is_target: true  },
          { label: 'Hammer', is_target: false },
          { label: 'Stair',  is_target: false },
          { label: 'Razor',  is_target: false }
        ] },
      { id: 'ap_cog_03', kind: 'attribute',   prompt: 'cognitive_attribute',     targets: 4,
        prompt_default: 'Which one is warm?',
        options: [
          { label: 'Hot tea', is_target: true  },
          { label: 'Ice cube', is_target: false },
          { label: 'Snow',    is_target: false },
          { label: 'River',   is_target: false }
        ] },
      { id: 'ap_cog_04', kind: 'sequencing',  prompt: 'cognitive_three_step',    targets: 3,
        prompt_default: 'Tap in order: 1, 2, 3.',
        options: [
          { label: '1', sequence: 1 },
          { label: '2', sequence: 2 },
          { label: '3', sequence: 3 }
        ] }
    ],
    vocab_probe: [
      { id: 'ap_vocab_01', word: 'comfortable', part_of_speech: 'adjective',
        prompt_default: 'Find "comfortable".',
        options: [
          { label: 'Comfortable', is_target: true  },
          { label: 'Painful',     is_target: false },
          { label: 'Tired',       is_target: false },
          { label: 'Hungry',      is_target: false }
        ] },
      { id: 'ap_vocab_02', word: 'caregiver',   part_of_speech: 'noun',
        prompt_default: 'Find "caregiver".',
        options: [
          { label: 'Caregiver', is_target: true  },
          { label: 'Doctor',    is_target: false },
          { label: 'Friend',    is_target: false },
          { label: 'Stranger',  is_target: false }
        ] },
      { id: 'ap_vocab_03', word: 'I',           part_of_speech: 'pronoun',
        prompt_default: 'Find "I".',
        options: [
          { label: 'I',    is_target: true  },
          { label: 'You',  is_target: false },
          { label: 'They', is_target: false },
          { label: 'It',   is_target: false }
        ] },
      { id: 'ap_vocab_04', word: 'feelings',    part_of_speech: 'category',
        prompt_default: 'Find a feeling word.',
        options: [
          { label: 'Tired',  is_target: true  },
          { label: 'Happy',  is_target: true  },
          { label: 'Walk',   is_target: false },
          { label: 'Drink',  is_target: false }
        ] }
    ]
  }
};

// Subtests that don't have an item-level `kind` get one inferred
// from the subtest name, so the runner can dispatch off a single
// field. access_snapshot stays as 'access_snapshot' even though
// individual items don't carry the kind themselves.
const SUBTEST_KIND = {
  access_snapshot: 'access_snapshot',
  library_compare: 'library_compare',
  vocab_probe:     'vocab_probe'
};

function forSubtest(profile, subtest) {
  const bank = ITEM_BANK[profile] || ITEM_BANK['peds-emerging'];
  const items = (bank && bank[subtest]) || [];
  // Annotate items missing a `kind` with the inferred subtest kind
  // so the runner's dispatch never has to special-case subtests.
  const fallback = SUBTEST_KIND[subtest];
  if (!fallback) { return items; }
  return items.map(function(item) {
    if (item.kind) { return item; }
    return Object.assign({}, item, { kind: fallback });
  });
}

function listProfiles() {
  return Object.keys(ITEM_BANK);
}

export default {
  forSubtest: forSubtest,
  listProfiles: listProfiles,
  ITEM_BANK: ITEM_BANK,
  SUBTEST_KIND: SUBTEST_KIND
};
