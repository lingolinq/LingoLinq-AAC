require 'spec_helper'

describe Uploader do
  describe "remote_upload" do
    it "should request upload parameters" do
      expect(Uploader).to receive(:remote_upload_params).with("bacon", "hat/beret").and_return({})
      Uploader.remote_upload("bacon", "/hat", "hat/beret")
    end
    it "should fail gracefully if the file is not found" do
      allow(Uploader).to receive(:remote_upload_params).and_return(upload_url: 'https://example.com/', upload_params: {})
      expect(Uploader.remote_upload("bacon", "/hat", "hat/beret")).to eq(nil)
    end
    
    it "should post the upload, including a file handle" do
      expect(Uploader).to receive(:remote_upload_params).with("bacon", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => true)
      f = Tempfile.new("stash")
      expect(Typhoeus).to receive(:post) { |url, args|
        expect(url).to eq("http://www.upload.com/")
        expect(args[:body][:a]).to eq(1)
        expect(args[:body][:b]).to eq(2)
        expect(args[:body][:file].path).to eq(f.path)
      }.and_return(res)
      Uploader.remote_upload("bacon", f.path, "text/plaintext")
      f.unlink
    end
    
    it "should return the url to the uploaded object if successful" do
      expect(Uploader).to receive(:remote_upload_params).with("bacon", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => true)
      f = Tempfile.new("stash")
      expect(Typhoeus).to receive(:post).and_return(res)
      expect(Uploader.remote_upload("bacon", f.path, "text/plaintext")).to eq({url: "http://www.upload.com/bacon", path: 'bacon', uploaded: true})
      f.unlink
    end

    it "should return nil if upload unsuccessful" do
      expect(Uploader).to receive(:remote_upload_params).with("bacon", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => false, body: 'nothing')
      f = Tempfile.new("stash")
      expect(Typhoeus).to receive(:post).and_return(res)
      expect{ Uploader.remote_upload("bacon", f.path, "text/plaintext") }.to raise_error("nothing")
      f.unlink
    end

    it "should return existing url if the checksum matches" do
      f = Tempfile.new("stash")
      expect(Uploader).to receive(:check_existing_upload).with("a/b/c", "chksum").and_return({url: "https://a.b.c/file.txt"})
      expect(Uploader).to receive(:remote_touch).with("a/b/c").and_return(true)
      expect(Uploader.remote_upload("a/b/c", f.path, "text/plaintext", "chksum")).to eq({:path=>"a/b/c", :url=>"https://a.b.c/file.txt"})
    end

    it "should return an updated path if the checksum is different" do
      f = Tempfile.new("stash")
      expect(Uploader).to receive(:check_existing_upload).with("a/b/c", "chksum").and_return({mismatch: true})

      expect(Uploader).to receive(:remote_upload_params).with("a/b/chksmchksu/c", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => true)
      f = Tempfile.new("stash")
      expect(Typhoeus).to receive(:post) { |url, args|
        expect(url).to eq("http://www.upload.com/")
        expect(args[:body][:a]).to eq(1)
        expect(args[:body][:b]).to eq(2)
        expect(args[:body][:file].path).to eq(f.path)
      }.and_return(res)

      expect(Uploader.remote_upload("a/b/c", f.path, "text/plaintext", "chksum")).to eq({:path=>"a/b/chksmchksu/c", :uploaded=>true, :url=>"http://www.upload.com/a/b/chksmchksu/c"})
    end

    it "should strip the old checksum from the path when updating the path if needed" do
      f = Tempfile.new("stash")
      expect(Uploader).to receive(:check_existing_upload).with("a/b/chksm8888", "chksum").and_return({mismatch: true})

      expect(Uploader).to receive(:remote_upload_params).with("a/chksmchksu/b", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => true)
      f = Tempfile.new("stash")
      expect(Typhoeus).to receive(:post) { |url, args|
        expect(url).to eq("http://www.upload.com/")
        expect(args[:body][:a]).to eq(1)
        expect(args[:body][:b]).to eq(2)
        expect(args[:body][:file].path).to eq(f.path)
      }.and_return(res)

      expect(Uploader.remote_upload("a/b/chksm8888", f.path, "text/plaintext", "chksum")).to eq({:path=>"a/chksmchksu/b", :uploaded=>true, :url=>"http://www.upload.com/a/chksmchksu/b"})
    end

    it "should remove any pending delete remote actions" do
      expect(Uploader).to receive(:remote_upload_params).with("bacon", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => true)
      f = Tempfile.new("stash")
      RemoteAction.create(action: 'delete', path: 'bacon', extra: 'chksum')
      RemoteAction.create(action: 'delete', path: 'radish', extra: 'chksum2')
      expect(RemoteAction.count).to eq(2)
      expect(Typhoeus).to receive(:post).and_return(res)
      expect(Uploader.remote_upload("bacon", f.path, "text/plaintext")).to eq({url: "http://www.upload.com/bacon", path: 'bacon', uploaded: true})
      f.unlink
      expect(RemoteAction.count).to eq(1)
      expect(RemoteAction.last.path).to eq('radish')
    end

    it "should remove pending delete remote actions if file already exists" do
      RemoteAction.create(action: 'delete', path: 'a/b/c', extra: 'chksum')
      RemoteAction.create(action: 'delete', path: 'a/b/c', extra: 'chksum2')
      expect(RemoteAction.count).to eq(2)
      f = Tempfile.new("stash")
      expect(Uploader).to receive(:check_existing_upload).with("a/b/c", "chksum").and_return({url: "https://a.b.c/file.txt"})
      expect(Uploader).to receive(:remote_touch).with("a/b/c").and_return(true)
      expect(Uploader.remote_upload("a/b/c", f.path, "text/plaintext", "chksum")).to eq({:path=>"a/b/c", :url=>"https://a.b.c/file.txt"})
      expect(RemoteAction.count).to eq(0)
    end

    it "should remove pending delete remote actions if checksum was appended" do
      RemoteAction.create(action: 'delete', path: 'a/b/c', extra: 'chksum')
      RemoteAction.create(action: 'delete', path: 'a/b/chksmchksu/c', extra: 'chksum')
      expect(RemoteAction.count).to eq(2)
      f = Tempfile.new("stash")
      expect(Uploader).to receive(:check_existing_upload).with("a/b/c", "chksum").and_return({mismatch: true})

      expect(Uploader).to receive(:remote_upload_params).with("a/b/chksmchksu/c", "text/plaintext").and_return({
        :upload_params => {:a => 1, :b => 2},
        :upload_url => "http://www.upload.com/"
      })
      res = OpenStruct.new(:success? => true)
      f = Tempfile.new("stash")
      expect(Typhoeus).to receive(:post) { |url, args|
        expect(url).to eq("http://www.upload.com/")
        expect(args[:body][:a]).to eq(1)
        expect(args[:body][:b]).to eq(2)
        expect(args[:body][:file].path).to eq(f.path)
      }.and_return(res)

      expect(Uploader.remote_upload("a/b/c", f.path, "text/plaintext", "chksum")).to eq({:path=>"a/b/chksmchksu/c", :uploaded=>true, :url=>"http://www.upload.com/a/b/chksmchksu/c"})
      expect(RemoteAction.count).to eq(1)
      expect(RemoteAction.last.path).to eq('a/b/c')
    end
  end

  describe "check_existing_upload" do
    let(:upload_config) do
      { access_key: 'test_key', secret: 'test_secret', bucket_name: 'test-bucket', upload_url: 'https://example.com/' }
    end

    before do
      allow(Uploader).to receive(:remote_upload_config).and_return(upload_config)
      @orig_cdn = ENV['UPLOADS_S3_CDN']
      ENV['UPLOADS_S3_CDN'] = 'https://example.com'
    end

    after do
      ENV['UPLOADS_S3_CDN'] = @orig_cdn
    end

    it "should return false without a path" do
      expect(Uploader.check_existing_upload(nil)).to eq({found: false})
    end

    it "should return false if the object is not found" do
      service = OpenStruct.new
      bucket = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(bucket)
      expect(bucket).to receive(:objects).and_return(bucket)
      expect(bucket).to receive(:find).with("a/b/c").and_raise("nope")
      expect(Uploader.check_existing_upload("a/b/c")).to eq({found: false})
    end

    it "should strip the leading slash" do
      service = OpenStruct.new
      bucket = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(bucket)
      expect(bucket).to  receive(:objects).and_return(bucket)
      expect(bucket).to receive(:find).with("a/b/c").and_raise("nope")
      expect(Uploader.check_existing_upload("/a/b/c")).to eq({found: false})
    end

    it "should return the found record" do
      service = OpenStruct.new
      bucket = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(bucket)
      expect(bucket).to  receive(:objects).and_return(bucket)
      expect(bucket).to receive(:find).with("a/b/c").and_return(bucket)
      expect(bucket).to receive(:object_request).with(:head, {}).and_return({'etag' => '', 'x-amz-expiration' => "expiry-date=\"#{7.days.from_now.iso8601}\""})

      expect(Uploader.check_existing_upload("/a/b/c")).to eq({found: true, url: "https://example.com/a/b/c"})
    end

    it "should return expiration status" do
      service = OpenStruct.new
      bucket = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(bucket)
      expect(bucket).to  receive(:objects).and_return(bucket)
      expect(bucket).to receive(:find).with("a/b/c").and_return(bucket)
      expect(bucket).to receive(:object_request).with(:head, {}).and_return({'etag' => '', 'x-amz-expiration' => "expiry-date=\"#{7.hours.from_now.iso8601}\""})

      expect(Uploader.check_existing_upload("/a/b/c")).to eq({found: true, expired: true})
    end

    it "should return mismatch status" do
      service = OpenStruct.new
      bucket = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(bucket)
      expect(bucket).to  receive(:objects).and_return(bucket)
      expect(bucket).to receive(:find).with("a/b/c").and_return(bucket)
      expect(bucket).to receive(:object_request).with(:head, {}).and_return({'etag' => 'chksum2', 'x-amz-expiration' => "expiry-date=\"#{7.days.from_now.iso8601}\""})

      expect(Uploader.check_existing_upload("/a/b/c", "chksum")).to eq({found: true, mismatch: true})
    end

    it "should return the found record if checksum matches" do
      service = OpenStruct.new
      bucket = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(bucket)
      expect(bucket).to  receive(:objects).and_return(bucket)
      expect(bucket).to receive(:find).with("a/b/c").and_return(bucket)
      expect(bucket).to receive(:object_request).with(:head, {}).and_return({'etag' => 'chksum', 'x-amz-expiration' => "expiry-date=\"#{7.days.from_now.iso8601}\""})

      expect(Uploader.check_existing_upload("/a/b/c")).to eq({found: true, url: "https://example.com/a/b/c"})
    end

    it "should return found false when S3 raises ResponseError (e.g. empty error body from AWS)" do
      service = OpenStruct.new
      response = double('response', code: '403')
      err = S3::Error::ResponseError.new('AccessDenied', response)
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_raise(err)
      expect(Rails.logger).to receive(:warn).with(/Uploader\.check_existing_upload S3::Error::ResponseError/)
      expect(Uploader.check_existing_upload("/a/b/c")).to eq({found: false})
    end

    it "should return found false when bucket find returns nil" do
      service = OpenStruct.new
      expect(S3::Service).to receive(:new).with(:access_key_id => 'test_key', :secret_access_key => 'test_secret', timeout: 3).and_return(service)
      expect(service).to receive(:buckets).and_return(service)
      expect(service).to receive(:find).with('test-bucket').and_return(nil)
      expect(Uploader.check_existing_upload("/a/b/c")).to eq({found: false})
    end
  end  

  describe "remote_upload_params" do
    let(:upload_config) do
      {
        upload_url: 'https://test-bucket.s3.amazonaws.com/',
        access_key: 'test_key',
        secret: 'test_secret',
        bucket_name: 'test-bucket',
        static_bucket_name: 'static-bucket'
      }
    end

    before do
      Uploader.instance_variable_set('@remote_upload_config', nil)
      allow(Uploader).to receive(:remote_upload_config).and_return(upload_config)
    end

    it "should generate signed upload parameters" do
      res = Uploader.remote_upload_params("downloads/file.png", "image/png")
      expect(res[:upload_url]).to eq(Uploader.remote_upload_config[:upload_url])
      expect(res[:upload_params]).not_to eq(nil)
      expect(res[:upload_params]['AWSAccessKeyId']).not_to eq(nil)
      expect(res[:upload_params]['Content-Type']).to eq('image/png')
      expect(res[:upload_params]['key']).to eq('downloads/file.png')
      expect(res[:upload_params]['policy']).not_to eq(nil)
      expect(res[:upload_params]['signature']).not_to eq(nil)
      expect(res[:upload_params]['success_action_status']).to eq('200')
    end
  end

  describe "remote_upload_config" do
    it "should return data from environment variables" do
      Uploader.instance_variable_set('@remote_upload_config', nil)
      expect(Uploader.remote_upload_config).to eq({
        :upload_url => "https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/",
        :access_key => ENV['AWS_KEY'],
        :secret => ENV['AWS_SECRET'],
        :bucket_name => ENV['UPLOADS_S3_BUCKET'],
        :static_bucket_name => ENV['STATIC_S3_BUCKET']
      })
    end
  end
  
  describe "signed_download_url" do
    it "should return a signed url if the object is found" do
      object = OpenStruct.new(:temporary_url => "asdfjkl")
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('asdf').and_return(object)
      bucket = OpenStruct.new(:objects => objects)
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).with(ENV['STATIC_S3_BUCKET']).and_return(bucket)
      service = OpenStruct.new(:buckets => buckets)
      expect(S3::Service).to receive(:new).and_return(service)
      
      expect(Uploader.signed_download_url("asdf")).to eq("asdfjkl")
    end
    
    it "should return nil if an object is not found" do
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('asdf').and_return(nil)
      bucket = OpenStruct.new(:objects => objects)
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).with(ENV['STATIC_S3_BUCKET']).and_return(bucket)
      service = OpenStruct.new(:buckets => buckets)
      expect(S3::Service).to receive(:new).and_return(service)
      
      expect(Uploader.signed_download_url("asdf")).to eq(nil)
    end
    
    it "should return nil if the bucket is not found" do
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).with(ENV['STATIC_S3_BUCKET']).and_return(nil)
      service = OpenStruct.new(:buckets => buckets)
      expect(S3::Service).to receive(:new).and_return(service)
      
      expect(Uploader.signed_download_url("asdf")).to eq(nil)
    end
    
    it "should filter out the bucket host and protocol" do
      object = OpenStruct.new(:temporary_url => "asdfjkl")
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('asdf').and_return(object).exactly(3).times
      bucket = OpenStruct.new(:objects => objects)
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).with(ENV['STATIC_S3_BUCKET']).and_return(bucket).exactly(3).times
      service = OpenStruct.new(:buckets => buckets)
      expect(S3::Service).to receive(:new).and_return(service).exactly(3).times
      
      expect(Uploader.signed_download_url("asdf")).to eq("asdfjkl")
      expect(Uploader.signed_download_url("https://#{ENV['STATIC_S3_BUCKET']}.s3.amazonaws.com/asdf")).to eq("asdfjkl")
      expect(Uploader.signed_download_url("https://#{ENV['STATIC_S3_BUCKET']}.s3.amazonaws.com/asdf")).to eq("asdfjkl")
    end
  end

  describe "valid_remote_url?" do
    it "should return true only for known URLs" do
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'
      orig_uploads = ENV['UPLOADS_S3_BUCKET']
      orig_opensymbols = ENV['OPENSYMBOLS_S3_BUCKET']
      ENV['UPLOADS_S3_BUCKET'] = uploads_bucket
      ENV['OPENSYMBOLS_S3_BUCKET'] = ENV['OPENSYMBOLS_S3_BUCKET'] || 'opensymbols'
      begin
        opensymbols_bucket = ENV['OPENSYMBOLS_S3_BUCKET']
        expect(Uploader.valid_remote_url?("https://#{uploads_bucket}.s3.amazonaws.com/bacon")).to eq(true)
        expect(Uploader.valid_remote_url?("http://#{uploads_bucket}.s3.amazonaws.com/bacon")).to eq(false)
        expect(Uploader.valid_remote_url?("https://#{uploads_bucket}.s3.amazonaws.com/bacon/downloads/maple.zip")).to eq(true)
        expect(Uploader.valid_remote_url?("https://#{opensymbols_bucket}.s3.amazonaws.com/hat.png")).to eq(true)
        expect(Uploader.valid_remote_url?("http://#{opensymbols_bucket}.s3.amazonaws.com/hat.png")).to eq(false)
        expect(Uploader.valid_remote_url?("https://#{opensymbols_bucket}.s3.amazonaws.com2/hat.png")).to eq(false)
        expect(Uploader.valid_remote_url?("https://images.com/cow.png")).to eq(false)
      ensure
        ENV['UPLOADS_S3_BUCKET'] = orig_uploads
        ENV['OPENSYMBOLS_S3_BUCKET'] = orig_opensymbols
      end
    end
  end  

  describe "remote_remove" do
    it "should raise error on unexpected path" do
      expect{ Uploader.remote_remove("https://www.google.com/bacon") }.to raise_error("scary delete, not a path I'm comfortable deleting: https://www.google.com/bacon")
      expect{ Uploader.remote_remove("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/images/abcdefg/asdf/asdfasdf.asdf") }.to raise_error("scary delete, not a path I'm comfortable deleting: images/abcdefg/asdf/asdfasdf.asdf")
    end
    
    it "should remove the object if found" do
      object = OpenStruct.new
      expect(object).to receive(:destroy).and_return(true)
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(object)
      bucket = OpenStruct.new({
        objects: objects
      })
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      res = Uploader.remote_remove("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/images/abcdefg/asdf-asdf.asdf")
      expect(res).to eq(true)
    end
    
    it "should not error if the object is not found" do
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_raise("not found")
      bucket = OpenStruct.new({
        objects: objects
      })
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      res = Uploader.remote_remove("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/images/abcdefg/asdf-asdf.asdf")
      expect(res).to eq(nil)
    end
    
    it "should remove with a nil checksum" do
      object = OpenStruct.new
      expect(object).to receive(:destroy).and_return(true)
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(object)
      bucket = OpenStruct.new({
        objects: objects
      })
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      res = Uploader.remote_remove("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/images/abcdefg/asdf-asdf.asdf")
      expect(res).to eq(true)
    end

    it "should not remove with a mismatched checksum" do
      object = OpenStruct.new
      expect(object).to receive(:object_request).with(:head, {}).and_return({
        'etag' => "remote_checksum",
        'x-amz-expiration' => "expiry-date=\"#{7.days.from_now.iso8601}\""
      })
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(object)
      bucket = OpenStruct.new({
        objects: objects
      })
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      res = Uploader.remote_remove("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/images/abcdefg/asdf-asdf.asdf", "bad_chksum")
      expect(res).to eq(false)
    end

    it "should not remove if checksum is passed and object is not found" do
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(nil)
      bucket = OpenStruct.new({
        objects: objects
      })
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      res = Uploader.remote_remove("https://#{ENV['UPLOADS_S3_BUCKET']}.s3.amazonaws.com/images/abcdefg/asdf-asdf.asdf", "bad_chksum")
      expect(res).to eq(false)
    end
  end

  describe 'remote_touch' do
    it 'should copy the path to the same location' do
      object = OpenStruct.new
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(object)
      bucket = OpenStruct.new({
        objects: objects
      })
      expect(object).to receive(:copy).with(hash_including(:key => 'images/abcdefg/asdf-asdf.asdf', :bucket => bucket)).and_return(true)
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      expect(Uploader.remote_touch('images/abcdefg/asdf-asdf.asdf')).to eq(true)
    end

    it 'should return false on failed update' do
      object = OpenStruct.new
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(object)
      bucket = OpenStruct.new({
        objects: objects
      })
      expect(object).to receive(:copy).with(hash_including(:key => 'images/abcdefg/asdf-asdf.asdf', :bucket => bucket)).and_raise("bacon")
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      expect(Uploader.remote_touch('images/abcdefg/asdf-asdf.asdf')).to eq(false)
    end

    it 'should return false on missing path' do
      object = OpenStruct.new
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_raise("nope")
      bucket = OpenStruct.new({
        objects: objects
      })
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      expect(Uploader.remote_touch('images/abcdefg/asdf-asdf.asdf')).to eq(false)
    end

    it 'should return true on success' do
      object = OpenStruct.new
      objects = OpenStruct.new
      expect(objects).to receive(:find).with('images/abcdefg/asdf-asdf.asdf').and_return(object)
      bucket = OpenStruct.new({
        objects: objects
      })
      expect(object).to receive(:copy).with(hash_including(:key => 'images/abcdefg/asdf-asdf.asdf', :bucket => bucket)).and_return(true)
      buckets = OpenStruct.new
      expect(buckets).to receive(:find).and_return(bucket)
      service = OpenStruct.new({
        buckets: buckets
      })
      expect(S3::Service).to receive(:new).and_return(service)
      expect(Uploader.remote_touch('images/abcdefg/asdf-asdf.asdf')).to eq(true)
    end
  end
  
  describe 'find_images' do
    # Use v1 API so specs can mock Typhoeus.get with search_token
    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('OPENSYMBOLS_SECRET').and_return(nil)
      allow(ENV).to receive(:[]).with('OPENSYMBOLS_TOKEN').and_return('test_token')
    end

    it 'should return nothing for unknown libraries' do
      expect(Typhoeus).to_not receive(:get)
      expect(Uploader.find_images('bacon', 'cool-pics', 'en', nil)).to eq(false)
      expect(Uploader.find_images('bacon', '', 'en', nil)).to eq(false)
      expect(Uploader.find_images('bacon', nil, 'en', nil)).to eq(false)
      expect(Uploader.find_images('bacon', '   ', 'en', nil)).to eq(false)
    end
    
    it 'should return nothing for empty queries' do
      expect(Typhoeus).to_not receive(:get)
      expect(Uploader.find_images(nil, 'arasaac', 'en', nil)).to eq(false)
      expect(Uploader.find_images('', 'arasaac', 'en', nil)).to eq(false)
      expect(Uploader.find_images('    ', 'arasaac', 'en', nil)).to eq(false)
    end
    
    it 'should make a remote request' do
      res = OpenStruct.new(body: [
      ].to_json)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon+repo%3Aarasaac&search_token=#{ENV['OPENSYMBOLS_TOKEN']}", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'arasaac', 'en', nil)
      expect(images).to eq([])
    end

    it 'should pass the search token' do
      res = OpenStruct.new(body: [
      ].to_json)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon+repo%3Aarasaac&search_token=#{ENV['OPENSYMBOLS_TOKEN']}", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'arasaac', 'en', nil)
      expect(images).to eq([])
    end

    it 'should allow searching all public images via opensymbols key' do
      res = OpenStruct.new(body: [
      ].to_json)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon&search_token=#{ENV['OPENSYMBOLS_TOKEN']}", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'opensymbols', 'en', nil)
      expect(images).to eq([])
    end

    it 'should not allow searching for pcs and marking results as from a protected source if not authorized for the user' do
      res = OpenStruct.new(body: [
      ].to_json)
      u = User.create
      u.settings['extras_disabled'] = true
      u.save
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon+repo%3Apcs&search_token=#{ENV['OPENSYMBOLS_TOKEN']}", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'pcs', 'en', u)
      expect(images).to eq([])
    end

    it 'should allow searching for pcs and marking results as from a protected source' do
      res = OpenStruct.new(body: [
        {
          'image_url' => 'http://www.example.com/pic.png',
          'extension' => 'png',
          'width' => '200',
          'height' => '200',
          'id' => '123',
          'license' => 'public_domain',
          'license_url' => 'http://www.example.com/cc0',
          'source_url' => 'http://www.example.com/pics',
          'author' => 'bob',
          'author_url' => 'http://www.example.com/bob'
        }
      ].to_json)
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon+repo%3Apcs&search_token=#{ENV['OPENSYMBOLS_TOKEN']}:pcs", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'pcs', 'en', u)
      expect(images).to eq([{
        'url' => 'http://www.example.com/pic.png',
        'thumbnail_url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png',
        'width' => '200',
        'height' => '200',
        'external_id' => '123',
        'public' => true,
        'protected' => true,
        'protected_source' => 'pcs',
        'license' => {
          'type' => 'public_domain',
          'copyright_notice_url' => 'http://www.example.com/cc0',
          'source_url' => 'http://www.example.com/pics',
          'author_name' => 'bob',
          'author_url' => 'http://www.example.com/bob',
          'uneditable' => true
        }
      }])
    end

    it 'should not allow searching PCS if a superisee has access but not the user' do
      res = OpenStruct.new(body: [
      ].to_json)
      u = User.create
      u2 = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u2.global_id})
      u.reload
      u2.reload

      u.settings['extras_disabled'] = true
      u.save
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon+repo%3Apcs&search_token=#{ENV['OPENSYMBOLS_TOKEN']}", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'pcs', 'en', u)
      expect(images).to eq([])
    end
    
    it 'should parse results' do
      res = OpenStruct.new(body: [
        {
          'image_url' => 'http://www.example.com/pic.png',
          'extension' => 'png',
          'width' => '200',
          'height' => '200',
          'id' => '123',
          'license' => 'public_domain',
          'license_url' => 'http://www.example.com/cc0',
          'source_url' => 'http://www.example.com/pics',
          'author' => 'bob',
          'author_url' => 'http://www.example.com/bob'
        }
      ].to_json)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=bacon+repo%3Aarasaac&search_token=#{ENV['OPENSYMBOLS_TOKEN']}", timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'arasaac', 'en', nil)
      expect(images).to eq([{
        'url' => 'http://www.example.com/pic.png',
        'thumbnail_url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png',
        'width' => '200',
        'height' => '200',
        'external_id' => '123',
        'public' => true,
        'protected' => false,
        'protected_source' => nil,
        'license' => {
          'type' => 'public_domain',
          'copyright_notice_url' => 'http://www.example.com/cc0',
          'source_url' => 'http://www.example.com/pics',
          'author_name' => 'bob',
          'author_url' => 'http://www.example.com/bob',
          'uneditable' => true
        }
      }])
    end
    
    it 'should handle pixabay searches' do
      ENV['PIXABAY_KEY'] = 'pixkey'
      res = OpenStruct.new(body: {'hits' => [
        {
          'webformatURL' => 'http://www.example.com/pic.png',
          'webformatWidth' => 200,
          'webformatHeight' => 200,
          'id' => '123',
          'pageURL' => 'http://www.example.com/pics',
        }, {
          'webformatURL' => 'http://www.example.com/pic2.jpg',
          'webformatWidth' => 123,
          'webformatHeight' => 234,
          'id' => '1234',
          'pageURL' => 'http://www.example.com/pics2',
        }]}.to_json)
      expect(Typhoeus).to receive(:get).with('https://pixabay.com/api/?key=pixkey&q=bacon&image_type=vector&per_page=30&safesearch=true', timeout: 5).and_return(res)
      images = Uploader.find_images('bacon', 'pixabay_vectors', 'en', nil)
      expect(images).to eq([{
        'url' => 'http://www.example.com/pic.png',
        'thumbnail_url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png',
        'width' => 200,
        'height' => 200,
        'external_id' => '123',
        'public' => true,
        'license' => {
          'type' => 'public_domain',
          'copyright_notice_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
          'source_url' => 'http://www.example.com/pics',
          'author_name' => 'unknown',
          'author_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
          'uneditable' => true
        }
      }, {
        'url' => 'http://www.example.com/pic2.jpg',
        'thumbnail_url' => 'http://www.example.com/pic2.jpg',
        'content_type' => 'image/jpeg',
        'width' => 123,
        'height' => 234,
        'external_id' => '1234',
        'public' => true,
        'license' => {
          'type' => 'public_domain',
          'copyright_notice_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
          'source_url' => 'http://www.example.com/pics2',
          'author_name' => 'unknown',
          'author_url' => 'https://creativecommons.org/publicdomain/zero/1.0/',
          'uneditable' => true
        }
      }])
    end
    
    it "should handle lessonpix searches" do
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', nil)).to eq(false)
      
      u = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'pocatello',
        'pid' => '99999',
        'token' => 'for_the_team'
      }).exactly(2).times
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=bacon&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: 'Token Mismatch'))
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', u)).to eq(false)

      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: [
        {'iscategory' => 't'},
        {
          'image_id' => '2345',
          'title' => 'good pic'
        }
      ].to_json))
      expect(Uploader.find_images('cheddar', 'lessonpix', 'en', u)).to eq([
        {
          'url' => "#{JsonApi::Json.current_host}/api/v1/users/#{u.global_id}/protected_image/lessonpix/2345",
          'thumbnail_url' => "https://lessonpix.com/drawings/2345/100x100/2345.png",
          'content_type' => 'image/png',
          'name' => 'good pic',
          'width' => 300,
          'height' => 300,
          'external_id' => '2345',
          'public' => false,
          'protected' => true,
          'protected_source' => 'lessonpix',
          'license' => {
            'type' => 'private',
            'source_url' => "https://lessonpix.com/pictures/2345/good+pic",
            'author_name' => 'LessonPix',
            'author_url' => 'https://lessonpix.com',
            'uneditable' => true,
            'copyright_notice_url' => 'https://lessonpix.com/articles/11/28/LessonPix+Terms+and+Conditions'
          }
        }
      ])
    end

    it "should fall back to the alt_user for lessonpix searches if needed" do
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', nil)).to eq(false)
      
      u = User.create
      u2 = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'pocatello',
        'pid' => '99999',
        'token' => 'for_the_team'
      }).exactly(1).times
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return({
        'username' => 'nimue',
        'pid' => '88888',
        'token' => 'i_got_wet'
      }).exactly(1).times

      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: "Token Mismatch"))
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=88888&username=nimue&token=i_got_wet&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: [
        {'iscategory' => 't'},
        {
          'image_id' => '2345',
          'title' => 'good pic'
        }
      ].to_json))
      expect(Uploader.find_images('cheddar', 'lessonpix', 'en', u, u2)).to eq([
        {
          'url' => "#{JsonApi::Json.current_host}/api/v1/users/#{u2.global_id}/protected_image/lessonpix/2345",
          'thumbnail_url' => "https://lessonpix.com/drawings/2345/100x100/2345.png",
          'content_type' => 'image/png',
          'name' => 'good pic',
          'width' => 300,
          'height' => 300,
          'external_id' => '2345',
          'public' => false,
          'protected' => true,
          'protected_source' => 'lessonpix',
          'license' => {
            'type' => 'private',
            'source_url' => "https://lessonpix.com/pictures/2345/good+pic",
            'author_name' => 'LessonPix',
            'author_url' => 'https://lessonpix.com',
            'uneditable' => true,
            'copyright_notice_url' => 'https://lessonpix.com/articles/11/28/LessonPix+Terms+and+Conditions'
          }
        }
      ])
    end

    it "should handle giphy searches" do
      ENV['GIPHY_KEY'] = 'giphy'
      expect(Typhoeus).to receive(:get).with("https://api.giphy.com/v1/gifs/search?q=%23asl+bacon&api_key=giphy&lang=en&rating=pg13", {timeout: 5}).and_return(OpenStruct.new({
        body: {
          data: [
            {
              slug: 'signwithrobert',
              url: 'http://www.example.com/pic1',
              username: 'bob',
              user: {profile_url: 'http://www.example.com/bob'},
              images: {
                original: {url: 'http://www.example.com/pic1.gif', width: 100, height: 100},
                downsized_still: {url: 'http://www.example.com/pic1-small.gif'}
              }
            },
            {
              slug: 'asl-is-cool',
              url: 'http://www.example.com/pic2',
              username: 'sue',
              user: {profile_url: 'http://www.example.com/sue'},
              images: {
                original: {url: 'http://www.example.com/pic2.gif', width: 100, height: 100},
                downsized_still: {url: 'http://www.example.com/pic2-small.gif'}
              }
            },
            {
              slug: 'good-stuff',
              url: 'http://www.example.com/pic3',
              username: 'max',
              user: {profile_url: 'http://www.example.com/max'},
              images: {
                original: {url: 'http://www.example.com/pic3.gif', width: 100, height: 100},
                downsized_still: {url: 'http://www.example.com/pic3-small.gif'}
              }
            },
            {
              slug: 'signwithrobert',
              url: 'http://www.example.com/pic4',
              username: 'ren',
              user: {profile_url: 'http://www.example.com/ren'},
              images: {
                original: {url: 'http://www.example.com/pic4.gif', width: 100, height: 100},
                downsized_still: {url: 'http://www.example.com/pic4-small.gif'}
              }
            }
          ]
        }.to_json
      }))
      expect(Uploader.find_images('bacon', 'giphy_asl', 'en', nil)).to eq([
        {
          'url' => 'https://www.example.com/pic1.gif',
          'thumbnail_url' => 'https://www.example.com/pic1-small.gif',
          'content_type' => 'image/gif',
          'width' => 100,
          'height' => 100,
          'public' => false,
          'license' => {
            'type' => 'private',
            'copyright_notice_url' => 'https://giphy.com/terms',
            'source_url' => 'http://www.example.com/pic1',
            'author_name' => 'bob',
            'author_url' => 'http://www.example.com/bob',
            'uneditable' => true
          }
        },
        {
          'url' => 'https://www.example.com/pic2.gif',
          'thumbnail_url' => 'https://www.example.com/pic2-small.gif',
          'content_type' => 'image/gif',
          'width' => 100,
          'height' => 100,
          'public' => false,
          'license' => {
            'type' => 'private',
            'copyright_notice_url' => 'https://giphy.com/terms',
            'source_url' => 'http://www.example.com/pic2',
            'author_name' => 'sue',
            'author_url' => 'http://www.example.com/sue',
            'uneditable' => true
          }
        },
        {
          'url' => 'https://www.example.com/pic4.gif',
          'thumbnail_url' => 'https://www.example.com/pic4-small.gif',
          'content_type' => 'image/gif',
          'width' => 100,
          'height' => 100,
          'public' => false,
          'license' => {
            'type' => 'private',
            'copyright_notice_url' => 'https://giphy.com/terms',
            'source_url' => 'http://www.example.com/pic4',
            'author_name' => 'ren',
            'author_url' => 'http://www.example.com/ren',
            'uneditable' => true
          }
        }
      ])
    end
        
    it 'should schedule caching action for returned results' do
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', nil)).to eq(false)
      
      u = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'pocatello',
        'pid' => '99999',
        'token' => 'for_the_team'
      }).exactly(2).times
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=bacon&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: 'Token Mismatch'))
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', u)).to eq(false)

      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: [
        {'iscategory' => 't'},
        {
          'image_id' => '2345',
          'title' => 'good pic'
        }
      ].to_json))
      expect(JsonApi::Json).to receive(:current_host).and_return("http://test.host")
      expect(Worker).to receive(:schedule_for) do |speed, klass, method, opts|
        if opts['method'] == 'assert_cached_copies'
          expect(klass).to eq(ButtonImage)
          expect(speed).to eq(:slow)
          expect(opts['arguments']).to eq([["http://test.host/api/v1/users/#{u.global_id}/protected_image/lessonpix/2345"]])
        end
      end.at_least(1).times
      
      expect(Uploader.find_images('cheddar', 'lessonpix', 'en', u)).to eq([
        {
          'url' => "http://test.host/api/v1/users/#{u.global_id}/protected_image/lessonpix/2345",
          'thumbnail_url' => "https://lessonpix.com/drawings/2345/100x100/2345.png",
          'content_type' => 'image/png',
          'name' => 'good pic',
          'width' => 300,
          'height' => 300,
          'external_id' => '2345',
          'public' => false,
          'protected' => true,
          'protected_source' => 'lessonpix',
          'license' => {
            'type' => 'private',
            'source_url' => "https://lessonpix.com/pictures/2345/good+pic",
            'author_name' => 'LessonPix',
            'author_url' => 'https://lessonpix.com',
            'uneditable' => true,
            'copyright_notice_url' => 'https://lessonpix.com/articles/11/28/LessonPix+Terms+and+Conditions'
          }
        }
      ])
    end

    it "should save to the library cache on results" do
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', nil)).to eq(false)
      
      u = User.create
      u2 = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'pocatello',
        'pid' => '99999',
        'token' => 'for_the_team'
      }).exactly(1).times
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return({
        'username' => 'nimue',
        'pid' => '88888',
        'token' => 'i_got_wet'
      }).exactly(1).times

      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: "Token Mismatch"))
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=88888&username=nimue&token=i_got_wet&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: [
        {'iscategory' => 't'},
        {
          'image_id' => '2345',
          'title' => 'good pic'
        }
      ].to_json))
      expect(Uploader.find_images('cheddar', 'lessonpix', 'en', u, u2)).to eq([
        {
          'url' => "#{JsonApi::Json.current_host}/api/v1/users/#{u2.global_id}/protected_image/lessonpix/2345",
          'thumbnail_url' => "https://lessonpix.com/drawings/2345/100x100/2345.png",
          'content_type' => 'image/png',
          'name' => 'good pic',
          'width' => 300,
          'height' => 300,
          'external_id' => '2345',
          'public' => false,
          'protected' => true,
          'protected_source' => 'lessonpix',
          'license' => {
            'type' => 'private',
            'source_url' => "https://lessonpix.com/pictures/2345/good+pic",
            'author_name' => 'LessonPix',
            'author_url' => 'https://lessonpix.com',
            'uneditable' => true,
            'copyright_notice_url' => 'https://lessonpix.com/articles/11/28/LessonPix+Terms+and+Conditions'
          }
        }
      ])
      cache = LibraryCache.find_by(library: 'lessonpix', locale: 'en')
      expect(cache).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']['url']).to eq("#{JsonApi::Json.current_host}/api/v1/users/#{u2.global_id}/protected_image/lessonpix/2345")
      expect(cache.data['fallbacks']['cheddar']['image_id']).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']['added']).to be >  5.seconds.ago.to_i
      expect(cache.data['fallbacks']['cheddar']['data']).to_not eq(nil)
    end

    it "should cache to the library long-term if specified" do
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', nil)).to eq(false)
      
      u = User.create
      u2 = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'pocatello',
        'pid' => '99999',
        'token' => 'for_the_team'
      }).exactly(1).times
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return({
        'username' => 'nimue',
        'pid' => '88888',
        'token' => 'i_got_wet'
      }).exactly(1).times

      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: "Token Mismatch"))
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=88888&username=nimue&token=i_got_wet&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: [
        {'iscategory' => 't'},
        {
          'image_id' => '2345',
          'title' => 'good pic'
        }
      ].to_json))
      expect(Uploader.find_images('cheddar', 'lessonpix', 'en', u, u2, false, true)).to eq([
        {
          'url' => "#{JsonApi::Json.current_host}/api/v1/users/#{u2.global_id}/protected_image/lessonpix/2345",
          'thumbnail_url' => "https://lessonpix.com/drawings/2345/100x100/2345.png",
          'content_type' => 'image/png',
          'name' => 'good pic',
          'width' => 300,
          'height' => 300,
          'external_id' => '2345',
          'public' => false,
          'protected' => true,
          'protected_source' => 'lessonpix',
          'license' => {
            'type' => 'private',
            'source_url' => "https://lessonpix.com/pictures/2345/good+pic",
            'author_name' => 'LessonPix',
            'author_url' => 'https://lessonpix.com',
            'uneditable' => true,
            'copyright_notice_url' => 'https://lessonpix.com/articles/11/28/LessonPix+Terms+and+Conditions'
          }
        }
      ])
      cache = LibraryCache.find_by(library: 'lessonpix', locale: 'en')
      expect(cache).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']['url']).to eq("#{JsonApi::Json.current_host}/api/v1/users/#{u2.global_id}/protected_image/lessonpix/2345")
      expect(cache.data['fallbacks']['cheddar']['image_id']).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']['added']).to be > 5.years.from_now.to_i
      expect(cache.data['fallbacks']['cheddar']['data']).to_not eq(nil)
    end

    it "should cache as missing to the library if long-term" do
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.find_images('bacon', 'lessonpix', 'en', nil)).to eq(false)
      
      u = User.create
      u2 = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'pocatello',
        'pid' => '99999',
        'token' => 'for_the_team'
      }).exactly(1).times
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return({
        'username' => 'nimue',
        'pid' => '88888',
        'token' => 'i_got_wet'
      }).exactly(1).times

      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=99999&username=pocatello&token=for_the_team&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: "Token Mismatch"))
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=88888&username=nimue&token=i_got_wet&word=cheddar&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new(body: [].to_json))
      expect(Uploader.find_images('cheddar', 'lessonpix', 'en', u, u2, false, true)).to eq([
      ])
      cache = LibraryCache.find_by(library: 'lessonpix', locale: 'en')
      expect(cache).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']).to eq(nil)
      expect(cache.data['missing']['cheddar']).to_not eq(nil)
    end    
  end

  describe 'default_images' do
    # Use v1 API fallback so specs can mock Typhoeus.post with search_token
    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('OPENSYMBOLS_SECRET').and_return(nil)
      allow(ENV).to receive(:[]).with('OPENSYMBOLS_TOKEN').and_return('test_token')
    end

    it 'should to nothing on invalid library' do
      expect(Typhoeus).to_not receive(:post)
      res = Uploader.default_images('bacon', [], 'en', nil)
      expect(res).to eq({})
    end

    it 'should make an API call to look for images' do
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['a', 'b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'a' => {},
          'b' => {},
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['a', 'b', 'c'], 'en', nil)
      expect(res.keys).to eq(['a', 'b'])
    end

    it 'should properly format any matching results' do
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['a', 'b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'a' => {
            'image_url' => 'http://www.example.com/pic.png',
            'content_type' => 'image/png',
            'width' => 200,
            'height' => 200,
            'id' => 'aaaa',
            'license' => 'private',
            'license_url' => 'http://www.example.com/license',
            'source_url' => 'http://www.example.com/pic',
            'author' => 'bob',
            'author_url' => 'http://www.example.com/bob'
          },
          'b' => {
            'image_url' => 'http://www.example.com/pic2.png',
            'extension' => '.png',
            'width' => 300,
            'height' => 300,
            'id' => 'bbbb'
          },
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['a', 'b', 'c'], 'en', nil)
      bi1 = ButtonImage.find_by(url: 'http://www.example.com/pic.png', user_id: nil)
      bi2 = ButtonImage.find_by(url: 'http://www.example.com/pic2.png', user_id: nil)
      expect(res['a']).to include("url"=>"http://www.example.com/pic.png", "lingolinq_image_id"=>bi1.global_id, "thumbnail_url"=>"http://www.example.com/pic.png", "content_type"=>"image/png", "width"=>200, "height"=>200, "external_id"=>"aaaa", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['a']['license']).to eq({"type"=>"private", "copyright_notice_url"=>"http://www.example.com/license", "source_url"=>"http://www.example.com/pic", "author_name"=>"bob", "author_url"=>"http://www.example.com/bob", "uneditable"=>true})
      expect(res['b']).to include("url"=>"http://www.example.com/pic2.png", "lingolinq_image_id"=>bi2.global_id, "thumbnail_url"=>"http://www.example.com/pic2.png", "content_type"=>"image/png", "width"=>300, "height"=>300, "external_id"=>"bbbb", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['b']['license']).to include("uneditable"=>true)
    end

    it 'should not send premium library token if not enabled' do
      u = User.create
      u.settings['extras_disabled'] = true
      u.save
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/pcs/defaults', body: {
        words: ['a', 'b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {}.to_json,
        code: 200
      }))
      res = Uploader.default_images('pcs', ['a', 'b', 'c'], 'en', u)
      expect(res.keys).to eq([])
    end

    it 'should search premium libraries if enabled' do
      u = User.create
      User.purchase_extras({
        'premium_symbols' => true, 
        'user_id' => u.global_id,
        'source' => 'admin_override'
      })
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/pcs/defaults', body: {
        words: ['a', 'b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}:pcs"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'a' => {},
          'b' => {},
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('pcs', ['a', 'b', 'c'], 'en', u.reload)
      expect(res.keys).to eq(['a', 'b'])
    end

    it "should use library cache results if available" do
      cache = LibraryCache.create(library: 'arasaac', locale: 'en')
      cache.data['defaults']['a'] = {
        'url' => 'http://www.example.com/pic3.png',
        'data' =>  {
          'url' => 'http://www.example.com/pic3.png',
          'content_type' => 'image/png',
          'width' => 200,
          'height' => 200,
        },
        'added' => 1.hour.ago.to_i,
        'image_id' => 'aaa'
      }
      cache.save!
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'b' => {
            'image_url' => 'http://www.example.com/pic2.png',
            'extension' => '.png',
            'width' => 300,
            'height' => 300,
            'id' => 'bbbb'
          },
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['a', 'b', 'c'], 'en', nil)
      bi2 = ButtonImage.find_by(url: 'http://www.example.com/pic2.png', user_id: nil)
      expect(res['a']).to include("url"=>"http://www.example.com/pic3.png", "lingolinq_image_id"=>"aaa", "width"=>200, "height"=>200, "content_type"=>"image/png")
      expect(res['b']).to include("url"=>"http://www.example.com/pic2.png", "lingolinq_image_id"=>bi2.global_id, "thumbnail_url"=>"http://www.example.com/pic2.png", "content_type"=>"image/png", "width"=>300, "height"=>300, "external_id"=>"bbbb", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['_missing']).to eq([])
      expect(cache).to_not eq(nil)
      cache.reload
      expect(cache.data['defaults']['a']).to_not eq(nil)
      expect(cache.data['defaults']['a']['url']).to eq('http://www.example.com/pic3.png')
      expect(cache.data['defaults']['a']['image_id']).to eq('aaa')
      expect(cache.data['defaults']['b']).to_not eq(nil)
      expect(cache.data['defaults']['b']['url']).to eq('http://www.example.com/pic2.png')
      expect(cache.data['defaults']['b']['image_id']).to eq(bi2.global_id)
    end

    it "should use library cache with different case if available" do
      cache = LibraryCache.create(library: 'arasaac', locale: 'en')
      cache.data['defaults']['a'] = {
        'url' => 'http://www.example.com/pic3.png',
        'data' =>  {
          'url' => 'http://www.example.com/pic3.png',
          'content_type' => 'image/png',
          'width' => 200,
          'height' => 200,
        },
        'added' => 1.hour.ago.to_i,
        'image_id' => 'aaa'
      }
      cache.save!
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'b' => {
            'image_url' => 'http://www.example.com/pic2.png',
            'extension' => '.png',
            'width' => 300,
            'height' => 300,
            'id' => 'bbbb'
          },
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['A', 'b', 'c'], 'en', nil)
      bi2 = ButtonImage.find_by(url: 'http://www.example.com/pic2.png', user_id: nil)
      expect(res['A']).to include("url"=>"http://www.example.com/pic3.png", "lingolinq_image_id"=>"aaa", "width"=>200, "height"=>200, "content_type"=>"image/png")
      expect(res['b']).to include("url"=>"http://www.example.com/pic2.png", "lingolinq_image_id"=>bi2.global_id, "thumbnail_url"=>"http://www.example.com/pic2.png", "content_type"=>"image/png", "width"=>300, "height"=>300, "external_id"=>"bbbb", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['_missing']).to eq([])
      expect(cache).to_not eq(nil)
      cache.reload
      expect(cache.data['defaults']['a']).to_not eq(nil)
      expect(cache.data['defaults']['a']['url']).to eq('http://www.example.com/pic3.png')
      expect(cache.data['defaults']['a']['image_id']).to eq('aaa')
      expect(cache.data['defaults']['b']).to_not eq(nil)
      expect(cache.data['defaults']['b']['url']).to eq('http://www.example.com/pic2.png')
      expect(cache.data['defaults']['b']['image_id']).to eq(bi2.global_id)
    end    

    it "should save looked-up results to the library cache" do
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['a', 'b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'a' => {
            'image_url' => 'http://www.example.com/pic.png',
            'content_type' => 'image/png',
            'width' => 200,
            'height' => 200,
            'id' => 'aaaa',
            'license' => 'private',
            'license_url' => 'http://www.example.com/license',
            'source_url' => 'http://www.example.com/pic',
            'author' => 'bob',
            'author_url' => 'http://www.example.com/bob'
          },
          'b' => {
            'image_url' => 'http://www.example.com/pic2.png',
            'extension' => '.png',
            'width' => 300,
            'height' => 300,
            'id' => 'bbbb'
          },
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['a', 'b', 'c'], 'en', nil)
      bi1 = ButtonImage.find_by(url: 'http://www.example.com/pic.png', user_id: nil)
      bi2 = ButtonImage.find_by(url: 'http://www.example.com/pic2.png', user_id: nil)
      expect(res['a']).to include("url"=>"http://www.example.com/pic.png", "lingolinq_image_id"=>bi1.global_id, "thumbnail_url"=>"http://www.example.com/pic.png", "content_type"=>"image/png", "width"=>200, "height"=>200, "external_id"=>"aaaa", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['a']['license']).to eq({"type"=>"private", "copyright_notice_url"=>"http://www.example.com/license", "source_url"=>"http://www.example.com/pic", "author_name"=>"bob", "author_url"=>"http://www.example.com/bob", "uneditable"=>true})
      expect(res['b']).to include("url"=>"http://www.example.com/pic2.png", "lingolinq_image_id"=>bi2.global_id, "thumbnail_url"=>"http://www.example.com/pic2.png", "content_type"=>"image/png", "width"=>300, "height"=>300, "external_id"=>"bbbb", "public"=>true, "protected"=>false, "protected_source"=>nil)
      cache = LibraryCache.find_by(library: 'arasaac', locale: 'en')
      expect(cache).to_not eq(nil)
      expect(cache.data['defaults']['a']).to_not eq(nil)
      expect(cache.data['defaults']['a']['url']).to eq('http://www.example.com/pic.png')
      expect(cache.data['defaults']['a']['image_id']).to eq(bi1.global_id)
      expect(cache.data['defaults']['b']).to_not eq(nil)
      expect(cache.data['defaults']['b']['url']).to eq('http://www.example.com/pic2.png')
      expect(cache.data['defaults']['b']['image_id']).to eq(bi2.global_id)
    end

    it "should cache long-term if specified" do
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['a', 'b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'a' => {
            'image_url' => 'http://www.example.com/pic.png',
            'content_type' => 'image/png',
            'width' => 200,
            'height' => 200,
            'id' => 'aaaa',
            'license' => 'private',
            'license_url' => 'http://www.example.com/license',
            'source_url' => 'http://www.example.com/pic',
            'author' => 'bob',
            'author_url' => 'http://www.example.com/bob'
          },
          'b' => {
            'image_url' => 'http://www.example.com/pic2.png',
            'extension' => '.png',
            'width' => 300,
            'height' => 300,
            'id' => 'bbbb'
          },
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['a', 'b', 'c'], 'en', nil, true, true)
      bi1 = ButtonImage.find_by(url: 'http://www.example.com/pic.png', user_id: nil)
      bi2 = ButtonImage.find_by(url: 'http://www.example.com/pic2.png', user_id: nil)
      expect(res['a']).to include("url"=>"http://www.example.com/pic.png", "lingolinq_image_id"=>bi1.global_id, "thumbnail_url"=>"http://www.example.com/pic.png", "content_type"=>"image/png", "width"=>200, "height"=>200, "external_id"=>"aaaa", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['b']).to include("url"=>"http://www.example.com/pic2.png", "lingolinq_image_id"=>bi2.global_id, "thumbnail_url"=>"http://www.example.com/pic2.png", "content_type"=>"image/png", "width"=>300, "height"=>300, "external_id"=>"bbbb", "public"=>true, "protected"=>false, "protected_source"=>nil)
      cache = LibraryCache.find_by(library: 'arasaac', locale: 'en')
      expect(cache).to_not eq(nil)
      expect(cache.data['defaults']['a']).to_not eq(nil)
      expect(cache.data['defaults']['a']['url']).to eq('http://www.example.com/pic.png')
      expect(cache.data['defaults']['a']['image_id']).to eq(bi1.global_id)
      expect(cache.data['defaults']['a']['added']).to be > 5.years.ago.to_i
      expect(cache.data['defaults']['b']).to_not eq(nil)
      expect(cache.data['defaults']['b']['url']).to eq('http://www.example.com/pic2.png')
      expect(cache.data['defaults']['b']['image_id']).to eq(bi2.global_id)
      expect(cache.data['defaults']['b']['added']).to be > 5.years.ago.to_i
    end

    it "should not try to find images that are known as missing" do
      cache = LibraryCache.create(library: 'arasaac', locale: 'en')
      cache.data['defaults']['a'] = {
        'url' => 'http://www.example.com/pic3.png',
        'data' =>  {
          'url' => 'http://www.example.com/pic3.png',
          'content_type' => 'image/png',
          'width' => 200,
          'height' => 200,
        },
        'added' => 1.hour.ago.to_i,
        'image_id' => 'aaa'
      }
      cache.data['missing']['water'] = {'added' => Time.now.to_i}
      cache.save!
      expect(Typhoeus).to receive(:post).with('https://www.opensymbols.org/api/v2/repositories/arasaac/defaults', body: {
        words: ['b', 'c'],
        allow_search: true,
        locale: 'en',
        search_token: "#{ENV['OPENSYMBOLS_TOKEN']}"
      }.to_json, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json' }, timeout: 10).and_return(OpenStruct.new({
        body: {
          'b' => {
            'image_url' => 'http://www.example.com/pic2.png',
            'extension' => '.png',
            'width' => 300,
            'height' => 300,
            'id' => 'bbbb'
          },
          'd' => {}
         }.to_json,
        code: 200
      }))
      res = Uploader.default_images('arasaac', ['a', 'b', 'c', 'water'], 'en', nil)
      bi2 = ButtonImage.find_by(url: 'http://www.example.com/pic2.png', user_id: nil)
      expect(res['a']).to include("url"=>"http://www.example.com/pic3.png", "lingolinq_image_id"=>"aaa", "width"=>200, "height"=>200, "content_type"=>"image/png")
      expect(res['b']).to include("url"=>"http://www.example.com/pic2.png", "lingolinq_image_id"=>bi2.global_id, "thumbnail_url"=>"http://www.example.com/pic2.png", "content_type"=>"image/png", "width"=>300, "height"=>300, "external_id"=>"bbbb", "public"=>true, "protected"=>false, "protected_source"=>nil)
      expect(res['_missing']).to eq(['water'])
      expect(cache).to_not eq(nil)
      cache.reload
      expect(cache.data['defaults']['a']).to_not eq(nil)
      expect(cache.data['defaults']['a']['url']).to eq('http://www.example.com/pic3.png')
      expect(cache.data['defaults']['a']['image_id']).to eq('aaa')
      expect(cache.data['defaults']['b']).to_not eq(nil)
      expect(cache.data['defaults']['b']['url']).to eq('http://www.example.com/pic2.png')
      expect(cache.data['defaults']['b']['image_id']).to eq(bi2.global_id)
    end
  end

  describe "lessonpix_credentials" do
    it "should return the correct value" do
      ENV['LESSONPIX_PID'] = nil
      ENV['LESSONPIX_SECRET'] = nil
      expect(Uploader.lessonpix_credentials({})).to eq(nil)
      ENV['LESSONPIX_PID'] = '90123'
      expect(Uploader.lessonpix_credentials({})).to eq(nil)
      ENV['LESSONPIX_SECRET'] = 'asdfuiop'
      expect(Uploader.lessonpix_credentials({})).to eq({
        'username' => nil,
        'pid' => '90123',
        'token' => 'e64ff981c5100fe1d0ed87f3fc029890'
      })
      expect(Uploader.lessonpix_credentials(nil)).to eq(nil)
      expect(Uploader.lessonpix_credentials('asdf')).to eq(nil)
      expect(Uploader.lessonpix_credentials({'username' => 'fred', 'password' => 'passy'})).to eq({
        'username' => 'fred',
        'pid' => '90123',
        'token' => Digest::MD5.hexdigest(Digest::MD5.hexdigest('passy') + 'asdfuiop')
      })
      template = UserIntegration.create(template: true, integration_key: 'lessonpix')
      u = User.create
      u.settings['extras_disabled'] = true
      u.save
      ui = UserIntegration.create(user: u, template_integration: template)
      secret, salt = GoSecure.encrypt('secretss', 'integration_password')

      ui.settings['user_settings'] = {
        'username' => {'value' => 'susan'},
        'password' => {'value_crypt' => secret, 'salt' => salt}
      }
      ui.save
      expect(Uploader.lessonpix_credentials(ui)).to eq({
        'username' => 'susan',
        'pid' => '90123',
        'token' => Digest::MD5.hexdigest('secretss' + 'asdfuiop')
      })
      expect(Uploader.lessonpix_credentials(u)).to eq({
        'username' => 'susan',
        'pid' => '90123',
        'token' => Digest::MD5.hexdigest('secretss' + 'asdfuiop')
      })
    end
  end
  
  describe "found_image_url" do
    it "should return the correct value" do
      u = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({
        'username' => 'amelia',
        'pid' => 'qwert',
        'token' => 'tokenss'
      })
      expect(Uploader.found_image_url('asdf', 'lessonpix', u)).to eq("https://lessonpix.com/apiGetImage.php?pid=qwert&username=amelia&token=tokenss&image_id=asdf&h=300&w=300&fmt=png")
      
      expect(Uploader).to receive(:lessonpix_credentials).with(nil).and_return(nil)
      expect(Uploader.found_image_url('qwer', 'lessonpix', nil)).to eq(nil)
    end
  end
  
  describe "protected_remote_url?" do
    it "should return a correct result" do
      expect(Uploader.protected_remote_url?('http://www.example.com')).to eq(false)
      expect(Uploader.protected_remote_url?('/api/v1/users/bob/protected_image/a/b')).to eq(true)
    end
  end
  
  describe "remote_zip" do
    it "should call the block with the loaded zip" do
      expect(OBF::Utils).to receive(:load_zip).and_yield({zipper: true})
      res = OpenStruct.new(body: 'abc')
      expect(Typhoeus).to receive(:get).with('http://www.example.com/import.zip').and_return(res)
      Uploader.remote_zip('http://www.example.com/import.zip') do |zipper|
        expect(zipper).to eq({zipper: true})
      end
    end
  end
 
  describe "generate_zip" do
    class TestZipper
      def add(filename, data)
        @files ||= []
        @files << [filename, data]
      end
      
      def files
        @files
      end
    end
    
    it "should return the known url if known" do
      hash = Digest::MD5.hexdigest([].to_json)
      key = GoSecure.sha512(hash, 'url_list')
      expect(Uploader).to receive(:check_existing_upload).with("downloads/#{key}/zippy.zip").and_return({url: 'http://www.example.com/zip.zip'})
      res = Uploader.generate_zip([], 'zippy.zip')
      expect(res).to eq('http://www.example.com/zip.zip')
    end
    
    it "should add urls to the zip" do
      zipper = TestZipper.new
      hash = Digest::MD5.hexdigest([
        { 'name' => 'file.png', 'url' => 'http://www.example.com/pic.png' },
        { 'name' => 'file2.png', 'data' => 'data:image/png;base64,R0lGODdh' }
      ].to_json)
      key = GoSecure.sha512(hash, 'url_list')
      expect(Uploader).to receive(:check_existing_upload).with("downloads/#{key}/zippy.zip").and_return({ found: false })
      expect(OBF::Utils).to receive(:build_zip).and_yield(zipper)
      expect(Uploader).to receive(:remote_upload).and_return({ url: 'http://www.example.com/import.zip' })
      expect(OBF::Utils).to receive(:get_url).with('http://www.example.com/pic.png').and_return({ 'data' => 'data:image/png;base64,R0lGODdh' })
      res = Uploader.generate_zip([
        {
          'name' => 'file.png',
          'url' => 'http://www.example.com/pic.png'
        },
        {
          'name' => 'file2.png',
          'data' => 'data:image/png;base64,R0lGODdh'
        }
      ], 'zippy.zip')
      expect(res).to eq('http://www.example.com/import.zip')
      expect(zipper.files).to eq([
        ['file.png', 'data:image/png;base64,R0lGODdh'],
        ['file2.png', 'data:image/png;base64,R0lGODdh']
      ])
    end
  end
  
  describe "find_resources" do
    it 'should return an empty list by default' do
      expect(Uploader.find_resources('bacon', 'something', nil)).to eq([])
      expect(Uploader.find_resources('bacon', 'whatever', nil)).to eq([])
      expect(Uploader.find_resources('bacon', nil, nil)).to eq([])
    end
    
    it 'should search for tarheel results' do
      expect(Typhoeus).to receive(:get).with("https://tarheelreader.org/find/?search=bacon&category=&reviewed=R&audience=E&language=en&page=1&json=1", {timeout: 5}).and_return(OpenStruct.new(body: {
        books: [
          {
            'link' => '/bacon1',
            'cover' => {
              'url' => '/bacon.png'
            },
            'title' => 'Bacon One',
            'author' => 'Amir',
            'slug' => 'bacon-1',
            'ID' => '12345'
          },
          {
            'link' => '/bacon2',
            'cover' => {
              'url' => '/bacon.png'
            },
            'title' => 'Bacon Two',
            'author' => 'Radish',
            'slug' => 'bacon-2',
            'ID' => '123456'
          }
        ]
      }.to_json))
      expect(Uploader.find_resources('bacon', 'tarheel', nil)).to eq([
        {
          'url' => 'https://tarheelreader.org/bacon1',
          'image' => 'https://tarheelreader.org/bacon.png',
          'title' => 'Bacon One',
          'author' => 'Amir',
          'id' => 'bacon-1',
          'image_attribution' => 'https://tarheelreader.org/photo-credits/?id=12345'
        },
        {
          'url' => 'https://tarheelreader.org/bacon2',
          'image' => 'https://tarheelreader.org/bacon.png',
          'title' => 'Bacon Two',
          'author' => 'Radish',
          'id' => 'bacon-2',
          'image_attribution' => 'https://tarheelreader.org/photo-credits/?id=123456'
        }
      ])
    end
    
    it 'should return tarheel book pages' do
      expect(Typhoeus).to receive(:get).with("https://tarheelreader.org/book-as-json/?slug=bacon-1", {:followlocation=>true}).and_return(OpenStruct.new(headers: {}, body: {
        'slug' => 'bacon-1',
        'ID' => '12345',
        'link' => '/bacon',
        'pages' => [
          {
            'text' => 'Bacon is Yummy',
            'url' => '/bacon-yum.png'
          },
          {
            'text' => 'I Love Bacon',
            'url' => '/heart.png'
          },
          {
            'text' => 'We Should Get Some Bacon',
            'url' => '/shopping.png'
          }
        ]
      }.to_json))
      expect(Uploader.find_resources('bacon-1', 'tarheel_book', nil)).to eq([
        {
          'id' => 'bacon-1-0',
          'title' => 'Bacon is Yummy',
          'image' => 'https://tarheelreader.org/bacon-yum.png',
          'image_content_type' => 'image/jpeg',
          'url' => 'https://tarheelreader.org/bacon',
          'image_attribution' => 'https://tarheelreader.org/photo-credits/?id=12345',
          'image_author' => 'Flickr User'
        },
        {
          'id' => 'bacon-1-1',
          'title' => 'I Love Bacon',
          'image' => 'https://tarheelreader.org/heart.png',
          'image_content_type' => 'image/jpeg',
          'url' => 'https://tarheelreader.org/bacon',
          'image_attribution' => 'https://tarheelreader.org/photo-credits/?id=12345',
          'image_author' => 'Flickr User'
        },
        {
          'id' => 'bacon-1-2',
          'title' => 'We Should Get Some Bacon',
          'image' => 'https://tarheelreader.org/shopping.png',
          'image_content_type' => 'image/jpeg',
          'url' => 'https://tarheelreader.org/bacon',
          'image_attribution' => 'https://tarheelreader.org/photo-credits/?id=12345',
          'image_author' => 'Flickr User'
        }
      ])
    end

    it "should return custom book pages" do
      expect(Typhoeus).to receive(:get).with("http://www.example.com/book.json", {:followlocation=>true}).and_return(OpenStruct.new(headers: {}, body: {
        "book_url": "http://github.com/whitmer",
        "author": "Brian",
        "attribution_url": "http://github.com/whitmer",
        "pages": [
          {
            "id": "title_page",
            "text": "Test Book",
            "image_url": "https://opensymbols.s3.amazonaws.com/libraries/noun-project/Test-Tube_89_g.svg",
            "image_content_type": "image/svg",
            "image_attribution_url": "http://creativecommons.org/licenses/by/3.0/us/",
            "image_attribution_author": "Hopkins"
          },
          {
            "id": "page_1",
            "text": "I like cats",
            "image_url": "https://opensymbols.s3.amazonaws.com/libraries/mulberry/cat.svg",
            "image_content_type": "image/svg",
            "image_attribution_url": "http://creativecommons.org/licenses/by-sa/2.0/uk",
            "image_attribution_author": "Paxtoncrafts Charitable Trust"
          },
          {
            "id": "page_2",
            "text": "Actually I really prefer dogs",
            "image_url": "https://opensymbols.s3.amazonaws.com/libraries/arasaac/dog.png",
            "image_content_type": "image/png",
            "image_attribution_url": "http://creativecommons.org/licenses/by-nc-sa/3.0/",
            "image_attribution_author": "ARASAAC"
          }
        ]
      }.to_json))
      expect(Uploader.find_resources('http://www.example.com/book.json', 'tarheel_book', nil)).to eq([
        {
          'id' => 'title_page',
          'title' => 'Test Book',
          'image' => 'https://opensymbols.s3.amazonaws.com/libraries/noun-project/Test-Tube_89_g.svg',
          'image_content_type' => 'image/svg',
          'url' => 'http://github.com/whitmer',
          'image_attribution' => 'http://creativecommons.org/licenses/by/3.0/us/',
          'image_author' => 'Hopkins'
        },
        {
          'id' => 'page_1',
          'title' => 'I like cats',
          'image' => 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/cat.svg',
          'image_content_type' => 'image/svg',
          'url' => 'http://github.com/whitmer',
          'image_attribution' => 'http://creativecommons.org/licenses/by-sa/2.0/uk',
          'image_author' => 'Paxtoncrafts Charitable Trust'
        },
        {
          'id' => 'page_2',
          'title' => 'Actually I really prefer dogs',
          'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/dog.png',
          'image_content_type' => 'image/png',
          'url' => 'http://github.com/whitmer',
          'image_attribution' => 'http://creativecommons.org/licenses/by-nc-sa/3.0/',
          'image_author' => 'ARASAAC'
        }
      ])
    end
  end
  
  describe "fronted_url" do
    it 'should return nil on nil' do
      expect(Uploader.fronted_url(nil)).to eq(nil)
    end
    
    it 'should return the same url on no match' do
      expect(Uploader.fronted_url('asdf')).to eq('asdf')
      expect(Uploader.fronted_url('http://www.example.com/pig.png')).to eq('http://www.example.com/pig.png')
    end
    
    it 'should return the CDN url if matching' do
      expect(ENV).to receive('[]').with('UPLOADS_S3_BUCKET').and_return(nil).at_least(1).times
      expect(ENV).to receive('[]').with('UPLOADS_S3_CDN').and_return('bacon').at_least(1).times
      expect(ENV).to receive('[]').with('OPENSYMBOLS_S3_BUCKET').and_return('cheese').at_least(1).times
      expect(ENV).to receive('[]').with('OPENSYMBOLS_S3_CDN').and_return('https://abc.cdn.com').at_least(1).times
      expect(Uploader.fronted_url('https://cheese.s3.amazonaws.com/c/d/pic.png')).to eq('https://abc.cdn.com/c/d/pic.png')
      expect(Uploader.fronted_url('https://cheese.s3.amazonaws.com/pic.png')).to eq('https://abc.cdn.com/pic.png')
      expect(Uploader.fronted_url('https://cheese.s3.amazonaws.com/c/d/pic.png')).to eq('https://abc.cdn.com/c/d/pic.png')
    end
  end

  describe "sanitize_url" do
    it 'should sanitize correctly' do
      expect(Uploader.sanitize_url("http://127.0.0.1:25/%0D%0AHELO")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1:25/%0D%0AHELO orange.tw%0D%0AMAIL FROM…")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1:11211:80/")).to eq(nil)
      expect(Uploader.sanitize_url("http://google.com#@evil.com/")).to eq("http://google.com.com/")
      expect(Uploader.sanitize_url("http://foo@evil.com:80@google.com/")).to eq(nil)
      expect(Uploader.sanitize_url("http://orange.tw/sandbox/\xFF\x2E\xFF\x2E/passwd")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1:6379/\r\nSLAVEOF orange.tw 6379\r\nFF0D U+FF0A")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1:6379/－＊SLAVEOF＠orange.tw＠6379－＊")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1\tfoo.google.com")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1%09foo.google.com")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1%2509foo.google.com")).to eq(nil)
      expect(Uploader.sanitize_url("http://127.0.0.1\r\nSLAVEOF orange.tw 6379\r\n:6379/")).to eq(nil)
      expect(Uploader.sanitize_url("http://0/")).to eq(nil)
      expect(Uploader.sanitize_url("http://0%09foo.google.com/")).to eq(nil)
      expect(Uploader.sanitize_url("http://0:8000/composer/send_email?to=orange@chroot.org&url=http://127.0.0.1:6379/%0D%0ASET")).to eq(nil)
      expect(Uploader.sanitize_url("http://0:8000/composer/send_email?to=orange@chroot.org&url=http://127.0.0.1:11211/%0D%0Aset%20githubproductionsearch/queries/code_query%3A857be82362ba02525cef496458ffb09cf30f6256%3Av3%3Acount%200%2060%20150%0D%0A%04%08o%3A%40ActiveSupport%3A%3ADeprecation%3A%3ADeprecatedInstanceVariableProxy%07%3A%0E%40instanceo%3A%08ERB%07%3A%09%40srcI%22%1E%60id%20%7C%20nc%20orange.tw%2012345%60%06%3A%06ET%3A%0C%40linenoi%00%3A%0C%40method%3A%0Bresult%0D%0A%0D%0A")).to eq(nil)
      expect(Uploader.sanitize_url("http://www.example.com:3000/asdf?a=4#awagw")).to eq("http://www.example.com:3000/asdf?a=4")
      expect(Uploader.sanitize_url("https://www.example.com:443/asdf")).to eq("https://www.example.com/asdf")
      expect(Uploader.sanitize_url("http://www.example.com:80/asdf")).to eq("http://www.example.com/asdf")
      expect(Uploader.sanitize_url("http://www.yahoo.com/?asdf=1")).to eq("http://www.yahoo.com/?asdf=1")
      expect(Uploader.sanitize_url("http://13.142.13.1512:12345/?asdf=1")).to eq("http://13.142.13.1512:12345/?asdf=1")
      expect(Uploader.sanitize_url("http://username:password@example.com")).to eq("http://example.com")
    end
  end

  describe "remote_remove_later" do
    it "should create a remove action" do
      expect(RemoteAction.count).to eq(0)
      Uploader.remote_remove_later('asdf', 'checksum')
      expect(RemoteAction.count).to eq(1)
      expect(RemoteAction.last.act_at).to be > 23.hours.from_now
      expect(RemoteAction.last.path).to eq('asdf')
      expect(RemoteAction.last.extra).to eq('checksum')
      expect(RemoteAction.last.action).to eq('delete')
    end

    it "should delete any existing remote_remove calls" do
      expect(RemoteAction.count).to eq(0)
      RemoteAction.create(action: 'delete', path: 'asdf', extra: 'checksum')
      RemoteAction.create(action: 'delete', path: 'asdf', extra: 'checksum')
      RemoteAction.create(action: 'delete', path: 'asdf', extra: 'checksum')
      Uploader.remote_remove_later('asdf', 'checksum')
      expect(RemoteAction.count).to eq(1)
      expect(RemoteAction.last.act_at).to be > 23.hours.from_now
      expect(RemoteAction.last.path).to eq('asdf')
      expect(RemoteAction.last.extra).to eq('checksum')
      expect(RemoteAction.last.action).to eq('delete')
    end

    describe "remote_remove_batch" do
      it "should schedule remove actions" do
        10.times do |i|
          Uploader.remote_remove_later("file/#{i}/pic.png", "chk#{i}")
        end
        expect(RemoteAction.count).to eq(10)
        expect(Uploader.remote_remove_batch).to eq(0)
        expect(Worker.scheduled_actions).to eq([])
        expect(RemoteAction.count).to eq(10)
        RemoteAction.update_all(act_at: 6.hours.ago)
        expect(Uploader.remote_remove_batch).to eq(10)
        expect(RemoteAction.count).to eq(0)
        expect(Worker.scheduled_actions).to eq([])
      end

      it "should return the count of actions cleared" do
        10.times do |i|
          Uploader.remote_remove_later("file/#{i}/pic.png", "chk#{i}")
        end
        expect(RemoteAction.count).to eq(10)
        expect(Uploader.remote_remove_batch).to eq(0)
        expect(Worker.scheduled_actions).to eq([])
        expect(RemoteAction.count).to eq(10)
        RemoteAction.update_all(act_at: 6.hours.ago)
        expect(Uploader.remote_remove_batch).to eq(10)
        expect(RemoteAction.count).to eq(0)
        expect(Worker.scheduled_actions).to eq([])
      end
    end
  end
end

