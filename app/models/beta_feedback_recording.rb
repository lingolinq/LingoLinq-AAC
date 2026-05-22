require 'fileutils'

class BetaFeedbackRecording < ApplicationRecord
  include GlobalId
  include SecureSerialize
  include Async

  secure_serialize :settings

  MAX_BYTES = 100 * 1024 * 1024
  RETENTION_DAYS = 90
  ALLOWED_CONTENT_TYPES = %w[video/webm video/mp4].freeze

  belongs_to :contact_message, optional: true

  before_validation :set_defaults
  validate :validate_upload_metadata

  def self.find_confirmed(global_id, token)
    rec = find_by_global_id(global_id)
    return nil unless rec
    return nil unless rec.token == token.to_s
    return nil unless rec.status == 'confirmed'
    rec
  end

  def self.flush_expired
    count = 0
    where('expires_at < ? AND deleted_at IS NULL', Time.now).find_each do |rec|
      rec.delete_remote!
      count += 1
    end
    count
  end

  def set_defaults
    self.settings ||= {}
    self.status ||= 'pending'
    self.token ||= GoSecure.nonce('beta_feedback_recording')
    self.expires_at ||= RETENTION_DAYS.days.from_now
    self.upload_key ||= "beta_feedback_recordings/#{Time.now.utc.strftime('%Y/%m/%d')}/#{GoSecure.nonce('beta_feedback_recording_file')}.#{file_extension}"
    true
  end

  def file_extension
    content_type.to_s == 'video/mp4' ? 'mp4' : 'webm'
  end

  def validate_upload_metadata
    unless ALLOWED_CONTENT_TYPES.include?(content_type.to_s)
      errors.add(:content_type, "is not supported")
    end
    if byte_size.to_i <= 0 || byte_size.to_i > MAX_BYTES
      errors.add(:byte_size, "must be between 1 byte and 100 MB")
    end
  end

  def remote_upload
    Uploader.remote_upload_params(upload_key, content_type, max_bytes: MAX_BYTES, private_upload: true)
  end

  def confirm!
    return false unless Uploader.remote_upload_exists?(upload_key)

    self.status = 'confirmed'
    self.confirmed_at ||= Time.now
    save
  end

  def attach_to!(message)
    self.contact_message = message
    save
  end

  def expired?
    expires_at && expires_at < Time.now
  end

  def deleted?
    deleted_at.present? || status == 'deleted'
  end

  def signed_url
    return nil if deleted? || expired?
    if settings && settings['local_path'].present?
      return "/api/v1/beta_feedback_recordings/#{global_id}/download?token=#{token}"
    end

    Uploader.presigned_url_for_uploads(upload_key)
  end

  def store_local_upload!(path)
    dir = Rails.root.join('tmp', 'beta_feedback_recordings')
    FileUtils.mkdir_p(dir)
    local_path = dir.join("#{global_id}-#{token}.#{file_extension}")
    FileUtils.cp(path, local_path)
    self.settings ||= {}
    self.settings['local_path'] = local_path.to_s
    self.settings['local_upload'] = true
    self.status = 'confirmed'
    self.confirmed_at ||= Time.now
    save!
  end

  def delete_remote!
    deletion_succeeded =
      if settings && settings['local_path'].present?
        !File.exist?(settings['local_path']) || File.delete(settings['local_path']) > 0
      elsif upload_key.present?
        Uploader.remote_remove_upload_path(upload_key).present?
      else
        false
      end

    return false unless deletion_succeeded
    self.status = 'deleted'
    self.deleted_at ||= Time.now
    save
  end
end
