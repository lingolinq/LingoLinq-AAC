require 'spec_helper'

describe Api::SearchController, :type => :controller do
  describe "symbols" do
    it "should require api token" do
      get :symbols, params: {:q => 'hat'}
      assert_missing_token
    end
    
    it "should make an opensymbols api call and return the adjusted results" do
      token_user
      list = [
        {'extension' => 'png', 'content_type' => 'image/png', 'name' => 'bob', 'thumbnail_url' => nil},
        {'extension' => 'gif', 'content_type' => 'image/gif', 'name' => 'fred', 'thumbnail_url' => nil}
      ]
      expect(Uploader).to receive(:find_images).with('hat', 'opensymbols', 'en', @user, nil, false, false).and_return(list)
      get :symbols, params: {:q => 'hat'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq(list)
    end
    
    it "should tally any search queries that have no results" do
      RedisInit.default.del('missing_symbols')
      token_user
      list2 = [
        {'extension' => 'png', 'content_type' => 'image/png', 'name' => 'bob', 'thumbnail_url' => nil},
        {'extension' => 'gif', 'content_type' => 'image/gif', 'name' => 'fred', 'thumbnail_url' => nil}
      ]
      expect(Uploader).to receive(:find_images).with('hat', 'opensymbols', 'en', @user, nil, false, false).and_return([])
      expect(Uploader).to receive(:find_images).with('hats', 'opensymbols', 'en', @user, nil, false, false).and_return(list2)
      get :symbols, params: {:q => 'hat'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
      get :symbols, params: {:q => 'hats'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json.length).to eq(2)
      
      hash = RedisInit.default.hgetall('missing_symbols')
      expect(hash).not_to eq(nil)
      expect(hash['hat']).to eq('1')
      expect(hash['hats']).to eq(nil)
    end

    it 'should not allow searching for pcs symbols if not allowed' do
      token_user
      @user.settings['extras_disabled'] = true
      @user.save
      list = [
        {'extension' => 'png', 'name' => 'bob'},
        {'extension' => 'gif', 'name' => 'fred'}
      ]
      res = OpenStruct.new(:body => list.to_json)
      get :symbols, params: {:q => 'hat premium_repo:pcs'}
      assert_error('premium search not allowed')
    end

    it "should search for pcs symbols if allowed" do
      token_user
      User.purchase_extras({'premium_symbols' => true, 'user_id' => @user.global_id})
      list = [
        {'extension' => 'png', 'protected' => true, 'protected_source' => 'pcs', 'content_type' => 'image/png', 'name' => 'bob', 'thumbnail_url' => nil},
        {'extension' => 'gif', 'protected' => true, 'protected_source' => 'pcs', 'content_type' => 'image/gif', 'name' => 'fred', 'thumbnail_url' => nil}
      ]
      expect(Uploader).to receive(:find_images).with('hat ', 'pcs', 'en', @user, nil, false, false).and_return(list)
      get :symbols, params: {:q => 'hat premium_repo:pcs'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq(list)
    end

    it 'should not allow searching for symbolstix symbols if not allowed' do
      token_user
      @user.settings['extras_disabled'] = true
      @user.save
      list = [
        {'extension' => 'png', 'name' => 'bob'},
        {'extension' => 'gif', 'name' => 'fred'}
      ]
      res = OpenStruct.new(:body => list.to_json)
      get :symbols, params: {:q => 'hat premium_repo:symbolstix'}
      assert_error('premium search not allowed')
    end

    it "should search for symbolstix symbols if allowed" do
      token_user
      User.purchase_extras({'premium_symbols' => true, 'user_id' => @user.global_id})
      list = [
        {'extension' => 'png', 'protected' => true, 'protected_source' => 'symbolstix', 'content_type' => 'image/png', 'name' => 'bob', 'thumbnail_url' => nil},
        {'extension' => 'gif', 'protected' => true, 'protected_source' => 'symbolstix', 'content_type' => 'image/gif', 'name' => 'fred', 'thumbnail_url' => nil}
      ]
      expect(Uploader).to receive(:find_images).with('hat ', 'symbolstix', 'en', @user, nil, false, false).and_return(list)
      get :symbols, params: {:q => 'hat premium_repo:symbolstix'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq(list)
    end

    it "should search for pcs symbols if not allowed for the user but for the referenced supervisee" do
      token_user
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      expect(u.subscription_hash['extras_enabled']).to eq(true)
      User.link_supervisor_to_user(@user, u, nil, true)
      Worker.process_queues
      list = [
        {'extension' => 'png', 'protected' => true, 'protected_source' => 'pcs', 'content_type' => 'image/png', 'name' => 'bob', 'thumbnail_url' => nil},
        {'extension' => 'gif', 'protected' => true, 'protected_source' => 'pcs', 'content_type' => 'image/gif', 'name' => 'fred', 'thumbnail_url' => nil}
      ]
      expect(Uploader).to receive(:find_images).with('hat ', 'pcs', 'en', @user, nil, false, false).and_return(list)
      get :symbols, params: {:q => 'hat premium_repo:pcs', :user_name => u.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq(list)
    end

    it "should mark protected symbols as such when found via search" do
      token_user
      User.purchase_extras({'premium_symbols' => true, 'user_id' => @user.global_id})
      list = [
        {'extension' => 'png', 'protected' => true, 'protected_source' => 'pcs', 'content_type' => 'image/png', 'name' => 'bob', 'thumbnail_url' => nil},
        {'extension' => 'gif', 'protected' => true, 'protected_source' => 'pcs', 'content_type' => 'image/gif', 'name' => 'fred', 'thumbnail_url' => nil}
      ]
      expect(Uploader).to receive(:find_images).with('hat ', 'pcs', 'en', @user, nil, false, false).and_return(list)
      get :symbols, params: {:q => 'hat premium_repo:pcs'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq(list)
    end
  end
  
  describe "protected_symbols" do
    it "should require api token" do
      get :protected_symbols, params: {:q => 'hats'}
      assert_missing_token
    end
    
    it "should require access to the integration" do
      token_user
      get :protected_symbols, params: {:q => 'hats'}
      assert_unauthorized
    end
    
    it "should return a result if authorized" do
      token_user
      expect(Uploader).to receive(:find_images).with('gerbils', 'lessonpix', 'en', @user, @user).and_return([])
      get :protected_symbols, params: {:q => 'gerbils', :library => 'lessonpix'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end
    
    it "should check for the existence of a user if specified" do
      token_user
      get :protected_symbols, params: {:q => 'feather', :user_name => 'nobody'}
      assert_not_found('nobody')
    end
    
    it "should check for edit permission for the user if specified" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, false)
      get :protected_symbols, params: {:q => 'walrus', :user_name => u.user_name}
      assert_unauthorized
    end
    
    it "should allow searching on behalf of an authorized user" do
      token_user
      u = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({'pid' =>  '1', 'username' => 'bob', 'token' => 'asdf'})
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=1&username=bob&token=asdf&word=snowman&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new({body: [
      ].to_json}))
      User.link_supervisor_to_user(@user, u, nil, true)
      get :protected_symbols, params: {:q => 'snowman', :library => 'lessonpix', :user_name => u.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end

    it "should allow searching LessonPix without an integration if premium symbols are enabled" do
      uid = ENV['LESSONPIX_USER']
      md5 = ENV['LESSONPIX_MD5']
      sec = ENV['LESSONPIX_SECRET']
      pid = ENV['LESSONPIX_PID']
      begin
        ENV['LESSONPIX_USER'] = 'bacon'
        ENV['LESSONPIX_MD5'] = '24tq3tq24t23r1'
        ENV['LESSONPIX_SECRET'] = 'test_secret'
        ENV['LESSONPIX_PID'] = '99' if ENV['LESSONPIX_PID'].blank?
        token_user
        u = User.create
        User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
        token = Digest::MD5.hexdigest('24tq3tq24t23r1' + ENV['LESSONPIX_SECRET'])
        expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=#{ENV['LESSONPIX_PID']}&username=bacon&token=#{token}&word=snowman&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new({body: [
        ].to_json}))
        User.link_supervisor_to_user(@user, u.reload, nil, true)
        get :protected_symbols, params: {:q => 'snowman', :library => 'lessonpix', :user_name => u.user_name}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json).to eq([])
      ensure
        ENV['LESSONPIX_USER'] = uid
        ENV['LESSONPIX_MD5'] = md5
        ENV['LESSONPIX_SECRET'] = sec
        ENV['LESSONPIX_PID'] = pid
      end
    end

    it "should fall back to api user if authorized user isn't authorized" do
      token_user
      u = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(@user).and_return({'pid' =>  '1', 'username' => 'bob', 'token' => 'asdf'})
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return(nil)
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=1&username=bob&token=asdf&word=snowman&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new({body: [
      ].to_json}))
      User.link_supervisor_to_user(@user, u, nil, true)
      get :protected_symbols, params: {:q => 'snowman', :library => 'lessonpix', :user_name => u.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end

    it "should fall back to api user if authorized user has expired lessonpix account" do
      token_user
      u = User.create
      expect(Uploader).to receive(:lessonpix_credentials).with(@user).and_return({'pid' =>  '1', 'username' => 'bob', 'token' => 'asdf'})
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return({'pid' =>  '1', 'username' => 'sue', 'token' => 'jkl'})
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=1&username=bob&token=asdf&word=snowman&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new({body: [
      ].to_json}))
      expect(Typhoeus).to receive(:get).with("https://lessonpix.com/apiKWSearch.php?pid=1&username=sue&token=jkl&word=snowman&fmt=json&allstyles=n&limit=30", {timeout: 5, followlocation: true}).and_return(OpenStruct.new({body: "Unknown User"}))
      User.link_supervisor_to_user(@user, u, nil, true)
      get :protected_symbols, params: {:q => 'snowman', :library => 'lessonpix', :user_name => u.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end

    it 'should search for symbols' do
      token_user
      expect(Uploader).to receive(:find_images).with('cheese', 'some_library', 'en', @user, @user).and_return([
        {
          'url' => 'http://www.example.com/pic1.png',
          'content_type' => 'image/png',
          'name' => 'my pic',
          'width' => 200,
          'height' => 200,
          'protected' => true,
          'license' => {
            'type' => 'public_domain',
            'author_name' => 'bob',
            'author_url' => 'http://www.example.com/bob',
            'source_url' => 'http://www.example.com/bob/pic1'
          }
        },
        {
          'url' => 'http://www.example.com/pic2.jpg',
          'content_type' => 'image/jpeg',
          'name' => 'my pic',
          'width' => 300,
          'height' => 300,
          'protected' => true,
          'license' => {
            'type' => 'private',
            'author_name' => 'fred',
            'author_url' => 'http://www.example.com/fred',
            'source_url' => 'http://www.example.com/fred/pic2',
            'copyright_notice_url' => 'http://www.example.com/c'
          }
        }
      ])
      get 'protected_symbols', params: {'q' => 'cheese', 'library' => 'some_library'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([
        {
         'image_url' => 'http://www.example.com/pic1.png',
         'thumbnail_url' => 'http://www.example.com/pic1.png',
         'content_type' => 'image/png',
         'name' => 'my pic',
         'width' => 200,
         'height' => 200,
         'external_id' => nil,
         'finding_user_name' => @user.user_name,
         'protected' => true,
         'protected_source' => 'some_library',
         'public' => false,
         'license' => 'public_domain',
         'author' => 'bob',
         'author_url' => 'http://www.example.com/bob',
         'source_url' => 'http://www.example.com/bob/pic1',
         'copyright_notice_url' => nil
        },
        {
         'image_url' => 'http://www.example.com/pic2.jpg',
         'thumbnail_url' => 'http://www.example.com/pic2.jpg',
         'content_type' => 'image/jpeg',
         'name' => 'my pic',
         'width' => 300,
         'height' => 300,
         'external_id' => nil,
         'finding_user_name' => @user.user_name,
         'protected' => true,
         'protected_source' => 'some_library',
         'public' => false,
         'license' => 'private',
         'author' => 'fred',
         'author_url' => 'http://www.example.com/fred',
         'source_url' => 'http://www.example.com/fred/pic2',
         'copyright_notice_url' => 'http://www.example.com/c'
        }
      ])
    end
  end
  
  describe "proxy" do
    it "should require api token" do
      get :proxy, params: {:url => 'http://www.example.com/pic.png'}
      assert_missing_token
    end
    
    it "should return content type and data-uri" do
      token_user
      expect(controller).to receive(:get_url_in_chunks).and_return(['image/png', '12345'])
      get :proxy, params: {:url => 'http://www.example.com/pic.png'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['content_type']).to eq('image/png')
      expect(json['data']).to eq('data:image/png;base64,MTIzNDU=')
    end
    
    it "should return error response if there are unexpected problems" do
      token_user
      expect(controller).to receive(:get_url_in_chunks).and_raise(Api::SearchController::BadFileError, 'something bad')
      get :proxy, params: {:url => 'http://www.example.com/pic.png'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('something bad')
    end
    
    it "should escape the URI if needed" do
      token_user
      expect(controller).to receive(:get_url_in_chunks) { |req|
        expect(req.url).to eq("http://www.example.com/a%20good%20pic.png")
        true
      }.and_return(['image/png', '12345'])
      get :proxy, params: {:url => 'http://www.example.com/a good pic.png'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['content_type']).to eq('image/png')
      expect(json['data']).to eq('data:image/png;base64,MTIzNDU=')
    end

    it "should not re-escape the URI if not needed" do
      token_user
      expect(controller).to receive(:get_url_in_chunks) { |req|
        expect(req.url).to eq("http://www.example.com/a%20good%20pic.png")
        true
      }.and_return(['image/png', '12345'])
      get :proxy, params: {:url => 'http://www.example.com/a%20good%20pic.png'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['content_type']).to eq('image/png')
      expect(json['data']).to eq('data:image/png;base64,MTIzNDU=')
    end
  end
  
  describe "apps" do
    it "should require an api token" do
      get :apps, params: {:q => 'hat', :os => 'ios'}
      assert_missing_token
    end
    
    it "should return the results of a call to AppSearcher" do
      token_user
      expect(AppSearcher).to receive(:find).with('hat', 'ios').and_return({})
      get :apps, params: {:q => 'hat', :os => 'ios'}
      expect(response).to be_successful
      expect(response.body).to eq("{}")
      
      expect(AppSearcher).to receive(:find).with('hat', 'android').and_return([])
      get :apps, params: {:q => 'hat', :os => 'android'}
      expect(response).to be_successful
      expect(response.body).to eq("[]")
    end
  end
  
  describe "get_url_in_chunks" do
    class FakeRequest
      def initialize(header_ok=true, content_type="text/text", body_size=100, headers=nil)
        @header_ok = header_ok
        @content_type = content_type
        @body_size = body_size
        @headers = headers
      end
      def on_headers(&block)
        @header_block = block
      end
      
      def on_body(&block)
        @body_block = block
      end
      
      def on_complete(&block)
        @complete_block = block
      end

      def url
        "whatevs"
      end
      
      def run
        code = 200 if @header_ok == true
        code = 400 if @header_ok == false
        code = @header_ok if @header_ok.is_a?(Numeric)
        code = code.to_i
        res = OpenStruct.new(:success? => (code <= 200), :code => code, :headers => {'Content-Type' => @content_type})
        if @headers
          @headers.each{|k, v| res.headers[k] = v }
        end
        if @body_size.is_a?(String)
          @header_block.call(res)
          @body_block.call(@body_size)
        elsif @body_size > 0
          @header_block.call(res)
          so_far = 0
          while so_far < @body_size
            so_far += 100
            str = "0123456789" * 10
            @body_block.call(str)
          end
        end
        @complete_block.call(res)
      end
    end
    it "should raise on invalid file types" do
      req = FakeRequest.new
      expect { controller.get_url_in_chunks(req) }.to raise_error(Api::SearchController::BadFileError, 'Invalid file type, text/text')
    end
    
    it "should raise on non-200 response" do
      req = FakeRequest.new(false)
      expect { controller.get_url_in_chunks(req) }.to raise_error(Api::SearchController::BadFileError, 'File not retrieved, status 400 for whatevs')
    end
    
    it "should raise on too-large a file" do
      stub_const("Uploader::CONTENT_LENGTH_RANGE", 200)
      req = FakeRequest.new(true, "image/png", Uploader::CONTENT_LENGTH_RANGE + 1)
      expect { controller.get_url_in_chunks(req) }.to raise_error(Api::SearchController::BadFileError, 'File too big (> 200)')
    end
    
    it "should raise on a fail that only calls complete" do
      req = FakeRequest.new(false, "text/text", 0)
      expect { controller.get_url_in_chunks(req) }.to raise_error(Api::SearchController::BadFileError, 'Bad file, 400')
    end
    
    it "should return content_type and binary data on success" do
      req = FakeRequest.new(true, "image/png", 100)
      expect(controller.get_url_in_chunks(req)).to eq(['image/png', '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789'])
    end
    
    it "should redirect with a Location header" do
      url = "http://www.example.com/pic.png:"
      req = FakeRequest.new(301, "image/png", url, {'Location' => url})
      expect(controller.get_url_in_chunks(req)).to eq(['redirect', url])
    end
    
    it "should not redirect with  a Location header AND a valid body" do
      url = "http://www.example.com/pic.png:"
      req = FakeRequest.new(200, "image/png", url * 2, {'Location' => url})
      expect(controller.get_url_in_chunks(req)).to eq(['image/png', url * 2])
    end
  end
  
  describe "parts_of_speech" do
    it "should require api token" do
      get :parts_of_speech, params: {:q => 'hat'}
      assert_missing_token
    end
    
    it "should look up a word" do
      token_user
      expect(WordData).to receive(:find_word).with('hat').and_return({
        :word => 'hat',
        :types => ['noun']
      })
      get :parts_of_speech, params: {:q => 'hat'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({
        'word' => 'hat',
        'types' => ['noun']
      })
    end
  end
  
  describe "external_resources" do
    it 'should require api token' do
      get :external_resources
      assert_missing_token
    end
    
    it 'should require a valid user_name if specified' do
      token_user
      get :external_resources, params: {'user_name' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it 'should require authorization if user_name specified' do
      token_user
      u = User.create
      get :external_resources, params: {'user_name' => u.user_name}
      assert_unauthorized
    end
    
    it 'should not require authorization if user_name not specified' do
      token_user
      expect(Uploader).to receive(:find_resources).with('a', 'b', @user).and_return([])
      get :external_resources, params: {'q' => 'a', 'source' => 'b'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end
    
    it 'should lookup for the specified user' do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      expect(Uploader).to receive(:find_resources).with('a', 'b', u).and_return([])
      get :external_resources, params: {'q' => 'a', 'source' => 'b', 'user_name' => u.user_name}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([])
    end
    
    it 'should call Uploader and return results' do
      token_user
      expect(Uploader).to receive(:find_resources).with('a', 'b', @user).and_return([{a: 1}, {b: 1}])
      get :external_resources, params: {'q' => 'a', 'source' => 'b'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq([{'a' => 1}, {'b' => 1}])
    end
  end
  
  describe "audio" do
    before(:each) do
      RedisInit.permissions.del("google/voices/fr")
    end
    it 'should not require an api token' do
      expect(Typhoeus).to receive(:get).and_return(OpenStruct.new({
        headers: {
          'Content-Type' => 'audio/mp3'
        },
        body: 'asdf'
      }))
      get :audio, params: {text: 'asdf'}
    end

    env_wrap('GOOGLE_TTS_TOKEN' => 'test_tts_key') do
      it "should use the token if there is one" do
        expect(Typhoeus).to receive(:get).with("https://texttospeech.googleapis.com/v1beta1/voices?languageCode=fr&key=test_tts_key").and_return(OpenStruct.new({
          body: {voices: [{'ssmlGender' => 'male', 'name' => 'Bob'}]}.to_json
        }))
        expect(Typhoeus).to receive(:post).with("https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=test_tts_key", body: {
          audioConfig: {audioEncoding: 'MP3', pitch: 0, speakingRate: 1},
          input: {text: 'asdf'},
          voice: {languageCode: 'fr', name: 'Bob'}
        }.to_json, headers: {'Content-Type': 'application/json'}).and_return(OpenStruct.new({
          headers: {'Content-Type' => 'audio/mp3'},
          body: {audioContent: Base64.strict_encode64('asdf')}.to_json
        }))
        get :audio, params: {text: 'asdf', locale: 'fr'}
        expect(response).to be_successful
      end

      it "should cache the voices list when retrieved" do
        expect(Typhoeus).to receive(:get).with("https://texttospeech.googleapis.com/v1beta1/voices?languageCode=fr&key=test_tts_key").and_return(OpenStruct.new({
          body: {voices: [{'ssmlGender' => 'male', 'name' => 'Bob'}]}.to_json
        }))
        expect(Typhoeus).to receive(:post).with("https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=test_tts_key", body: {
          audioConfig: {audioEncoding: 'MP3', pitch: 0, speakingRate: 1},
          input: {text: 'asdf'},
          voice: {languageCode: 'fr', name: 'Bob'}
        }.to_json, headers: {'Content-Type': 'application/json'}).and_return(OpenStruct.new({
          headers: {'Content-Type' => 'audio/mp3'},
          body: {audioContent: Base64.strict_encode64('asdf')}.to_json
        }))
        fount_setex = false
        expect(Permissions).to receive(:setex) do |a, b, c, d|
          if b == 'google/voices/fr'
            expect(a).to eq(RedisInit.permissions)
            expect(b).to eq("google/voices/fr")
            expect(c).to eq(72.hours.to_i)
            fount_setex = true
          end
        end.at_least(1).times
        get :audio, params: {text: 'asdf', locale: 'fr'}
        expect(fount_setex).to eq(true)
      end

      it "should use the cached voices list when available" do
        RedisInit.permissions.setex("google/voices/fr", 10.seconds.to_i, {voices: [{'ssmlGender' => 'male', 'name' => 'Bob'}]}.to_json)
        expect(Typhoeus).to_not receive(:get).with("https://texttospeech.googleapis.com/v1beta1/voices?languageCode=fr&key=test_tts_key")
        expect(Typhoeus).to receive(:post).with("https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=test_tts_key", body: {
          audioConfig: {audioEncoding: 'MP3', pitch: 0, speakingRate: 1},
          input: {text: 'asdf'},
          voice: {languageCode: 'fr', name: 'Bob'}
        }.to_json, headers: {'Content-Type': 'application/json'}).and_return(OpenStruct.new({
          headers: {'Content-Type' => 'audio/mp3'},
          body: {audioContent: Base64.strict_encode64('asdf')}.to_json
        }))
        get :audio, params: {text: 'asdf', locale: 'fr'}
        expect(response).to be_successful
      end
    end

    it "should use the irish voice service" do
      obj = OpenStruct.new(body: "<audio><source src='/abcde'/></audio>", headers: {'Content-Type' => 'audio/wav'})
      expect(obj).to receive(:success?).and_return(true)
      expect(Typhoeus).to receive(:post).with("https://abair.ie/aac_irish", body: {text: 'aha', voice: 'a1'}, timeout: 5).and_return(obj)
      get :audio, params: {locale: 'ga', text: 'aha', voice_id: 'a1'}
    end
  end

  describe 'focuses' do
    it "should return the results of a remote call" do
      expect(Typhoeus).to receive(:get).with("https://workshop.openaac.org/api/v1/search/focus?locale=en&q=bacon&category=&type=&sort=", timeout: 10).and_return(OpenStruct.new(body: [
        {a: 1}, {b: 2}
      ].to_json))
      post 'focuses', params: {q: 'bacon'}
      json = assert_success_json
      expect(json).to eq([{'a' => 1}, {'b' => 2}])
    end

    it "should pass valid query parameters" do
      expect(Typhoeus).to receive(:get).with("https://workshop.openaac.org/api/v1/search/focus?locale=es&q=bacon&category=chocolate&type=cool&sort=popularity", timeout: 10).and_return(OpenStruct.new(body: [
        {a: 1}, {b: 2}
      ].to_json))
      post 'focuses', params: {q: 'bacon', locale: 'es', category: 'chocolate', type: 'cool', sort: 'popularity', limit: 10}
      json = assert_success_json
      expect(json).to eq([{'a' => 1}, {'b' => 2}])
    end
  end

end
