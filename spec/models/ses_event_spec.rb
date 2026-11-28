require 'spec_helper'

# Event shapes follow the AWS SES Developer Guide, "Contents of event data that Amazon SES
# publishes to Amazon SNS" (cited in docs/task-management/2026-10-14_ses-bounce-handling.md).
# The queue is subscribed to SNS without raw delivery (scripts/gcp/phase5-ses-config-set-setup.sh),
# so each SQS body is an SNS envelope whose Message field holds the SES event as a string.
describe SesEvent do
  def sns_body(event)
    {'Type' => 'Notification', 'MessageId' => 'm-1', 'TopicArn' => 'arn:aws:sns:us-west-2:1:t',
     'Message' => event.to_json}.to_json
  end

  def bounce(type, subtype, addresses)
    {'eventType' => 'Bounce', 'mail' => {'messageId' => 'x'},
     'bounce' => {'bounceType' => type, 'bounceSubType' => subtype,
                  'bouncedRecipients' => addresses.map { |a| {'emailAddress' => a} }}}
  end

  def complaint(addresses, feedback_type = 'abuse')
    {'eventType' => 'Complaint', 'mail' => {'messageId' => 'x'},
     'complaint' => {'complaintFeedbackType' => feedback_type,
                     'complainedRecipients' => addresses.map { |a| {'emailAddress' => a} }}}
  end

  it 'disables every recipient of a permanent bounce' do
    r = SesEvent.classify(sns_body(bounce('Permanent', 'General', ['a@example.com', 'b@example.com'])))
    expect(r.action).to eq(:disable)
    expect(r.addresses).to eq(['a@example.com', 'b@example.com'])
    expect(r.label).to eq('Bounce:Permanent')
  end

  # bouncedRecipients can come from a DSN's Final-Recipient field, which the bouncing server
  # writes; only addresses the mail was actually sent to may be disabled.
  it 'drops a bounced address the mail was not sent to' do
    event = bounce('Permanent', 'General', ['victim@example.com', 'Real@Example.com'])
    event['mail']['destination'] = ['Someone <real@example.com>']
    r = SesEvent.classify(sns_body(event))
    expect(r.action).to eq(:disable)
    expect(r.addresses).to eq(['Real@Example.com'])
  end

  it 'ignores a permanent bounce when none of its addresses was a recipient' do
    event = bounce('Permanent', 'General', ['victim@example.com'])
    event['mail']['destination'] = ['real@example.com']
    r = SesEvent.classify(sns_body(event))
    expect(r.action).to eq(:ignore)
    expect(r.addresses).to eq([])
    expect(r.label).to eq('Bounce:Mismatch')
  end

  it 'disables an address SES reports as on the account suppression list' do
    r = SesEvent.classify(sns_body(bounce('Permanent', 'OnAccountSuppressionList', ['a@example.com'])))
    expect(r.action).to eq(:disable)
    expect(r.addresses).to eq(['a@example.com'])
  end

  it 'ignores a transient bounce' do
    r = SesEvent.classify(sns_body(bounce('Transient', 'MailboxFull', ['a@example.com'])))
    expect(r.action).to eq(:ignore)
    expect(r.addresses).to eq([])
    expect(r.label).to eq('Bounce:Transient')
  end

  it 'ignores an undetermined bounce' do
    r = SesEvent.classify(sns_body(bounce('Undetermined', 'Undetermined', ['a@example.com'])))
    expect(r.action).to eq(:ignore)
  end

  # Complaints are counted, not acted on: disabling would also block password reset for every
  # account on that address (users_controller#forgot_password). Owner decision; see ses_event.rb.
  it 'counts a complaint without disabling anyone' do
    r = SesEvent.classify(sns_body(complaint(['a@example.com'])))
    expect(r.action).to eq(:ignore)
    expect(r.addresses).to eq([])
    expect(r.label).to eq('Complaint')
  end

  it 'labels a not-spam complaint separately' do
    r = SesEvent.classify(sns_body(complaint(['a@example.com'], 'not-spam')))
    expect(r.action).to eq(:ignore)
    expect(r.label).to eq('Complaint:not-spam')
  end

  it 'raises Malformed for a complaint without a complaint object' do
    expect { SesEvent.classify(sns_body({'eventType' => 'Complaint'})) }.to raise_error(SesEvent::Malformed)
  end

  %w[Send Delivery DeliveryDelay Reject].each do |type|
    it "ignores a #{type} event" do
      r = SesEvent.classify(sns_body({'eventType' => type, 'mail' => {'messageId' => 'x'}}))
      expect(r.action).to eq(:ignore)
      expect(r.label).to eq(type)
    end
  end

  it 'reports an unknown event type as Other, never echoing the payload value' do
    r = SesEvent.classify(sns_body({'eventType' => 'someone@example.com', 'mail' => {}}))
    expect(r.action).to eq(:ignore)
    expect(r.label).to eq('Other')
  end

  it 'accepts the identity-notification field name notificationType' do
    event = bounce('Permanent', 'General', ['a@example.com'])
    event['notificationType'] = event.delete('eventType')
    expect(SesEvent.classify(sns_body(event)).action).to eq(:disable)
  end

  it 'accepts a raw SES event body (raw message delivery)' do
    r = SesEvent.classify(bounce('Permanent', 'General', ['a@example.com']).to_json)
    expect(r.action).to eq(:disable)
  end

  it 'extracts the bare address from a display-name form and drops blank or address-less entries' do
    r = SesEvent.classify(sns_body(bounce('Permanent', 'General',
      ['Bob <bob@example.com>', '', nil, 'not-an-address', ' c@example.com '])))
    expect(r.addresses).to eq(['bob@example.com', 'c@example.com'])
  end

  it 'raises Malformed for a body that is not JSON' do
    expect { SesEvent.classify('not json') }.to raise_error(SesEvent::Malformed)
  end

  it 'raises Malformed for an SNS envelope whose Message is not JSON' do
    body = {'Type' => 'Notification', 'Message' => 'nope'}.to_json
    expect { SesEvent.classify(body) }.to raise_error(SesEvent::Malformed)
  end

  it 'raises Malformed when there is no event type' do
    expect { SesEvent.classify(sns_body({'mail' => {}})) }.to raise_error(SesEvent::Malformed)
  end

  it 'raises Malformed for a bounce without a bounce object' do
    expect { SesEvent.classify(sns_body({'eventType' => 'Bounce'})) }.to raise_error(SesEvent::Malformed)
  end

  it 'raises Malformed for a JSON body that is not an object' do
    expect { SesEvent.classify('[1,2]') }.to raise_error(SesEvent::Malformed)
    expect { SesEvent.classify(nil) }.to raise_error(SesEvent::Malformed)
  end

  it 'never puts an address in the Malformed message' do
    begin
      SesEvent.classify(sns_body({'eventType' => 'Bounce', 'bounce' => 'a@example.com'}))
      raise 'expected Malformed'
    rescue SesEvent::Malformed => e
      expect(e.message).not_to include('@')
    end
  end
end
