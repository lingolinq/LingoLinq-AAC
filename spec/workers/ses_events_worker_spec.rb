require 'spec_helper'
require 'aws-sdk-sqs'

# The SQS client is a real Aws::SQS::Client with stub_responses, so requests are validated
# against the SDK's own API model and nothing reaches the network.
describe SesEventsWorker do
  let(:queue_url) { 'https://sqs.us-west-2.amazonaws.com/123456789012/lingolinq-ses-events' }
  let(:client) { Aws::SQS::Client.new(region: 'us-west-2', stub_responses: true) }

  def with_queue_url(value)
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('SES_EVENTS_QUEUE_URL').and_return(value)
  end

  def sns_body(event)
    {'Type' => 'Notification', 'Message' => event.to_json}.to_json
  end

  def permanent_bounce(address)
    sns_body({'eventType' => 'Bounce', 'mail' => {'messageId' => 'x'},
              'bounce' => {'bounceType' => 'Permanent', 'bounceSubType' => 'General',
                           'bouncedRecipients' => [{'emailAddress' => address}]}})
  end

  def transient_bounce(address)
    sns_body({'eventType' => 'Bounce', 'mail' => {'messageId' => 'x'},
              'bounce' => {'bounceType' => 'Transient', 'bounceSubType' => 'MailboxFull',
                           'bouncedRecipients' => [{'emailAddress' => address}]}})
  end

  def message(id, body)
    {message_id: id, receipt_handle: "rh-#{id}", body: body}
  end

  def stub_batches(*batches)
    client.stub_responses(:receive_message, batches.map { |msgs| {messages: msgs} } + [{messages: []}])
    allow(SesEventsWorker).to receive(:sqs_client).and_return(client)
  end

  def deleted_handles
    client.api_requests.select { |r| r[:operation_name] == :delete_message_batch }
      .flat_map { |r| r[:params][:entries].map { |e| e[:receipt_handle] } }
  end

  it 'runs on the default queue like the other scheduled workers' do
    expect(SesEventsWorker.instance_variable_get(:@queue)).to eq(:default)
  end

  it 'is a no-op when SES_EVENTS_QUEUE_URL is unset' do
    with_queue_url(nil)
    expect(SesEventsWorker).not_to receive(:sqs_client)
    expect(SesEventsWorker.perform).to eq({skipped: true})
  end

  it 'is a no-op when SES_EVENTS_QUEUE_URL is blank' do
    with_queue_url('  ')
    expect(SesEventsWorker).not_to receive(:sqs_client)
    expect(SesEventsWorker.perform).to eq({skipped: true})
  end

  it 'disables the user matching a permanent bounce and deletes the message' do
    with_queue_url(queue_url)
    u = User.create(:settings => {'email' => 'gone@example.com'})
    other = User.create(:settings => {'email' => 'fine@example.com'})
    stub_batches([message('1', permanent_bounce('gone@example.com'))])
    res = SesEventsWorker.perform
    expect(u.reload.settings['email_disabled']).to eq(true)
    expect(other.reload.settings['email_disabled']).to eq(nil)
    expect(deleted_handles).to eq(['rh-1'])
    expect(res[:disabled_addresses]).to eq(1)
    expect(res[:by_type]).to eq({'Bounce:Permanent' => 1})
  end

  it 'does nothing to the user for a transient bounce, and deletes the message' do
    with_queue_url(queue_url)
    u = User.create(:settings => {'email' => 'full@example.com'})
    stub_batches([message('1', transient_bounce('full@example.com'))])
    expect(UserMailer).not_to receive(:bounce_email)
    res = SesEventsWorker.perform
    expect(u.reload.settings['email_disabled']).to eq(nil)
    expect(deleted_handles).to eq(['rh-1'])
    expect(res[:ignored]).to eq(1)
  end

  it 'deletes and counts a malformed message so it cannot loop' do
    with_queue_url(queue_url)
    stub_batches([message('1', 'not json'), message('2', transient_bounce('x@example.com'))])
    res = SesEventsWorker.perform
    expect(res[:malformed]).to eq(1)
    expect(deleted_handles).to match_array(['rh-1', 'rh-2'])
  end

  it 'does not delete a message whose handling raised, keeps going, then fails the run' do
    with_queue_url(queue_url)
    stub_batches([message('1', permanent_bounce('a@example.com')), message('2', permanent_bounce('b@example.com'))])
    allow(UserMailer).to receive(:bounce_email).and_call_original
    allow(UserMailer).to receive(:bounce_email).with('a@example.com').and_raise(ActiveRecord::ConnectionNotEstablished)
    expect { SesEventsWorker.perform }.to raise_error(SesEventsWorker::HandlingFailed, /1 SES event/)
    expect(deleted_handles).to eq(['rh-2'])
  end

  it 'attributes the settings change to the SES events worker, then restores whodunnit' do
    with_queue_url(queue_url)
    stub_batches([message('1', permanent_bounce('a@example.com'))])
    seen = nil
    allow(UserMailer).to receive(:bounce_email) { seen = PaperTrail.request.whodunnit }
    PaperTrail.request.whodunnit = 'before'
    SesEventsWorker.perform
    expect(seen).to eq('system:ses-events')
    expect(PaperTrail.request.whodunnit).to eq('before')
  ensure
    PaperTrail.request.whodunnit = nil
  end

  it 'deletes a complaint without disabling anyone' do
    with_queue_url(queue_url)
    u = User.create(:settings => {'email' => 'grumpy@example.com'})
    body = sns_body({'eventType' => 'Complaint', 'complaint' => {'complaintFeedbackType' => 'abuse',
      'complainedRecipients' => [{'emailAddress' => 'grumpy@example.com'}]}})
    stub_batches([message('1', body)])
    res = SesEventsWorker.perform
    expect(u.reload.settings['email_disabled']).to eq(nil)
    expect(deleted_handles).to eq(['rh-1'])
    expect(res[:by_type]).to eq({'Complaint' => 1})
  end

  it 'handles a message before deleting it' do
    with_queue_url(queue_url)
    stub_batches([message('1', permanent_bounce('a@example.com'))])
    order = []
    allow(UserMailer).to receive(:bounce_email) { order << :handled }
    allow(client).to receive(:delete_message_batch).and_wrap_original { |m, *args| order << :deleted; m.call(*args) }
    SesEventsWorker.perform
    expect(order).to eq([:handled, :deleted])
  end

  it 'stops after the batch limit even when messages remain' do
    with_queue_url(queue_url)
    batch = [message('1', transient_bounce('a@example.com'))]
    client.stub_responses(:receive_message, {messages: batch})
    allow(SesEventsWorker).to receive(:sqs_client).and_return(client)
    res = SesEventsWorker.perform(max_batches: 3)
    receives = client.api_requests.count { |r| r[:operation_name] == :receive_message }
    expect(receives).to eq(3)
    expect(res[:received]).to eq(3)
  end

  it 'stops early on an empty receive' do
    with_queue_url(queue_url)
    stub_batches([message('1', transient_bounce('a@example.com'))])
    SesEventsWorker.perform(max_batches: 50)
    receives = client.api_requests.count { |r| r[:operation_name] == :receive_message }
    expect(receives).to eq(2)
  end

  it 'never passes a blank address to bounce_email' do
    with_queue_url(queue_url)
    body = sns_body({'eventType' => 'Bounce', 'bounce' => {'bounceType' => 'Permanent',
      'bouncedRecipients' => [{'emailAddress' => ''}, {}]}})
    no_email = User.create
    stub_batches([message('1', body)])
    expect(UserMailer).not_to receive(:bounce_email)
    SesEventsWorker.perform
    expect(no_email.reload.settings['email_disabled']).to eq(nil)
    expect(deleted_handles).to eq(['rh-1'])
  end

  it 'logs counts and event types only, never an address or the payload' do
    with_queue_url(queue_url)
    User.create(:settings => {'email' => 'secret.person@example.com'})
    stub_batches([message('1', permanent_bounce('secret.person@example.com')), message('2', 'garbage {payload')])
    lines = []
    allow(Rails.logger).to receive(:info) { |msg| lines << msg.to_s }
    allow(Rails.logger).to receive(:warn) { |msg| lines << msg.to_s }
    allow(Rails.logger).to receive(:error) { |msg| lines << msg.to_s }
    SesEventsWorker.perform
    expect(lines.join("\n")).to include('[SES events]')
    expect(lines.join("\n")).not_to include('@')
    expect(lines.join("\n")).not_to include('garbage')
  end
end
