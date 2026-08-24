class Api::SystemEmailTemplatesController < ApplicationController
  include Api::SystemSettingsAccess

  before_action :require_api_token
  before_action :require_system_settings_access
  before_action :require_system_settings_read_scope!, only: [:index, :show, :preview]
  before_action :require_system_settings_write_scope!, only: [:update, :destroy]
  before_action :load_template_entry, only: [:show, :update, :destroy, :preview]

  # GET /api/v1/system_email_templates?org_id=default|#global_id#
  def index
    org, scope_id = resolve_org_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} if params[:org_id].present? && params[:org_id] != 'default' && scope_id.nil?

    templates = SystemEmailRegistry.all.map do |entry|
      content = SystemEmailTemplates.effective_content(entry[:key], org)
      entry.merge(
        is_customized: content[:is_customized],
        subject: content[:subject]
      )
    end

    render json: {
      org_id: scope_id || 'default',
      templates: templates,
      categories: SystemEmailRegistry.categories
    }.to_json
  end

  # GET /api/v1/system_email_templates/:id  (id = user_mailer.confirm_registration)
  def show
    org, scope_id = resolve_org_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} if params[:org_id].present? && params[:org_id] != 'default' && scope_id.nil?

    render json: {
      org_id: scope_id || 'default',
      template: template_payload(@entry, org, scope_id)
    }.to_json
  end

  # PUT /api/v1/system_email_templates/:id
  def update
    org, scope_id = resolve_org_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} if params[:org_id].present? && params[:org_id] != 'default' && scope_id.nil?

    attrs = params[:template] || params[:system_email_template] || params
    if attrs.respond_to?(:permit)
      attrs = attrs.permit(:subject, :html_body, :text_body, i18n_overrides: {})
    end
    saved = SystemEmailTemplates.set_template!(org, @entry[:key], attrs)
    render json: {org_id: scope_id || 'default', template: template_payload(@entry, org, scope_id)}.to_json
  rescue ArgumentError => e
    api_error 400, {error: e.message}
  end

  # DELETE /api/v1/system_email_templates/:id
  def destroy
    org, scope_id = resolve_org_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} if params[:org_id].present? && params[:org_id] != 'default' && scope_id.nil?

    SystemEmailTemplates.clear_template!(org, @entry[:key])
    render json: {
      org_id: scope_id || 'default',
      template: template_payload(@entry, org, scope_id)
    }.to_json
  end

  # POST /api/v1/system_email_templates/:id/preview
  def preview
    org, scope_id = resolve_org_scope(params[:org_id])
    return api_error 404, {error: 'Organization not found'} if params[:org_id].present? && params[:org_id] != 'default' && scope_id.nil?

    attrs = params[:template] || {}
    if attrs.respond_to?(:permit)
      attrs = attrs.permit(:subject, :html_body, :text_body, i18n_overrides: {})
    end
    user = SystemEmailPreview.sample_user

    if org && org.settings['hosts']&.first
      JsonApi::Json.load_domain(org.settings['hosts'].first)
    else
      JsonApi::Json.load_domain('default')
    end

    branding = SystemAppDefaults.branding_for_org(org)
    preview_i18n = build_preview_i18n(attrs[:i18n_overrides])
    app_name = branding['app_name'] || 'LingoLinq'

    subject = attrs[:subject].presence
    if subject.blank? && @entry[:uses_i18n_subject]
      subject_key = SystemEmailI18n.subject_key_for(@entry)
      subject = preview_i18n[subject_key] if subject_key && preview_i18n[subject_key].present?
      subject ||= SystemEmailI18n.resolved_subject(@entry[:key], org, @entry, 'app_name' => app_name)
    end
    subject ||= @entry[:default_subject]
    subject = "#{app_name} - #{subject}" unless @entry[:uses_i18n_subject]

    html_custom = attrs[:html_body].presence
    text_custom = attrs[:text_body].presence
    html_template = html_custom || SystemEmailTemplates.default_body(@entry[:key], 'html') || ''
    text_template = text_custom || SystemEmailTemplates.default_body(@entry[:key], 'text') || ''
    sample_consent_url = "#{JsonApi::Json.absolute_host}/parental_consent/complete?user_id=#{user.global_id}&token=sample-token"
    sample_revoke_url = "#{JsonApi::Json.absolute_host}/parental_consent/revoke?user_id=#{user.global_id}&token=sample-revoke-token"
    sample_granted_at = Time.now.utc
    sample_revoked_at = Time.now.utc

    preview_binding = preview_binding_for(user, branding, preview_i18n, sample_consent_url, sample_revoke_url, sample_granted_at, sample_revoked_at)
    html = SystemEmailTemplates.render_string(html_template, preview_binding, validate: !!html_custom)
    text = SystemEmailTemplates.render_string(text_template, preview_binding, validate: !!text_custom)

    render json: {
      subject: subject,
      html_body: html,
      text_body: text,
      note: 'Preview uses synthetic sample data for variables like @consent_url.'
    }.to_json
  end

  private

  def template_payload(entry, org, scope_id)
    content = SystemEmailTemplates.effective_content(entry[:key], org)
    branding = SystemAppDefaults.branding_for_org(org)
    payload = entry.merge(content).merge(
      org_id: scope_id || 'default',
      branding_variables: branding_variables_payload(branding, scope_id),
      dynamic_variables: entry[:dynamic_variables] || []
    )
    if entry[:i18n_blocks].present?
      payload[:i18n_blocks] = SystemEmailI18n.blocks_for(entry[:key], org, entry)
      payload[:has_i18n_blocks] = true
    else
      payload[:has_i18n_blocks] = false
    end
    payload
  end

  def branding_variables_payload(branding, scope_id)
    SystemAppDefaults::EDITABLE_FIELDS.map do |field|
      {
        key: field,
        value: branding[field],
        editable: false,
        edit_scope: scope_id == 'default' ? 'app_defaults' : 'org_settings',
        org_id: scope_id == 'default' ? nil : scope_id
      }
    end
  end

  def build_preview_i18n(raw_overrides)
    overrides = SystemEmailTemplates.normalize_i18n_overrides(raw_overrides || {})
    (@entry[:i18n_blocks] || []).each_with_object({}) do |block, memo|
      key = block[:key] || block['key']
      memo[key] = overrides[key].presence || I18n.t(key, default: '')
    end
  end

  def preview_binding_for(user, branding, preview_i18n, sample_consent_url, sample_revoke_url = nil, sample_granted_at = nil, sample_revoked_at = nil)
    entry = @entry
    template_key = "#{entry[:mailer]}/#{entry[:action]}"
    helper = Object.new.extend(MailerHelper)
    helper.define_singleton_method(:mailer) do
      OpenStruct.new(mailer_name: entry[:mailer], action_name: entry[:action])
    end
    helper.define_singleton_method(:domain_settings) { branding }
    helper.define_singleton_method(:mailer_t) do |key, interpolations = {}|
      if preview_i18n[key].present?
        text = preview_i18n[key]
        interpolations.present? ? I18n.interpolate(text, interpolations.symbolize_keys) : text
      else
        SystemEmailI18n.resolve(template_key, key, interpolations)
      end
    end
    helper.instance_variable_set(:@user, user)
    helper.instance_variable_set(:@consent_url, sample_consent_url)
    helper.instance_variable_set(:@revoke_url, sample_revoke_url)
    helper.instance_variable_set(:@privacy_url, "#{JsonApi::Json.absolute_host}/privacy")
    helper.instance_variable_set(:@contact_url, "#{JsonApi::Json.absolute_host}/contact")
    helper.instance_variable_set(:@child_name, user.settings['name'])
    helper.instance_variable_set(:@child_username, user.display_user_name)
    helper.instance_variable_set(:@parent_email, (user.settings['coppa'] || {})['parent_email'] || 'parent@example.com')
    helper.instance_variable_set(:@granted_at, sample_granted_at)
    helper.instance_variable_set(:@revoked_at, sample_revoked_at)
    helper.instance_eval { binding }
  end

  def load_template_entry
    key = SystemEmailRegistry.key_from_slug(params[:id])
    @entry = SystemEmailRegistry.find(key)
    unless @entry
      api_error 404, {error: 'Template not found'}
      return
    end
  end
end
