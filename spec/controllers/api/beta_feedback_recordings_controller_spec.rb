require 'spec_helper'

describe Api::BetaFeedbackRecordingsController, type: :controller do
  describe 'create' do
    it 'should require consent' do
      post :create, params: {beta_feedback_recording: {content_type: 'video/webm', byte_size: 1000, consent_accepted: false}}
      assert_error('Recording consent is required', 400)
    end

    it 'should create a private upload target' do
      expect(Uploader).to receive(:remote_upload_params).with(
        kind_of(String),
        'video/webm',
        max_bytes: BetaFeedbackRecording::MAX_BYTES,
        private_upload: true
      ).and_return(upload_url: 'https://example.com/', upload_params: {'key' => 'beta_feedback_recordings/test.webm'})

      post :create, params: {beta_feedback_recording: {content_type: 'video/webm', byte_size: 1000, consent_accepted: true}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['beta_feedback_recording']['id']).to be_present
      expect(json['beta_feedback_recording']['token']).to be_present
      expect(json['beta_feedback_recording']['remote_upload']['upload_url']).to eq('https://example.com/')
    end

    it 'should normalize browser codec content types' do
      expect(Uploader).to receive(:remote_upload_params).with(
        kind_of(String),
        'video/webm',
        max_bytes: BetaFeedbackRecording::MAX_BYTES,
        private_upload: true
      ).and_return(upload_url: 'https://example.com/', upload_params: {'key' => 'beta_feedback_recordings/test.webm'})

      post :create, params: {beta_feedback_recording: {content_type: 'video/webm;codecs=vp9', byte_size: 1000, consent_accepted: true}}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['beta_feedback_recording']['content_type']).to eq('video/webm')
    end
  end

  describe 'confirm' do
    it 'should confirm an uploaded recording' do
      rec = BetaFeedbackRecording.create!(
        content_type: 'video/webm',
        byte_size: 1000
      )
      expect(Uploader).to receive(:remote_upload_exists?).with(rec.upload_key).and_return(true)

      post :confirm, params: {id: rec.global_id, token: rec.token}
      expect(response.successful?).to eq(true)
      rec.reload
      expect(rec.status).to eq('confirmed')
      expect(rec.confirmed_at).to be_present
    end

    it 'should reject an invalid token' do
      rec = BetaFeedbackRecording.create!(
        content_type: 'video/webm',
        byte_size: 1000
      )

      post :confirm, params: {id: rec.global_id, token: 'bad'}
      assert_error('Invalid confirmation token', 403)
    end
  end

  describe 'upload' do
    it 'should upload through the server fallback' do
      rec = BetaFeedbackRecording.create!(
        content_type: 'video/webm',
        byte_size: 1000
      )
      tempfile = Tempfile.new(['recording', '.webm'])
      tempfile.write('video data')
      tempfile.rewind
      upload = Rack::Test::UploadedFile.new(tempfile.path, 'video/webm')
      expect(Uploader).to receive(:remote_upload).with(rec.upload_key, kind_of(String), rec.content_type).and_return({url: 'https://example.com/recording.webm'})

      post :upload, params: {id: rec.global_id, token: rec.token, file: upload}
      expect(response.successful?).to eq(true)
      rec.reload
      expect(rec.status).to eq('confirmed')
      expect(rec.confirmed_at).to be_present
    ensure
      tempfile.close!
    end
  end
end
