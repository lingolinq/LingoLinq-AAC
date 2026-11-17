# frozen_string_literal: true

require 'spec_helper'

# #384: when an account is permanently deleted, its HubSpot contact is removed.
# HubSpot's permanent-delete call stores (blocklists) an address it does not know, so the
# call is made ONLY for an address this app recorded as actually sent, never for every
# deleted account: otherwise deleting a child's or student's account would hand HubSpot an
# address it never had.
describe 'HubSpot: remove the contact when the account is deleted (#384)' do
  restore_env_after_each('IPLOCATE_API_KEY', 'HUBSPOT_ACCESS_TOKEN')

  DELETE_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/gdpr-delete'

  def adult_supporter(email)
    u = User.create
    u.settings['email'] = email
    u.settings['preferences'] ||= {}
    u.settings['preferences']['registration_type'] = 'therapist'
    u.settings['registration'] = { 'adult_at_signup' => true }
    u.save!
    u
  end

  describe 'recording what was sent' do
    it 'records the address on the account when HubSpot accepts the contact' do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      u = adult_supporter('sent_one@example.com')
      expect(Typhoeus).to receive(:post).and_return(OpenStruct.new(code: '201'))
      ExternalTracker.persist_new_user(u.global_id)
      expect(ExternalTracker.sent_emails(u.reload)).to eq(['sent_one@example.com'])
    end

    it 'records nothing when HubSpot refuses the contact or the call raises' do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      u = adult_supporter('refused@example.com')
      expect(Typhoeus).to receive(:post).and_return(OpenStruct.new(code: '409'))
      ExternalTracker.persist_new_user(u.global_id)
      expect(ExternalTracker.sent_emails(u.reload)).to eq([])
      expect(Typhoeus).to receive(:post).and_raise(Timeout::Error)
      ExternalTracker.persist_new_user(u.global_id)
      expect(ExternalTracker.sent_emails(u.reload)).to eq([])
    end
  end

  describe 'Flusher.flush_user_completely' do
    it 'schedules removal of the recorded address, after the account row is gone' do
      u = adult_supporter('to_remove@example.com')
      u.settings['hubspot'] = { 'sent_emails' => ['to_remove@example.com'] }
      u.save!
      Flusher.flush_user_completely(u.global_id, u.user_name)
      expect(User.find_by(id: u.id)).to eq(nil)
      expect(Worker.scheduled?(ExternalTracker, :remove_contact, ['to_remove@example.com'])).to eq(true)
    end

    it 'schedules nothing for an account that was never sent, whatever addresses it holds' do
      u = User.create
      u.settings['email'] = 'never_sent@example.com'
      u.settings['old_emails'] = ['older_never_sent@example.com']
      u.save!
      Flusher.flush_user_completely(u.global_id, u.user_name)
      expect(User.find_by(id: u.id)).to eq(nil)
      expect(Worker.scheduled_actions.select { |a| a.to_s.include?('remove_contact') }).to eq([])
    end

    it 'schedules nothing when the deletion does not go ahead' do
      u = adult_supporter('kept@example.com')
      u.settings['hubspot'] = { 'sent_emails' => ['kept@example.com'] }
      u.save!
      allow(User).to receive(:scheduled_deletion_proceeds?).with(u.id).and_return(false)
      expect(Flusher.flush_user_completely(u.global_id, u.user_name)).to eq(false)
      expect(User.find_by(id: u.id)).not_to eq(nil)
      expect(Worker.scheduled_actions.select { |a| a.to_s.include?('remove_contact') }).to eq([])
    end

    it 'schedules nothing when the deletion fails part way, so a surviving account keeps its contact' do
      u = adult_supporter('survivor@example.com')
      u.settings['hubspot'] = { 'sent_emails' => ['survivor@example.com'] }
      u.save!
      allow(Flusher).to receive(:flush_record).and_call_original
      allow(Flusher).to receive(:flush_record).with(anything, u.id, 'User').and_raise('boom')
      expect { Flusher.flush_user_completely(u.global_id, u.user_name) }.to raise_error('boom')
      expect(Worker.scheduled_actions.select { |a| a.to_s.include?('remove_contact') }).to eq([])
    end

    it 'still deletes the account when scheduling the removal fails' do
      u = adult_supporter('sched_fail@example.com')
      u.settings['hubspot'] = { 'sent_emails' => ['sched_fail@example.com'] }
      u.save!
      allow(Worker).to receive(:schedule).and_call_original
      allow(Worker).to receive(:schedule).with(ExternalTracker, :remove_contact, anything).and_raise('redis down')
      expect { Flusher.flush_user_completely(u.global_id, u.user_name) }.not_to raise_error
      expect(User.find_by(id: u.id)).to eq(nil)
    end
  end

  describe 'ExternalTracker.remove_contact' do
    it 'makes no call without a HubSpot token' do
      ENV.delete('HUBSPOT_ACCESS_TOKEN')
      expect(Typhoeus).not_to receive(:post)
      expect(ExternalTracker.remove_contact(['a@example.com'])).to eq(false)
    end

    it "calls HubSpot's permanent delete once per address, keyed by email" do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      calls = []
      allow(Typhoeus).to receive(:post) { |url, opts| calls << [url, JSON.parse(opts[:body]), opts[:headers], opts[:timeout]]; OpenStruct.new(code: 204) }
      expect(ExternalTracker.remove_contact(['a@example.com', 'b@example.com', 'a@example.com', '', nil])).to eq(true)
      expect(calls.map(&:first).uniq).to eq([DELETE_URL])
      expect(calls.map { |c| c[1] }).to eq([{ 'objectId' => 'a@example.com', 'idProperty' => 'email' },
                                           { 'objectId' => 'b@example.com', 'idProperty' => 'email' }])
      expect(calls.first[2]['Authorization']).to eq('Bearer hubby')
      expect(calls.first[3]).to be_present
    end

    it 'treats 404 as done and schedules no retry' do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(code: 404))
      expect(ExternalTracker.remove_contact(['gone@example.com'])).to eq(true)
      expect(Worker.scheduled_actions).to eq([])
    end

    it 'retries only the addresses that failed, and never raises' do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      allow(Typhoeus).to receive(:post) do |_url, opts|
        JSON.parse(opts[:body])['objectId'] == 'ok@example.com' ? OpenStruct.new(code: 204) : OpenStruct.new(code: 500)
      end
      expect(ExternalTracker.remove_contact(['ok@example.com', 'fails@example.com'])).to eq(false)
      expect(Worker.scheduled?(ExternalTracker, :remove_contact, ['fails@example.com'], 2)).to eq(true)
      allow(Typhoeus).to receive(:post).and_raise(Timeout::Error)
      expect(ExternalTracker.remove_contact(['raises@example.com'])).to eq(false)
      expect(Worker.scheduled?(ExternalTracker, :remove_contact, ['raises@example.com'], 2)).to eq(true)
    end

    it 'gives up after the last attempt instead of retrying forever' do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(code: 500))
      expect(ExternalTracker.remove_contact(['fails@example.com'], ExternalTracker::REMOVE_CONTACT_ATTEMPTS)).to eq(false)
      expect(Worker.scheduled_actions).to eq([])
    end

    it 'never writes an address to the log' do
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      logged = []
      allow(Rails.logger).to receive(:error) { |msg| logged << msg.to_s }
      allow(Rails.logger).to receive(:warn) { |msg| logged << msg.to_s }
      allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(code: 500))
      ExternalTracker.remove_contact(['secret_person@example.com'], ExternalTracker::REMOVE_CONTACT_ATTEMPTS)
      allow(Typhoeus).to receive(:post).and_raise(RuntimeError, 'failed for secret_person@example.com')
      ExternalTracker.remove_contact(['secret_person@example.com'])
      expect(logged).not_to be_empty
      expect(logged.join("\n")).not_to include('secret_person')
    end
  end
end
