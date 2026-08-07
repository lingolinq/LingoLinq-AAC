/**
 * Shared behavior table for the AI preference gate. GENERATED MIRROR of
 * spec/fixtures/ai_pref_gate_cases.json — edit that file, then regenerate.
 *
 * The payload below is the canonical JSON verbatim, kept as a raw template
 * literal so both suites parse identical bytes.
 * spec/lib/feature_flags_ai_prefs_spec.rb extracts this same string and asserts
 * it matches the canonical file, so a drifted mirror fails the Ruby suite
 * rather than silently under-testing the client half.
 *
 * String.raw is required, not decorative: a plain template literal resolves
 * \u0000 itself and hands JSON.parse an actual control character, which is a
 * syntax error. The table deliberately contains such a case.
 */

// ai-pref-gate-cases:begin
const RAW = String.raw`
{
  "_comment": [
    "Canonical behavior table for the AI preference gate, executed by BOTH sides:",
    "  server -> spec/lib/feature_flags_ai_prefs_spec.rb (FeatureFlags.user_pref_allows_ai?)",
    "  client -> app/frontend/tests/utils/ai_feature_gate-test.js (prefAllowsAi)",
    "The client reads its copy from app/frontend/tests/fixtures/ai_pref_gate_cases.js,",
    "which a spec here asserts is structurally identical to this file. Editing one",
    "side's behavior without the other now fails that side's own suite.",
    "'prefs' is the literal settings['preferences'] hash; an omitted key means the",
    "preference was never written (undefined in JS, nil in Ruby)."
  ],
  "cases": [
    { "name": "absent master grandfathers a gated feature",
      "prefs": {}, "feature": "ai_board_generation", "expected": true },
    { "name": "absent master grandfathers an ungated feature",
      "prefs": {}, "feature": "comprehensive_eval_ai", "expected": true },
    { "name": "explicit null master grandfathers",
      "prefs": { "ai_features_enabled": null }, "feature": "ai_board_generation", "expected": true },

    { "name": "empty-string master denies a gated feature",
      "prefs": { "ai_features_enabled": "" }, "feature": "ai_board_generation", "expected": false },
    { "name": "empty-string master denies an UNGATED feature too",
      "prefs": { "ai_features_enabled": "" }, "feature": "comprehensive_eval_ai", "expected": false },
    { "name": "empty-string master denies even with the child opted in",
      "prefs": { "ai_features_enabled": "", "ai_board_generation": true }, "feature": "ai_board_generation", "expected": false },

    { "name": "unrecognized master denies a gated feature",
      "prefs": { "ai_features_enabled": "maybe" }, "feature": "ai_board_generation", "expected": false },
    { "name": "unrecognized master denies an UNGATED feature too",
      "prefs": { "ai_features_enabled": "maybe" }, "feature": "comprehensive_eval_ai", "expected": false },
    { "name": "object master denies",
      "prefs": { "ai_features_enabled": {} }, "feature": "ai_board_generation", "expected": false },

    { "name": "ascii-space master denies",
      "prefs": { "ai_features_enabled": " " }, "feature": "ai_board_generation", "expected": false },
    { "name": "non-breaking-space master denies (Ruby strip and JS trim disagree here; with no blank test there is no divergence)",
      "prefs": { "ai_features_enabled": "\u00a0" }, "feature": "ai_board_generation", "expected": false },
    { "name": "NUL master denies (the same disagreement in the other direction)",
      "prefs": { "ai_features_enabled": "\u0000" }, "feature": "ai_board_generation", "expected": false },

    { "name": "boolean false master denies",
      "prefs": { "ai_features_enabled": false }, "feature": "ai_board_generation", "expected": false },
    { "name": "string false master denies",
      "prefs": { "ai_features_enabled": "false" }, "feature": "ai_board_generation", "expected": false },
    { "name": "numeric 0 master denies",
      "prefs": { "ai_features_enabled": 0 }, "feature": "ai_board_generation", "expected": false },
    { "name": "string 0 master denies",
      "prefs": { "ai_features_enabled": "0" }, "feature": "ai_board_generation", "expected": false },
    { "name": "numeric 0 master denies an ungated feature too",
      "prefs": { "ai_features_enabled": 0 }, "feature": "comprehensive_eval_ai", "expected": false },
    { "name": "explicit false master beats an opted-in child",
      "prefs": { "ai_features_enabled": false, "ai_board_generation": true }, "feature": "ai_board_generation", "expected": false },

    { "name": "true master plus true child allows",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": true }, "feature": "ai_board_generation", "expected": true },
    { "name": "string true master plus string true child allows",
      "prefs": { "ai_features_enabled": "true", "ai_board_generation": "true" }, "feature": "ai_board_generation", "expected": true },
    { "name": "string 1 master plus numeric 1 child allows",
      "prefs": { "ai_features_enabled": "1", "ai_board_generation": 1 }, "feature": "ai_board_generation", "expected": true },
    { "name": "numeric 1 master plus string 1 child allows",
      "prefs": { "ai_features_enabled": 1, "ai_board_generation": "1" }, "feature": "ai_board_generation", "expected": true },
    { "name": "true master allows an ungated feature without any child key",
      "prefs": { "ai_features_enabled": true }, "feature": "comprehensive_eval_ai", "expected": true },

    { "name": "true master with absent child denies (incomplete opt-in)",
      "prefs": { "ai_features_enabled": true }, "feature": "ai_board_generation", "expected": false },
    { "name": "true master with empty-string child denies",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": "" }, "feature": "ai_board_generation", "expected": false },
    { "name": "true master with unrecognized child denies",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": "maybe" }, "feature": "ai_board_generation", "expected": false },
    { "name": "true master with false child denies",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": false }, "feature": "ai_board_generation", "expected": false },
    { "name": "true master with numeric 0 child denies",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": 0 }, "feature": "ai_board_generation", "expected": false },
    { "name": "true master with null child denies",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": null }, "feature": "ai_board_generation", "expected": false },

    { "name": "one gated feature opted in does not enable a sibling",
      "prefs": { "ai_features_enabled": true, "ai_board_generation": true }, "feature": "ai_word_prediction", "expected": false }
  ]
}
`;
// ai-pref-gate-cases:end

export default JSON.parse(RAW);
