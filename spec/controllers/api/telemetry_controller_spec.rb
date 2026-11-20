require 'spec_helper'

describe Api::TelemetryController, :type => :controller do
  describe "index" do
    it "requires an api token" do
      get :index
      assert_missing_token
    end

    it "limits global telemetry to super admins" do
      token_user
      @user.settings['feature_flags'] ||= {}
      @user.settings['feature_flags']['telemetry_admin_panel'] = true
      @user.save!

      get :index
      assert_error 'Not authorized', 403
    end

    it "allows super admins to see global telemetry" do
      token_user
      @user.settings['admin'] = true
      @user.save!
      TelemetryEvent.process_new({
        'event_type' => 'route_visit',
        'route' => 'board.index',
        'feature_area' => 'speak_board',
        'data' => {'duration_ms' => 100}
      }, user: @user)

      get :index
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scope']['type']).to eq('global')
      expect(json['summary']['event_count']).to eq(1)
    end
  end

  describe "organization" do
    it "requires an api token" do
      get :organization, params: {organization_id: '1'}
      assert_missing_token
    end

    it "allows org managers to see scoped telemetry" do
      token_user
      @user.settings['feature_flags'] ||= {}
      @user.settings['feature_flags']['telemetry_admin_panel'] = true
      @user.save!
      org = Organization.create(settings: {'total_licenses' => 1})
      org.add_manager(@user.user_name)
      communicator = User.create
      org.add_user(communicator.user_name, false)
      TelemetryEvent.process_new({
        'event_type' => 'route_visit',
        'route' => 'board.index',
        'feature_area' => 'speak_board',
        'data' => {'duration_ms' => 100}
      }, user: communicator, organization: org)

      get :organization, params: {organization_id: org.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scope']['type']).to eq('organization')
      expect(json['summary']['event_count']).to eq(1)
      expect(json['routes'][0]['key']).to eq('board.index')
    end

    it "filters dashboard to a single communicator when filter_user_id is set" do
      token_user
      @user.settings['feature_flags'] ||= {}
      @user.settings['feature_flags']['telemetry_admin_panel'] = true
      @user.save!
      org = Organization.create(settings: {'total_licenses' => 2})
      org.add_manager(@user.user_name)
      alice = User.create
      bob = User.create
      org.add_user(alice.user_name, false)
      org.add_user(bob.user_name, false)
      TelemetryEvent.process_new({
        'event_type' => 'route_visit',
        'route' => 'board.index',
        'feature_area' => 'speak_board',
        'data' => {'duration_ms' => 100}
      }, user: alice, organization: org)
      TelemetryEvent.process_new({
        'event_type' => 'route_visit',
        'route' => 'user.index',
        'feature_area' => 'profile',
        'data' => {'duration_ms' => 100}
      }, user: bob, organization: org)

      get :organization, params: {organization_id: org.global_id, filter_user_id: alice.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['summary']['event_count']).to eq(1)
      expect(json['routes'][0]['key']).to eq('board.index')
    end

    it "limits no-organization telemetry to super admins" do
      token_user
      @user.settings['feature_flags'] ||= {}
      @user.settings['feature_flags']['telemetry_admin_panel'] = true
      @user.save!
      org = Organization.create
      org.add_manager(@user.user_name)

      get :organization, params: {organization_id: org.global_id, scope: 'none'}
      assert_error 'Not authorized', 403
    end

    it "allows super admins to see no-organization telemetry" do
      token_user
      @user.settings['admin'] = true
      @user.save!
      org = Organization.create
      beta_user = User.create
      TelemetryEvent.process_new({
        'event_type' => 'non_activation_tap',
        'route' => 'board.index',
        'feature_area' => 'speak_board',
        'data' => {'percent_x' => 0.5, 'percent_y' => 0.25}
      }, user: beta_user)

      get :organization, params: {organization_id: org.global_id, scope: 'none'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['scope']['type']).to eq('none')
      expect(json['summary']['possible_misclicks']).to eq(1)
      expect(json['heatmap']['max_touches']).to eq(1)
    end
  end

  describe "admin sign-in" do
    LimitedSignInHelpers::KINDS.each do |kind, wording|
      it "should refuse global telemetry to an admin whose sign-in #{wording}" do
        limited_admin_token(kind)
        get :index
        assert_error 'Not authorized', 403
      end

      it "should refuse the admin panel to an admin whose sign-in #{wording}" do
        limited_admin_token(kind)
        org = Organization.create
        get :organization, params: {organization_id: org.global_id}
        assert_error 'Not authorized', 403
      end

      it "should refuse global and no-organization scopes to a panel user whose admin sign-in #{wording}" do
        limited_admin_token(kind)
        @user.settings['feature_flags'] = {'telemetry_admin_panel' => true}
        @user.save!
        org = Organization.create
        get :organization, params: {organization_id: org.global_id, scope: 'global'}
        assert_error 'Not authorized', 403
        get :organization, params: {organization_id: org.global_id, scope: 'none'}
        assert_error 'Not authorized', 403
      end
    end
  end
end
