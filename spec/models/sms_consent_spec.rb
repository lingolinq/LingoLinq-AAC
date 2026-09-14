require 'spec_helper'

describe SmsConsent, :type => :model do
  env_wrap({
    'SMS_ENCRYPTION_KEY' => 'sms-consent-spec-key'
  }) do
    describe 'grant! and granted?' do
      it "does not treat one communicator's grant as consent for another communicator on the same number" do
        alice = User.create
        bob = User.create
        number = '(555) 867-5309'

        SmsConsent.grant!(alice, number, ip: '203.0.113.10', disclosure_version: '2026-09-08.1')

        expect(SmsConsent.granted?(alice, number)).to eq(true)
        expect(SmsConsent.granted?(alice, '+15558675309')).to eq(true)
        expect(SmsConsent.granted?(bob, number)).to eq(false)
      end

      it "stores a hash of the canonical number and no plaintext phone or per-row salt" do
        communicator = User.create
        SmsConsent.grant!(communicator, '(555) 867-5309', ip: '203.0.113.10', disclosure_version: '2026-09-08.1')

        row = SmsConsent.find_by(user_id: communicator.id)
        expect(row.target_hash).to eq(RemoteTarget.salted_hash('+15558675309', 'sms-consent-spec-key', 'global'))
        expect(row.target_hash).not_to include('555')
        expect(row.has_attribute?(:salt)).to eq(false)
        expect(row.has_attribute?(:phone)).to eq(false)
        expect(row.has_attribute?(:cell)).to eq(false)
        expect(row.attributes.values.map(&:to_s).join).not_to include('5558675309')
        expect(row.disclosure_version).to eq('2026-09-08.1')
        expect(row.request_ip).to eq('203.0.113.10')
        expect(row.state).to eq('granted')
      end

      it "writes an AuditEvent without the plaintext number" do
        communicator = User.create
        SmsConsent.grant!(communicator, '(555) 867-5309', ip: '203.0.113.10', disclosure_version: '2026-09-08.1')

        event = AuditEvent.where(event_type: 'sms_consent_granted').order('id DESC').first
        expect(event).to_not eq(nil)
        expect(event.user_key).to eq(communicator.global_id)
        expect(event.data['target_hash']).to eq(SmsConsent.find_by(user_id: communicator.id).target_hash)
        expect(event.data['disclosure_version']).to eq('2026-09-08.1')
        expect(event.data['request_ip']).to eq('203.0.113.10')
        expect(event.summary).to eq("#{communicator.global_id}: sms_consent_granted")
        dumped = [event.summary, event.data.to_s, event.record_id.to_s].join
        expect(dumped).not_to include('5558675309')
        expect(dumped).not_to include('(555)')
      end

      it "rolls back the consent row when AuditEvent.create! raises" do
        communicator = User.create
        allow(AuditEvent).to receive(:create!).and_raise(ActiveRecord::RecordInvalid.new(AuditEvent.new))

        expect {
          SmsConsent.grant!(communicator, '(555) 867-5309', ip: '203.0.113.10', disclosure_version: '2026-09-08.1')
        }.to raise_error(ActiveRecord::RecordInvalid)
        expect(SmsConsent.where(user_id: communicator.id).count).to eq(0)
      end

      it "re-grant after revoke updates disclosure_version and request_ip" do
        communicator = User.create
        SmsConsent.grant!(communicator, '5558675309', ip: '203.0.113.10', disclosure_version: '2026-09-08.1')
        SmsConsent.revoke!(communicator, '5558675309', ip: '203.0.113.11', disclosure_version: '2026-09-08.1')
        expect(SmsConsent.granted?(communicator, '5558675309')).to eq(false)

        SmsConsent.grant!(communicator, '5558675309', ip: '198.51.100.9', disclosure_version: '2026-09-08.2')
        expect(SmsConsent.granted?(communicator, '5558675309')).to eq(true)
        row = SmsConsent.find_by(user_id: communicator.id)
        expect(row.disclosure_version).to eq('2026-09-08.2')
        expect(row.request_ip).to eq('198.51.100.9')
        expect(SmsConsent.where(user_id: communicator.id).count).to eq(1)
      end
    end

    describe 'hash_for' do
      it "raises when SMS_ENCRYPTION_KEY is blank" do
        communicator = User.create
        ENV.delete('SMS_ENCRYPTION_KEY')
        expect {
          SmsConsent.hash_for(communicator, '5558675309')
        }.to raise_error('missing SMS_ENCRYPTION_KEY')
      end

      it "rejects a blank number before hashing" do
        communicator = User.create
        expect { SmsConsent.hash_for(communicator, '') }.to raise_error('missing number')
        expect { SmsConsent.hash_for(communicator, nil) }.to raise_error('missing number')
      end
    end
  end
end
