require "spec_helper"

describe SupervisorMailer, :type => :mailer do
  after(:each) do
    JsonApi::Json.load_domain("default")
  end

  def create_relationship(opts = {})
    supervisor = opts[:supervisor] || User.create(settings: {
      'name' => 'Jane Smith',
      'email' => 'jane@example.com'
    })
    communicator = opts[:communicator] || User.create(settings: {
      'name' => 'Bob Jones',
      'email' => 'bob@example.com'
    })
    org = opts[:organization]
    rel = SupervisorRelationship.create(
      supervisor_user: supervisor,
      communicator_user: communicator,
      permission_level: opts[:permission_level] || 'edit_boards',
      status: opts[:status] || 'pending',
      initiated_by: 'supervisor',
      creation_method: 'manual',
      organization: org
    )
    rel.generate_consent_token!
    rel.save
    rel
  end

  describe "schedule_delivery" do
    it "should schedule deliveries" do
      SupervisorMailer.schedule_delivery('consent_request', 'abc')
      expect(Worker.scheduled_for?('priority', SupervisorMailer, :deliver_message, 'consent_request', 'abc')).to eq(true)
    end
  end

  describe "consent_request" do
    it "should send to the communicator" do
      rel = create_relationship
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.consent_request(rel.global_id)
      expect(m.subject).to eq("LingoLinq - Supervisor Access Request")
      expect(m.to).to eq(["bob@example.com"])
    end

    it "should include supervisor name and permission description in html" do
      rel = create_relationship
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.consent_request(rel.global_id)
      html = message_body(m, :html)
      expect(html).to match(/Jane Smith/)
      expect(html).to match(/Can view and edit communication boards/i)
      expect(html).to match(/Approve Access/)
      expect(html).to match(/Deny Request/)
    end

    it "should include supervisor name and permission description in text" do
      rel = create_relationship
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.consent_request(rel.global_id)
      text = message_body(m, :text)
      expect(text).to match(/Jane Smith/)
      expect(text).to match(/approve/)
      expect(text).to match(/deny/)
    end

    it "should include organization name when present" do
      org = Organization.create
      org.settings['name'] = 'Sunshine School'
      org.save
      rel = create_relationship(organization: org)
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.consent_request(rel.global_id)
      html = message_body(m, :html)
      expect(html).to match(/Sunshine School/)
    end

    it "should use signed token URLs, not bare record IDs" do
      rel = create_relationship
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.consent_request(rel.global_id)
      html = message_body(m, :html)
      expect(html).to match(/consent\/#{rel.consent_response_token}\?action=approve/)
      expect(html).to match(/consent\/#{rel.consent_response_token}\?action=deny/)
      expect(html).not_to match(/supervisor_relationship.*#{rel.id}/)
    end

    it "should not send if relationship is not pending" do
      rel = create_relationship(status: 'approved')
      m = SupervisorMailer.consent_request(rel.global_id)
      expect(m.message).to be_a(ActionMailer::Base::NullMail)
    end

    it "should not send if communicator is missing" do
      rel = create_relationship
      allow_any_instance_of(SupervisorRelationship).to receive(:communicator_user).and_return(nil)
      m = SupervisorMailer.consent_request(rel.global_id)
      expect(m.message).to be_a(ActionMailer::Base::NullMail)
    end

    it "should include expiration notice" do
      rel = create_relationship
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.consent_request(rel.global_id)
      html = message_body(m, :html)
      expect(html).to match(/expire in 14 days/)
    end
  end

  describe "consent_approved" do
    it "should send to the supervisor" do
      rel = create_relationship(status: 'approved')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.consent_approved(rel.global_id)
      expect(m.subject).to eq("LingoLinq - Supervisor Access Approved")
      expect(m.to).to eq(["jane@example.com"])
    end

    it "should include communicator name and permission level in html" do
      rel = create_relationship(status: 'approved')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.consent_approved(rel.global_id)
      html = message_body(m, :html)
      expect(html).to match(/Bob Jones/)
      expect(html).to match(/approved/)
    end

    it "should include communicator name in text" do
      rel = create_relationship(status: 'approved')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.consent_approved(rel.global_id)
      text = message_body(m, :text)
      expect(text).to match(/Bob Jones/)
    end

    it "should not send if supervisor is missing" do
      rel = create_relationship(status: 'approved')
      allow_any_instance_of(SupervisorRelationship).to receive(:supervisor_user).and_return(nil)
      m = SupervisorMailer.consent_approved(rel.global_id)
      expect(m.message).to be_a(ActionMailer::Base::NullMail)
    end
  end

  describe "consent_denied" do
    it "should send to the supervisor" do
      rel = create_relationship(status: 'denied')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.consent_denied(rel.global_id)
      expect(m.subject).to eq("LingoLinq - Supervisor Access Denied")
      expect(m.to).to eq(["jane@example.com"])
    end

    it "should include communicator name in html" do
      rel = create_relationship(status: 'denied')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.consent_denied(rel.global_id)
      html = message_body(m, :html)
      expect(html).to match(/Bob Jones/)
      expect(html).to match(/declined/)
    end

    it "should include communicator name in text" do
      rel = create_relationship(status: 'denied')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.consent_denied(rel.global_id)
      text = message_body(m, :text)
      expect(text).to match(/Bob Jones/)
    end
  end

  describe "supervisor_revoked" do
    it "should send to communicator when supervisor revokes" do
      rel = create_relationship(status: 'revoked')
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.supervisor_revoked(rel.global_id, 'supervisor')
      expect(m.subject).to eq("LingoLinq - Supervisor Access Revoked")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/removed their own supervisor access/)
    end

    it "should send to supervisor when communicator revokes" do
      rel = create_relationship(status: 'revoked')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.supervisor_revoked(rel.global_id, 'communicator')
      expect(m.subject).to eq("LingoLinq - Supervisor Access Revoked")
      expect(m.to).to eq(["jane@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/removed your supervisor access/)
    end

    it "should include permission description in html" do
      rel = create_relationship(status: 'revoked')
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = SupervisorMailer.supervisor_revoked(rel.global_id, 'supervisor')
      html = message_body(m, :html)
      expect(html).to match(/Can view and edit communication boards/i)
    end

    it "should include revocation info in text" do
      rel = create_relationship(status: 'revoked')
      expect_any_instance_of(User).to receive(:named_email).and_return("jane@example.com")
      m = SupervisorMailer.supervisor_revoked(rel.global_id, 'communicator')
      text = message_body(m, :text)
      expect(text).to match(/removed your supervisor access/)
    end

    it "should not send if recipient is missing" do
      rel = create_relationship(status: 'revoked')
      allow_any_instance_of(SupervisorRelationship).to receive(:communicator_user).and_return(nil)
      allow_any_instance_of(SupervisorRelationship).to receive(:supervisor_user).and_return(nil)
      m = SupervisorMailer.supervisor_revoked(rel.global_id, 'supervisor')
      expect(m.message).to be_a(ActionMailer::Base::NullMail)
    end
  end

  describe "no em dashes" do
    it "should not contain em dashes in any template" do
      rel = create_relationship
      allow_any_instance_of(User).to receive(:named_email).and_return("test@example.com")

      m = SupervisorMailer.consent_request(rel.global_id)
      if m
        html = message_body(m, :html)
        text = message_body(m, :text)
        expect(html).not_to match(/\u2014/)
        expect(text).not_to match(/\u2014/)
      end

      rel2 = create_relationship(status: 'approved')
      m2 = SupervisorMailer.consent_approved(rel2.global_id)
      if m2
        html = message_body(m2, :html)
        text = message_body(m2, :text)
        expect(html).not_to match(/\u2014/)
        expect(text).not_to match(/\u2014/)
      end

      rel3 = create_relationship(status: 'denied')
      m3 = SupervisorMailer.consent_denied(rel3.global_id)
      if m3
        html = message_body(m3, :html)
        text = message_body(m3, :text)
        expect(html).not_to match(/\u2014/)
        expect(text).not_to match(/\u2014/)
      end

      rel4 = create_relationship(status: 'revoked')
      m4 = SupervisorMailer.supervisor_revoked(rel4.global_id, 'communicator')
      if m4
        html = message_body(m4, :html)
        text = message_body(m4, :text)
        expect(html).not_to match(/\u2014/)
        expect(text).not_to match(/\u2014/)
      end
    end
  end
end
