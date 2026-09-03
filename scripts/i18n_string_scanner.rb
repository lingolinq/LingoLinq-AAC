# frozen_string_literal: true

# Reads the quoted source string out of a translatable call, for i18n_generator.rb.
#
# Extracted so it can be tested: the generator itself is a top-level script that globs the
# repo and writes locale files as a side effect of being loaded, so it cannot be required
# from a spec. The two call sites it serves — `i18n.t('key', "...")` in .js and
# `{{t "..." key='...'}}` in .hbs — had SEPARATE COPIES of this loop with the same defect.
#
# THE DEFECT, for anyone tempted to re-inline this:
#   str += line[idx]        # consume the current character
#   idx += 1
#   if line[idx] == "\\"    # ...then test the NEXT one for a backslash
#
# That only catches an escape which FOLLOWS an ordinary character. A string that BEGINS with
# an escape — `"\"Do Not Sell...\" (CCPA):"` in templates/privacy.hbs — fell straight through:
# the backslash is not the closing quote so it was consumed as content, idx landed on the
# escaped `"`, the backslash test looked at the wrong character and failed, and the loop's own
# condition then saw a quote and terminated. The captured value was a single backslash, which
# serialises into the locale files as "\\".
#
# It had shipped: all twelve non-English locales carried `*** \\` for that key, and because
# --merge keeps any existing value (`json[key] || "*** #{english}"`) they could never have
# recovered on their own.
module I18nStringScanner
  # line          - the source line
  # open_idx      - index of the OPENING quote (the quote character itself, not the first
  #                 character of the contents)
  #
  # Returns [contents, closing_idx], where closing_idx is the index of the closing quote —
  # or of the end of the line if the string is unterminated, which both callers then handle
  # by failing to find their own terminator.
  #
  # A backslash escapes whatever follows it and is itself dropped, so `\"` yields `"`. That
  # is what the original loop did for a MID-string escape, and is preserved deliberately: the
  # locale files hold the unescaped text and JSON.pretty_generate re-escapes on write.
  def self.read_quoted(line, open_idx)
    quote = line[open_idx]
    idx = open_idx + 1
    str = +''
    while line[idx] && line[idx] != quote
      if line[idx] == '\\'
        # Skip the backslash and take the character it escapes, whatever it is. Guarded
        # because a line can end on a trailing backslash.
        idx += 1
        str << line[idx] if line[idx]
        idx += 1
      else
        str << line[idx]
        idx += 1
      end
    end
    [str, idx]
  end
end
