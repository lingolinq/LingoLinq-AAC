class UserVideo < ApplicationRecord
  include Processable
  include Permissions
  include Uploadable
  include MediaObject
  include Async
  include GlobalId
  include SecureSerialize
  protect_global_id
  belongs_to :user
  before_save :generate_defaults
  include Replicate

  secure_serialize :settings

  add_permissions('view', ['*']) { true }
  add_permissions('view', 'edit') {|user| self.user_id == user.id || (self.user && self.user.allows?(user, 'edit')) }
  cache_permissions
  
  def removable=(val)
  end
  
  def removable
    true
  end
  
  def summary_hash
    {
      'id' => self.global_id,
      'duration' => (self.settings && self.settings['duration']),
      'url' => self.url
    }
  end

  def self.acceptable_url?(url)
    url.is_a?(String) && url.match?(/\A(https?:\/\/|data:video\/)/i)
  end

  def generate_defaults
    self.settings ||= {}
    self.settings['license'] ||= {
      'type' => 'private'
    }
    self.public ||= false
    true
  end
  
  def process_params(params, non_user_params)
    raise "user required as video author" unless self.user_id || non_user_params[:user]
    self.user ||= non_user_params[:user] if non_user_params[:user]
    @download_url = false if non_user_params[:download] == false
    self.settings ||= {}
    # A video url is an http(s) url or a data:video/* URI (recorded and picked videos,
    # app/frontend/app/models/video.js:77-79); any other scheme or data: MIME is dropped,
    # as ButtonImage#process_params drops a data: URI whose MIME is not image/*. A data:video URI
    # is kept only when a client upload can take the bytes (create, remote_upload_possible); on
    # update check_for_pending would copy it into url, which cannot hold a recording.
    url = params['url']
    url = nil if url.to_s.match?(/\Adata:/i) && !non_user_params[:remote_upload_possible]
    process_url(url, non_user_params) if UserVideo.acceptable_url?(url)
    self.settings['content_type'] = params['content_type'] if params['content_type']
    self.settings['duration'] = params['duration'].to_i if params['duration']
    process_license(params['license']) if params['license']
    self.public = params['public'] if params['public'] != nil
    true
  end
end
