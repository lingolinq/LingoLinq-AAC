#!/usr/bin/env ruby
# frozen_string_literal: true

# minimized-disclosure-guard.rb - keeps withheld finding detail out of the public tree.
#
# This repository is PUBLIC. The security disclosure policy (docs/legal, decided
# 2026-09-17) minimizes a finding's technical detail until remediation is deployed,
# verified, and disclosure is approved: the register keeps the id, severity and a
# generic title, and holds the path, snippet and mechanism in the restricted private
# evidence store.
#
# That minimization was applied by hand and nothing enforced it. On 2026-09-22 a
# recovered three-week-old handoff document was committed to a branch and opened as a
# PR; it restated a minimized Critical finding's mechanism together with its code
# path. The reviewers caught it, but only after the branch was public, and the commit
# stayed publicly reachable through refs/pull/<n>/head after the PR was closed.
#
# So this guard fails the build when a tracked file OUTSIDE the register carries a
# protected finding's id next to a code path. Pairing the id with a path is the
# signature of restored detail: it is what turns "finding LL-xxxx exists" (published
# by design) into "here is where and how" (withheld by policy).
#
# WHAT IT CANNOT DO. Stated plainly, because a gate that looks like enforcement but
# is not is worse than no gate:
#   * Prose that describes a mechanism WITHOUT naming the finding id is not detected.
#     No mechanical rule separates that from ordinary engineering discussion. Review
#     remains the only gate there, and this guard does not change that.
#   * It fires in CI, which is AFTER the push. On a public repo the content is already
#     world-readable at that point, and stays reachable through refs/pull/<n>/head even
#     after the PR is closed and the branch deleted. This narrows the window and stops
#     the merge; it does not prevent the disclosure. A pre-push hook is the companion
#     control, not an alternative to it.
#   * It cannot tell whether a cited path is the SAME path held in the private evidence
#     store, so it treats any code path beside a protected id as a violation.
#   * A change that deletes or conditionalises its own CI step defeats it. That is a
#     repository-ruleset concern, not something a script can self-enforce.
#   * CONFIRMED EVASIONS, added 2026-09-25 after an adversarial pass. Each was reproduced
#     against this script; none is fixable by widening a regex, so they are stated rather
#     than implied:
#       - Split across FILES. The window is per-file, so naming the id in one tracked file
#         and the path in another passes. Handoff documents in this repo routinely ship
#         with companion logs, which makes this the more natural shape, not the exotic one.
#       - ruleKey instead of the id. FINDINGS.json publishes ruleKey in the clear and
#         descriptively, so it identifies a finding at least as well as its id, and nothing
#         here looks at it.
#       - Binary-ish documents. A NUL byte in the first SNIFF_BYTES skips the file, so a
#         .docx, .pdf or screenshot carrying the id and the path is never read. The incident
#         this guard was written for was a handoff DOCUMENT; that is the likely real format.
#       - Path forms outside CODE_PATH: .scss, .css, .md, .json, .sql, .haml, anything under
#         scripts/ or docs/, `file.rb#L42`, a symbol reference such as Foo::Bar#baz, or the
#         path written in prose. The comment on CODE_PATH names only the widenings that were
#         measured and rejected; these were simply never in scope.
#   * The CI step that runs this is preceded in the same job by a `git fetch --depth=1`,
#     which writes .git/shallow. That grafts the base and can break `git merge-base` even
#     though the job sets fetch-depth: 0. It does not fire on the pull_request merge ref,
#     where base.sha is an ancestor of HEAD -- verified green on this PR's own run -- but
#     if the guard ever reports "no merge base" on a clean tree, that fetch is why.
#
# Stdlib-only, no network, no database, no app boot. Uses `git ls-files` for the
# tracked-file list, so it sees the index rather than the working tree's junk.
#
# Usage:
#   ruby scripts/minimized-disclosure-guard.rb --check [--base-ref REF] [REGISTER ...]
#   ruby scripts/minimized-disclosure-guard.rb --list  [--base-ref REF] [REGISTER ...]
#
# --base-ref makes the protected set the UNION of the register at that revision and at
# the working revision. Without it a single change could flip a row to verified-closed,
# or reword it out of the marker, and license its own disclosure in the same commit:
# verified by fixture, exit 1 became exit 0. legal-naming-check.rb reads its allowlist
# at the base revision for exactly this reason. CI always passes it.
#
# Exit codes: 0 = no protected id sits beside a code path; 1 = one or more violations.

require 'json'
require 'open3'
require 'optparse'
require 'set'

