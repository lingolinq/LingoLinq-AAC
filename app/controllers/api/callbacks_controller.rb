require 'aws-sdk-sns'

class Api::CallbacksController < ApplicationController
  def callback
    topic_arn = request.headers['x-amz-sns-topic-arn']
    body = request.body.read.force_encoding("UTF-8")
    json_body = JSON.parse(body) rescue nil
    # TODO: confirm signature, https://docs.aws.amazon.com/sns/latest/dg/sns-message-and-json-formats.html
    # https://docs.aws.amazon.com/sdk-for-ruby/v3/api/Aws/SNS/MessageVerifier.html
    if request.headers['x-amz-sns-message-type'] == 'SubscriptionConfirmation'
      Rails.logger.warn("CONFIRM SUBSCRIPTION #{topic_arn}")
      valid_arns = (ENV['SNS_ARNS'] || '').split(/,/)
      if valid_arns.include?(topic_arn)
        token = json_body['Token'] || json_body['token']
        Rails.logger.warn(json_body.to_json)
        cred = Aws::Credentials.new(ENV['AWS_KEY'], ENV['AWS_SECRET'])
        client = Aws::SNS::Client.new(region: ENV['SNS_REGION'], credentials: cred, retry_limit: 2, retry_backoff: lambda { |c| sleep(3) })
        client.confirm_subscription({topic_arn: topic_arn, token: token, authenticate_on_unsubscribe: 'true'})
        render json: {confirmed: true}
      else
        api_error 400, {error: 'invalid arn'}
      end
    elsif request.headers['x-amz-sns-message-type'] == 'Notification'
      if !topic_arn
        api_error 400, {error: 'missing topic arn'}
      elsif topic_arn.match(/audio_conversion_events/) || topic_arn.match(/video_conversion_events/)
        Rails.logger.warn(json_body.to_json)
        res = Transcoder.handle_event(json_body)
        if res
          render json: {handled: true}
        else
          api_error 400, {error: 'event not handled'}
        end
      elsif topic_arn.match(/LingoLinqSMSInbound/) || topic_arn.match(/sms_inbound/)
        Rails.logger.warn("INBOUND SMS NOTIFICATION")
        Rails.logger.warn(json_body.to_json)
        verifier = Aws::SNS::MessageVerifier.new
        if !verifier.authentic?(body)
          return api_error 401, {error: 'inauthentic message'}
        end
        message = JSON.parse(json_body['Message'])
        res = RemoteTarget.process_inbound(message)
        if res
          render json: {handled: true}
        else
          api_error 400, {error: 'event not handled'}
        end
      end
    else
      api_error 400, {error: 'unrecognized callback'}
    end
  end
end
