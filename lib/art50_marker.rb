# frozen_string_literal: true

require 'json'
require 'go_secure'
require 'active_support/security_utils'

# EU AI Act Article 50(2) machine-readable marking of AI-generated output.
#
# When LingoLinq generates AAC board content with an external model, Article 50(2)
# requires the output be marked in a machine-readable, detectable way that travels
# with the content. This module produces a tamper-evident, server-verifiable
# metadata marker for that purpose.
#
# Design notes:
# - The marker attests PROVENANCE (this content originated from AI generation at a
#   time, by a named provider/model), NOT the exact bytes of the words. AAC boards
#   are routinely human-edited after generation (an SLP tweaks a label), so a
#   content-bound signature would falsely invalidate the moment a user edits a word.
#   Provenance binding keeps the marker valid through legitimate editing while still
#   being unforgeable by a client.
# - CONSEQUENCE (state it, do not gloss it): because the signature does not cover the
#   words, the marker is a server-issued PROVENANCE/BEARER attestation, not a binding
#   to specific content. `marked?` proves "an AI-generation event occurred on this
#   server," NOT "these exact words are that output." A valid marker could be lifted
#   onto unrelated content. This is the accepted tradeoff against post-edit
#   invalidation; it must be documented in the compliance record, not over-claimed as
#   content integrity. A future hardening could co-sign a normalized, edit-tolerant
#   digest of the delivered words if content binding becomes required.
# - The signature is a keyed HMAC-SHA512 (GoSecure.lite_hmac) over a canonical
#   serialization of the signed fields, keyed by the app encryption secret. A client
#   cannot mint or alter a marker without the server secret, so a forged or stripped
#   marker fails #verify. This is the codebase's strongest existing MAC primitive;
#   an asymmetric / C2PA provenance signature is a documented future hardening.
# - The marker is UNCONDITIONAL: it is emitted whenever AI produced the content,
#   independent of any feature flag or jurisdiction. Only the Article 50(1)
#   user-facing disclosure is gated; the 50(2) marking is not.
module Art50Marker
  # Bump SPEC / SIG_ALG (never silently) if the signed shape or algorithm changes,
  # so older markers remain verifiable against the version that produced them.
  SPEC = 'eu-ai-act-art50-2'
  SIG_ALG = 'GoSecure.lite_hmac.v1'
  SIG_SALT = 'art50_marker'

  # Fields covered by the signature, in canonical order. Order is fixed so the
  # canonical string is deterministic across Ruby versions and hash orderings.
  SIGNED_KEYS = %w[spec provider model generated_at content_id].freeze

  module_function

  # Builds a signed marker for one AI generation. provider/model identify the
  # system that produced the output; generated_at defaults to now (UTC ISO8601).
  # Returns a string-keyed Hash safe to embed in JSON responses and board.settings.
  def build(provider:, model:, generated_at: nil)
    payload = {
      'spec' => SPEC,
      'provider' => provider.to_s,
      'model' => model.to_s,
      'generated_at' => (generated_at || Time.now.utc).iso8601,
      'content_id' => GoSecure.nonce('art50_content')
    }
    payload.merge(
      'marked' => true,
      'sig_alg' => SIG_ALG,
      'signature' => sign(payload)
    )
  end

  # Verifies a marker's signature against the current server secret. Returns true
  # only for a well-formed, untampered, server-issued marker. Any malformed input,
  # missing field, or signature mismatch returns false (never raises).
  def verify(marker)
    return false unless marker.is_a?(Hash)
    m = stringify(marker)
    return false unless m['marked'] == true || m['marked'] == 'true'
    return false unless m['sig_alg'] == SIG_ALG
    sig = m['signature']
    return false unless sig.is_a?(String) && !sig.empty?
    return false unless SIGNED_KEYS.all? { |k| m[k].is_a?(String) && !m[k].empty? }

    ActiveSupport::SecurityUtils.secure_compare(sig, sign(m))
  rescue StandardError
    false
  end

  # Convenience: is the ai_generated key on a board.settings-style hash a valid marker?
  def marked?(settings)
    return false unless settings.is_a?(Hash)
    verify(settings['ai_generated'] || settings[:ai_generated])
  end

  # Non-secret provenance fields safe to expose to API consumers / downstream deployers
  # for Article 50(2) detection. Deliberately EXCLUDES signature and content_id.
  PUBLIC_KEYS = %w[spec provider model generated_at].freeze

  # Public, non-secret view of a stored marker for API exposure. Returns the provenance
  # fields a downstream consumer needs to detect AI-generated content (spec/provider/
  # model/generated_at + marked:true) and WITHHOLDS the signature and content_id: the
  # HMAC is keyed by the server secret so a client cannot verify it anyway, and content_id
  # links to an internal AiApiLog row -- exposing them only enables a bearer-token
  # transplant that mislinks per-board provenance. Returns nil unless the stored marker
  # actually verifies, so a forged or key-rotation-invalidated marker reads as unmarked
  # (consistent with #marked?).
  def public_view(marker)
    return nil unless verify(marker)
    m = stringify(marker)
    view = { 'marked' => true }
    PUBLIC_KEYS.each { |k| view[k] = m[k] }
    view
  end

  # Computes the signature over the canonical serialization of the signed fields.
  # Extra (unsigned) keys on the input are ignored, so #verify can pass the full
  # marker hash here without stripping marked/sig_alg/signature first.
  #
  # The canonical form is a JSON array of [key, value] pairs in fixed SIGNED_KEYS
  # order. JSON escaping makes it injective: no field value (even one containing a
  # delimiter) can collide with a different field assignment, so two distinct field
  # sets can never produce the same signing input. (Today provider/model come from
  # server config and the rest are hex/ISO8601, but signing must not depend on that.)
  def sign(payload)
    p = stringify(payload)
    canonical = JSON.generate(SIGNED_KEYS.map { |k| [k, p[k]] })
    GoSecure.lite_hmac(canonical, SIG_SALT, 1)
  end

  def stringify(hash)
    hash.transform_keys(&:to_s)
  end
end