# Both registers, matching the sibling register-lint CI step. FINDINGS-EMBER.json carries no
# protected row today, so this is latent rather than a live gap -- but a minimized row landing
# there would otherwise be unguarded with nothing to signal it.
DEFAULT_REGISTERS = ['audit-reports/FINDINGS.json',
                     'audit-reports/ember-upgrade/FINDINGS-EMBER.json'].freeze

# Statuses whose detail is still withheld. A verified-closed finding may have had its
# disclosure approved, so it is not protected here; that is the policy's own boundary
# ("withheld until remediation is deployed, verified, and disclosure is approved"),
# not a convenience.
PROTECTED_STATUSES = %w[open remediated-unverified].freeze

# The canonical minimization markers. Matched narrowly on purpose: an earlier, looser
# version of this rule keyed on any note containing "minimiz" and flagged three
# unrelated low/medium rows whose notes use the word in a different sense. A guard
# stricter than the policy it protects is a new failure mode, not extra safety.
TITLE_MARKER = /details withheld/i
NOTES_MARKER = /minimized\b[^.]*under the security disclosure policy/i

# Paths allowed to carry an id beside a path.
#
# READ THIS BEFORE TRUSTING A PASS. This is a DIRECTORY PREFIX, and the directory holds far
# more than the register and its generated mirrors: ~55 tracked files, most of them free-form
# audit prose under domain-reports/ and run-log/. Everything under it is unscanned. The
# rationale below covers FINDINGS.json and its mirrors, where the pairing is intentional and
# is what the minimization itself trims; it does NOT cover the prose, which is exempt only as
# a side effect of the prefix.
#
# KNOWN CONSEQUENCE, not hypothetical: audit-reports/domain-reports/2026-08-12/
# infra-audit-2026-08-12.md (committed 2026-08-17, a month before the 2026-09-17
# minimization) carries an open High's id beside its Location and mechanism, and this guard
# exits 0 over it. Narrowing this list to the generated files is the correct end state and
# will turn CI red until that report is minimized -- a disclosure decision reserved to Scot,
# tracked separately. Until then a pass from this guard means "no NEW pairing outside
# audit-reports/", which is what the OK line now says.
ALLOWED_PREFIXES = ['audit-reports/'].freeze

# A code path, or a file:line citation. Both are "here is where" signals.
#
# Extensions are limited to application source. Widening this to bare, extensionless
# paths, or adding .sh/.py, was measured against the tree and produced false positives:
# a protected id listed among other ids, with an unrelated tooling path such as
# `bin/audit_console` or `scripts/regenerate-register.sh` a line or two away. Those
# pairings are coincidental proximity, not restored detail. The cost of that choice is
# stated rather than hidden: a disclosure that cites only a shell or Python path, or a
# path with no extension, is not detected.
CODE_PATH = %r{
  \b(?:app|lib|config|db|spec|bin)/[\w/.-]+\.(?:rb|js|jsx|ts|tsx|hbs|erb|rake|yml)\b
  |
  \b[\w.-]+\.(?:rb|js|jsx|ts|tsx|hbs|erb|rake):\d+
}xi

# Lines to look at around the id. A markdown table row, a bullet, or a wrapped sentence
# routinely separates an id from its citation, and a one-line window proved trivially
# evadable by putting them two apart.
#
# SEVEN, NOT THREE (widened 2026-09-25 after review). The window was 3 on the stated
# grounds that it measured 0 false positives "same as the one-line window, so the wider
# window is free". That argument was right and under-applied: re-run over all tracked
# files outside ALLOWED_PREFIXES, 0 false positives holds at 4, 5, 6 and 7, and the first
# real pairing in the tree is 8 lines apart. At 3 the guard shipped -- and its own harness
# asserted -- that pressing Enter twice evades it. 7 is the widest setting the original
# criterion supports; 8 starts flagging two docs/legal records that carry an
# attestedContentHash and therefore cannot be edited in place, which would be unfixable.
WINDOW = 7

# Maximum file size to read. A tracked file larger than this is not a prose disclosure,
# and reading without a bound lets a tracked symlink to a character device hang CI.
MAX_BYTES = 2 * 1024 * 1024

# Bytes sniffed for a NUL to classify a file as binary. Scanning every tracked text file
# rather than an extension allowlist closes the "rename it to .html" evasion; the sniff
# is what keeps that affordable.
SNIFF_BYTES = 8192

def rows_from(json_text)
  raw = JSON.parse(json_text)
  raw.is_a?(Hash) ? (raw['findings'] || []) : raw
