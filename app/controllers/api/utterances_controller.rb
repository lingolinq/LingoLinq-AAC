class Api::UtterancesController < ApplicationController
  before_action :require_api_token, :except => [:show, :reply]
  
  def show
    utterance_id, reply_code = params['id'].split(/x/)
    utterance = Utterance.find_by_global_id(utterance_id)
    return unless exists?(utterance, utterance_id)
    return unless allowed?(utterance, 'view')

    if !utterance.accessible_for?(reply_code, true)
      return allowed?(utterance, 'never_allow')
    end

    render json: JsonApi::Utterance.as_json(utterance, :wrapper => true, :permissions => @api_user, :reply_code => reply_code).to_json
  end
  
  def create
    utt_data = params['utterance']
    utt_data = utt_data.permit! if utt_data.is_a?(ActionController::Parameters)
    user = @api_user
    if utt_data && utt_data['user_id']
      user = User.find_by_path(utt_data['user_id'])
      return unless exists?(user, utt_data['user_id'])
      return unless allowed?(user, 'model')
    end
    utterance = Utterance.process_new(utt_data, {:user => user})
    if !utterance || utterance.errored?
      api_error(400, {error: "utterance creation failed", errors: utterance.processing_errors})
    else
      render json: JsonApi::Utterance.as_json(utterance, :wrapper => true, :permissions => @api_user).to_json
    end
  end
  
  def share
    utterance = Utterance.find_by_global_id(params['utterance_id'])
    return unless exists?(utterance)
    return unless allowed?(utterance, 'edit')
    sharer = @api_user
    if params['sharer_id'] && @api_user && params['sharer_id'] != @api_user.global_id
      user = User.find_by_path(params['sharer_id'])
      return unless exists?(user, params['sharer_id'])
      return unless allowed?(user, 'model')
      sharer = user
    end
    if params['user_id'] && !sharer.any_premium_or_grace_period?(true)
      return allowed?(user, 'premium_access_required')      
    end
    share_params = params.permit(:user_id, :email, :message, :sharer_id, :sentence, :reply_id, :share_type, :supervisor_id, :cell, :subject)
    res = utterance.share_with(share_params, sharer, @api_user.global_id)
    if res
      render json: {shared: true, details: res}.to_json
    else
      api_error(400, {error: "utterance share failed"})
    end
  end

  def update
    utterance = Utterance.find_by_global_id(params['id'])
    return unless exists?(utterance)
    return unless allowed?(utterance, 'edit')
    utt_update = params['utterance']
    utt_update = utt_update.permit! if utt_update.is_a?(ActionController::Parameters)
    if utterance.process(utt_update)
      render json: JsonApi::Utterance.as_json(utterance, :wrapper => true, :permissions => @api_user).to_json
    else
      api_error(400, {error: "utterance update failed", errors: utterance.processing_errors})
    end
  end

  def reply
    utterance_id, reply_code = params['utterance_id'].split(/x/)
    utterance = Utterance.find_by_global_id(utterance_id)
    return unless exists?(utterance, utterance_id)
    return unless allowed?(utterance, 'view')

    reply_index = nil
    if reply_code
      match = reply_code.match(/^([0-9a-f]+)([A-Z]+)$/)
      reply_nonce = match && match[1]
      share_index = match[2]
      if utterance.reply_nonce && utterance.reply_nonce == reply_nonce
        reply_index = Utterance.from_alpha_code(share_index)
      end
    end
    if !reply_index || !(utterance.data['share_user_ids'] || {})[reply_index]
      return exists?(nil, reply_code)
    end

    #raise "for user contacts, ensure that the contact hash still exists"

    user_id = utterance.data['share_user_ids'][reply_index]
    sharer = User.find_by_path(user_id)
    return unless exists?(sharer, user_id)
    # this reply mechanism should only be used to reply to a communicator
    res = LogSession.message({
      recipient: utterance.user,
      sender: sharer,
      sender_id: user_id,
      notify: 'user_only',
      device: sharer.devices[0],
      message: params['message'],
      reply_id: utterance.global_id
    })
    render json: {sent: !!res, from: user_id, to: utterance.user.global_id}
  end
end
