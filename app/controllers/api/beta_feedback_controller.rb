class Api::BetaFeedbackController < ApplicationController
  before_action :require_api_token
  before_action :require_admin

  def index
    scope = ContactMessage.where(recipient: 'beta_feedback')
    scope = if params['filter_type'].to_s == 'hidden'
              scope.where(hidden: true)
            else
              scope.where(hidden: false)
            end
    scope = apply_beta_feedback_filters(scope, params)
    render json: JsonApi::BetaFeedback.paginate(params, scope, prefix: '/api/v1/beta_feedback').to_json
  end

  def show
    msg = ContactMessage.find_by_global_id(params[:id])
    return unless exists?(msg, params[:id])
    unless msg.recipient == 'beta_feedback'
      return api_error 404, {error: 'Record not found'}
    end

    render json: JsonApi::BetaFeedback.as_json(msg, detail: true, wrapper: true).to_json
  end

  def update
    msg = ContactMessage.find_by_global_id(params[:id])
    return unless exists?(msg, params[:id])
    unless msg.recipient == 'beta_feedback'
      return api_error 404, {error: 'Record not found'}
    end

    bf = params['beta_feedback'] || params[:beta_feedback]
    if bf.present?
      bf = bf.permit(:hidden, :priority) if bf.is_a?(ActionController::Parameters)
      h = bf.is_a?(ActionController::Parameters) ? bf.to_unsafe_h : bf.to_h
      h = h.with_indifferent_access
      priority = nil
      priority_provided = h.key?(:priority) || h.key?('priority')
      if priority_provided
        priority = h[:priority].to_s
        priority = nil if priority.blank?
        unless priority.nil? || ContactMessage::BETA_FEEDBACK_ALLOWED_PRIORITIES.include?(priority)
          return api_error 400, {error: 'Invalid priority'}
        end
      end
      if h.key?(:hidden) || h.key?('hidden')
        val = h[:hidden]
        msg.update_column(:hidden, ActiveModel::Type::Boolean.new.cast(val))
      end
      if priority_provided
        msg.update_column(:beta_priority, priority)
      end
    end

    render json: JsonApi::BetaFeedback.as_json(msg, detail: true, wrapper: true).to_json
  end

  private

  def apply_beta_feedback_filters(scope, params)
    q = params['q'].to_s.strip
    if q.present?
      q_like = "%#{ActiveRecord::Base.sanitize_sql_like(q)}%"
      scope = scope.where(
        'beta_subject ILIKE ? OR beta_submitter_name ILIKE ? OR beta_feedback_type ILIKE ? OR beta_severity ILIKE ?',
        q_like, q_like, q_like, q_like
      )
    end

    ft = params['filter_type'].to_s
    if ft.present? && ft != 'hidden' && ContactMessage::BETA_FEEDBACK_ALLOWED_TYPES.include?(ft)
      scope = scope.where(beta_feedback_type: ft)
    end

    sev = params['filter_severity'].to_s
    if sev.present? && ContactMessage::BETA_FEEDBACK_ALLOWED_SEVERITIES.include?(sev)
      scope = scope.where(beta_severity: sev)
    end

    priority = params['filter_priority'].to_s
    if priority.present? && ContactMessage::BETA_FEEDBACK_ALLOWED_PRIORITIES.include?(priority)
      scope = scope.where(beta_priority: priority)
    end

    sort_by = params['sort_by'].to_s
    sort_order = params['sort_order'].to_s.downcase == 'asc' ? 'asc' : 'desc'
    allowed = %w[created_at beta_subject beta_submitter_name beta_feedback_type beta_severity beta_priority]
    sort_by = 'created_at' unless allowed.include?(sort_by)
    scope.order(sort_by => sort_order)
  end

  def require_admin
    return if @api_user&.admin?

    api_error 403, {error: 'Not authorized'}
  end
end
