require 'spec_helper'

describe AuditEvent, :type => :model do
  describe 'generate_summary' do
    it 'should generate a summary' do
      e = AuditEvent.new(user_key: 'bob')
      e.generate_summary
      expect(e.summary).to eq('bob:  ')
      
      e = AuditEvent.new(user_key: 'bob')
      e.data = {
        'type' => 'console',
        'command' => 'do something'
      }
      e.generate_summary
      expect(e.summary).to eq('bob: console do something')
    end
  end
  
  describe 'log_command' do
    it 'should log events' do
      expect(AuditEvent.log_command('fred', {})).to be_is_a(AuditEvent)
      e = AuditEvent.log_command('fred', {'type' => 'run'})
      expect(e.id).not_to eq(nil)
      expect(e.user_key).to eq('fred')
      expect(e.data['type']).to eq('run')
    end
    
    it 'should log loudly and not raise when persistence fails' do
      # The real failure mode is a raise (encryption-key drift, DB error), not a
      # false return -- AuditEvent has no validations, so save never returns false.
      event = AuditEvent.new
      allow(event).to receive(:save!).and_raise(StandardError.new('boom'))
      allow(AuditEvent).to receive(:new).and_return(event)

      expect(Rails.logger).to receive(:error).with('[AuditEvent] failed to persist audit record for fred: StandardError: boom')
      result = nil
      expect { result = AuditEvent.log_command('fred', {}) }.not_to raise_error

      expect(result).to eq(event)
      expect(result.id).to be_nil
    end

    it 'scrubs PII from the exception message before logging' do
      # A DB/encoding error can echo input back in e.message; that one field is
      # the only interpolated value that could carry PII, so it must be scrubbed.
      event = AuditEvent.new
      allow(event).to receive(:save!).and_raise(StandardError.new('PG error near grandma@hospital.example'))
      allow(AuditEvent).to receive(:new).and_return(event)

      logged = nil
      allow(Rails.logger).to receive(:error) { |line| logged = line }
      expect { AuditEvent.log_command('fred', {}) }.not_to raise_error

      expect(logged).to include('[REDACTED_EMAIL]')
      expect(logged).not_to include('grandma@hospital.example')
    end

    it 'alerts Sentry with a scrubbed message when persistence fails' do
      # Fail-open paths must surface in monitoring; the alert carries the same
      # scrubbed message, never the raw exception (which Sentry would not scrub).
      event = AuditEvent.new
      allow(event).to receive(:save!).and_raise(StandardError.new('db error for grandma@hospital.example'))
      allow(AuditEvent).to receive(:new).and_return(event)
      allow(Rails.logger).to receive(:error)
      allow(Sentry).to receive(:initialized?).and_return(true)

      captured = nil
      expect(Sentry).to receive(:capture_message) { |msg, *_| captured = msg }
      expect { AuditEvent.log_command('fred', {}) }.not_to raise_error

      expect(captured).to include('[REDACTED_EMAIL]')
      expect(captured).not_to include('grandma@hospital.example')
    end

    it 'falls back to a non-echoing placeholder when the scrubber itself fails' do
      # If PiiScrubber is unavailable (e.g. lib/ not autoloaded in a worker) the
      # scrub call raises; the fallback must NOT log the raw e.message we were
      # trying to scrub, or the scrubber-absent path becomes the PII-leak path.
      event = AuditEvent.new
      allow(event).to receive(:save!).and_raise(StandardError.new('PG error near grandma@hospital.example'))
      allow(AuditEvent).to receive(:new).and_return(event)
      allow(PiiScrubber).to receive(:scrub_log_line).and_raise(NameError.new('uninitialized constant'))

      logged = nil
      allow(Rails.logger).to receive(:error) { |line| logged = line }
      expect { AuditEvent.log_command('fred', {}) }.not_to raise_error

      expect(logged).to include('[unscrubbable]')
      expect(logged).not_to include('grandma@hospital.example')
    end
  end
end
