require 'aws-sdk-sns'

module Pusher
  def self.sms(phone, message, origination_number=nil)
    client = config
    raise "phone missing" unless phone
    raise "message missing" unless message
    orig_phone = phone
    phone.strip!
    if phone.match(/,/)
      return  phone.split(/,/).map{|p| Pusher.sms(p, message)[0]}
    end
    if Setting.blocked_cell?(RemoteTarget.canonical_target(phone, 'sms'))
      return []
    end
    if !phone.match(/^\+\d/)
      phone = RemoteTarget.canonical_target('sms', phone)
    end
    publish_opts = {
      phone_number: phone,
      # TODO: support app_name
      message: "LingoLinq: #{message}",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "1.0"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "LingoLinq"
        }
      }
    }
    if origination_number
      publish_opts[:message_attributes]['AWS.MM.SMS.OriginationNumber'] = {
        data_type: "String",
        string_value: origination_number
      }
    end
    
    res = client.publish(publish_opts)
    message_id = res.message_id
    [message_id]
  end

  def self.config
    cred = Aws::Credentials.new((ENV['TRANSCODER_KEY'] || ENV['AWS_KEY']), (ENV['TRANSCODER_SECRET'] || ENV['AWS_SECRET']))
    Aws::SNS::Client.new(region: (ENV['TRANSCODER_REGION'] || ENV['AWS_REGION']), credentials: cred, retry_limit: 2, retry_backoff: lambda { |c| sleep(3) })
  end
end
