require 'oj'

# Use Oj as a transparent drop-in replacement for the standard JSON library.
# Oj is 5-10x faster than the stdlib JSON module and uses less memory,
# which is significant for board content blobs (BoardDownstreamButtonSet,
# board settings, translations) that get parsed repeatedly during exports
# and copy operations.
#
# `mimic_JSON` rewrites the global JSON module to use Oj's implementation,
# so existing JSON.parse / JSON.generate / .to_json calls automatically
# get the speedup with no code changes.
Oj.mimic_JSON

# Use the :rails mode for Oj's own dump/load calls so it generally matches
# Rails' JSON serialization conventions (for example, Time as ISO 8601).
# App-specific overrides, such as custom BigDecimal serialization, still apply.
Oj.default_options = { mode: :rails }
