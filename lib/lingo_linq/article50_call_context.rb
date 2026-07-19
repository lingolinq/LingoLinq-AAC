# frozen_string_literal: true

require_relative '../eu_jurisdiction'
require_relative 'article50_disclosures'

module LingoLinq
  # THE single shared EU AI Act Article 50 call-context helper (ENF-01, VPC Phase 4).
  #
  # `Article50CallContext.for(user)` composes the FULL Art.50 call context that each
  # AI call site stamps onto its AiApiLog row, in ONE place:
  #
  #   { jurisdiction: <'EU' | nil>, article_50_disclosure_shown: <true | false> }
  #
  # The three per-file `log_ai_call` wrappers (ai_board_generator, ai_word_predictor,
  # eval_narrator) call ONLY this helper and thread its result into the sink; they never
  # re-implement either read. Single-sourcing the RESOLUTION (both fields + guards + the
  # logged fallback) here is what satisfies ENF-01 literally -- guarded locals duplicated
  # per call site would only single-source the jurisdiction mapping, not the full context
  # (Codex M1/M2).
  #
  # This helper OWNS the `require_relative`s for its lib deps (EuJurisdiction +
  # Article50Disclosures). lib/ Zeitwerk autoload is DISABLED on the Resque-worker path
  # (config/application.rb:47, RESQUE_WORKER=true), so a worker resolving these constants
  # via autoload would NameError; the requires above guarantee they load. The wrappers
  # then require only THIS one file.
  #
  # Resolves EXCLUSIVELY from the passed `user` (the data subject, D-02); it never infers
  # from surrounding call context.
  module Article50CallContext
    # Returns the full Art.50 call context for `user`. BOTH keys are ALWAYS present.
    # Class-method form (not module_function + `def for`): `for` is a Ruby keyword, so
    # `def for` under module_function is a parse landmine; `def self.for` parses cleanly.
    def self.for(user)
      {
        jurisdiction: resolve_jurisdiction(user),
        article_50_disclosure_shown: resolve_disclosure_shown(user)
      }
    end

    # The jurisdiction retention stamp ('EU' only for a confirmed :eu user, D-01).
    # Degrades to nil on any error so AI generation + base audit logging continue, but
    # emits exactly one SCRUBBED warning (exception CLASS only -- never the message,
    # `user`, or settings) so a SYSTEMATIC failure is observable, not silent (Codex M2).
    def self.resolve_jurisdiction(user)
      EuJurisdiction.retention_stamp(user)
    rescue StandardError => e
      Rails.logger.warn("Article50CallContext: jurisdiction resolution failed, degrading to nil: #{e.class}")
      nil
    end
    private_class_method :resolve_jurisdiction

    # The B3 disclosure-shown read. Degrades to false on any error with the same
    # scrubbed single-warning contract. The `user &&` guard is load-bearing: log_ai_call
    # runs on API-error paths where `user` can be nil.
    def self.resolve_disclosure_shown(user)
      !!(user && user.article_50_disclosure_shown?)
    rescue StandardError => e
      Rails.logger.warn("Article50CallContext: disclosure-shown resolution failed, degrading to false: #{e.class}")
      false
    end
    private_class_method :resolve_disclosure_shown
  end
end