rescue JSON::ParserError => e
  # NOT `[]`. A security control must never read "I cannot parse the register" as "there is
  # nothing to protect": an empty protected set makes every disclosure pass. Under --check
  # with --base-ref the demotion check happened to turn this into an exit 1 anyway, but the
  # guard's own documented Usage line and the companion pre-push hook both run without a base
  # ref, and there it exited 0 with a message blaming marker drift for a truncated file.
  abort("minimized-disclosure-guard: register is not valid JSON (#{e.message}). " \
        'Refusing to treat an unreadable register as an empty one.')
end

def collect(rows, into, origin)
  rows.each do |row|
    next unless PROTECTED_STATUSES.include?(row['status'])

    title = row['title'].to_s
    notes = row['notes'].to_s
    next unless title.match?(TITLE_MARKER) || notes.match?(NOTES_MARKER)

    evidence = row['evidence'] || {}
    file = evidence['file'].to_s
    # Each row's OWN evidence path, and its basename, become id-bound signals. This is
    # what catches a citation the generic regex structurally cannot: one protected row's
    # evidence lives at scripts/gcp/phase1-setup.sh, and neither `scripts/` nor `.sh` is
    # in the regex, because measuring that widening produced false positives on attested
    # docs/legal records where the "code path" was a citation to another legal document.
    # Measured on the real tree: 13 of 14 rows have a path, and 0 false positives.
    #
    # It does not REPLACE the regex. The incident document cited organization.rb, the
    # model, while that row's evidence is organizations_controller.rb: a different file,
    # so only the generic signal catches it. Each covers what the other misses.
    signals = []
    unless file.empty?
      signals << file.downcase
      signals << File.basename(file).downcase
    end

    into[row['id']] ||= { severity: row['severity'], status: row['status'], origin: origin,
                          signals: signals }
  end
end

# Reads a register at a git revision. A missing file at that revision is not an error:
# the register may post-date the base commit.
def register_at(base_ref, path)
  out, _err, status = Open3.capture3('git', 'show', "#{base_ref}:#{path}")
  status.success? ? out : nil
end

# Fails closed on an unusable --base-ref. An empty or unresolvable value would otherwise
# degrade silently to a head-only read, which IS the self-licensing bypass: the guard
# would still print OK while no longer checking the thing it was given the flag for.
# "I could not read the baseline" is not the same claim as "the baseline is clean".
def verify_base_ref!(base_ref)
  if base_ref.to_s.strip.empty?
    warn 'minimized-disclosure-guard: --base-ref was given an empty value.'
    warn 'Refusing rather than falling back to a head-only read, which is the bypass'
    warn 'this flag exists to close.'
    exit 1
  end

  _out, _err, status = Open3.capture3('git', 'rev-parse', '--verify', '--quiet', "#{base_ref}^{commit}")
  return if status.success?

  warn "minimized-disclosure-guard: --base-ref #{base_ref} does not resolve to a commit here."
  warn 'Refusing rather than falling back to a head-only read. In CI this usually means'
  warn 'the baseline commit was not fetched.'
  exit 1
end

# The demotion check must compare against the COMMON ANCESTOR, not the tip of the base
# branch. github.event.pull_request.base.sha is the base branch's head at event time, not
# the point the branch forked from, so on a branch that has not been rebased every row
# added to the register since the fork looks deleted. Measured on real open PR 909: with
# develop's tip as the base, two protected rows were reported as deleted and the run
# failed; against the true merge base it passes. That false failure would have wedged an
# in-flight PR the first time this gate ran.
#
# Fails closed when no merge base can be found, rather than silently degrading: without
# one, a deleted row and a row that never existed on this branch are indistinguishable,
# and that ambiguity is exactly the deletion bypass. CI therefore needs real history
# (fetch-depth: 0), not a shallow fetch of the base SHA alone.
def effective_base(base_ref)
  out, _err, status = Open3.capture3('git', 'merge-base', base_ref, 'HEAD')
  return out.strip if status.success? && !out.strip.empty?

  warn "minimized-disclosure-guard: no merge base between #{base_ref} and HEAD."
  warn 'Refusing rather than comparing against a base branch tip, which on a branch that'
  warn 'has not been rebased reports every newer register row as deleted. In CI this means'
  warn 'the checkout lacks history: use fetch-depth: 0 for this job.'
  exit 1
end

def protected_ids(register_paths, base_ref)
  ids = {}
  register_paths.each do |path|
    if base_ref
      text = register_at(base_ref, path)
      collect(rows_from(text), ids, :base) if text
    end
    collect(rows_from(File.read(path)), ids, :head) if File.exist?(path)
  end
  ids
end

