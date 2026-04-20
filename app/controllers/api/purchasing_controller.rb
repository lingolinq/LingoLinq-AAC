class Api::PurchasingController < ApplicationController
  def event
    res = Purchasing.subscription_event(request)
    render json: res[:data], :status => res[:status]
  end

  def code_check
    gift = GiftPurchase.find_by_code(params['code'])
    return api_error 400, {error: "code not recognized"} unless gift
    return api_error 400, {error: "invalid code"} if gift.gift_type == 'bulk_purchase'
    redeem = gift.redemption_state(params['code'])
    if !redeem[:valid]
      render json: {valid: false, error: redeem[:error]}
    else
      render json: {valid: true, type: gift.gift_type, discount_percent: gift.discount_percent, extras: gift.settings['include_extras'], supporters: gift.settings['include_supporters']}
    end
  end
  
  def purchase_gift
    return api_error 400, {error: "invalid purchase token"} unless params['token'] && params['token']['id']
    token = params['token']
    token = token.permit! if token.is_a?(ActionController::Parameters)
    user_id = @api_user && @api_user.global_id
    extras = params['extras'] == true || params['extras'] == 'true'
    donate = params['donate'] == true || params['donate'] == 'true'
    progress = Progress.schedule(GiftPurchase, :process_subscription_token, token.to_unsafe_h, {'type' => params['type'], 'code' => params['code'], 'email' => params['email'], 'user_id' => user_id, 'extras' => extras, 'supporters' => params['supporters'].to_i, 'donate' => donate})
    render json: JsonApi::Progress.as_json(progress, :wrapper => true)
  end
end