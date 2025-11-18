require 'spec_helper'

describe Uploadable, :type => :model do
  class FakeUploadable
    def self.before_save(*args); end
    def self.after_save(*args); end
    def self.after_destroy(*args); end
    include Uploadable
  end
  
  describe "file_type" do
    it "should return the correct file type" do
      expect(ButtonImage.new.file_type).to eq('images')
      expect(ButtonSound.new.file_type).to eq('sounds')
      expect(UserVideo.new.file_type).to eq('videos')
      expect(FakeUploadable.new.file_type).to eq('objects')
    end
  end
  
  describe "confirmation_key" do
    it "should generate a valid key" do
      i = ButtonImage.create
      i2 = ButtonImage.create
      k = i.confirmation_key
      expect(k).not_to eq(nil)
      expect(k.length).to be > 64
      expect(i.confirmation_key).to eq(k)
      expect(i2.confirmation_key).not_to eq(k)
    end
  end
  
  describe "full_filename" do
    it "should used the cached value if available" do
      i = ButtonImage.new(:settings => {'full_filename' => 'once/upon/a/time.png'})
      expect(i.full_filename).to eq('once/upon/a/time.png')
    end
    
    it "should add extensions only for known file types" do
      i = ButtonImage.create(:settings => {'content_type' => 'image/png'})
      expect(i.full_filename).to match(/\.png$/)
      i.settings['full_filename'] = nil
      i.settings['content_type'] = 'bacon/bacon'
      expect(i.full_filename).not_to match(/\./)
    end
    
    it "should add a hashed value for security" do
      i = ButtonImage.create(:settings => {'content_type' => 'image/png'})
      expect(i.full_filename.length).to be > 150
    end
    
    it "should store the value when returned" do
      i = ButtonImage.create(:settings => {'content_type' => 'image/png'})
      fn = i.full_filename
      i.reload
      expect(i.settings['full_filename']).to eq(fn)
    end
  end
  
  describe "content_type" do
    it "should return the value set in settings" do
      i = ButtonImage.new(:settings => {'content_type' => 'hippo/potamus'})
      expect(i.content_type).to eq('hippo/potamus')
    end
    
    it "should raise if no value found" do
      i = ButtonImage.new(:settings => {})
      expect { i.content_type }.to raise_error("content type required for uploads")
    end
  end

  describe "pending_upload?" do
    it "should return the correct boolean result" do
      i = ButtonImage.new(:settings => {})
      expect(i.pending_upload?).to eq(false)
      i.settings['pending'] = true
      expect(i.pending_upload?).to eq(true)
    end
  end

  describe "process_url" do
    it "should check if it's an already-stored URL, and not force re-upload if so" do
      i = ButtonImage.new(:settings => {})
      expect(Uploader).to receive(:valid_remote_url?).with("http://www.example.com/pic.png").and_return(true)
      i.process_url("http://www.example.com/pic.png", {})
      expect(i.url).to eq("http://www.example.com/pic.png")
    end
    
    it "should set to pending only if it's not already-stored and download is possible" do
      i = ButtonImage.new(:settings => {})
      expect(Uploader).to receive(:valid_remote_url?).with("http://www.example.com/pic.png").and_return(false)
      i.process_url("http://www.example.com/pic.png", {})
      expect(i.url).to eq(nil)
      expect(i.settings['pending_url']).to eq("http://www.example.com/pic.png")
      
      i = ButtonImage.new(:settings => {})
      expect(Uploader).to receive(:valid_remote_url?).with("http://www.example.com/pic.png").and_return(false)
      i.process_url("http://www.example.com/pic.png", {:download => false})
      expect(i.url).to eq("http://www.example.com/pic.png")
    end
    
    it "should set the instance variable @remote_upload_possible if specified during processing" do
      i = ButtonImage.new(:settings => {})
      expect(Uploader).to receive(:valid_remote_url?).with("http://www.example.com/pic.png").and_return(true)
      expect(i.instance_variable_get('@remote_upload_possible')).to eq(nil)
      i.process_url("http://www.example.com/pic.png", {:remote_upload_possible => true})
      expect(i.instance_variable_get('@remote_upload_possible')).to eq(true)
    end
  end

  describe "check_for_pending" do
    it "should set to pending if not already saved and a valid pending_url set" do
      i = ButtonImage.new(:settings => {})
      i.check_for_pending
      expect(i.settings['pending']).to eq(true)
      
      i.url = "http://www.pic.com"
      i.check_for_pending
      expect(i.settings['pending']).not_to eq(true)
      
      i.instance_variable_set('@remote_upload_possible', true)
      i.settings['pending_url'] = "http://www.pic.com"
      i.check_for_pending
      expect(i.settings['pending']).to eq(true)
    end
    
    it "should unset from pending and schedule a background download if client can't upload" do
      i = ButtonImage.new(:settings => {})
      i.settings['pending_url'] = "http://www.example.com"
      i.instance_variable_set('@remote_upload_possible', false)
      i.check_for_pending
      expect(i.settings['pending']).to eq(false)
      expect(i.url).to eq("http://www.example.com")
      expect(i.instance_variable_get('@schedule_upload_to_remote')).to eq(true)
    end
  end

  describe "upload_after_save" do
    it "should schedule an upload only if set" do
      s = ButtonSound.create(:settings => {})
      s.settings['pending_url'] = 'http://www.example.com/pic.png'
      s.instance_variable_set('@schedule_upload_to_remote', false)
      s.upload_after_save
      expect(Worker.scheduled?(ButtonSound, 'perform_action', {'id' => s.id, 'method' => 'upload_to_remote', 'arguments' => ['http://www.example.com/pic.png']})).to eq(false)

      s.instance_variable_set('@schedule_upload_to_remote', true)
      s.upload_after_save
      expect(Worker.scheduled?(ButtonSound, 'perform_action', {'id' => s.id, 'method' => 'upload_to_remote', 'arguments' => ['http://www.example.com/pic.png']})).to eq(true)
    end
  end

  describe "remote_upload_params" do
    it "should collect upload parameters, including a success callback" do
      s = ButtonSound.create(:settings => {'content_type' => 'image/png'})
      res = s.remote_upload_params
      expect(res[:upload_url]).not_to eq(nil)
      expect(res[:upload_params]).not_to eq(nil)
      expect(res[:success_url]).to eq("#{JsonApi::Json.current_host}/api/v1/#{s.file_type}/#{s.global_id}/upload_success?confirmation=#{s.confirmation_key}")
    end
  end

  describe "upload_to_remote" do
    it "should fail unless the record is saved" do
      s = ButtonSound.new
      expect { s.upload_to_remote("") }.to raise_error("must have id first")
    end
    
    it "should handle data-uris" do
      uri = "data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAACyAgCdASoCAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA=="
      s = ButtonSound.create(:settings => {})
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        f = args[:body][:file]
        expect(f.size).to eq(58)
      }.and_return(res)
      s.upload_to_remote(uri)
      expect(s.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(s.settings['content_type']).to eq('image/webp')
    end
    
    it "should handle downloads" do
      s = ButtonSound.create(:settings => {})
      res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'audio/mp3'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        f = args[:body][:file]
        expect(f.size).to eq(7)
      }.and_return(res)
      s.upload_to_remote("http://pic.com/cow.png")
      expect(s.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(s.settings['content_type']).to eq('audio/mp3')
    end
    
    it "should error gracefully on mismatched content type header" do
      s = ButtonSound.create(:settings => {})
      res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      s.upload_to_remote("http://pic.com/cow.png")
      expect(s.url).to eq(nil)
      expect(s.settings['source_url']).to eq("http://pic.com/cow.png")
      expect(s.settings['errored_pending_url']).to eq("http://pic.com/cow.png")
      expect(s.settings['pending']).to eq(true)
    end
    
    it "should error gracefully on bad http response" do
      s = ButtonSound.create(:settings => {})
      res = OpenStruct.new(:success? => false, :headers => {'Content-Type' => 'audio/mp3'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      s.upload_to_remote("http://pic.com/cow.png")
      expect(s.url).to eq(nil)
      expect(s.settings['source_url']).to eq("http://pic.com/cow.png")
      expect(s.settings['errored_pending_url']).to eq("http://pic.com/cow.png")
      expect(s.settings['pending']).to eq(true)
    end
    
    it "should upload to the remote location" do
      s = ButtonSound.create(:settings => {})
      res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'audio/mp3'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        expect(url).to eq(Uploader.remote_upload_config[:upload_url])
      }.and_return(res)
      s.upload_to_remote("http://pic.com/cow.png")
      expect(s.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(s.settings['content_type']).to eq('audio/mp3')
    end
    
    it "should convert for rasterization if specified" do
      s = ButtonSound.create(:settings => {})
      res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'audio/mp3'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        expect(url).to eq(Uploader.remote_upload_config[:upload_url])
      }.and_return(res)


      expect(s).to receive(:convert_image) do |path|
        file = File.open("#{path}.raster.png", 'wb')
        file.puts("asdf")
      end
      expect(File).to receive(:exist?).and_return(true)
  
      expect(s.settings['content_type']).to eq(nil)
      s.upload_to_remote("http://pic.com/cow.png", true)
      expect(s.url).to eq(nil)
      expect(s.settings['rasterized']).to eq('from_filename')
      expect(s.settings['content_type']).to eq('audio/mp3')
    end

    it "should measure image height if not already set" do
      s = ButtonImage.create(:settings => {})
      res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        f = args[:body][:file]
        expect(f.size).to eq(7)
      }.and_return(res)
      
      expect(s).to receive(:'`').and_return("A\nB\nGeometry:  100x150")
      s.upload_to_remote("http://pic.com/cow.png")
      expect(s.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(s.settings['content_type']).to eq('image/png')
      expect(s.settings['width']).to eq(100)
      expect(s.settings['height']).to eq(150)
    end
    
    it "should use the data uri if specified" do
      s = ButtonImage.create(:settings => {'data_uri' => 'data:image/png;base64,R0lGODdh'})
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        f = args[:body][:file]
        expect(f.size).to eq(6)
      }.and_return(res)
      
      s.upload_to_remote('data_uri')
      expect(s.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(s.settings['content_type']).to eq('image/png')
      expect(s.settings['data_uri']).to eq(nil)
    end
    
    it "should clear the data uri on success" do
      s = ButtonImage.create(:settings => {'data_uri' => 'data:image/png;base64,000'})
      res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => "abcdefg")
      expect(Typhoeus).to receive(:get).and_return(res)
      res = OpenStruct.new(:success? => true)
      expect(Typhoeus).to receive(:post) { |url, args|
        f = args[:body][:file]
        expect(f.size).to eq(7)
      }.and_return(res)
      
      expect(s).to receive(:'`').and_return("A\nB\nGeometry:  100x150")
      s.upload_to_remote("http://pic.com/cow.png")
      expect(s.url).not_to eq(nil)
      expect(s.settings['pending']).to eq(false)
      expect(s.settings['content_type']).to eq('image/png')
      expect(s.settings['data_uri']).to eq(nil)
    end
  end
  
  describe "url_for" do
    it 'should return the correct value' do
      u = User.create
      i = ButtonImage.new(url: 'http://www.example.com/api/v1/users/1234/protected_images/bacon')
      expect(i.url_for(nil)).to eq('http://www.example.com/api/v1/users/1234/protected_images/bacon')
      expect(i.url_for(u)).to eq("http://www.example.com/api/v1/users/1234/protected_images/bacon?user_token=#{u.user_token}")
      i.url = "http://www.example.com/api/v1/users/1234/protected_images/bacon?a=1"
      expect(i.url_for(u)).to eq("http://www.example.com/api/v1/users/1234/protected_images/bacon?a=1&user_token=#{u.user_token}")
    end
  end
  
  describe "cached_copy" do
    it "should schedule to cache a copy for protected images" do
      i = ButtonImage.new
      expect(Uploader).to receive(:protected_remote_url?).with("http://www.example.com/pic.png").and_return(true).at_least(1).times
      i.url = "http://www.example.com/pic.png"
      i.save
      expect(Worker.scheduled?(ButtonImage, 'perform_action', {'id' => i.id, 'method' => 'assert_cached_copy', 'arguments' => []})).to eq(true)
    end
    
    it "should return false on no url" do
      i = ButtonImage.new
      expect(i.assert_cached_copy).to eq(false)
    end
    
    it "should return false on no identifiers" do
      i = ButtonImage.new(url: 'http://www.example.com/pic.png')
      expect(i.assert_cached_copy).to eq(false)
    end

    it "should not create a new record on error, just use the same record again" do
      i = ButtonImage.new(url: 'http://www.example.com/pic.svg')
      bi = ButtonImage.create(url: 'bacon')
      expect(Uploader).to receive(:protected_remote_url?).with('http://www.example.com/pic.svg').and_return(true)
      expect(Uploader).to receive(:protected_remote_url?).with('bacon').and_return(false).at_least(1).times
      expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pic.svg').and_return({url: 'bacon'})
      expect(Uploader).to receive(:found_image_url).and_return('http://www.example.com/cache/pic.svg')
      expect(ButtonImage).to receive(:find_by).with(url: 'bacon').and_return(bi)
      expect(bi).to receive(:upload_to_remote) do |url|
        bi.settings['errored_pending_url'] = 'http://something'
        expect(url).to eq('http://www.example.com/cache/pic.svg')
      end
      expect(i.assert_cached_copy).to eq(false)
      expect(ButtonImage.count).to eq(1)
      expect(bi.reload.settings['copy_attempts'].length).to eq(1)
      expect(bi.reload.settings['copy_attempts'][0]).to be > 2.seconds.ago.to_i
    end
    
    it "should return false if too many failed attempts" do
      i = ButtonImage.new(url: 'http://www.example.com/pic.svg')
      bi = ButtonImage.create(url: 'bacon', settings: {'copy_attempts' => [2.hours.ago.to_i, 1.hour.ago.to_i, 30.minutes.ago.to_i]})
      expect(Uploader).to receive(:protected_remote_url?).with('http://www.example.com/pic.svg').and_return(true)
      expect(Uploader).to_not receive(:found_image_url)
      expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pic.svg').and_return({url: 'bacon'})
      expect(i.assert_cached_copy).to eq(false)
    end
    
    it "should not stop if too few failed attempts" do
      i = ButtonImage.new(url: 'http://www.example.com/pic.svg')
      bi = ButtonImage.create(url: 'bacon', settings: {'copy_attempts' => [2.hours.ago.to_i, 1.hour.ago.to_i]})
      expect(Uploader).to receive(:protected_remote_url?).with('http://www.example.com/pic.svg').and_return(true)
      expect(Uploader).to receive(:found_image_url).and_return(nil)
      expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pic.svg').and_return({url: 'bacon'})
      expect(i.assert_cached_copy).to eq(false)
    end
    
    it "should return false if no remote url found" do
      i = ButtonImage.new(url: 'http://www.example.com/pic.svg', settings: {})
      expect(Uploader).to receive(:protected_remote_url?).with('http://www.example.com/pic.svg').and_return(true)
      expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pic.svg').and_return({
        user_id: 'asdf',
        library: 'bacon',
        image_id: 'id'
      })
      expect(Uploader).to receive(:found_image_url).with('id', 'bacon', nil).and_return(nil)
      expect(i.assert_cached_copy).to eq(false)
    end
    
    it "should not error if cached button_image is found, but no result on it yet" do
      bi = ButtonImage.new
      bi2 = ButtonImage.create(url: 'lingolinq://something.png', settings: {'error_pending_url' => 'lingolinq://something.png', 'copy_attempts' => [2.hours.ago.to_i, 1.hour.ago.to_i]})
      u = User.create
      expect(bi.assert_cached_copy).to eq(false)
      bi.url = "http://www.example.com/pic.png"
      bi.save
      expect(Uploader).to receive(:protected_remote_url?).with("http://www.example.com/pic.png").and_return(true)
      expect(Uploader).to receive(:protected_remote_url?).with("http://www.example.com/uploads/pic.png").and_return(false).at_least(1).times
      expect(Uploader).to receive(:protected_remote_url?).with("lingolinq://something.png").and_return(false).at_least(1).times
      expect(ButtonImage).to receive(:cached_copy_identifiers).with("http://www.example.com/pic.png").and_return({
        library: 'lessonpix',
        user_id: u.global_id,
        image_id: '12345',
        url: 'lingolinq://something.png'
      })
      expect(Uploader).to receive(:found_image_url).with('12345', 'lessonpix', u).and_return('http://www.example.com/pics/pic.png')
      expect(ButtonImage).to receive(:find_by).with(url: 'lingolinq://something.png').and_return(bi2)
      expect(bi2).to receive(:upload_to_remote){|url|
        expect(url).to eq('http://www.example.com/pics/pic.png')
        bi2.url = 'http://www.example.com/uploads/pic.png'
        bi2.save
      }.and_return(true)
      expect(bi.settings['errored_pending_url']).to eq(nil)
      expect(bi.assert_cached_copy).to eq(true)
      bi2.reload
      expect(bi2.url).to eq("lingolinq://something.png")
      expect(bi2.settings['cached_copy_url']).to eq('http://www.example.com/uploads/pic.png')
      expect(bi2.settings['copy_attempts']).to eq([])
    end
    
    it "should assert a cached copy" do
      bi = ButtonImage.new
      bi2 = ButtonImage.create
      u = User.create
      expect(bi.assert_cached_copy).to eq(false)
      bi.url = "http://www.example.com/pic.png"
      bi.save
      expect(Uploader).to receive(:protected_remote_url?).with("http://www.example.com/pic.png").and_return(true)
      expect(Uploader).to receive(:protected_remote_url?).with("http://www.example.com/uploads/pic.png").and_return(false).at_least(1).times
      expect(Uploader).to receive(:protected_remote_url?).with("lingolinq://something.png").and_return(false).at_least(1).times
      expect(ButtonImage).to receive(:cached_copy_identifiers).with("http://www.example.com/pic.png").and_return({
        library: 'lessonpix',
        user_id: u.global_id,
        image_id: '12345',
        url: 'lingolinq://something.png'
      })
      expect(Uploader).to receive(:found_image_url).with('12345', 'lessonpix', u).and_return('http://www.example.com/pics/pic.png')
      expect(ButtonImage).to receive(:create).and_return(bi2)
      expect(bi2).to receive(:upload_to_remote){|url|
        expect(url).to eq('http://www.example.com/pics/pic.png')
        bi2.url = 'http://www.example.com/uploads/pic.png'
        bi2.save
      }.and_return(true)
      expect(bi.assert_cached_copy).to eq(true)
      bi2.reload
      expect(bi2.url).to eq("lingolinq://something.png")
      expect(bi2.settings['cached_copy_url']).to eq('http://www.example.com/uploads/pic.png')
    end
    
    it "should retry on failed cache copy assertion" do
      bi = ButtonImage.new
      bi2 = ButtonImage.create
      u = User.create
      expect(bi.assert_cached_copy).to eq(false)
      bi.url = "http://www.example.com/api/v1/users/bob/protected_image/pic/123"
      bi.save
      expect(ButtonImage).to receive(:cached_copy_identifiers).with("http://www.example.com/api/v1/users/bob/protected_image/pic/123").and_return({
        library: 'lessonpix',
        user_id: u.global_id,
        image_id: '12345',
        url: 'lingolinq://something.png'
      })
      expect(Uploader).to receive(:found_image_url).with('12345', 'lessonpix', u).and_return('http://www.example.com/pics/pic.png')
      expect(ButtonImage).to receive(:create).and_return(bi2)
      bi2.settings['errored_pending_url'] = 'asdf'
      bi2.save
      expect(bi2).to receive(:upload_to_remote).with('http://www.example.com/pics/pic.png').and_return(true)
      Worker.flush_queues
      expect(bi.assert_cached_copy).to eq(false)
      expect(ButtonImage.find_by(id: bi2.id)).to_not eq(nil)
      bi2.reload
      expect(bi2.settings['cached_copy_url']).to eq(nil)
      expect(bi2.settings['copy_attempts'].length).to eq(1)
      bi.reload
      expect(Worker.scheduled?(ButtonImage, 'perform_action', {'method' => 'assert_cached_copies', 'arguments' => [["http://www.example.com/api/v1/users/bob/protected_image/pic/123"]]})).to eq(true)
    end
    
    it "should find the cached copy if available" do
      bi = ButtonImage.new
      u = User.create
      expect(ButtonImage.cached_copy_url("http://www.example.com/api/v1/users/#{u.global_id}/protected_image/lessonpix/12345", u)).to eq("https://lessonpix.com/drawings/12345/100x100/12345.png")
      
      bi2 = ButtonImage.create(url: 'lingolinq://protected_image/lessonpix/12345', settings: {'cached_copy_url' => 'http://www.example.com/pic.png'})
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({})
      expect(ButtonImage.cached_copy_url("http://www.example.com/api/v1/users/#{u.global_id}/protected_image/lessonpix/12345", u)).to eq('http://www.example.com/pic.png')
    end
    
    it "should find the cached copy for a different user who is also authorized" do
      bi = ButtonImage.new
      u = User.create
      u2 = User.create
      expect(ButtonImage.cached_copy_url("http://www.example.com/api/v1/users/#{u.global_id}/protected_image/lessonpix/12345", u)).to eq("https://lessonpix.com/drawings/12345/100x100/12345.png")
      
      bi2 = ButtonImage.create(url: 'lingolinq://protected_image/lessonpix/12345', settings: {'cached_copy_url' => 'http://www.example.com/pic.png'})
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return({})
      expect(ButtonImage.cached_copy_url("http://www.example.com/api/v1/users/#{u.global_id}/protected_image/lessonpix/12345", u2)).to eq('http://www.example.com/pic.png')
    end
    
    it "should not find the cached copy for a different user who is not authorized" do
      bi = ButtonImage.new
      u = User.create
      u2 = User.create
      expect(ButtonImage.cached_copy_url("http://www.example.com/api/v1/users/#{u.global_id}/protected_image/lessonpix/12345", u)).to eq("https://lessonpix.com/drawings/12345/100x100/12345.png")
      
      bi2 = ButtonImage.create(url: 'lingolinq://protected_image/lessonpix/12345', settings: {'cached_copy_url' => 'http://www.example.com/pic.png'})
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return(nil)
      expect(ButtonImage.cached_copy_url("http://www.example.com/api/v1/users/#{u.global_id}/protected_image/lessonpix/12345", u2)).to eq("https://lessonpix.com/drawings/12345/100x100/12345.png")
    end
    
    describe "assert_cached_copies" do
      it "should call assert_cached_copy for any non-cached urls" do
        url1 = "http://www.example.com/pics/1"
        url2 = "http://www.example.com/pics/1"
        url3 = "http://www.example.com/pics/2"
        url4 = "http://www.example.com/pics/3"
        url5 = "http://www.example.com/pics/4"
        url6 = "http://www.example.com/pics/5"
        bi = ButtonImage.create(:url => 'pic:1', :settings => {'cached_copy_url' => 'http://www.example/cache/1'})
        bi = ButtonImage.create(:url => 'pic:2', :settings => {'cached_copy_url' => 'http://www.example/cache/2'})
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pics/1').and_return({
          user_id: 'sue', library: 'lessonpix', image_id: '123', url: 'pic:1'
        }).exactly(2).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pics/2').and_return({
          user_id: 'jane', library: 'lessonpix', image_id: '234', url: 'pic:2'
        }).exactly(1).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pics/3').and_return({
          user_id: 'alice', library: 'lessonpix', image_id: '345', url: 'pic:3'
        }).exactly(1).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pics/4').and_return({
          user_id: 'minnie', library: 'lessonpix', image_id: '456', url: 'pic:4'
        })
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/pics/5').and_return(nil)
        expect(ButtonImage).to receive(:assert_cached_copy).with('http://www.example.com/pics/3').and_return(true)
        expect(ButtonImage).to receive(:assert_cached_copy).with('http://www.example.com/pics/4').and_return(false)
        expect(ButtonImage).to receive(:assert_cached_copy).with('http://www.example.com/pics/5').and_return(false)
        res = ButtonImage.assert_cached_copies([url1, url2, url3, url4, url5, url6])
        expect(res).to eq({
          'http://www.example.com/pics/1' => true,
          'http://www.example.com/pics/2' => true,
          'http://www.example.com/pics/3' => true,
          'http://www.example.com/pics/4' => false,
          'http://www.example.com/pics/5' => false
        })
      end
    end
    
    describe "cached_copy_urls" do
      it "should return a list of url mappings" do
        bi1 = ButtonImage.create(:url => "bacon:1", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/1'})
        bi2 = ButtonImage.create(:url => "bacon:2", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/2'})
        bbi1 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi2 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi3 = ButtonImage.create(:url => 'http://www.example.com/bacon/2')
        bbi4 = ButtonImage.create(:url => 'http://www.example.com/bacon/3')
        bbi5 = ButtonImage.create(:url => 'http://www.example.com/bacon/4')
        u = User.create
        expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({})
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/1').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:1'
        }).exactly(2).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/2').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:2'
        })
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/3').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:3'
        })
        expect(Uploader).to receive(:protected_remote_url?).and_return(true).at_least(7).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/4').and_return(nil)
        expect(Uploader).to receive(:fallback_image_url).and_return("http://www.example.com/bacon/cache/fallback").at_least(4).times
        hash = ButtonImage.cached_copy_urls([bbi1, bbi2, bbi3, bbi4, bbi5], u)
        expect(hash).to eq({
          'http://www.example.com/bacon/1' => 'http://www.example.com/bacon/cache/1',
          'http://www.example.com/bacon/2' => 'http://www.example.com/bacon/cache/2',
          'http://www.example.com/bacon/3' => 'http://www.example.com/bacon/cache/fallback'
        })
        expect(bbi1.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi5.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
      end

      it "should update any records where a cached url is found" do
        bi1 = ButtonImage.create(:url => "bacon:1", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/1'})
        bi2 = ButtonImage.create(:url => "bacon:2", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/2'})
        bbi1 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi2 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi3 = ButtonImage.create(:url => 'http://www.example.com/bacon/2')
        bbi4 = ButtonImage.create(:url => 'http://www.example.com/bacon/3')
        bbi5 = ButtonImage.create(:url => 'http://www.example.com/bacon/4')
        u = User.create
        expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({})
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/1').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:1'
        }).exactly(2).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/2').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:2'
        })
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/3').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:3'
        })
        expect(Uploader).to receive(:protected_remote_url?).and_return(true).at_least(7).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/4').and_return(nil)
        expect(Uploader).to receive(:fallback_image_url).and_return("http://www.example.com/bacon/cache/fallback").at_least(4).times
        hash = ButtonImage.cached_copy_urls([bbi1, bbi2, bbi3, bbi4, bbi5], u)
        expect(hash).to eq({
          'http://www.example.com/bacon/1' => 'http://www.example.com/bacon/cache/1',
          'http://www.example.com/bacon/2' => 'http://www.example.com/bacon/cache/2',
          'http://www.example.com/bacon/3' => 'http://www.example.com/bacon/cache/fallback'
        })
        expect(bbi1.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi5.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
        expect(bbi1.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq(nil)
        expect(bbi5.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
      end
      
      it "should not update records where a cached url is found if it already has a cached url (unless it happens to find a better url)" do
        bi1 = ButtonImage.create(:url => "bacon:1", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/1'})
        bi2 = ButtonImage.create(:url => "bacon:2", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/2'})
        bbi1 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi2 = ButtonImage.create(:url => 'http://www.example.com/bacon/1', :settings => {'cached_copy_url' => 'http://www.example.com/cheddar/cache/1'})
        bbi3 = ButtonImage.create(:url => 'http://www.example.com/bacon/2', :settings => {'cached_copy_url' => 'http://www.example.com/cheddar/cache/2'})
        bbi4 = ButtonImage.create(:url => 'http://www.example.com/bacon/3')
        bbi5 = ButtonImage.create(:url => 'http://www.example.com/bacon/4')
        u = User.create
        expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({})
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/1').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:1'
        }).exactly(2).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/2').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:2'
        })
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/3').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:3'
        })
        expect(Uploader).to receive(:protected_remote_url?).and_return(true).at_least(4).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/4').and_return(nil)
        expect(Uploader).to receive(:fallback_image_url).and_return("http://www.example.com/bacon/cache/fallback").at_least(4).times
        hash = ButtonImage.cached_copy_urls([bbi1, bbi2, bbi3, bbi4, bbi5], u)
        expect(hash).to eq({
          'http://www.example.com/bacon/1' => 'http://www.example.com/bacon/cache/1',
          'http://www.example.com/bacon/2' => 'http://www.example.com/cheddar/cache/2',
          'http://www.example.com/bacon/3' => 'http://www.example.com/bacon/cache/fallback'
        })
        expect(bbi1.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.settings['cached_copy_url']).to eq('http://www.example.com/cheddar/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi5.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
        expect(bbi1.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.reload.settings['cached_copy_url']).to eq('http://www.example.com/cheddar/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq(nil)
        expect(bbi4.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq(nil)
        expect(bbi5.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
      end
      
      it "should not update records that only have fallback urls" do
        bi1 = ButtonImage.create(:url => "bacon:1", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/1'})
        bi2 = ButtonImage.create(:url => "bacon:2", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/2'})
        bbi1 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi2 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi3 = ButtonImage.create(:url => 'http://www.example.com/bacon/2')
        bbi4 = ButtonImage.create(:url => 'http://www.example.com/bacon/3')
        bbi5 = ButtonImage.create(:url => 'http://www.example.com/bacon/4')
        u = User.create
        expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({})
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/1').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:1'
        }).exactly(2).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/2').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:2'
        })
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/3').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:3'
        })
        expect(Uploader).to receive(:protected_remote_url?).and_return(true).at_least(7).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/4').and_return(nil)
        expect(Uploader).to receive(:fallback_image_url).and_return("http://www.example.com/bacon/cache/fallback").at_least(4).times
        hash = ButtonImage.cached_copy_urls([bbi1, bbi2, bbi3, bbi4, bbi5], u)
        expect(hash).to eq({
          'http://www.example.com/bacon/1' => 'http://www.example.com/bacon/cache/1',
          'http://www.example.com/bacon/2' => 'http://www.example.com/bacon/cache/2',
          'http://www.example.com/bacon/3' => 'http://www.example.com/bacon/cache/fallback'
        })
        expect(bbi1.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi5.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
        expect(bbi1.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/1')
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.reload.settings['cached_copy_url']).to eq('http://www.example.com/bacon/cache/2')
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq(nil)
        expect(bbi5.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
      end
      
      it "should return fallback urls if available and the user isn't authorized for the real one" do
        bi1 = ButtonImage.create(:url => "bacon:1", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/1'})
        bi2 = ButtonImage.create(:url => "bacon:2", :settings => {'cached_copy_url' => 'http://www.example.com/bacon/cache/2'})
        bbi1 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi2 = ButtonImage.create(:url => 'http://www.example.com/bacon/1')
        bbi3 = ButtonImage.create(:url => 'http://www.example.com/bacon/2')
        bbi4 = ButtonImage.create(:url => 'http://www.example.com/bacon/3')
        bbi5 = ButtonImage.create(:url => 'http://www.example.com/bacon/4')
        u = User.create
        expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return(nil)
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/1').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:1'
        }).exactly(2).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/2').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:2'
        })
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/3').and_return({
          user_id: 'sam',
          library: 'lessonpix',
          image_id: '123',
          url: 'bacon:3'
        })
        expect(Uploader).to receive(:protected_remote_url?).and_return(true).at_least(4).times
        expect(ButtonImage).to receive(:cached_copy_identifiers).with('http://www.example.com/bacon/4').and_return(nil)
        expect(Uploader).to receive(:fallback_image_url).and_return("http://www.example.com/bacon/cache/fallback").at_least(4).times
        hash = ButtonImage.cached_copy_urls([bbi1, bbi2, bbi3, bbi4, bbi5], u)
        expect(hash).to eq({
          'http://www.example.com/bacon/1' => 'http://www.example.com/bacon/cache/fallback',
          'http://www.example.com/bacon/2' => 'http://www.example.com/bacon/cache/fallback',
          'http://www.example.com/bacon/3' => 'http://www.example.com/bacon/cache/fallback'
        })
        expect(bbi1.settings['cached_copy_url']).to eq(nil)
        expect(bbi1.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi2.settings['cached_copy_url']).to eq(nil)
        expect(bbi2.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi3.settings['cached_copy_url']).to eq(nil)
        expect(bbi3.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi4.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq('http://www.example.com/bacon/cache/fallback')
        expect(bbi5.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
        expect(bbi1.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi1.settings['fallback_copy_url']).to eq(nil)
        expect(bbi2.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi2.settings['fallback_copy_url']).to eq(nil)
        expect(bbi3.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi3.settings['fallback_copy_url']).to eq(nil)
        expect(bbi4.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi4.settings['fallback_copy_url']).to eq(nil)
        expect(bbi5.reload.settings['cached_copy_url']).to eq(nil)
        expect(bbi5.settings['fallback_copy_url']).to eq(nil)
      end
      
    end
    
    describe "cached_copy_identifiers" do
      it "should return matching parameters" do
        expect(ButtonImage.cached_copy_identifiers(nil)).to eq(nil)
        expect(ButtonImage.cached_copy_identifiers('')).to eq(nil)
        expect(ButtonImage.cached_copy_identifiers('http://www.example.com/api/v1/users/bob/protected_image/lessonpix/12345?a=1234')).to eq({
          user_id: 'bob',
          library: 'lessonpix',
          image_id: '12345',
          original_url: 'http://www.example.com/api/v1/users/bob/protected_image/lessonpix/12345?a=1234',
          url: 'lingolinq://protected_image/lessonpix/12345'
        })
      end
      
      it "should return nil if not a valid address" do
        expect(ButtonImage.cached_copy_identifiers(nil)).to eq(nil)
        expect(ButtonImage.cached_copy_identifiers('')).to eq(nil)
        expect(ButtonImage.cached_copy_identifiers('http://www.example.com/pic.png')).to eq(nil)
      end
    end
  end
  
  describe "best_url" do
    it 'should return the cached url if defined' do
      bi = ButtonImage.new(:settings => {'cached_copy_url' => 'asdf'})
      expect(bi.best_url).to eq('asdf')
    end
    
    it 'should return the frontend url if defined' do
      expect(Uploader).to receive(:fronted_url).with('asdf').and_return('jkl')
      bi = ButtonImage.new(:url => 'asdf', :settings => {})
      expect(bi.best_url).to eq('jkl')
    end
  end

  describe "raster_url" do
    it "should return nil by default" do
      bi = ButtonImage.new
      expect(bi.raster_url).to eq(nil)
    end

    it "should return url-based options" do
      bi = ButtonImage.new
      bi.settings = {'rasterized' => 'from_url'}
      expect(bi.raster_url).to eq(nil)
      bi.url = "http://www.example.com/pic.svg"
      expect(bi.raster_url).to eq("http://www.example.com/pic.svg.raster.png")
    end

    it "should return filename-based rasters" do
      bi = ButtonImage.new
      bi.settings = {'rasterized' => 'from_filename'}
      expect(bi).to receive(:full_filename).and_return(nil)
      expect(bi.raster_url).to eq(nil)
      expect(bi).to receive(:full_filename).and_return("a/b/c/d.svg").at_least(1).times
      expect(bi.raster_url).to eq("#{ENV['UPLOADS_S3_CDN'] || "https://#{ENV['UPLOADS_S3_BUCKET']}"}/a/b/c/d.svg.raster.png")
    end

    it "should return skinned url if passed" do
      bi = ButtonImage.new
      bi.settings = {'rasterized' => 'from_url'}
      expect(bi.raster_url).to eq(nil)
      bi.url = "http://www.example.com/pic.svg"
      expect(bi.raster_url("skinned_url")).to eq("skinned_url.raster.png")

      bi.settings = {'rasterized' => 'from_filename'}
      expect(bi).to receive(:full_filename).and_return(nil)
      expect(bi.raster_url('skinned_url')).to eq(nil)
      expect(bi).to receive(:full_filename).and_return("a/b/c/d.svg").at_least(1).times
      expect(bi.raster_url('skinned_url')).to eq("skinned_url.raster.png")
    end
  end

  describe "assert_raster" do
    it "should do nothing by default" do
      bi = ButtonImage.new
      expect(Typhoeus).to_not receive(:head)
      expect(bi.assert_raster).to eq(nil)
    end

    it "should do nothing if already rasterized" do
      bi = ButtonImage.new
      bi.settings = {'content_type' => 'image/svg', 'rasterized' => true}
      expect(Typhoeus).to_not receive(:head)
      expect(bi.assert_raster).to eq(nil)
    end

    it "should do a HEAD request for svg images" do
      bi = ButtonImage.new
      bi.url = "http://www.example.com/pic.svg"
      bi.settings = {'content_type' => 'image/svg'}
      res = OpenStruct.new
      expect(res).to receive(:success?).and_return(false)
      expect(Typhoeus).to receive(:head).with("http://www.example.com/pic.svg.raster.png", followlocation: true).and_return(res)
      bi.assert_raster
    end

    it "should use the existing raster if there" do
      bi = ButtonImage.new
      bi.url = "http://www.example.com/pic.svg"
      bi.settings = {'content_type' => 'image/svg'}
      res = OpenStruct.new
      expect(res).to receive(:success?).and_return(true)
      expect(Typhoeus).to receive(:head).with("http://www.example.com/pic.svg.raster.png", followlocation: true).and_return(res)
      bi.assert_raster
      expect(bi.settings['rasterized']).to eq('from_url')
    end

    it "should schedule remote upload if no existing raster" do
      bi = ButtonImage.new
      bi.url = "http://www.example.com/pic.svg"
      bi.settings = {'content_type' => 'image/svg'}
      res = OpenStruct.new
      expect(res).to receive(:success?).and_return(false)
      expect(bi).to receive(:schedule).with(:upload_to_remote, bi.url, true)
      expect(Typhoeus).to receive(:head).with("http://www.example.com/pic.svg.raster.png", followlocation: true).and_return(res)
      bi.assert_raster
    end
  end
end
