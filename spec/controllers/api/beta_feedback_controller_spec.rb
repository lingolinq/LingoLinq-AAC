require 'spec_helper'

describe Api::BetaFeedbackController, :type => :controller do
  describe 'index' do
    it 'should require api token' do
      get :index
      assert_missing_token
    end

    it 'should return forbidden for a non-admin user' do
      token_user
      get :index
      assert_error('Not authorized', 403)
    end

    it 'should return beta feedback for an admin org full manager' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      m = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Summary',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'x' * 12
      })
      expect(m.recipient).to eq('beta_feedback')

      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['beta_feedback'].length).to eq(1)
      expect(json['beta_feedback'][0]['id']).to eq(m.global_id)
      expect(json['beta_feedback'][0]['has_screenshot']).to eq(false)
      expect(json['beta_feedback'][0]['general_feedback_preview']).to be_present
      expect(json['beta_feedback'][0]['general_feedback']).to eq(nil)
    end

    it 'should return beta feedback for a user with settings admin' do
      token_user
      @user.settings['admin'] = true
      @user.save

      ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'S2',
        'feedback_type' => 'other',
        'severity' => 'suggestion',
        'general_feedback' => 'y' * 12
      })

      get :index
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['beta_feedback'].length).to eq(1)
    end

    it 'should exclude hidden beta feedback' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      visible = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Visible summary',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'a' * 12
      })
      hidden = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Hidden summary',
        'feedback_type' => 'other',
        'severity' => 'suggestion',
        'general_feedback' => 'b' * 12
      })
      hidden.update_column(:hidden, true)

      get :index
      json = JSON.parse(response.body)
      expect(json['beta_feedback'].length).to eq(1)
      expect(json['beta_feedback'][0]['id']).to eq(visible.global_id)
    end

    it 'should list only hidden beta feedback when filter_type is hidden' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Visible summary',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'a' * 12
      })
      hidden = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Hidden summary',
        'feedback_type' => 'other',
        'severity' => 'suggestion',
        'general_feedback' => 'b' * 12
      })
      hidden.update_column(:hidden, true)

      get :index, params: {filter_type: 'hidden'}
      json = JSON.parse(response.body)
      expect(json['beta_feedback'].length).to eq(1)
      expect(json['beta_feedback'][0]['id']).to eq(hidden.global_id)
    end

    it 'should filter by search query on denormalized columns' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Alpha unique',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'c' * 12
      })
      ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Beta other',
        'feedback_type' => 'other',
        'severity' => 'suggestion',
        'general_feedback' => 'd' * 12
      })

      get :index, params: {q: 'Alpha'}
      json = JSON.parse(response.body)
      expect(json['beta_feedback'].length).to eq(1)
      expect(json['beta_feedback'][0]['subject']).to eq('Alpha unique')
    end

    it 'should sort by beta_subject ascending' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Zebra',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'e' * 12
      })
      ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Apple',
        'feedback_type' => 'other',
        'severity' => 'suggestion',
        'general_feedback' => 'f' * 12
      })

      get :index, params: {sort_by: 'beta_subject', sort_order: 'asc'}
      json = JSON.parse(response.body)
      expect(json['beta_feedback'].map { |r| r['subject'] }).to eq(%w[Apple Zebra])
    end
  end

  describe 'show' do
    it 'should require api token' do
      get :show, params: {id: '1_1'}
      assert_missing_token
    end

    it 'should return forbidden for a non-admin user' do
      token_user
      m = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Summary',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'x' * 12
      })
      get :show, params: {id: m.global_id}
      assert_error('Not authorized', 403)
    end

    it 'should return detail for admin' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      m = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Full detail',
        'feedback_type' => 'boards',
        'severity' => 'minor',
        'general_feedback' => 'Detail text here ok',
        'steps_to_reproduce' => 'Step one'
      })

      get :show, params: {id: m.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['beta_feedback']['id']).to eq(m.global_id)
      expect(json['beta_feedback']['general_feedback']).to eq('Detail text here ok')
      expect(json['beta_feedback']['steps_to_reproduce']).to eq('Step one')
    end

    it 'should 404 for non-beta message' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      m = ContactMessage.process_new({
        'name' => 'Bob',
        'email' => 'bob@example.com',
        'subject' => 'ok',
        'recipient' => 'nobody',
        'message' => 'hi'
      })

      get :show, params: {id: m.global_id}
      assert_error('Record not found', 404)
    end
  end

  describe 'update' do
    it 'should require api token' do
      patch :update, params: {id: '1_1', beta_feedback: {hidden: true}}
      assert_missing_token
    end

    it 'should return forbidden for a non-admin user' do
      token_user
      m = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'Patch test',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'g' * 12
      })
      patch :update, params: {id: m.global_id, beta_feedback: {hidden: true}}
      assert_error('Not authorized', 403)
    end

    it 'should set hidden for admin' do
      admin_org = Organization.create(admin: true)
      token_user
      admin_org.add_manager(@user.user_name, true)

      m = ContactMessage.process_new({
        'recipient' => 'beta_feedback',
        'subject' => 'To hide',
        'feedback_type' => 'crash',
        'severity' => 'major',
        'general_feedback' => 'h' * 12
      })
      expect(m.hidden).to eq(false)

      patch :update, params: {id: m.global_id, beta_feedback: {hidden: true}}
      expect(response.successful?).to eq(true)
      m.reload
      expect(m.hidden).to eq(true)
      json = JSON.parse(response.body)
      expect(json['beta_feedback']['id']).to eq(m.global_id)
    end
  end
end
