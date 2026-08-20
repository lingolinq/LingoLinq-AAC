class Api::IntegrationsController < ApplicationController
  before_action :require_api_token, :except => [:show, :domain_settings]
  
  def index
    integrations = UserIntegration.where(:template => true).order('id ASC')
    if params['user_id']
      user = User.find_by_path(params['user_id'])
      return unless exists?(user, params['user_id'])
      return unless allowed?(user, 'supervise')
      # TODO: sharding
      integrations = UserIntegration.where(:user_id => user.id).order('id DESC')
      if params['for_button']
        integrations = integrations.where(:for_button => true)
      end
    end
    render json: JsonApi::Integration.paginate(params, integrations)
  end
  
  def show
    orig_id = params['id']
    if UserIntegration.global_integrations[params['id']]
      params['id'] = UserIntegration.global_integrations[params['id']]
    end
    integration = UserIntegration.find_by_path(params['id'])
    return unless exists?(integration, orig_id)
    return unless allowed?(integration, 'view')
    render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
  end
  
  def create
    int_data = params['integration']
    int_data = int_data.permit! if int_data.is_a?(ActionController::Parameters)
    user = User.find_by_path(int_data['user_id'])
    return unless exists?(user, int_data['user_id'])
    return unless allowed?(user, 'supervise')
    integration = nil
    if int_data && int_data['integration_key']
      template = UserIntegration.find_by(template: true, integration_key: int_data['integration_key'])
      integration = UserIntegration.find_or_initialize_by(user: user, template_integration: template)
    end
    if integration
      integration.process(int_data, {user: user})
    else
      integration = UserIntegration.process_new(int_data, {user: user})
    end
    if integration.errored?
      api_error(400, {error: "integration creation failed", errors: integration && integration.processing_errors})      
    else
      render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
    end
  end
  
  def update
    integration = UserIntegration.find_by_path(params['id'])
    return unless exists?(integration, params['id'])
    return unless allowed?(integration, 'edit')
    int_update = params['integration']
    int_update = int_update.permit! if int_update.is_a?(ActionController::Parameters)
    if integration.process(int_update)
      render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "integration update failed", errors: integration.processing_errors})
    end
  end
  
  def destroy
    integration = UserIntegration.find_by_path(params['id'])
    return unless exists?(integration, params['id'])
    return unless allowed?(integration, 'delete')
    if integration.destroy
      render json: JsonApi::Integration.as_json(integration, {wrapper: true, permissions: @api_user})
    else
      api_error(400, {error: "integration deletion failed"})
    end
  end

  def domain_settings
    # Merge the per-request jurisdiction-aware consent age into a FRESH copy so
    # the cached per-host blob (@domain_overrides) is never mutated. With the
    # eu_consent_age feature OFF the injection is {}, so the payload is
    # byte-identical to today. Same pattern for compliance_kernel_injection.
    overrides = (@domain_overrides || {}).dup
    overrides['settings'] = (overrides['settings'] || {})
      .merge(coppa_consent_age_injection)
      .merge(compliance_kernel_injection)
    render json: overrides.to_json
  end

  def focus_usage
    UserIntegration.schedule(:track_focus, @api_user && @api_user.global_id, params['focus_id'])
    render json: {accepted: true}
  end

  def focus_generate_words
    # Gate on the AI-specific check so org disable_ai_features, COPPA, EU under-16,
    # and user prefs are enforced at the endpoint — including on an AiFocusWordSet
    # cache hit, which returns before AiBoardGenerator.generate_focus_words runs.
    unless FeatureFlags.ai_feature_enabled_for?('ai_board_generation', @api_user)
      return api_error(403, { error: 'Feature not available' })
    end
    # EU AI Act Article 50(1) server-side backstop (shared helper LL-6723438462):
    # a client that skips the ai-disclosure modal and calls this endpoint directly
    # must still be refused. See ApplicationController#require_article_50_disclosure!.
    return unless require_article_50_disclosure!

    processed_params, json_body_source = integration_json_body_params_source
    if json_body_source == :invalid_json_root
      return api_error(400, { error: 'JSON body must be an object' })
    end

    prompt = (processed_params['prompt'] || '').to_s.strip
    return api_error(400, { error: 'prompt required' }) if prompt.blank?

    requested_count = [[(processed_params['word_count'] || 20).to_i, 5].max, 50].min
    locale = processed_params['locale'].presence || 'en'
    include_core_words = processed_params['include_core_words'] != false && processed_params['include_core_words'] != 'false'
    scrubbed_prompt = scrub_focus_prompt(prompt)

    focus_set = AiFocusWordSet.find_for(
      scrubbed_prompt: scrubbed_prompt,
      locale: locale,
      include_core_words: include_core_words
    )

    if focus_set && focus_set.words.length >= requested_count
      focus_set.record_cache_hit!
      return render json: focus_words_response(focus_set, requested_count, true)
    end

    existing_words = focus_set ? focus_set.words : []
    result = AiBoardGenerator.generate_focus_words(
      prompt: prompt,
      word_count: requested_count,
      locale: locale,
      include_core_words: include_core_words,
      user: @api_user,
      existing_words: existing_words
    )

    if result[:error]
      err_payload = { error: result[:error] }
      if Rails.env.development?
        err_payload[:error_detail] = result[:error_detail] if result[:error_detail].present?
        err_payload[:error_kind] = result[:error_kind] if result[:error_kind].present?
      end
      return api_error(503, err_payload)
    end

    new_words = result[:words] || []
    return api_error(400, { error: 'Could not generate words' }) if new_words.blank? && existing_words.blank?

    focus_set ||= AiFocusWordSet.new(
      scrubbed_prompt: scrubbed_prompt,
      locale: locale,
      include_core_words: include_core_words
    )
    focus_set.record_generation!(new_words: new_words, title: result[:title], user: @api_user, marker: result[:ai_generated])
    render json: focus_words_response(focus_set, requested_count, false)
  end

  def focus_generated_words_usage
    unless FeatureFlags.feature_enabled_for?('ai_board_generation', @api_user)
      return api_error(403, { error: 'Feature not available' })
    end

    processed_params, json_body_source = integration_json_body_params_source
    if json_body_source == :invalid_json_root
      return api_error(400, { error: 'JSON body must be an object' })
    end

    focus_set = AiFocusWordSet.find_by_global_id(processed_params['library_id'].to_s) rescue nil
    return api_error(404, { error: 'focus word library record not found' }) unless focus_set

    focus_set.record_usage!(
      final_words: processed_params['words'],
      action: processed_params['action']
    )
    render json: { accepted: true }
  end

  private

  def integration_json_body_params_source
    unless request.media_type == 'application/json'
      return params, :rails_params
    end
    begin
      parsed = JSON.parse(request.raw_post)
    rescue JSON::ParserError
      return params, :rails_params
    end
    return parsed, :json_hash if parsed.is_a?(Hash)

    [nil, :invalid_json_root]
  end

  def scrub_focus_prompt(prompt)
    if @api_user
      names = [@api_user.user_name]
      names << @api_user.settings['full_name'] if @api_user.settings && @api_user.settings['full_name']
      PiiScrubber.configure_blocklist(names)
    end
    result = PiiScrubber.redact_for_ai(prompt)
    result[:payload].to_s.strip
  end

  def focus_words_response(focus_set, requested_count, cached)
    {
      words: focus_set.words.first(requested_count).join(', '),
      title: focus_set.title,
      cached: cached,
      library_id: focus_set.global_id,
      # EU AI Act Article 50(2): non-secret provenance view of the marker (marked/spec/
      # provider/model), or nil for a set with no valid marker. Additive key; withholds
      # signature + content_id. Cache-hit responses expose the stored set's marker too.
      ai_generated: focus_set.ai_generated_public_view
    }
  end
end
