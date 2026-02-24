# frozen_string_literal: true

require 'spec_helper'

describe PiiScrubber do
  after(:each) do
    PiiScrubber.reset_blocklist!
  end

  describe "strip_user_identity" do
    it "should return an empty hash for nil input" do
      expect(PiiScrubber.strip_user_identity(nil)).to eq({})
    end

    it "should raise ArgumentError for non-Hash input" do
      expect { PiiScrubber.strip_user_identity("string") }.to raise_error(ArgumentError, 'Expected a Hash')
      expect { PiiScrubber.strip_user_identity([1, 2]) }.to raise_error(ArgumentError, 'Expected a Hash')
    end

    it "should redact name fields" do
      data = { name: 'Alice Smith', first_name: 'Alice', last_name: 'Smith', full_name: 'Alice Smith' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:name]).to eq('[REDACTED_NAME]')
      expect(result[:first_name]).to eq('[REDACTED_NAME]')
      expect(result[:last_name]).to eq('[REDACTED_NAME]')
      expect(result[:full_name]).to eq('[REDACTED_NAME]')
    end

    it "should redact username fields" do
      data = { user_name: 'alice99', username: 'alice99' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:user_name]).to eq('[REDACTED_USERNAME]')
      expect(result[:username]).to eq('[REDACTED_USERNAME]')
    end

    it "should redact email fields" do
      data = { email: 'alice@example.com', email_address: 'alice@test.org' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:email]).to eq('[REDACTED_EMAIL]')
      expect(result[:email_address]).to eq('[REDACTED_EMAIL]')
    end

    it "should redact phone fields" do
      data = { phone: '555-123-4567', phone_number: '(800) 555-0199' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:phone]).to eq('[REDACTED_PHONE]')
      expect(result[:phone_number]).to eq('[REDACTED_PHONE]')
    end

    it "should redact address fields" do
      data = { address: '123 Main St', street_address: '123 Main St', city: 'Portland',
               state: 'OR', zip: '97201', zip_code: '97201', postal_code: '97201-1234' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:address]).to eq('[REDACTED_ADDRESS]')
      expect(result[:street_address]).to eq('[REDACTED_ADDRESS]')
      expect(result[:city]).to eq('[REDACTED_ADDRESS]')
      expect(result[:state]).to eq('[REDACTED_ADDRESS]')
      expect(result[:zip]).to eq('[REDACTED_ADDRESS]')
      expect(result[:zip_code]).to eq('[REDACTED_ADDRESS]')
      expect(result[:postal_code]).to eq('[REDACTED_ADDRESS]')
    end

    it "should redact SSN fields" do
      data = { ssn: '123-45-6789', social_security_number: '987-65-4321' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:ssn]).to eq('[REDACTED_SSN]')
      expect(result[:social_security_number]).to eq('[REDACTED_SSN]')
    end

    it "should redact IP and ID fields" do
      data = { ip_address: '192.168.1.1', readable_ip_address: '10.0.0.1',
               global_id: '1_12345', user_id: '42', author_id: '7', device_id: 'dev_abc' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:ip_address]).to eq('[REDACTED_IP]')
      expect(result[:readable_ip_address]).to eq('[REDACTED_IP]')
      expect(result[:global_id]).to eq('[REDACTED_ID]')
      expect(result[:user_id]).to eq('[REDACTED_ID]')
      expect(result[:author_id]).to eq('[REDACTED_ID]')
      expect(result[:device_id]).to eq('[REDACTED_ID]')
    end

    it "should handle string keys as well as symbol keys" do
      data = { 'name' => 'Bob Jones', 'email' => 'bob@example.com' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result['name']).to eq('[REDACTED_NAME]')
      expect(result['email']).to eq('[REDACTED_EMAIL]')
    end

    it "should preserve non-PII keys" do
      data = { name: 'Alice', board_type: 'core_words', locale: 'en', grid_size: '4x5' }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:board_type]).to eq('core_words')
      expect(result[:locale]).to eq('en')
      expect(result[:grid_size]).to eq('4x5')
    end

    it "should recursively scrub nested hashes" do
      data = {
        board: 'greetings',
        user_info: {
          name: 'Alice',
          email: 'alice@example.com',
          preferences: {
            username: 'alice99',
            theme: 'dark'
          }
        }
      }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:user_info][:name]).to eq('[REDACTED_NAME]')
      expect(result[:user_info][:email]).to eq('[REDACTED_EMAIL]')
      expect(result[:user_info][:preferences][:username]).to eq('[REDACTED_USERNAME]')
      expect(result[:user_info][:preferences][:theme]).to eq('dark')
    end

    it "should scrub hashes inside arrays" do
      data = {
        users: [
          { name: 'Alice', role: 'admin' },
          { name: 'Bob', role: 'user' }
        ]
      }
      result = PiiScrubber.strip_user_identity(data)
      expect(result[:users][0][:name]).to eq('[REDACTED_NAME]')
      expect(result[:users][0][:role]).to eq('admin')
      expect(result[:users][1][:name]).to eq('[REDACTED_NAME]')
      expect(result[:users][1][:role]).to eq('user')
    end

    it "should not mutate the original data" do
      data = { name: 'Alice', email: 'alice@example.com' }
      PiiScrubber.strip_user_identity(data)
      expect(data[:name]).to eq('Alice')
      expect(data[:email]).to eq('alice@example.com')
    end
  end

  describe "anonymize_board" do
    it "should return an empty hash for nil input" do
      expect(PiiScrubber.anonymize_board(nil)).to eq({})
    end

    it "should raise ArgumentError for non-Hash input" do
      expect { PiiScrubber.anonymize_board("string") }.to raise_error(ArgumentError, 'Expected a Hash')
    end

    it "should remove user identity fields from board metadata" do
      board = {
        'name' => 'My Board',
        'user' => { 'id' => 1, 'name' => 'Alice' },
        'user_id' => 42,
        'author_id' => 7,
        'key' => 'alice/my-board',
        'user_name' => 'alice',
        'email' => 'alice@example.com'
      }
      result = PiiScrubber.anonymize_board(board)
      expect(result).not_to have_key('user')
      expect(result).not_to have_key('user_id')
      expect(result).not_to have_key('author_id')
      expect(result).not_to have_key('key')
      expect(result).not_to have_key('user_name')
      expect(result).not_to have_key('email')
    end

    it "should replace the board name with [BOARD]" do
      board = { 'name' => 'Core Vocabulary', 'buttons' => [] }
      result = PiiScrubber.anonymize_board(board)
      expect(result['name']).to eq('[BOARD]')
    end

    it "should replace person names in buttons on a family board" do
      board = {
        'name' => 'My Family',
        'buttons' => [
          { 'label' => 'Grandma', 'part_of_speech' => 'noun' },
          { 'label' => 'want', 'part_of_speech' => 'verb' }
        ]
      }
      result = PiiScrubber.anonymize_board(board)
      # "Grandma" is on a family board, so it should be anonymized
      family_button = result['buttons'].find { |b| b['label'] != 'want' }
      expect(family_button['label']).to match(/\[PERSON_\d+\]/)
      # "want" is a verb, not a person
      want_button = result['buttons'].find { |b| b['label'] == 'want' || b['label'].include?('want') }
      expect(want_button['label']).to eq('want')
    end

    it "should anonymize person-name buttons identified by person_label heuristic" do
      board = {
        'name' => 'People',
        'buttons' => [
          { 'label' => 'Jennifer', 'part_of_speech' => 'noun' },
          { 'label' => 'Marcus', 'part_of_speech' => 'noun' },
          { 'label' => 'play', 'part_of_speech' => 'verb' }
        ]
      }
      result = PiiScrubber.anonymize_board(board)
      labels = result['buttons'].map { |b| b['label'] }
      expect(labels).to include('play')
      expect(labels).not_to include('Jennifer')
      expect(labels).not_to include('Marcus')
      person_labels = labels.select { |l| l.match?(/\[PERSON_\d+\]/) }
      expect(person_labels.size).to eq(2)
    end

    it "should not anonymize common AAC core words even if capitalized" do
      board = {
        'name' => 'People',
        'buttons' => [
          { 'label' => 'Mom', 'part_of_speech' => 'noun' },
          { 'label' => 'Dad', 'part_of_speech' => 'noun' }
        ]
      }
      result = PiiScrubber.anonymize_board(board)
      labels = result['buttons'].map { |b| b['label'] }
      # "mom" and "dad" are in the core_words list, so they should not be treated as person names
      expect(labels).to include('Mom')
      expect(labels).to include('Dad')
    end

    it "should remove external_id from buttons" do
      board = {
        'name' => 'Test',
        'buttons' => [
          { 'label' => 'hello', 'external_id' => 'ext_123' }
        ]
      }
      result = PiiScrubber.anonymize_board(board)
      expect(result['buttons'][0]).not_to have_key('external_id')
    end

    it "should scrub author and copy_id from settings" do
      board = {
        'name' => 'Test',
        'buttons' => [],
        'settings' => {
          'locale_distance' => 1.5,
          'author' => 'Alice',
          'never_edited' => true,
          'copy_id' => 'abc123',
          'source_board_id' => '42',
          'grid' => { 'rows' => 3, 'columns' => 4 }
        }
      }
      result = PiiScrubber.anonymize_board(board)
      expect(result['settings']).not_to have_key('locale_distance')
      expect(result['settings']).not_to have_key('author')
      expect(result['settings']).not_to have_key('never_edited')
      expect(result['settings']).not_to have_key('copy_id')
      expect(result['settings']).not_to have_key('source_board_id')
      expect(result['settings']['grid']).to eq({ 'rows' => 3, 'columns' => 4 })
    end

    it "should detect people boards via load_board references" do
      board = {
        'name' => 'Home',
        'buttons' => [
          {
            'label' => 'Sophia',
            'part_of_speech' => 'noun',
            'load_board' => { 'key' => 'user/family-people' }
          }
        ]
      }
      result = PiiScrubber.anonymize_board(board)
      labels = result['buttons'].map { |b| b['label'] }
      expect(labels).not_to include('Sophia')
      expect(labels.first).to match(/\[PERSON_\d+\]/)
    end

    it "should not mutate the original board data" do
      board = {
        'name' => 'Family',
        'user' => { 'name' => 'Alice' },
        'buttons' => [{ 'label' => 'Grandpa', 'part_of_speech' => 'noun' }]
      }
      PiiScrubber.anonymize_board(board)
      expect(board['name']).to eq('Family')
      expect(board['user']).to eq({ 'name' => 'Alice' })
    end
  end

  describe "aggregate_usage" do
    it "should return empty aggregate for empty input" do
      result = PiiScrubber.aggregate_usage([])
      expect(result[:total_sessions]).to eq(0)
      expect(result[:unique_words_used]).to eq(0)
      expect(result[:avg_session_duration]).to eq(0.0)
      expect(result[:total_button_presses]).to eq(0)
      expect(result[:button_press_distribution]).to eq({})
      expect(result[:date_range][:earliest]).to eq(nil)
      expect(result[:date_range][:latest]).to eq(nil)
    end

    it "should return empty aggregate for nil input" do
      result = PiiScrubber.aggregate_usage(nil)
      expect(result[:total_sessions]).to eq(0)
    end

    it "should aggregate session counts" do
      sessions = [
        OpenStruct.new(data: { 'duration' => 120, 'events' => [] }),
        OpenStruct.new(data: { 'duration' => 180, 'events' => [] }),
        OpenStruct.new(data: { 'duration' => 60, 'events' => [] })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:total_sessions]).to eq(3)
    end

    it "should calculate average session duration" do
      sessions = [
        OpenStruct.new(data: { 'duration' => 100, 'events' => [] }),
        OpenStruct.new(data: { 'duration' => 200, 'events' => [] })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:avg_session_duration]).to eq(150.0)
    end

    it "should count unique words from button events" do
      sessions = [
        OpenStruct.new(data: {
          'duration' => 60,
          'events' => [
            { 'type' => 'button', 'button' => { 'label' => 'Hello' }, 'parts_of_speech' => { 'types' => ['interjection'] } },
            { 'type' => 'button', 'button' => { 'label' => 'want' }, 'parts_of_speech' => { 'types' => ['verb'] } },
            { 'type' => 'button', 'button' => { 'label' => 'hello' }, 'parts_of_speech' => { 'types' => ['interjection'] } }
          ]
        })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      # "Hello" and "hello" are the same word (downcased), plus "want"
      expect(result[:unique_words_used]).to eq(2)
      expect(result[:total_button_presses]).to eq(3)
    end

    it "should track button press distribution by part of speech" do
      sessions = [
        OpenStruct.new(data: {
          'duration' => 60,
          'events' => [
            { 'type' => 'button', 'button' => { 'label' => 'go' }, 'parts_of_speech' => { 'types' => ['verb'] } },
            { 'type' => 'button', 'button' => { 'label' => 'big' }, 'parts_of_speech' => { 'types' => ['adjective'] } },
            { 'type' => 'button', 'button' => { 'label' => 'run' }, 'parts_of_speech' => { 'types' => ['verb'] } }
          ]
        })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:button_press_distribution]['verb']).to eq(2)
      expect(result[:button_press_distribution]['adjective']).to eq(1)
    end

    it "should count spelling completions as unique words" do
      sessions = [
        OpenStruct.new(data: {
          'duration' => 60,
          'events' => [
            { 'type' => 'spelling', 'spelling' => 'dinosaur' }
          ]
        })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:unique_words_used]).to eq(1)
    end

    it "should track date range from session timestamps" do
      early = Time.new(2025, 1, 1, 10, 0, 0)
      late = Time.new(2025, 1, 15, 14, 30, 0)
      sessions = [
        OpenStruct.new(data: { 'duration' => 60, 'events' => [] }, started_at: early, ended_at: early + 60),
        OpenStruct.new(data: { 'duration' => 90, 'events' => [] }, started_at: late, ended_at: late + 90)
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:date_range][:earliest]).to eq(early)
      expect(result[:date_range][:latest]).to eq(late + 90)
    end

    it "should never expose individual session data" do
      sessions = [
        OpenStruct.new(data: {
          'duration' => 60,
          'events' => [
            { 'type' => 'button', 'button' => { 'label' => 'want' }, 'parts_of_speech' => { 'types' => ['verb'] } }
          ]
        })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      # The result should only contain aggregate keys, not raw session data
      expect(result).not_to have_key(:sessions)
      expect(result).not_to have_key(:events)
      expect(result).not_to have_key(:words)
      expect(result).not_to have_key(:data)
      expected_keys = %i[total_sessions unique_words_used avg_session_duration
                         total_button_presses button_press_distribution date_range]
      expect(result.keys).to match_array(expected_keys)
    end

    it "should handle sessions with nil data gracefully" do
      sessions = [
        OpenStruct.new(data: nil),
        OpenStruct.new(data: { 'duration' => 60, 'events' => [] })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:total_sessions]).to eq(2)
      expect(result[:avg_session_duration]).to eq(60.0)
    end

    it "should categorize buttons without parts_of_speech as uncategorized" do
      sessions = [
        OpenStruct.new(data: {
          'duration' => 60,
          'events' => [
            { 'type' => 'button', 'button' => { 'label' => 'hello' } }
          ]
        })
      ]
      result = PiiScrubber.aggregate_usage(sessions)
      expect(result[:button_press_distribution]['uncategorized']).to eq(1)
    end
  end

  describe "redact_for_ai" do
    it "should redact emails from strings" do
      result = PiiScrubber.redact_for_ai("Contact alice@example.com for info")
      expect(result[:payload]).to eq("Contact [REDACTED_EMAIL] for info")
      expect(result[:pii_found]).to eq(true)
      expect(result[:findings].first[:type]).to eq(:email)
    end

    it "should redact phone numbers from strings" do
      result = PiiScrubber.redact_for_ai("Call 555-123-4567 now")
      expect(result[:payload]).to eq("Call [REDACTED_PHONE] now")
      expect(result[:pii_found]).to eq(true)
      expect(result[:findings].first[:type]).to eq(:phone)
    end

    it "should redact SSNs from strings" do
      result = PiiScrubber.redact_for_ai("SSN is 123-45-6789")
      expect(result[:payload]).to eq("SSN is [REDACTED_SSN]")
      expect(result[:pii_found]).to eq(true)
      expect(result[:findings].first[:type]).to eq(:ssn)
    end

    it "should redact IP addresses from strings" do
      result = PiiScrubber.redact_for_ai("Server at 192.168.1.100 is down")
      expect(result[:payload]).to eq("Server at [REDACTED_IP] is down")
      expect(result[:pii_found]).to eq(true)
      expect(result[:findings].first[:type]).to eq(:ip_address)
    end

    it "should redact multiple PII types from a single string" do
      text = "User alice@example.com from 10.0.0.1 called 555-123-4567"
      result = PiiScrubber.redact_for_ai(text)
      expect(result[:payload]).not_to include('alice@example.com')
      expect(result[:payload]).not_to include('10.0.0.1')
      expect(result[:payload]).not_to include('555-123-4567')
      expect(result[:pii_found]).to eq(true)
      types = result[:findings].map { |f| f[:type] }
      expect(types).to include(:email)
      expect(types).to include(:ip_address)
      expect(types).to include(:phone)
    end

    it "should return pii_found false when no PII is present" do
      result = PiiScrubber.redact_for_ai("Generate a board with core vocabulary words")
      expect(result[:payload]).to eq("Generate a board with core vocabulary words")
      expect(result[:pii_found]).to eq(false)
      expect(result[:findings]).to eq([])
    end

    it "should redact identity keys from hashes" do
      data = { 'prompt' => 'Generate board', 'email' => 'alice@example.com', 'name' => 'Alice' }
      result = PiiScrubber.redact_for_ai(data)
      expect(result[:payload]['email']).to eq('[REDACTED_EMAIL]')
      expect(result[:payload]['name']).to eq('[REDACTED_NAME]')
      expect(result[:payload]['prompt']).to eq('Generate board')
      expect(result[:pii_found]).to eq(true)
    end

    it "should redact PII patterns inside hash string values" do
      data = { 'context' => 'User from 192.168.1.1 requested a board' }
      result = PiiScrubber.redact_for_ai(data)
      expect(result[:payload]['context']).to eq('User from [REDACTED_IP] requested a board')
    end

    it "should recursively redact nested hashes" do
      data = {
        'request' => {
          'user' => { 'email' => 'bob@example.com' },
          'description' => 'SSN: 111-22-3333'
        }
      }
      result = PiiScrubber.redact_for_ai(data)
      expect(result[:payload]['request']['user']['email']).to eq('[REDACTED_EMAIL]')
      expect(result[:payload]['request']['description']).to eq('SSN: [REDACTED_SSN]')
    end

    it "should handle arrays as payload" do
      data = ["Contact alice@example.com", "No PII here"]
      result = PiiScrubber.redact_for_ai(data)
      expect(result[:payload][0]).to eq("Contact [REDACTED_EMAIL]")
      expect(result[:payload][1]).to eq("No PII here")
    end

    it "should pass through non-string non-hash non-array payloads unchanged" do
      result = PiiScrubber.redact_for_ai(42)
      expect(result[:payload]).to eq(42)
      expect(result[:pii_found]).to eq(false)
    end

    it "should redact blocklist names when configured" do
      PiiScrubber.configure_blocklist(['Alice', 'Bob'])
      result = PiiScrubber.redact_for_ai("Generate a board for Alice and Bob")
      expect(result[:payload]).not_to include('Alice')
      expect(result[:payload]).not_to include('Bob')
      expect(result[:payload]).to include('[REDACTED_NAME]')
    end

    it "should deduplicate findings by type and position" do
      # A string with the same PII appearing once should only generate one finding
      result = PiiScrubber.redact_for_ai("Email: alice@example.com")
      expect(result[:findings].size).to eq(1)
    end
  end

  describe "scan_for_pii" do
    it "should return empty array for nil input" do
      expect(PiiScrubber.scan_for_pii(nil)).to eq([])
    end

    it "should return empty array for non-string input" do
      expect(PiiScrubber.scan_for_pii(123)).to eq([])
      expect(PiiScrubber.scan_for_pii({})).to eq([])
    end

    it "should detect email addresses" do
      findings = PiiScrubber.scan_for_pii("Send to alice@example.com please")
      expect(findings.size).to eq(1)
      expect(findings.first[:type]).to eq(:email)
      expect(findings.first[:position]).to be_a(Integer)
      # Value should be redacted preview, not the original
      expect(findings.first[:value]).not_to eq('alice@example.com')
      expect(findings.first[:value]).to match(/\Aa\*+m\z/)
    end

    it "should detect phone numbers" do
      findings = PiiScrubber.scan_for_pii("Call 555-123-4567")
      expect(findings.size).to eq(1)
      expect(findings.first[:type]).to eq(:phone)
    end

    it "should detect phone numbers in various formats" do
      expect(PiiScrubber.scan_for_pii("(800) 555-0199").size).to be >= 1
      expect(PiiScrubber.scan_for_pii("+1 555.123.4567").size).to be >= 1
      expect(PiiScrubber.scan_for_pii("1-800-555-0199").size).to be >= 1
    end

    it "should detect SSNs" do
      findings = PiiScrubber.scan_for_pii("SSN: 123-45-6789")
      expect(findings.size).to eq(1)
      expect(findings.first[:type]).to eq(:ssn)
    end

    it "should detect IP addresses" do
      findings = PiiScrubber.scan_for_pii("From 192.168.1.100")
      expect(findings.size).to eq(1)
      expect(findings.first[:type]).to eq(:ip_address)
    end

    it "should detect multiple PII types in one string" do
      text = "User alice@example.com at 10.0.0.1 SSN 111-22-3333 phone 555-123-4567"
      findings = PiiScrubber.scan_for_pii(text)
      types = findings.map { |f| f[:type] }
      expect(types).to include(:email)
      expect(types).to include(:ip_address)
      expect(types).to include(:ssn)
      expect(types).to include(:phone)
    end

    it "should return findings sorted by position" do
      text = "IP 10.0.0.1 then email alice@example.com"
      findings = PiiScrubber.scan_for_pii(text)
      positions = findings.map { |f| f[:position] }
      expect(positions).to eq(positions.sort)
    end

    it "should return empty array for clean text" do
      findings = PiiScrubber.scan_for_pii("Generate a board with core vocabulary")
      expect(findings).to eq([])
    end

    it "should detect blocklist names when configured" do
      PiiScrubber.configure_blocklist(['Alice', 'Bartholomew'])
      findings = PiiScrubber.scan_for_pii("Alice wants to play with Bartholomew")
      types = findings.map { |f| f[:type] }
      expect(types).to include(:blocklist_name)
      expect(findings.size).to eq(2)
    end

    it "should not detect blocklist names when blocklist is empty" do
      PiiScrubber.reset_blocklist!
      findings = PiiScrubber.scan_for_pii("Alice wants to play")
      blocklist_findings = findings.select { |f| f[:type] == :blocklist_name }
      expect(blocklist_findings).to eq([])
    end
  end

  describe "configure_blocklist" do
    it "should set the blocklist with provided names" do
      PiiScrubber.configure_blocklist(['Alice', 'Bob', 'Charlie'])
      expect(PiiScrubber.blocklist).to eq(['Alice', 'Bob', 'Charlie'])
    end

    it "should strip whitespace and reject empty names" do
      PiiScrubber.configure_blocklist(['  Alice  ', '', '  ', 'Bob'])
      expect(PiiScrubber.blocklist).to eq(['Alice', 'Bob'])
    end

    it "should deduplicate names" do
      PiiScrubber.configure_blocklist(['Alice', 'Bob', 'Alice'])
      expect(PiiScrubber.blocklist).to eq(['Alice', 'Bob'])
    end

    it "should handle nil input gracefully" do
      PiiScrubber.configure_blocklist(nil)
      expect(PiiScrubber.blocklist).to eq([])
    end

    it "should convert non-string entries to strings" do
      PiiScrubber.configure_blocklist([:Alice, 123])
      expect(PiiScrubber.blocklist).to include('Alice')
      expect(PiiScrubber.blocklist).to include('123')
    end

    it "should enable blocklist-based PII detection in scan_for_pii" do
      PiiScrubber.configure_blocklist(['Cornelius'])
      findings = PiiScrubber.scan_for_pii("Cornelius wants more juice")
      expect(findings.any? { |f| f[:type] == :blocklist_name }).to eq(true)
    end

    it "should enable blocklist-based redaction in redact_for_ai" do
      PiiScrubber.configure_blocklist(['Cornelius'])
      result = PiiScrubber.redact_for_ai("Generate a board for Cornelius")
      expect(result[:payload]).to include('[REDACTED_NAME]')
      expect(result[:payload]).not_to include('Cornelius')
    end
  end

  describe "reset_blocklist!" do
    it "should clear the blocklist" do
      PiiScrubber.configure_blocklist(['Alice', 'Bob'])
      expect(PiiScrubber.blocklist.size).to eq(2)
      PiiScrubber.reset_blocklist!
      expect(PiiScrubber.blocklist).to eq([])
    end

    it "should stop detecting previously-blocklisted names" do
      PiiScrubber.configure_blocklist(['Alice'])
      findings_before = PiiScrubber.scan_for_pii("Alice is here")
      expect(findings_before.any? { |f| f[:type] == :blocklist_name }).to eq(true)

      PiiScrubber.reset_blocklist!
      findings_after = PiiScrubber.scan_for_pii("Alice is here")
      expect(findings_after.any? { |f| f[:type] == :blocklist_name }).to eq(false)
    end
  end
end
