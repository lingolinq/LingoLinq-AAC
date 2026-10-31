require 'spec_helper'

describe Api::ImagesController, :type => :controller do
  describe "create" do
    it "should require api token" do
      post :create, params: {}
      assert_missing_token
    end
    
    env_wrap('UPLOADS_S3_BUCKET' => 'lingolinq-dev-uploads') do
      it "should create an image based on the passer parameters" do
        token_user
        url = "https://lingolinq-dev-uploads.s3.amazonaws.com/bacon.png"
        post :create, params: {:image => {'url' => url, 'content_type' => 'image/png'}}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['image']['id']).not_to eq(nil)
        expect(json['image']['url']).to match(/bacon\.png$/)
        expect(json['meta']).to eq(nil)
      end
    end
    
    it "should return meta (upload information) for pending images" do
      token_user
      url = "https://www.example.com/pic.png"
      post :create, params: {:image => {'url' => url, 'content_type' => 'image/png'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).not_to eq(nil)
      expect(json['image']['pending']).to eq(true)
      expect(json['image']['url']).to eq(nil)
      expect(json['meta']).not_to eq(nil)
    end
    
    it "should error gracefully on image create fail" do
      expect_any_instance_of(ButtonImage).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      url = "https://www.example.com/pic.png"
      post :create, params: {:image => {'url' => url, 'content_type' => 'image/png'}}
      json = JSON.parse(response.body)
      expect(json['error']).to eq("image creation failed")
      expect(json['errors']).to eq(["bacon"])
    end
  end
  
  describe "upload_success" do
    it "should not require api token" do
      get :upload_success, params: {:image_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for bad confirmation key" do
      get :upload_success, params: {:image_id => "1234"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'Invalid confirmation key'})
    end
    
    it "should error for valid confirmation key but missing from server" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      config = Uploader.remote_upload_config
      expect(Uploader).to receive(:remote_upload_exists?).with(config[:upload_url] + s.full_filename).and_return(false)
      get :upload_success, params: {:image_id => s.global_id, :confirmation => s.confirmation_key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => false, 'message' => 'File not found'})
    end
    
    it "should succeed for valid confirmation key that is found on server" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'image/png'})
      config = Uploader.remote_upload_config
      expect(Uploader).to receive(:remote_upload_exists?).with(config[:upload_url] + s.full_filename).and_return(true)
      expect(Typhoeus).to receive(:get).with(
        config[:upload_url] + s.full_filename,
        headers: { 'Range' => "bytes=0-#{SvgSanitizer::SNIFF_BYTES - 1}" }
      ).and_return(OpenStruct.new(code: 206, body: "\x89PNG\r\n\x1a\n"))
      get :upload_success, params: {:image_id => s.global_id, :confirmation => s.confirmation_key}
      json = JSON.parse(response.body)
      expect(response).to be_successful
      expect(s.reload.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(json).to eq({'confirmed' => true, 'url' => s.url})
    end
  end
  
  describe "show" do
    it "should require api token" do
      get :show, params: {:id => 1}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      get :show, params: {:id => '1234'}
      assert_not_found
    end
    
    it "should return a found object" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      get :show, params: {:id => s.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).to eq(s.global_id)
      expect(json['image']['content_type']).to eq('audio/mp3')
    end
  end
  
  # The upload form is a signed S3 policy plus the confirmation key for upload_success, which
  # replaces the record's file; only someone who can edit the record may have it.
  describe "upload form for a pending image" do
    before { allow(Uploader).to receive(:client_uploads_configured?).and_return(true) }

    it "is given to the owner" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'image/png', 'pending' => true})
      get :show, params: {:id => s.global_id}
      expect(response).to be_successful
      expect(JSON.parse(response.body)['meta']['remote_upload']).to be_present
    end

    it "is not given to another user" do
      owner = User.create
      s = ButtonImage.create(:user => owner, :settings => {'content_type' => 'image/png', 'pending' => true})
      token_user
      get :show, params: {:id => s.global_id}
      expect(response).to be_successful
      expect(JSON.parse(response.body)['meta']).to eq(nil)
    end
  end

  describe "update" do
    it "should require api token" do
      put :update, params: {:id => "1234"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      put :update, params: {:id => "1234"}
      assert_not_found
    end
    
    it "should update an object" do
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      put :update, params: {:id => s.global_id, :image => {:license => {'type' => 'CC-By'}}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).to eq(s.global_id)
      expect(json['image']['license']).to eq({'type' => 'CC-By'})
    end
    
    # Every user has view (button_image.rb:21); updating another user's picture needs edit, as
    # it does for sounds and videos.
    # It answers with the image as it is rather than an error: app builds already installed queue
    # offline edits to images they reuse and replay them on sync, where one error fails the whole
    # sync on every later attempt (services/persistence.js sync_changed).
    it "should not let a user update someone else's image" do
      owner = User.create
      png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
      s = ButtonImage.create(:user => owner, :settings => {'content_type' => 'image/png', 'license' => {'type' => 'private'}})
      token_user
      put :update, params: {:id => s.global_id, :image => {:license => {'type' => 'CC-By'}, :url => png, :content_type => 'image/png'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).to eq(s.global_id)
      expect(json['image']['license']).to eq({'type' => 'private'})
      s.reload
      expect(s.settings['license']).to eq({'type' => 'private'})
      expect(s.data).to eq(nil)
    end

    it "should let a supervisor with edit rights update the communicator's image" do
      token_user
      communicator = User.create
      User.link_supervisor_to_user(@user, communicator, nil, true)
      s = ButtonImage.create(:user => communicator.reload, :settings => {'content_type' => 'image/png'})
      put :update, params: {:id => s.global_id, :image => {:license => {'type' => 'CC-By'}}}
      expect(response).to be_successful
      expect(s.reload.settings['license']).to eq({'type' => 'CC-By'})
    end

    it "should error gracefully on image update fail" do
      expect_any_instance_of(ButtonImage).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      s = ButtonImage.create(:user => @user, :settings => {'content_type' => 'audio/mp3'})
      put :update, params: {:id => s.global_id, :image => {:license => {'type' => 'CC-By'}}}
      json = JSON.parse(response.body)
      expect(json['error']).to eq("image update failed")
      expect(json['errors']).to eq(["bacon"])
    end
  end

  # See the matching block in goals_controller_spec.rb. `params:` scalars are
  # stringified by the controller-test harness, so the rest of this file asserts
  # the old form-encoded shape. ButtonImage#process_params:236 reads `avatar`
  # through `!!params['avatar']` with no string coercion, so the string "false"
  # becomes TRUE. Only a raw `body:` distinguishes them.
  describe "create with a raw JSON body" do
    it "should keep avatar false rather than coercing the string \"false\" to true" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'avatar' => false}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['avatar']).to eq(false)
      expect(bi.settings['avatar']).to be_a(FalseClass)
    end

    it "should keep avatar true when sent as a real boolean" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'avatar' => true}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['avatar']).to eq(true)
    end

    it "should store width and height as Integers" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'width' => 400, 'height' => 300}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['width']).to eq(400)
      expect(bi.settings['width']).to be_a(Integer)
      expect(bi.settings['height']).to eq(300)
      expect(bi.settings['height']).to be_a(Integer)
    end

    # `badge` takes the same `!= nil` guard as `avatar` above, so it is pinned
    # the same way. Kept separate rather than folded into the avatar specs
    # because they are independent settings and a shared spec would not say
    # which one regressed.
    it "should keep badge false rather than coercing the string \"false\" to true" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'badge' => false}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['badge']).to eq(false)
      expect(bi.settings['badge']).to be_a(FalseClass)
    end

    it "should set badge true when sent as a real boolean" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'badge' => true}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['badge']).to eq(true)
    end

    it "should set hc true when sent as a real boolean" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'hc' => true}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['hc']).to eq(true)
    end

    # DOCUMENTS EXISTING BEHAVIOUR, and it is asymmetric on purpose to record it:
    # `hc` is guarded by `if params['hc']` (button_image.rb:233) — a TRUTHY test —
    # while its neighbours `avatar` and `badge` use `!= nil`. So a real `false`
    # never reaches the assignment and `hc` cannot be turned off through this
    # endpoint once set. Under the old form-encoded shape the string "false" was
    # truthy and turned it ON, which is the direction that mattered; that is gone.
    # The remaining asymmetry is a live quirk, pinned here rather than "fixed",
    # because changing the guard would alter behaviour no caller has asked to
    # change. See PR #807 "Not covered".
    it "treats hc=false as a no-op rather than clearing it (truthy guard, unlike avatar/badge)" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, body: {
        :image => {'content_type' => 'image/png', 'hc' => false}
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      bi = ButtonImage.find_by_global_id(json['image']['id'])
      expect(bi.settings['hc']).to eq(nil)
    end
  end

  # No upload form can be issued: a create that needs a client upload must not leave a pending
  # record behind, and reading a pending record must still work, just without the form.
  describe "without S3 configured" do
    before(:each) { allow(Uploader).to receive(:client_uploads_configured?).and_return(false) }

    it "should answer 503 and keep no record when the create needs a client upload" do
      token_user
      expect {
        post :create, params: {:image => {'url' => 'https://www.example.com/file.png', 'content_type' => 'image/png'}}
      }.to_not change(ButtonImage, :count)
      assert_error('File uploads are not available right now', 503)
    end

    it "should still create a record that needs no client upload" do
      token_user
      allow(Uploader).to receive(:valid_remote_url?).and_return(true)
      post :create, params: {:image => {'url' => 'https://www.example.com/file.png', 'content_type' => 'image/png'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['pending']).to eq(false)
      expect(json['meta']).to eq(nil)
    end

    it "should show a pending record without upload params" do
      token_user
      record = ButtonImage.create!(user: @user, settings: {'pending' => true, 'content_type' => 'image/png'})
      get :show, params: {:id => record.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['image']['id']).to eq(record.global_id)
      expect(json['image']['pending']).to eq(true)
      expect(json['meta']).to eq(nil)
    end
  end
end
