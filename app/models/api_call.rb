class ApiCall < ActiveRecord::Base
  include SecureSerialize
  # raise "replicate should be a separate sub-class"
  include Replicate
  secure_serialize :data
  
  def self.log(token, user, request, response, time)
    # TODO: log all calls from external developer keys
    return true if ENV['DISABLE_API_CALL_LOGGING']
    return true if ENV['DISABLE_SHORT_API_CALL_LOGGING'] && (!time || time < 15)
    if request && request.path && request.path.match(/^\/api\/v\d+/) && token && user && response
      call = ApiCall.new
      call.user_id = user.id
      call.data ||= {}
      call.data['url'] = request.url
      call.data['method'] = request.method
      call.data['access_token_prefix'] = token[0..7]
      call.data['access_token_hash'] = Digest::SHA256.hexdigest(token)
      call.data['status'] = response.code
      call.data['time'] = time
      call.save
    else
      false
    end
  end
  
  def self.flush
    ApiCall.where(['created_at < ?', 2.months.ago]).delete_all
  end
end
