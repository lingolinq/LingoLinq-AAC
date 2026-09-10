module RemoteUploader
  extend ActiveSupport::Concern

  def upload_success
    # check on S3 that the file uploaded successfully
    type = ButtonImage
    type = ButtonSound if params['controller'] == 'api/sounds'
    type = UserVideo if params['controller'] == 'api/videos'
    record = type.find_by_global_id(params['image_id'] || params['sound_id'] || params['video_id'])
    if record && record.confirmation_key == params['confirmation']
      config = Uploader.remote_upload_config
      url = config[:upload_url] + record.full_filename
      # IAM head_object (lib/uploader.rb:537). Unsigned Typhoeus.head of this
      # URL 403s when the uploads bucket blocks public access.
      if Uploader.remote_upload_exists?(url)
        unless !record.is_a?(ButtonImage) || record.verify_stored_s3_upload!(url)
          render json: {confirmed: false, message: "Upload rejected"}.to_json, status: 400
          return
        end
        record.url = url
        record.settings['pending'] = false
        record.settings['data_uri'] = nil
        record.data = nil if record.respond_to?(:data=)
        record.save
        render json: {confirmed: true, url: url}.to_json
      else
        render json: {confirmed: false, message: "File not found"}.to_json, status: 400
      end
    else
      render json: {confirmed: false, message: "Invalid confirmation key"}.to_json, status: 400
    end
  end
end