# Rows that were minimized at the base revision and are NOT minimized at the head.
#
# The base-ref union shields one commit, which a two-commit sequence walks around: the
# first change quietly reworders a title out of the marker and discloses nothing, so it
# passes; the second change is based on that commit, sees an unprotected row, and
# publishes freely. Measured in a scratch repo, both commits pass. So stripping the
# marker is itself the event to stop, and it must be deliberate rather than incidental.
def demoted_rows(register_paths, base_ref)
  return [] unless base_ref

  demoted = []
  register_paths.each do |path|
    text = register_at(base_ref, path)
    next unless text

    base_rows = {}
    collect(rows_from(text), base_rows, :base)
    next if base_rows.empty?

    head_rows = {}
    collect(rows_from(File.read(path)), head_rows, :head) if File.exist?(path)

    head_by_id = (File.exist?(path) ? rows_from(File.read(path)) : []).to_h { |row| [row['id'], row] }
    base_rows.each_key do |id|
      next if head_rows.key?(id)

      row = head_by_id[id]
      status = row ? row['status'] : nil
      # Only ONE shape here is the governed path: the row is still present and its status
      # has moved out of the protected set, because the status field is what licenses
      # disclosure and only Scot moves it.
      #
      # A row that has VANISHED is not that. An earlier version treated a missing row as
      # governed, and it was measured as a working bypass: delete the row in one change
      # (a green run with a note), publish the detail in the next. Deleting the row is
      # strictly more destructive than rewording its title, so it cannot be the lenient
      # case. Renumbering an id is the same event wearing a different hat, and it lands
      # here too, as the old id going missing.
      removed = status.nil?
      demoted << { id: id, register: path, status: status || '(row removed)',
                   removed: removed,
                   stripped: removed || PROTECTED_STATUSES.include?(status) }
    end
  end
  demoted
end

def tracked_files
  out, err, status = Open3.capture3('git', 'ls-files', '-z')
  abort "minimized-disclosure-guard: git ls-files failed: #{err.strip}" unless status.success?

  out.split("\0").reject(&:empty?)
end

def allowed?(path)
  ALLOWED_PREFIXES.any? { |prefix| path.start_with?(prefix) }
end

# Returns the file's text, or nil when it should not be scanned. Symlinks and other
# non-regular files are skipped via lstat BEFORE any read: a tracked symlink to
# /dev/zero would otherwise be read until the runner died.
def readable_text(path)
  stat = File.lstat(path)
  return nil unless stat.file?
  return nil if stat.size > MAX_BYTES

  raw = File.binread(path)
  return nil if raw[0, SNIFF_BYTES].to_s.include?("\x00")

  raw.force_encoding('UTF-8').scrub('?')
rescue SystemCallError, ArgumentError
  nil
end

def violations(ids)
  found = []
  lowered = ids.keys.to_h { |id| [id.downcase, id] }
  tracked_files.each do |path|
    next if allowed?(path)

    text = readable_text(path)
    next if text.nil?

    haystack = text.downcase
    next unless lowered.keys.any? { |id| haystack.include?(id) }

    lines = text.lines.map(&:chomp)
    lines.each_with_index do |line, index|
      lowered_line = line.downcase
      # EVERY protected id on the line, not the first one found. `find` returned a single
      # id in REGISTER order, so the id-bound signals of every other id on the same line
      # were never evaluated: `LL-aaa and LL-bbb are in scripts/gcp/x.sh` passed whenever
      # LL-aaa happened to sort first, because CODE_PATH deliberately excludes .sh and only
      # LL-bbb carries that path as a bound signal. Listing several ids on one line is the
      # normal shape of this repo's compliance prose, and the id-bound signal is the ONLY
      # cover for the three protected rows whose evidence is scripts/gcp/*.sh.
      keys = lowered.keys.select { |id| lowered_line.include?(id) }
      next if keys.empty?

      low = [0, index - WINDOW].max
      window = lines[low..(index + WINDOW)].join("\n")
      lowered_window = window.downcase

      keys.each do |key|
        id = lowered[key]

        # Two independent signals, checked in order of precision. The id-bound one names
        # the row's own evidence path, so it is reported as the stronger hit.
        own = ids[id][:signals].find { |signal| lowered_window.include?(signal) }
        match = own || window[CODE_PATH]
        next unless match

        found << { file: path, line: index + 1, id: id, severity: ids[id][:severity],
                   origin: ids[id][:origin], path_match: match, own_evidence: !own.nil? }
      end
    end
  end
  found
end

