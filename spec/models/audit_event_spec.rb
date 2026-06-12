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
  end
end
