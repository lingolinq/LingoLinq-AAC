require 'spec_helper'

# #1063: the informational notice sent to the account's own email when a school-authorized
# under-13 is handed back to the family.
describe UserMailer, :type => :mailer do
  def handed_back_user(email:)
    u = User.create(settings: {'email' => email, 'name' => 'Handoff Kid'})
    u.settings['school_authorization_ended'] = {
      'basis' => 'school_official',
      'ended_at' => Time.now.utc.iso8601
    }
    u.save!
    u
  end

  it 'mails the account email' do
    o = Organization.create(settings: {'name' => 'Riverside District'})
    u = handed_back_user(email: 'family_handoff@example.com')

    m = UserMailer.school_handoff_notice(u.global_id, o.global_id)

    expect(m.to).to eq(['family_handoff@example.com'])
    expect(m.subject).to be_present
    text = m.body.parts.detect { |p| p.content_type.match(/text\/plain/) }.body.to_s
    expect(text).to include('Riverside District')
  end

  it 'names the organization in the HTML part too' do
    o = Organization.create(settings: {'name' => 'Riverside District'})
    u = handed_back_user(email: 'family_handoff_html@example.com')

    m = UserMailer.school_handoff_notice(u.global_id, o.global_id)

    html = m.body.parts.detect { |p| p.content_type.match(/text\/html/) }.body.to_s
    expect(html).to include('Riverside District')
  end

  it 'still sends when the organization is gone by the time the notice goes out' do
    u = handed_back_user(email: 'family_handoff_unnamed@example.com')

    # '1_0' names no organization (ids start at 1).
    m = UserMailer.school_handoff_notice(u.global_id, '1_0')

    expect(m.to).to eq(['family_handoff_unnamed@example.com'])
    text = m.body.parts.detect { |p| p.content_type.match(/text\/plain/) }.body.to_s
    expect(text).to include('An organization no longer supports')
  end

  # User#school_handoff_blocks_ai? keeps AI off for this account until a parent consents, so a
  # preferences switch alone does not turn it back on.
  it 'says AI stays off until a parent or guardian consents, in both parts' do
    o = Organization.create(settings: {'name' => 'Riverside District'})
    u = handed_back_user(email: 'family_handoff_ai@example.com')
    expect(u.school_handoff_blocks_ai?).to eq(true)

    m = UserMailer.school_handoff_notice(u.global_id, o.global_id)

    m.body.parts.each do |part|
      body = CGI.unescapeHTML(part.body.to_s)
      expect(body).to include('They stay off until a parent or guardian gives consent.')
      expect(body).not_to include('turn them back on')
    end
  end

  # There is no in-app consent step for these accounts yet, so the notice says how to arrange it.
  it 'points the family to the contact page to arrange consent, in both parts' do
    o = Organization.create(settings: {'name' => 'Riverside District'})
    u = handed_back_user(email: 'family_handoff_contact@example.com')

    m = UserMailer.school_handoff_notice(u.global_id, o.global_id)

    m.body.parts.each do |part|
      body = CGI.unescapeHTML(part.body.to_s)
      expect(body).to include('To arrange consent, contact us using the link below.')
      expect(body).to include("#{JsonApi::Json.absolute_host}/contact")
    end
  end

  it 'sends nothing when the account has no email' do
    o = Organization.create
    u = handed_back_user(email: nil)

    m = UserMailer.school_handoff_notice(u.global_id, o.global_id)

    expect(m.to).to be_blank
  end
end