def main
  mode = nil
  base_ref = nil
  parser = OptionParser.new do |opts|
    opts.banner = 'Usage: ruby scripts/minimized-disclosure-guard.rb --check|--list [--base-ref REF] [REGISTER ...]'
    opts.on('--check', 'Fail if a protected finding id sits beside a code path') { mode = :check }
    opts.on('--list', 'Print the protected finding ids and exit 0') { mode = :list }
    opts.on('--base-ref REF', 'Also protect rows minimized at REF, so a change cannot un-protect its own disclosure') do |ref|
      base_ref = ref
    end
  end
  parser.parse!

  unless mode
    warn parser.banner
    exit 1
  end

  unless base_ref.nil?
    verify_base_ref!(base_ref)
    base_ref = effective_base(base_ref)
  end

  registers = ARGV.empty? ? DEFAULT_REGISTERS : ARGV
  ids = protected_ids(registers, base_ref)

  if mode == :list
    puts "protected findings (#{ids.size}#{base_ref ? ", union with #{base_ref}" : ''}):"
    ids.each { |id, meta| puts "  #{id}  #{meta[:severity]}  #{meta[:status]}  [#{meta[:origin]}]" }
    exit 0
  end

  # An empty protected set passes, and that is a deliberate reversal of a stricter rule
  # tried first. Failing on "register exists but nothing is minimized" broke four
  # legitimate fixtures (a row that was never minimized, a row closed by decision) and
  # would wedge CI permanently in the state where every finding has been disclosed. The
  # drift it was meant to catch is caught precisely, per row, by the demotion check
  # below, which knows what WAS protected at the base instead of guessing from a count.
  # A guard stricter than the policy it protects is a new failure mode.
  # Order matters: the demotion check runs BEFORE the empty-set exit. A change that
  # strips the marker from the LAST protected row would otherwise land in the empty-set
  # branch and pass, which is the exact hole this check exists to close.
  demoted = demoted_rows(registers, base_ref)
  stripped = demoted.select { |row| row[:stripped] }
  demoted.reject { |row| row[:stripped] }.each do |row|
    puts "minimized-disclosure-guard: note - #{row[:id]} is no longer minimized (status now #{row[:status]}); governed disclosure path, not blocked."
  end

  unless stripped.empty?
    warn 'minimized-disclosure-guard: FAILED'
    warn ''
    warn 'A finding lost its minimization marker while its status still withholds detail.'
    warn 'Left to stand, the next change would see an unprotected row and could publish the'
    warn 'detail freely, so the two changes together would disclose what neither did alone.'
    warn ''
    stripped.each do |row|
      reason = row[:removed] ? 'row deleted from the register' : 'marker removed, status unchanged'
      warn "  #{row[:id]}  status #{row[:status]}  (#{row[:register]}) - #{reason}"
    end
    warn ''
    warn 'Fix: restore the marker, or the row. To publish the detail, close the finding'
    warn 'through the governed path first, in its own change; the status field is what'
    warn 'licenses it, and a row that is simply gone licenses nothing. A genuinely'
    warn 'withdrawn finding needs an explicit record, not a deletion.'
    exit 1
  end

  if ids.empty?
    warn 'minimized-disclosure-guard: no rows carry the minimization marker; nothing to protect.'
    warn '(If that is unexpected, the marker wording has drifted: check the register.)'
    exit 0
  end

  found = violations(ids)
  if found.empty?
    puts "minimized-disclosure-guard: OK - #{ids.size} protected finding id(s); no NEW pairing found outside #{ALLOWED_PREFIXES.join(', ')} (that prefix is unscanned, see ALLOWED_PREFIXES)."
    exit 0
  end

  warn 'minimized-disclosure-guard: FAILED'
  warn ''
  warn 'A finding whose technical detail is withheld under the security disclosure policy'
  warn 'appears in a tracked file next to a code path. This repository is public, so that'
  warn 'pairing republishes what the register deliberately trimmed.'
  warn ''
  found.each do |v|
    origin = v[:origin] == :base ? ' [minimized at the base revision]' : ''
    kind = v[:own_evidence] ? "its own evidence path #{v[:path_match]}" : "a code path #{v[:path_match]}"
    warn "  #{v[:file]}:#{v[:line]}  #{v[:id]} (#{v[:severity]})  beside  #{kind}#{origin}"
  end
  warn ''
  warn 'Fix: keep the finding id, drop the path, snippet and mechanism. Point at the'
  warn 'private evidence store instead. If remediation has shipped and Scot has approved'
  warn 'disclosure, record that on the register row in a SEPARATE change: a row this'
  warn 'change un-protects is still protected here, by design.'
  exit 1
end

main if $PROGRAM_NAME == __FILE__
