# frozen_string_literal: true

# Signs a controller spec in as an admin (settings['admin']) whose token is not a full sign-in,
# for the specs of the admin entry points that ApplicationController#admin_sign_in? guards. Sets
# @user, @device and the request headers the way token_user (spec/spec_helper.rb) does.
#
# kind:
#   :pending_2fa  the account uses 2FA and this sign-in has not entered a code yet
#                 (Device#generate_token! marks it pending)
#   :third_party  a token issued to another app (developer_key_id other than 0)
#   :valet        a modeling (valet) sign-in
# admin_org_manager: true makes the account a full manager of the admin organization instead of
# setting settings['admin'], for entry points that check Organization.admin_manager?.
module LimitedSignInHelpers
  # Example-name wording for each kind.
  KINDS = {
    pending_2fa: 'has not entered its second-factor code',
    third_party: 'was issued to another app',
    valet: 'is a modeling sign-in'
  }.freeze

  def limited_admin_token(kind, admin_org_manager: false)
    @user = User.create
    if admin_org_manager
      admin_org = Organization.admin || Organization.create!(admin: true)
      admin_org.add_manager(@user.user_name, true)
      @user.reload
    else
      @user.settings['admin'] = true
      @user.save!
    end
    @user.assert_2fa! if kind == :pending_2fa
    @device = Device.create(user: @user, developer_key_id: (kind == :third_party ? 1 : 0), device_key: "limited-#{kind}")
    @device.settings['permission_scopes'] = ['read_profile'] if kind == :third_party
    @device.settings['valet'] = true if kind == :valet
    @device.save!
    request.headers['Authorization'] = "Bearer #{@device.tokens[0]}"
    request.headers['Check-Token'] = "true"
    expect(@device.reload.settings['2fa']['pending']).to eq(true) if kind == :pending_2fa
  end
end

RSpec.configure do |config|
  config.include LimitedSignInHelpers, type: :controller
end
