class Api::GiftsController < ApplicationController
  before_action :require_api_token, :except => [:show]
  # TODO: implement throttling to prevent brute force gift lookup

  def show
    id, verifier = params['id'].split(/::/)
    admin_allowed = @api_user && @api_user.allows?(@api_user, 'admin_support_actions')
    code = admin_allowed ? id : id.gsub(/x/, '&')
    gift = GiftPurchase.find_by_code(code, verifier != nil || admin_allowed)
    return unless exists?(gift, params['id'])
    return unless allowed?(gift, 'view')
    return allowed?(gift, 'never_allow') if !admin_allowed && id.length < 20 && verifier != gift.code_verifier
    render json: JsonApi::Gift.as_json(gift, :wrapper => true, :permissions => @api_user).to_json
  end
  
  def index
    return unless allowed?(@api_user, 'admin_support_actions')
    gifts = GiftPurchase.all.order('id DESC')
    render json: JsonApi::Gift.paginate(params, gifts)
  end
  
  def create
    return unless allowed?(@api_user, 'admin_support_actions')
    gift_data = params['gift']
    gift_data = gift_data.permit! if gift_data.is_a?(ActionController::Parameters)
    code = gift_data['code']
    if code && GiftPurchase.find_by(code: code)
      api_error 400, {error: 'code is taken'}
      return
    end
    gift = GiftPurchase.process_new(
    gift_data.slice('licenses', 'total_codes', 'amount',
          'expires', 'limit', 'code', 'memo', 'email', 'organization',
          'org_id', 'gift_type', 'gift_name', 'discount', 'include_extras', 'include_supporters'),
    {
      'giver' => @api_user,
      'email' => @api_user.settings['email'],
      'seconds' => gift_data['seconds'].to_i
    })
    
    if gift.errored?
      api_error(400, {error: "gift creation failed", errors: gift && gift.processing_errors})
    else
      render json: JsonApi::Gift.as_json(gift, :wrapper => true, :permissions => @api_user).to_json
    end
  end
  
  def destroy
    return unless allowed?(@api_user, 'admin_support_actions')
    gift = GiftPurchase.find_by_code(params['id'].gsub(/x/, '&'))
    return unless exists?(gift, params['id'])
    gift.active = false
    gift.save
    render json: JsonApi::Gift.as_json(gift, :wrapper => true, :permissions => @api_user).to_json
  end
end
