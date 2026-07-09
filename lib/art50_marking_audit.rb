# frozen_string_literal: true

require_relative 'art50_marker'

# EU AI Act Article 50(2) compliance audit.
#
# Verifies that AI-generated AAC board content carries a valid, server-signed
# provenance marker (see lib/art50_marker.rb), AND that copies of AI-generated
# boards retain that marker (BoardCloner propagation). This is the compliance
# read-back for the Art. 50(2) marking obligation: marking is unconditional, so
# every AI-generated original must be marked, and a copy of synthetic content is
# still synthetic content and must stay marked.
#
# Read-only: it reports, it never mutates a board.
#
# board.settings is secure_serialized (encrypted at rest), so there is no cheap
# SQL prefilter on the marker key; the audit decrypts each board's settings via
# ActiveRecord. It is a full-table scan meant to run off-peak as a periodic
# compliance job, not on the request path.
#
# SCOPE BOUNDARY (state it, do not overclaim). This audit verifies the markers it
# can SEE: it confirms that every marker-bearing original verifies and that every
# copy of a validly-marked source stays marked. It CANNOT detect an AI-generated
# board whose marker is entirely absent -- such a board is indistinguishable from
# ordinary human-authored content. The marker was the only durable board->
# generation link, and once it is gone there is no independent server-side pointer
# to recover it: the marker's content_id -> AiApiLog linkage is transplantable and
# unreliable by construction (EU_AI_ACT_ARTICLE_50_PLAN.md Sec 8.4, accepted risk),
# AiApiLog is written at generation time before the board exists, and a raw count of
# generation events cannot be a denominator because generations are routinely
# discarded (no board) or retention-deleted. So a `:clean` status means "no marking
# violation among inspectable boards," NOT "every AI board is marked." AiApiLog, not
# this audit, is the system of record for what was generated.
#
# This replaces the earlier non-runnable DeepSeek scaffold: it reads the marker
# that actually shipped (`settings['ai_generated']`, verified via Art50Marker,
# not a plain `ai_metadata` block), guards divide-by-zero in coverage, and audits
# copies as well as originals.
module Art50MarkingAudit
  module_function

  # Runs the audit and returns a stats hash:
  #   {
  #     originals: { total:, valid:, invalid:, invalid_ids: [] },
  #     copies:    { total:, valid:, stripped:, stripped_ids: [] },
  #     unreadable: <count of boards whose settings could not be decrypted>,
  #     originals_coverage: <Float pct>, copies_coverage: <Float pct>,
  #     status: :clean | :violations | :indeterminate
  #   }
  # status is :violations if any inspected marker is invalid/stripped (worst, a
  # confirmed marking failure), else :indeterminate if any board was unreadable (the
  # audit could not vouch for boards it could not decrypt), else :clean. A caller
  # (e.g. the rake) must treat :indeterminate as a non-pass, not silently as clean.
  # "originals" counts AI-marked boards that are not copies; "copies" counts only
  # copies whose SOURCE is a validly AI-marked board (a copy of a non-AI board has
  # no marker to carry and is correctly ignored).
  #
  # `scope` is an optional ActiveRecord relation to audit a subset of boards
  # (defaults to every board). A copy is only classifiable when its source is also
  # inside the scope, so a scoped audit must include both a copy and its source.
  def run(scope: nil, batch_size: 500)
    boards = scope || Board.all
    originals = { total: 0, valid: 0, invalid: 0, invalid_ids: [] }
    copies    = { total: 0, valid: 0, stripped: 0, stripped_ids: [] }
    unreadable = 0

    # Global ids of boards carrying a VALID marker, gathered in the same pass so a
    # copy can be checked against its source without a second decrypt per copy.
    valid_marked_ids = {}
    # Deferred copy checks: [copy_global_id, source_global_id, copy_marker_valid].
    copy_rows = []

    boards.find_each(batch_size: batch_size) do |board|
      settings = safe_settings(board)
      unless settings.is_a?(Hash)
        # safe_settings returned nil (a decrypt error) OR the board's settings decoded
        # to an unexpected non-Hash value. A persisted board's settings is always a Hash
        # (Board#generate_defaults coerces `settings ||= {}` before save), so either case
        # is an anomaly the audit could not inspect for a marker. Count it as unreadable
        # so the run cannot report :clean over a board it never actually checked, rather
        # than silently skipping it.
        unreadable += 1
        next
      end

      marker = settings['ai_generated']
      marker_present = marker.is_a?(Hash)
      marker_valid = marker_present && Art50Marker.verify(marker)
      valid_marked_ids[board.global_id] = true if marker_valid

      source_id = settings['source_board_id']
      if source_id.present?
        # A copy. Defer classification until every source's marker status is known.
        copy_rows << [board.global_id, source_id, marker_valid]
      elsif marker_present
        # An AI-marked original.
        originals[:total] += 1
        if marker_valid
          originals[:valid] += 1
        else
          originals[:invalid] += 1
          originals[:invalid_ids] << board.global_id
        end
      end
    end

    # A copy matters for Article 50 only if its source is a validly AI-marked board;
    # such a copy must itself stay marked, else the marker was stripped on copy.
    copy_rows.each do |copy_id, source_id, copy_marker_valid|
      next unless valid_marked_ids[source_id]

      copies[:total] += 1
      if copy_marker_valid
        copies[:valid] += 1
      else
        copies[:stripped] += 1
        copies[:stripped_ids] << copy_id
      end
    end

    status =
      if originals[:invalid].positive? || copies[:stripped].positive?
        :violations
      elsif unreadable.positive?
        :indeterminate
      else
        :clean
      end

    {
      originals: originals,
      copies: copies,
      unreadable: unreadable,
      originals_coverage: coverage(originals[:valid], originals[:total]),
      copies_coverage: coverage(copies[:valid], copies[:total]),
      status: status
    }
  end

  # Percentage of the total that carry a valid marker, guarded against divide-by-zero
  # (no AI content -> 100.0, vacuously compliant, never a NaN or ZeroDivisionError).
  def coverage(valid, total)
    return 100.0 if total.zero?

    ((valid.to_f / total) * 100).round(2)
  end

  # Decrypting a board's settings can raise on a stale row encrypted under a rotated
  # key (see board_art50_marking_spec notes on orphaned test-DB rows / bad decrypt).
  # One unreadable board must not abort a compliance sweep: return nil so the caller
  # counts it as unreadable and moves on, rather than crashing the whole audit.
  def safe_settings(board)
    board.settings
  rescue StandardError
    nil
  end
end
