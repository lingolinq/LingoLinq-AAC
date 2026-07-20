# frozen_string_literal: true

module PiiScrubber
  # Common first-name gazetteer for the AI-egress path (redact_for_ai / scan_for_pii).
  # Source: US Social Security Administration baby-name data (public domain), names
  # given to at least 1,000 babies in a single year, 1880-present (~1,656 entries).
  # This closes a real gap the account-holder blocklist cannot: a parent/SLP can type
  # ANY name -- a child's, a sibling's, a classmate's -- into a free-text AI prompt
  # (e.g. the board-generation topic field), and only the account holder's OWN name is
  # ever in the blocklist. Deliberately biased toward over-matching: a common English
  # word that is also a name (e.g. "Grace", "Hope", "Will") gets redacted even when used
  # as an ordinary word, the same tradeoff already accepted for the SSN pattern above
  # (see scrub_log_line's plausible_ssn_format? comment) -- catching an actual child's
  # name outweighs occasionally over-redacting a common word in a short topic prompt.
  COMMON_FIRST_NAMES = File.readlines(File.join(__dir__, 'data', 'common_first_names.txt'), chomp: true)
                            .map(&:downcase).to_set.freeze

  # Patterns for detecting PII
  EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  PHONE_PATTERN = /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
  SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/
  IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/
  GLOBAL_ID_PATTERN = /\b\d+_\d+(_[a-zA-Z0-9]+)?\b/

  # Log-line patterns (stricter or broader than AI-egress patterns where appropriate).
  # Quoted local-part, dotted-domain, or single-label host (e.g. user@localhost).
  LOG_EMAIL_PATTERN = /
    (?:
      "[^"]+"@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}
      |
      [A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}
      |
      [A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9-]*
    )
  \b/x
  # Requires explicit phone separators so bare 10-digit epoch timestamps are not matched.
  LOG_PHONE_PATTERN = /\b(?:\+?1[-.\s])?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/

  # Hash keys that contain user-identifiable information
  IDENTITY_KEYS = %i[
    name first_name last_name full_name user_name username
    email email_address
    phone phone_number
    address street_address city state zip zip_code postal_code
    ssn social_security_number
    ip_address readable_ip_address
    global_id user_id author_id device_id
  ].freeze

  # String variants of identity keys for hash lookups
  IDENTITY_STRING_KEYS = IDENTITY_KEYS.map(&:to_s).freeze

  # Placeholder values for redacted fields
  PLACEHOLDERS = {
    name: '[REDACTED_NAME]',
    first_name: '[REDACTED_NAME]',
    last_name: '[REDACTED_NAME]',
    full_name: '[REDACTED_NAME]',
    user_name: '[REDACTED_USERNAME]',
    username: '[REDACTED_USERNAME]',
    email: '[REDACTED_EMAIL]',
    email_address: '[REDACTED_EMAIL]',
    phone: '[REDACTED_PHONE]',
    phone_number: '[REDACTED_PHONE]',
    address: '[REDACTED_ADDRESS]',
    street_address: '[REDACTED_ADDRESS]',
    city: '[REDACTED_ADDRESS]',
    state: '[REDACTED_ADDRESS]',
    zip: '[REDACTED_ADDRESS]',
    zip_code: '[REDACTED_ADDRESS]',
    postal_code: '[REDACTED_ADDRESS]',
    ssn: '[REDACTED_SSN]',
    social_security_number: '[REDACTED_SSN]',
    ip_address: '[REDACTED_IP]',
    readable_ip_address: '[REDACTED_IP]',
    global_id: '[REDACTED_ID]',
    user_id: '[REDACTED_ID]',
    author_id: '[REDACTED_ID]',
    device_id: '[REDACTED_ID]'
  }.freeze

  class << self
    # Strip all user identity from a data hash.
    # Removes: names, emails, phone numbers, SSNs, global_ids that could identify users.
    # Operates on a deep copy so the original data is never mutated.
    #
    # @param data [Hash] a hash potentially containing PII in its keys/values
    # @return [Hash] a new hash with all identity fields replaced by placeholders
    def strip_user_identity(data)
      return {} if data.nil?
      raise ArgumentError, 'Expected a Hash' unless data.is_a?(Hash)

      scrub_hash(deep_copy(data))
    end

    # Anonymize a board's content for AI processing.
    # Replaces family/person names with [PERSON_1], [PERSON_2], etc.
    # Keeps vocabulary words intact, removes user-specific customizations.
    #
    # @param board_data [Hash] board data hash with keys like 'buttons', 'name', 'key', 'user'
    # @return [Hash] anonymized board data safe for AI consumption
    def anonymize_board(board_data)
      return {} if board_data.nil?
      raise ArgumentError, 'Expected a Hash' unless board_data.is_a?(Hash)

      result = deep_copy(board_data)

      # Remove direct user identity from board metadata
      result.delete('user')
      result.delete('user_id')
      result.delete('author_id')
      result.delete('key')          # contains username path like "username/board-name"
      result.delete('user_name')
      result.delete('email')

      # Redact the board name if it looks like it contains a person's name
      # (board names are typically descriptive like "Core Words" not personal)
      result['name'] = '[BOARD]' if result['name']

      # Collect person-name labels from buttons categorized as people/family
      person_names = extract_person_names(result)
      person_map = build_person_map(person_names)

      # Process buttons: replace person names, keep vocabulary
      if result['buttons'].is_a?(Array)
        result['buttons'] = result['buttons'].map do |button|
          anonymize_button(button, person_map)
        end
      end

      # Scrub settings that might contain user-specific data
      if result['settings'].is_a?(Hash)
        result['settings'].delete('locale_distance')
        result['settings'].delete('author')
        result['settings'].delete('never_edited')
        result['settings'].delete('copy_id')
        result['settings'].delete('source_board_id')
      end

      result
    end

    # Aggregate usage logs into stats only -- no individual records.
    # Returns counts, averages, and distributions. Never returns specific sessions
    # or any data that could be used to reconstruct individual user activity.
    #
    # @param log_sessions [ActiveRecord::Relation, Array<LogSession>] log sessions to aggregate
    # @return [Hash] aggregate statistics only
    def aggregate_usage(log_sessions)
      sessions = Array(log_sessions)
      return empty_aggregate if sessions.empty?

      durations = []
      word_set = Set.new
      button_categories = Hash.new(0)
      total_button_presses = 0
      timestamps = []

      sessions.each do |session|
        data = session_data(session)
        next if data.nil?

        # Duration
        duration = data['duration']
        durations << duration.to_f if duration.present?

        # Timestamps for date range
        timestamps << session.started_at if session.respond_to?(:started_at) && session.started_at
        timestamps << session.ended_at if session.respond_to?(:ended_at) && session.ended_at

        # Words used (only count, never store the actual words with session context)
        events = data['events'] || []
        events.each do |event|
          next unless event.is_a?(Hash)

          if event['type'] == 'button' && event['button'].is_a?(Hash)
            label = event['button']['label']
            word_set.add(label.downcase) if label.present?

            # Button press distribution by part of speech
            pos = event.dig('parts_of_speech', 'types')&.first || 'uncategorized'
            button_categories[pos] += 1
            total_button_presses += 1
          end

          # Also capture spelling completions
          if event['spelling'].present?
            word_set.add(event['spelling'].downcase)
          end
        end
      end

      avg_duration = durations.any? ? (durations.sum / durations.size).round(1) : 0.0
      timestamps.compact!

      {
        total_sessions: sessions.size,
        unique_words_used: word_set.size,
        avg_session_duration: avg_duration,
        total_button_presses: total_button_presses,
        button_press_distribution: button_categories,
        date_range: {
          earliest: timestamps.min,
          latest: timestamps.max
        }
      }
    end

    # Final check before any AI API call.
    # Scans the payload for residual PII and redacts it. This is the last line
    # of defense -- every outbound AI request should pass through this method.
    #
    # @param payload [String, Hash] the data about to be sent to an AI API
    # @return [Hash] { payload: scrubbed_payload, pii_found: Boolean, findings: Array }
    def redact_for_ai(payload)
      findings = []

      scrubbed = case payload
                 when String
                   redact_string(payload, findings)
                 when Hash
                   redact_hash(payload, findings)
                when Array
                  payload.map do |item|
                    res = redact_for_ai(item)
                    findings.concat(res[:findings])
                    res[:payload]
                  end
                 else
                   payload
                 end

      # Deduplicate findings by type and position
      findings.uniq! { |f| [f[:type], f[:position]] }

      {
        payload: scrubbed,
        pii_found: findings.any?,
        findings: findings
      }
    end

    # Scan text for PII patterns. Returns an array of findings with type,
    # a redacted preview of the value, and its position in the string.
    #
    # @param text [String] the text to scan
    # @return [Array<Hash>] array of { type: Symbol, value: String, position: Integer }
    def scan_for_pii(text)
      return [] unless text.is_a?(String)

      findings = []

      scan_pattern(text, EMAIL_PATTERN, :email, findings)
      scan_pattern(text, PHONE_PATTERN, :phone, findings)
      scan_pattern(text, SSN_PATTERN, :ssn, findings)
      scan_pattern(text, IP_PATTERN, :ip_address, findings)
      scan_pattern(text, GLOBAL_ID_PATTERN, :global_id, findings)
      scan_blocklist(text, findings)
      # Structured patterns above can contain a name-shaped substring (e.g. "alice"
      # inside "alice@example.com"); skip common-name matches already covered by one
      # of those spans so a single email/phone/etc. is not double-reported.
      occupied = structured_pattern_ranges(text)
      scan_common_names(text, findings, occupied)

      findings.sort_by { |f| f[:position] }
    end

    # Defense-in-depth scrub for a single formatted log line. BACKSTOP ONLY --
    # per-call-site log hygiene (log global_id not user_name, never log raw user
    # content) is the primary control. Pattern classes scrubbed here:
    #
    #   - EMAIL (LOG_EMAIL_PATTERN): dotted-domain, single-label host
    #     (user@localhost), and quoted-local-part ("user"@example.com).
    #   - PHONE (LOG_PHONE_PATTERN): US-style numbers with required separators
    #     (parens/dashes/dots/spaces). Bare 10-digit runs (epoch timestamps) are
    #     deliberately skipped.
    #   - SSN (SSN_PATTERN + plausible_ssn_format?): 3-2-4 dashed numerics that
    #     pass SSA-invalid checks (not 000/666 area, not 00 group, not 0000 serial).
    #     Still OVER-matches some order/part ids shaped like valid SSNs -- accepted
    #     in a HIPAA-scoped sink where catching free-text SSNs outweighs masking ids.
    #   - IP (IP_PATTERN): full IPv4 literals. Rack request logs are already
    #     /24-masked upstream (rack_logger.rb); this catches leaks from other paths.
    #
    # Deliberately does NOT touch names/usernames/utterances/board-labels (no
    # reliable regex; this is the app's real PHI and stays a call-site concern)
    # or global_id (opaque, intentionally retained in some diagnostic warns).
    #
    # Scope: only lines emitted through config.log_formatter (PiiScrubbingFormatter
    # on production Rails/Resque stdout). Third-party gems that write directly to
    # stderr or bypass the formatter are out of scope.
    #
    # Wrapped in a rescue so a scrub failure fails open (returns the line) and can
    # never break logging. Uses log_line_needs_scrub? for a cheap pre-check.
    #
    # @param text [String] a fully-formatted log line
    # @return [String] the line with detectable PII redacted
    def scrub_log_line(text)
      return text unless text.is_a?(String)
      return text unless log_line_needs_scrub?(text)

      result = text
      result = result.gsub(LOG_EMAIL_PATTERN, '[REDACTED_EMAIL]') if result.include?('@')
      result = result.gsub(LOG_PHONE_PATTERN, '[REDACTED_PHONE]') if result.match?(LOG_PHONE_PATTERN)
      if result.match?(SSN_PATTERN)
        result = result.gsub(SSN_PATTERN) do |match|
          plausible_ssn_format?(match) ? '[REDACTED_SSN]' : match
        end
      end
      result = result.gsub(IP_PATTERN, '[REDACTED_IP]') if result.match?(IP_PATTERN)
      result
    rescue StandardError
      text
    end

    # Configure a blocklist of names that should always be redacted.
    # Typically loaded from the app's user records or environment config.
    # Uses Thread.current storage for thread safety under Puma concurrency.
    #
    # @param names [Array<String>] list of names to add to the blocklist
    def configure_blocklist(names)
      Thread.current[:pii_scrubber_blocklist] = Array(names).map { |n| n.to_s.strip }.reject(&:empty?).uniq
      Thread.current[:pii_scrubber_blocklist_pattern] = nil
    end

    # Returns the current blocklist
    #
    # @return [Array<String>]
    def blocklist
      Thread.current[:pii_scrubber_blocklist] || []
    end

    # Reset the blocklist (useful in tests)
    def reset_blocklist!
      Thread.current[:pii_scrubber_blocklist] = []
      Thread.current[:pii_scrubber_blocklist_pattern] = nil
    end

    private

    # Cheap gate before running log-line regex passes.
    def log_line_needs_scrub?(text)
      return true if text.include?('@')
      return true if text.include?('-') && text.match?(SSN_PATTERN)
      return true if text.match?(LOG_PHONE_PATTERN)
      return true if text.match?(IP_PATTERN)

      false
    end

    # SSA-invalid SSN components (000 area, 666 area, 00 group, 0000 serial).
    # Does not eliminate all 3-2-4 false positives (e.g. order ids).
    def plausible_ssn_format?(token)
      parts = token.split('-')
      return false unless parts.size == 3 && parts.all? { |p| p.match?(/\A\d+\z/) }

      area, group, serial = parts.map(&:to_i)
      return false if area.zero? || area == 666
      return false if group.zero?
      return false if serial.zero?

      true
    end

    # Deep copy a hash/array structure to avoid mutating the original
    def deep_copy(obj)
      case obj
      when Hash
        obj.each_with_object({}) { |(k, v), h| h[k] = deep_copy(v) }
      when Array
        obj.map { |item| deep_copy(item) }
      else
        begin
          obj.duplicable? ? obj.dup : obj
        rescue TypeError
          obj
        end
      end
    end

    # Recursively scrub identity keys from a hash
    def scrub_hash(hash)
      hash.each_with_object({}) do |(key, value), result|
        str_key = key.to_s
        sym_key = key.to_sym rescue nil

        if IDENTITY_STRING_KEYS.include?(str_key)
          placeholder = PLACEHOLDERS[sym_key] || PLACEHOLDERS[str_key.to_sym] || '[REDACTED]'
          result[key] = placeholder
        elsif value.is_a?(Hash)
          result[key] = scrub_hash(value)
        elsif value.is_a?(Array)
          result[key] = value.map { |item| item.is_a?(Hash) ? scrub_hash(item) : item }
        else
          result[key] = value
        end
      end
    end

    # Extract person names from board buttons that are categorized as people/family.
    # Buttons linked to "people" or "family" boards typically contain proper names.
    def extract_person_names(board_data)
      names = Set.new
      buttons = board_data['buttons'] || []

      buttons.each do |button|
        next unless button.is_a?(Hash)

        # Check if the button is in a people/family semantic category
        is_person = false
        is_person = true if button['part_of_speech'] == 'noun' && person_label?(button['label'])
        is_person = true if button_in_people_board?(button, board_data)

        names.add(button['label'].strip) if is_person && button['label'].present?
      end

      names.to_a
    end

    # Heuristic: does this button label look like a person's name?
    # Single capitalized words or two-word capitalized phrases that are not
    # common AAC vocabulary.
    def person_label?(label)
      return false if label.nil?

      cleaned = label.to_s.strip
      return false if cleaned.empty?

      # Common AAC core words are not person names
      core_words = %w[
        I me my mine you your we our they them he she it his her
        want need like go stop more help do make get put have is
        am are was not no yes all some the a an this that here there
        in on up down out off big little good bad happy sad
        eat drink play read look see hear feel think know
        mom dad mommy daddy brother sister baby teacher friend
      ]
      return false if core_words.include?(cleaned.downcase)

      # Person names are typically capitalized, 1-2 words, no special chars
      words = cleaned.split(/\s+/)
      return false if words.length > 3
      return false if cleaned.match?(/[^a-zA-Z\s\-']/)

      words.all? { |w| w.match?(/\A[A-Z]/) }
    end

    # Check if a button links to or is on a people/family category board
    def button_in_people_board?(button, board_data)
      return false unless button.is_a?(Hash)

      # Check if the board itself is a people/family board
      board_name = (board_data['name'] || '').downcase
      people_keywords = %w[people family friends names contacts persons]
      return true if people_keywords.any? { |kw| board_name.include?(kw) }

      # Check if the button's load_board reference indicates a people board
      if button['load_board'].is_a?(Hash)
        load_key = (button['load_board']['key'] || '').downcase
        return true if people_keywords.any? { |kw| load_key.include?(kw) }
      end

      false
    end

    # Build a mapping of person names to anonymized placeholders
    def build_person_map(names)
      map = {}
      names.sort.each_with_index do |name, index|
        map[name] = "[PERSON_#{index + 1}]"
      end
      map
    end

    # Anonymize a single button hash, replacing person names
    def anonymize_button(button, person_map)
      return button unless button.is_a?(Hash)

      result = button.dup

      # Remove fields that could link back to a specific user's board
      result.delete('external_id')

      # Replace person names in label and vocalization
      %w[label vocalization].each do |field|
        next unless result[field].is_a?(String)

        person_map.each do |name, placeholder|
          result[field] = result[field].gsub(/\b#{Regexp.escape(name)}\b/i, placeholder)
        end
      end

      # Strip image_id if it might be a user-uploaded personal photo
      # (keep it if it looks like a library symbol ID)
      if result['image_id'].is_a?(String) && !result['image_id'].match?(/\A\d+_\d+\z/)
        result.delete('image_id')
      end

      result
    end

    # Safely access session data, handling both Hash-like and ActiveRecord objects
    def session_data(session)
      if session.respond_to?(:data)
        session.data
      elsif session.is_a?(Hash)
        session['data'] || session[:data]
      end
    end

    # Return an empty aggregate stats structure
    def empty_aggregate
      {
        total_sessions: 0,
        unique_words_used: 0,
        avg_session_duration: 0.0,
        total_button_presses: 0,
        button_press_distribution: {},
        date_range: {
          earliest: nil,
          latest: nil
        }
      }
    end

    # Redact PII patterns from a string, recording findings
    def redact_string(text, findings)
      result = text.dup

      result = redact_pattern(result, SSN_PATTERN, '[REDACTED_SSN]', :ssn, findings)
      result = redact_pattern(result, EMAIL_PATTERN, '[REDACTED_EMAIL]', :email, findings)
      result = redact_pattern(result, PHONE_PATTERN, '[REDACTED_PHONE]', :phone, findings)
      result = redact_pattern(result, IP_PATTERN, '[REDACTED_IP]', :ip_address, findings)
      result = redact_pattern(result, GLOBAL_ID_PATTERN, '[REDACTED_ID]', :global_id, findings)
      result = redact_blocklist_names(result, findings)
      result = redact_common_names(result, findings)

      result
    end

    # Redact PII from a hash, recursively processing all values
    def redact_hash(hash, findings)
      hash.each_with_object({}) do |(key, value), result|
        str_key = key.to_s
        sym_key = key.to_sym rescue nil

        # Redact known identity keys entirely (any value type: string, integer, etc.)
        if IDENTITY_STRING_KEYS.include?(str_key)
          placeholder = PLACEHOLDERS[sym_key] || PLACEHOLDERS[str_key.to_sym] || '[REDACTED]'
          findings << { type: :identity_field, value: redact_value_preview(value), position: 0 }
          result[key] = placeholder
        elsif value.is_a?(String)
          result[key] = redact_string(value, findings)
        elsif value.is_a?(Hash)
          result[key] = redact_hash(value, findings)
        elsif value.is_a?(Array)
          result[key] = value.map do |item|
            case item
            when String then redact_string(item, findings)
            when Hash then redact_hash(item, findings)
            else item
            end
          end
        else
          result[key] = value
        end
      end
    end

    # Replace all occurrences of a regex pattern in text, recording findings
    def redact_pattern(text, pattern, replacement, type, findings)
      text.gsub(pattern) do |match|
        findings << {
          type: type,
          value: redact_value_preview(match),
          position: Regexp.last_match.begin(0)
        }
        replacement
      end
    end

    # Scan text for a specific PII pattern and record findings
    def scan_pattern(text, pattern, type, findings)
      text.scan(pattern) do
        match = Regexp.last_match
        findings << {
          type: type,
          value: redact_value_preview(match[0]),
          position: match.begin(0)
        }
      end
    end

    # Scan text against the configured blocklist of names
    def scan_blocklist(text, findings)
      return if blocklist.empty?

      blocklist.each do |name|
        pattern = /\b#{Regexp.escape(name)}\b/i
        text.scan(pattern) do
          match = Regexp.last_match
          findings << {
            type: :blocklist_name,
            value: redact_value_preview(match[0]),
            position: match.begin(0)
          }
        end
      end
    end

    # Redact blocklist names from text, recording findings
    def redact_blocklist_names(text, findings)
      return text if blocklist.empty?

      result = text.dup
      blocklist.each do |name|
        pattern = /\b#{Regexp.escape(name)}\b/i
        result = result.gsub(pattern) do |match|
          findings << {
            type: :blocklist_name,
            value: redact_value_preview(match),
            position: Regexp.last_match.begin(0)
          }
          '[REDACTED_NAME]'
        end
      end
      result
    end

    # Character ranges already matched by a structured PII pattern (email, phone,
    # ssn, ip, global_id), used to keep scan_common_names from double-reporting a
    # name-shaped substring inside one of those (e.g. "alice" in "alice@example.com").
    def structured_pattern_ranges(text)
      [EMAIL_PATTERN, PHONE_PATTERN, SSN_PATTERN, IP_PATTERN, GLOBAL_ID_PATTERN].flat_map do |pattern|
        text.to_enum(:scan, pattern).map { Regexp.last_match.begin(0)...Regexp.last_match.end(0) }
      end
    end

    # Scan text against the common first-name gazetteer (any name, not just the
    # account holder's own -- see COMMON_FIRST_NAMES comment for rationale).
    # `occupied`: optional array of Ranges to skip (already-matched structured PII).
    def scan_common_names(text, findings, occupied = [])
      text.scan(/\b[A-Za-z]+\b/) do
        match = Regexp.last_match
        next unless COMMON_FIRST_NAMES.include?(match[0].downcase)
        next if occupied.any? { |range| range.cover?(match.begin(0)) }

        findings << {
          type: :common_name,
          value: redact_value_preview(match[0]),
          position: match.begin(0)
        }
      end
    end

    # Honorifics that strongly signal the immediately-following Capitalized token
    # is a surname (e.g. "Dr. Smith", "Mrs. Johnson"). The honorific itself is not
    # PII and is preserved; only the surname is redacted.
    HONORIFIC_SURNAME_PATTERN =
      /\b((?:Mr|Mrs|Ms|Miss|Mx|Dr|Drs|Prof|Professor)\.?\s+)([A-Z][A-Za-z'’-]+)\b/

    # A Capitalized token immediately following an already-redacted name placeholder
    # is the likely surname (e.g. "[REDACTED_NAME] Johnson"). Applied AFTER the
    # first-name / blocklist passes so the placeholder is present.
    TRAILING_SURNAME_PATTERN = /\[REDACTED_NAME\](\s+)([A-Z][A-Za-z'’-]+)\b/

    # Redact person names from free text, recording findings. Three passes, all
    # deliberately biased toward over-redaction (the safe direction for an AI
    # egress path, consistent with the COMMON_FIRST_NAMES gazetteer's own bias):
    #   1. honorific + Capitalized surname ("Dr. Smith")   -> redact the surname
    #   2. standalone common first name ("Sarah", "Bobby")  -> redact it
    #   3. a Capitalized token right after a name placeholder ("[REDACTED_NAME]
    #      Johnson") -> redact it too (the likely surname of a first name from
    #      pass 2 or a blocklisted account-holder name)
    # Ordering matters: pass 2 runs before pass 3 so a "First Last" pair becomes
    # "[REDACTED_NAME] Last" and pass 3 then catches "Last" -- a single left-to-right
    # two-word regex would instead consume "<preceding word> First" and miss the
    # surname. Passes 1 and 3 close the surname gap the first-name gazetteer alone
    # cannot (the residual the eval-narration review flagged for free-typed
    # third-party names). A bare surname with no honorific and no preceding
    # first/blocklisted name is still not caught here -- that needs a surname
    # gazetteer, which over-matches ordinary English words -- so a UI affordance
    # discouraging free-typed third-party names remains the primary point-of-entry
    # control (tracked as a follow-up).
    def redact_common_names(text, findings)
      result = text.gsub(HONORIFIC_SURNAME_PATTERN) do
        prefix = Regexp.last_match(1)
        surname = Regexp.last_match(2)
        findings << {
          type: :person_name,
          value: redact_value_preview(surname),
          position: Regexp.last_match.begin(2)
        }
        "#{prefix}[REDACTED_NAME]"
      end

      result = result.gsub(/\b[A-Za-z]+\b/) do |word|
        if COMMON_FIRST_NAMES.include?(word.downcase)
          findings << {
            type: :common_name,
            value: redact_value_preview(word),
            position: Regexp.last_match.begin(0)
          }
          '[REDACTED_NAME]'
        else
          word
        end
      end

      result.gsub(TRAILING_SURNAME_PATTERN) do
        separator = Regexp.last_match(1)
        surname = Regexp.last_match(2)
        findings << {
          type: :person_name,
          value: redact_value_preview(surname),
          position: Regexp.last_match.begin(2)
        }
        "[REDACTED_NAME]#{separator}[REDACTED_NAME]"
      end
    end

    # Create a redacted preview of a PII value for logging purposes.
    # Shows first and last character only, with asterisks in between.
    # Never stores the full original value in findings.
    def redact_value_preview(value)
      str = value.to_s
      return '***' if str.length <= 2

      "#{str[0]}#{'*' * [str.length - 2, 6].min}#{str[-1]}"
    end
  end
end
