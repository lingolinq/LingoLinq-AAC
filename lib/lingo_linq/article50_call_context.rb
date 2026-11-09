# frozen_string_literal: true

require_relative '../eu_jurisdiction'
require_relative 'article50_disclosures'

module LingoLinq
  # THE single shared EU AI Act Article 50 call-context helper (ENF-01, VPC Phase 4).
  #
  # `Article50CallContext.for(user)` composes the Art.50 call context that each AI call
  # site stamps onto its AiApiLog row, in ONE place:
  #
  #   { article_50_disclosure_shown: <true | false> }
  #
  # The three per-file `log_ai_call` wrappers (ai_board_generator, ai_word_predictor,
  # eval_narrator) call ONLY this helper and thread its result into the sink; they never
  # re-implement the read. It used to return a `jurisdiction` stamp too
  # (EuJurisdiction.retention_stamp); that stamp existed only for the EU five-year purge,
  # and was removed with it when one 12-month purge replaced the tiers (2026-11-08).
  #
  # This helper OWNS the `require_relative`s for lib deps. lib/ Zeitwerk autoload is
  # DISABLED on the Resque-worker path (config/application.rb:47, RESQUE_WORKER=true), so
  # a worker resolving these constants via autoload would NameError. Article50Disclosures
  # is used below. EuJurisdiction is no longer used here, but this require is still the
  # only one that loads it on the worker path, and JsonApi::User (lib/json_api/user.rb:569)
  # calls it; it stays until that dependency has its own require.
  #
  # Resolves EXCLUSIVELY from the passed `user` (the data subject, D-02); it never infers
  # from surrounding call context.
  module Article50CallContext
    # Returns the Art.50 call context for `user`. The key is ALWAYS present.
    # Class-method form (not module_function + `def for`): `for` is a Ruby keyword, so
    # `def for` under module_function is a parse landmine; `def self.for` parses cleanly.
    def self.for(user)
      {
        article_50_disclosure_shown: resolve_disclosure_shown(user)
      }
    end

    # The B3 disclosure-shown read. Degrades to false on any error and logs one scrubbed
    # warning (exception CLASS only, never the message or the user). The `user &&` guard is load-bearing: log_ai_call
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
