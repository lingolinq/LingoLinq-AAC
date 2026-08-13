#!/usr/bin/env ruby
# frozen_string_literal: true
#
# legal-naming-check.rb - register-aware enforcement of the docs/legal naming rule.
#
# WHY THIS EXISTS
#   docs/legal/README.md ("Naming") requires new dated records to be
#   `docs/legal/<YYYY-MM-DD>_<kebab-slug>.<ext>` with NO status token, because a
#   status is a mutable property of the register row while rule 3 freezes an
#   attested file's name permanently. A status in the name would either become
#   false at the first status change or force a rename that rule 3 forbids.
#
#   Until this script existed the rule was prose only. `document-register-render.rb`
#   performs no filename validation of any kind, so a future cycle could violate the
#   rule silently -- the same failure shape the compliance follow-through exists to
#   correct.
#
# WHY IT IS REGISTER-AWARE RATHER THAN A FILENAME REGEX
#   A regex over filenames cannot express the rule that actually matters, which is a
#   RELATIONSHIP between a row's attestation state and its path. An unattested draft
#   may legitimately sit at a `_draft` path; the same file may not once it is signed.
#   So every check below reads the register row and the path together.
#
#   This also removes the need for a hand-maintained exemption list for the four
#   grandfathered `_draft` records. Because CHECK 1 fires only when a row carries an
#   attestation, those four pass while unattested and fail automatically the moment
#   one is attested. The exemption expires by construction rather than by someone
#   remembering to delete a line. A manually-maintained list is what let the earlier
#   drift persist, so this deliberately does not add another one.
#
# WHAT IT CHECKS (register rows whose canonicalSystem is git and whose
# canonicalLocation is under docs/legal/)
#
#   1. AN ATTESTED DATED RECORD'S SLUG IS KEBAB-CASE.
#      Lowercase alphanumerics separated by single hyphens, with `_` reserved as the
#      date boundary and appearing nowhere else. This is rule 3's unfixable case: once
#      signed the name can never be corrected, only superseded, so it must be right
#      BEFORE signing.
#
#      Stated as a positive test for the convention rather than a blacklist of status
#      tokens, because the blacklist version of this check shipped and was then probed
#      past three ways in a few minutes (`_DRAFT` uppercase, `_draft_thing` with the
#      token not final, and a TitleCase slug). A blacklist needs every evasion
#      enumerated; a convention test needs none.
#
#      "Attested" here means ANY populated field in the attestation block, not
#      attestedDate specifically. See ATTESTATION_FIELDS.
#
#   2. A SIGNATURE CANNOT PREDATE THE RECORD IT SIGNS.
#      For a dated row, `attestation.attestedDate` must not be EARLIER than the date
#      in the filename. Later is fine and normal: the filename date is when the
#      record was written and its evidence gathered, the attested date is when it was
#      signed, and a cycle that spans midnight legitimately splits them.
#
#   3. A SUCCESSOR IS NOT DATED BEFORE WHAT IT SUPERSEDES.
#      When both ends of a `supersedes` / `supersededBy` pair are dated records, the
#      successor's filename date must be >= the predecessor's. This is what stops a
#      chain silently pointing at mismatched vintages, e.g. a "successor" backdated to
#      a planning date that precedes the record it replaces.
#
#   4. NEW NON-DATED RECORDS ARE BARRED; EXISTING ONES ARE GRANDFATHERED.
#      `SCREAMING_SNAKE.md` records that predate the rule keep their names, because
#      renaming breaks every inbound reference for no compliance benefit. They are
#      listed in `meta.legalNamingGrandfathered`, which is a CLOSED set: any docs/legal
#      git-canonical row that is neither dated nor on that list is a new violation.
#      The list may only shrink. A stale entry (a path no longer in the register) is
#      itself an error, so the list cannot quietly accumulate dead weight.
#
#   5. DATED FILENAMES CARRY A REAL DATE.
#      `2026-13-45_x.md` matches the shape but is not a date. Checked explicitly so a
#      typo cannot produce a permanently frozen nonsense name.
#
# WHAT IT DELIBERATELY DOES NOT DO
#   It does not rename anything, does not touch the register, and does not read file
#   CONTENT. Whether a tracked file has a row at all, and whether its bytes match the
#   pinned hash, are `document-register-render.rb --check`'s job; this script only
#   judges paths against row state. Keeping the two separate is why neither has to
#   grow the other's failure modes.
#
# USAGE
#   ruby scripts/legal-naming-check.rb            # same as --check; this script never writes
#   ruby scripts/legal-naming-check.rb --check    # exit 1 on any violation
#   ruby scripts/legal-naming-check.rb --register PATH   # TEST ONLY, see below
#
#   `--register` exists so scripts/tests/legal-naming-check-test.sh can prove each check
#   FIRES, by running against fixtures in a temp dir. A check that has only ever been
#   observed passing on clean data is not evidence of anything. It is deliberately NOT a
#   bypass concern: CI invokes this with no argument, and anyone able to pass a different
#   path is already able to delete the CI step. The alternative -- mutating the live
#   register and restoring it, as the attestation-hash guard harness must -- is strictly
#   more dangerous, and is only justified there because that guard's subject IS the live file.
#
# Exit codes: 0 = clean; 1 = violation / malformed register.

require 'json'
require 'date'

register_override = nil
if (i = ARGV.index('--register'))
  register_override = ARGV[i + 1]
  abort('legal-naming-check: --register needs a path') if register_override.nil?
end

REGISTER = register_override || File.expand_path('../audit-reports/DOCUMENT-REGISTER.json', __dir__)

LEGAL_PREFIX = 'docs/legal/'
# `<YYYY-MM-DD>_<slug><ext>`; slug and extension captured so the slug and the date can
# be judged separately. Case-insensitive so a stray `docs/Legal/` is judged rather than
# silently falling out of scope.
DATED = %r{\A#{Regexp.escape(LEGAL_PREFIX)}(\d{4}-\d{2}-\d{2})_([^/]+?)(\.[^./]+)\z}i
#
# The slug of an ATTESTED dated record must be kebab-case: lowercase alphanumerics
# separated by single hyphens, with no underscore anywhere.
#
# Deliberately stricter than "does it end in _draft", and it replaced exactly that
# narrower check after probing found ways past it: `_DRAFT` (the token match was
# case-sensitive) and `_draft_thing` (token not in the final position). Enumerating
# evasions of a suffix rule is a losing game. The convention itself is the rule --
# `<YYYY-MM-DD>_<kebab-slug>` reserves `_` as the date boundary, so any further
# underscore is off-convention whatever follows it -- and a positive test for the
# convention has no evasion list to keep up to date.
KEBAB_SLUG = /\A[a-z0-9]+(-[a-z0-9]+)*\z/
# Used only to give a precise message when the off-convention slug is specifically a
# status token. Case-insensitive and position-independent, for the message alone;
# KEBAB_SLUG is what actually decides.
STATUS_TOKEN = /(\A|_)(draft|approved|published|superseded|archived)(_|\z)/i

def die(msg)
  warn "legal-naming-check: #{msg}"
  exit 1
end

die("register not found at #{REGISTER}") unless File.exist?(REGISTER)

register = begin
  JSON.parse(File.read(REGISTER))
rescue JSON::ParserError => e
  die("register is not valid JSON: #{e.message}")
end

meta = register['meta'] || {}
documents = register['documents']
die('register has no "documents" array') unless documents.is_a?(Array)

# Guard against the status-token list drifting away from the schema it mirrors. If a
# new status is added to the enum, this check would silently stop catching it.
enum = meta['statusEnum']
if enum.is_a?(Array)
  known = %w[draft approved published superseded archived]
  missing = enum.map(&:to_s) - known
  unless missing.empty?
    die("meta.statusEnum has value(s) #{missing.inspect} that STATUS_TOKEN does not cover. " \
        'Add them to STATUS_TOKEN in this script, or the naming rule stops being enforced for them.')
  end
end

grandfathered = meta['legalNamingGrandfathered']
unless grandfathered.is_a?(Array)
  die('meta.legalNamingGrandfathered is missing or not an array. It is the closed set of ' \
      'pre-rule non-dated docs/legal records; without it every legacy record reads as a new violation.')
end
grandfathered = grandfathered.map(&:to_s)

# Only git-canonical docs/legal rows describe files this rule governs. Drive- and
# Notion-canonical rows carry URLs in canonicalLocation and are out of scope.
rows = documents.select do |d|
  d['canonicalSystem'].to_s == 'git' && d['canonicalLocation'].to_s.start_with?(LEGAL_PREFIX)
end

by_id = documents.to_h { |d| [d['id'].to_s, d] }
problems = []

# Fails CLOSED: any populated attestation field means the row is treated as attested.
#
# An earlier version required attestedDate specifically, which let a row carrying
# attestedBy + attestedContentHash but no date slip the naming check entirely. That is
# the worst possible row to skip: it is both malformed AND signed. Treating "signed" as
# the union of the fields means a partially-filled block is judged, not excused.
ATTESTATION_FIELDS = %w[attestedBy attestedDate attestedContentHash].freeze

def attested?(row)
  att = row['attestation']
  return false unless att.is_a?(Hash)

  ATTESTATION_FIELDS.any? { |f| !att[f].to_s.strip.empty? }
end

def dated_parts(location)
  m = DATED.match(location.to_s)
  return nil unless m

  { date_str: m[1], slug: m[2], ext: m[3] }
end

def parse_date(str)
  Date.iso8601(str)
rescue ArgumentError
  nil
end

seen_locations = []

rows.each do |row|
  loc = row['canonicalLocation'].to_s
  label = "#{row['title'].inspect} (#{row['id']})"
  seen_locations << loc
  parts = dated_parts(loc)

  if parts.nil?
    # CHECK 4: non-dated rows must be on the closed grandfather list.
    unless grandfathered.include?(loc)
      problems << "#{label}: #{loc} is a NEW non-dated docs/legal record. New records must be " \
                  "#{LEGAL_PREFIX}<YYYY-MM-DD>_<kebab-slug>.<ext> with no status token " \
                  '(docs/legal/README.md, "Naming"). Existing pre-rule names are grandfathered via ' \
                  'meta.legalNamingGrandfathered, which is closed and may only shrink.'
    end
    next
  end

  # CHECK 5: the date component must be a real date.
  file_date = parse_date(parts[:date_str])
  if file_date.nil?
    problems << "#{label}: #{loc} has date component #{parts[:date_str].inspect}, which is not a " \
                'valid ISO date. Attestation freezes the filename, so a typo here is permanent.'
    next
  end

  token = STATUS_TOKEN.match(parts[:slug])

  # CHECK 1: the rule that matters. An off-convention name on an attested record is
  # unfixable after the fact, so this tests the convention positively (kebab-case)
  # rather than blacklisting the status tokens it is most likely to be violated by.
  if attested?(row) && !KEBAB_SLUG.match?(parts[:slug])
    if token
      problems << "#{label}: #{loc} is ATTESTED but its filename carries the status token " \
                  "#{token[2].downcase.inspect}. Status lives in the register row (statusEnum), not the name: " \
                'rule 3 freezes an attested filename permanently, so the token would either become ' \
                'false at the first status change or force a rename rule 3 forbids. An unattested ' \
                'record may sit at this path, but it must LEAVE it before being attested, and via ' \
                'Path A supersession rather than an in-place rename (docs/legal/README.md, ' \
                '"Transition rule"): create a new statusless dated file, add a row that supersedes ' \
                'this one, mark this row superseded with a reciprocal pointer, retarget live bundle ' \
                  'requiredDocs, then attest ONLY the successor. Renaming in place would change the ' \
                  'DOC- id, which is sha256(canonicalLocation)[0,10], breaking the permanent-ID promise.'
    else
      problems << "#{label}: #{loc} is ATTESTED but its slug #{parts[:slug].inspect} is not " \
                  'kebab-case. An attested filename is frozen permanently (rule 3), so it must match ' \
                  'the convention exactly: lowercase alphanumerics separated by single hyphens, with ' \
                  '`_` reserved as the date boundary and appearing nowhere else. Rename before ' \
                  'attesting, or if the record is already attested, supersede it (Path A).'
    end
  end

  # CHECK 2: a signature cannot predate the record it signs.
  next unless attested?(row)

  attested_date = parse_date(row['attestation']['attestedDate'].to_s)
  if attested_date.nil?
    problems << "#{label}: attestation.attestedDate " \
                "#{row['attestation']['attestedDate'].inspect} is not a valid ISO date."
  elsif attested_date < file_date
    problems << "#{label}: attested #{attested_date} but the record is dated #{file_date} " \
                "(#{loc}). A signature cannot predate the record it signs. The filename date is when " \
                'the record was written and its evidence gathered; the attested date is when it was ' \
                'signed, and may legitimately be later, never earlier.'
  end
end

# CHECK 3: a successor is not dated before what it supersedes.
rows.each do |row|
  successor_id = row['supersededBy'].to_s
  next if successor_id.empty?

  successor = by_id[successor_id]
  next if successor.nil? # reciprocity/resolution is document-register-render.rb's job

  pred_parts = dated_parts(row['canonicalLocation'])
  succ_parts = dated_parts(successor['canonicalLocation'])
  next if pred_parts.nil? || succ_parts.nil?

  pred_date = parse_date(pred_parts[:date_str])
  succ_date = parse_date(succ_parts[:date_str])
  next if pred_date.nil? || succ_date.nil?

  next unless succ_date < pred_date

  problems << "#{successor['title'].inspect} (#{successor['id']}) is dated #{succ_date} but " \
              "supersedes #{row['title'].inspect} (#{row['id']}) dated #{pred_date}. A successor " \
              'cannot be dated before the record it replaces; that is how a chain ends up pointing ' \
              'at mismatched vintages. Date the successor when its evidence was gathered, never to a ' \
              'planning date carried forward.'
end

# CHECK 4b: the grandfather list may only shrink, so a stale entry is an error.
stale = grandfathered - seen_locations
stale.each do |loc|
  problems << "meta.legalNamingGrandfathered lists #{loc}, which is no longer a git-canonical " \
              'docs/legal row. Remove it: the list is closed and may only shrink, and a stale entry ' \
              'is a slot a future non-dated record could occupy without review.'
end

dated_count = rows.count { |r| dated_parts(r['canonicalLocation']) }

if problems.empty?
  puts "legal-naming-check: OK (#{rows.size} docs/legal rows: #{dated_count} dated, " \
       "#{grandfathered.size} grandfathered)"
  exit 0
end

warn "legal-naming-check: #{problems.size} VIOLATION(S)\n\n"
problems.each { |p| warn "  [FAIL] #{p}\n\n" }
warn "See docs/legal/README.md (\"Naming\") and rule 3 (\"Attestation freezes the artifact\").\n"
exit 1
