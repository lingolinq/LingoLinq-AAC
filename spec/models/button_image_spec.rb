require 'spec_helper'

describe ButtonImage, :type => :model do
  describe "paper trail" do
    it "should make sure paper trail is doing its thing"
  end
  
  describe "permissions" do
    it "should have some permissions set" do
      i = ButtonImage.new
      expect(i.permissions_for(nil)).to eq({'user_id' => nil, 'view' => true})
      u = User.create
      i.user = u
      expect(i.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true})
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      i.user.reload
      expect(i.permissions_for(u2.reload)).to eq({'user_id' => u2.global_id, 'view' => true, 'edit' => true})
    end
  end
  
  describe "generate_defaults" do
    it "should generate default values" do
      i = ButtonImage.new
      i.generate_defaults
      expect(i.settings['license']).to eq({'type' => 'private'})
      expect(i.public).to eq(false)
    end
    
    it "should not override existing values" do
      i = ButtonImage.new(public: true, settings: {'license' => {'type' => 'nunya'}})
      i.generate_defaults
      expect(i.settings['license']).to eq({'type' => 'nunya'})
      expect(i.public).to eq(true)
    end
  end

  describe "track_image_use" do
    it "shouldn't track if there is a suggestion (system picked the icon) or there isn't a label or search term" do
      expect(ButtonImage).not_to receive(:track_image_use)
      i = ButtonImage.new(settings: {
        'suggestion' => 'abc'
      })
      i.track_image_use
      i.settings = {
        'hat' => true
      }
      i.track_image_use
    end
    
    it "shouldn't track if there is no board set" do
      u = User.create
      i = ButtonImage.new(settings: {
        'suggestion' => 'abc'
      }, :user => u)
      i.track_image_use
      i.settings = {
        'hat' => true
      }
      i.track_image_use
    end
    
    it "shouldn't track if the set board isn't public" do
      u = User.create
      b = Board.create(:user => u)
      i = ButtonImage.new(settings: {
        'suggestion' => 'abc'
      }, :user => u, :board => b)
      i.track_image_use
      i.settings = {
        'hat' => true
      }
      i.track_image_use
    end
    
    it "should use image settings if available" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      i = ButtonImage.new(settings: {
        'search_term' => 'bacon',
        'label' => 'pig'
      }, user: u, board: b)
      expect(ButtonImage).to receive(:track_image_use).with({
        :search_term => 'bacon',
        :locale => 'en',
        :label => 'pig',
        :suggestion => nil,
        :external_id => nil,
        :user_id => u.global_id
      })
      i.track_image_use
    end
    
    env_wrap({'OPENSYMBOLS_TOKEN' => 'test_token'}) do
      it "should make an API call to opensymbols" do
        u = User.create
        b = Board.create(:user => u, :public => true)
        i = ButtonImage.new(settings: {
          'search_term' => 'bacon',
          'label' => 'pig',
          'external_id' => '12356'
        }, user: u, board: b)
        expect(Typhoeus).to receive(:post) do |url, args|
          expect(url).to eq("https://www.opensymbols.org/api/v1/symbols/12356/use")
          expect(args[:body][:access_token]).not_to eq(nil)
          expect(args[:body][:user_id]).not_to eq(nil)
        end.and_return(OpenStruct.new(code: 200))
        i.track_image_use
      end

      it "should obfuscate user_id" do
        u = User.create
        b = Board.create(:user => u, :public => true)
        i = ButtonImage.new(settings: {
          'search_term' => 'bacon',
          'label' => 'pig',
          'external_id' => '12356'
        }, user: u, board: b)
        expect(Typhoeus).to receive(:post) do |url, args|
          expect(url).to eq("https://www.opensymbols.org/api/v1/symbols/12356/use")
          expect(args[:body][:user_id]).not_to eq(nil)
          expect(args[:body][:user_id]).not_to eq(u.id)
          expect(args[:body][:user_id]).not_to eq(u.global_id)
          expect(args[:body][:user_id].length).to eq(10)
        end.and_return(OpenStruct.new(code: 200))
        i.track_image_use
      end
    end
    
    it "should schedule call to track_image_use", skip: "slow queue not processed in test worker" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      i = ButtonImage.new(settings: {
        'search_term' => 'bacon',
        'label' => 'pig',
        'external_id' => '12356'
      }, user: u, board: b)
      i.save
      expect(Typhoeus).to receive(:post) do |url, args|
        expect(url).to eq("https://www.opensymbols.org/api/v1/symbols/12356/use")
        expect(args[:body][:user_id]).not_to eq(nil)
        expect(args[:body][:user_id]).not_to eq(u.id)
        expect(args[:body][:user_id]).not_to eq(u.global_id)
        expect(args[:body][:user_id].length).to eq(10)
      end
      Worker.process_queues
    end

    it 'should auto-track when the image is created', skip: "slow queue not processed in test worker" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      i = ButtonImage.new(settings: {
        'search_term' => 'bacon',
        'label' => 'pig',
        'external_id' => '12356'
      }, user: u, board: b)
      i.save
      expect(Typhoeus).to receive(:post) do |url, args|
        expect(url).to eq("https://www.opensymbols.org/api/v1/symbols/12356/use")
        expect(args[:body][:user_id]).not_to eq(nil)
        expect(args[:body][:user_id]).not_to eq(u.id)
        expect(args[:body][:user_id]).not_to eq(u.global_id)
        expect(args[:body][:user_id].length).to eq(10)
      end
      Worker.process_queues
    end

    it 'should track protected_source usage' do
      u = User.create
      b = Board.create(:user => u, :public => true)
      i = ButtonImage.new(settings: {
        'search_term' => 'bacon',
        'label' => 'pig',
        'external_id' => '12356',
        'protected_source' => 'bacon'
      }, user: u, board: b)
      i.save
      expect(Worker.scheduled?(User, :perform_action, {id: u.id, method: 'track_protected_source', arguments: ['bacon']})).to eq(true)
    end

    it 'should schedule generate_fallback if image is protected' do
      u = User.create
      b = Board.create(user: u, :public => true)
      i = ButtonImage.create(settings: {
        protected: true,
        button_label: 'cheddar',
        protected_source: 'bacon'
      }, user: u, board: b, url: 'http://www.example.com/pic.png')
      expect(Worker.scheduled_for?(:slow, ButtonImage, :perform_action, {id: i.id, method: 'generate_fallback', arguments: []})).to eq(true)
    end

    it 'should not schedule generate_fallback for non-protected images' do
      u = User.create
      b = Board.create(user: u, :public => true)
      i = ButtonImage.create(settings: {
        protected: false,
        button_label: 'cheddar',
        protected_source: 'bacon'
      }, user: u, board: b, url: 'http://www.example.com/pic.png')
      expect(Worker.scheduled_for?(:slow, ButtonImage, :perform_action, {id: i.id, method: 'generate_fallback', arguments: []})).to eq(false)
    end
  end

  describe "generate_fallback" do
    it 'should not generate a fallback for non-protected images' do
      i = ButtonImage.new(settings: {
        'protected' => false,
        'button_label' => 'bacon',
      })
      expect(Uploader).to_not receive(:find_images)
      i.generate_fallback
      expect(i.settings['fallback']).to eq(nil)
    end

    it 'should lookup a public image matching the image label or search term' do
      u = User.create
      i = ButtonImage.new(user: u, settings: {
        'protected' => true,
        'button_label' => 'bacon',
      })
      expect(Uploader).to receive(:default_images).with('opensymbols', ['bacon'], 'en', u).and_return({})
      expect(Uploader).to receive(:find_images).with('bacon', 'opensymbols', 'en', u).and_return([{'a' => 1}])
      i.generate_fallback
      expect(i.settings['fallback']).to_not eq(nil)
      expect(i.settings['fallback']['a']).to eq(1)
    end

    it "should dig for a search term if none is provided" do
      u = User.create
      i = ButtonImage.create(:user => u, settings: {
        'protected' => true
      })
      b = Board.create(user: u)
      b.settings['buttons'] = [{
        'id' => '11', 'label' => 'bacon', 'image_id' => i.global_id
      }]
      b.save
      BoardButtonImage.create(board_id: b.id, button_image_id: i.id)
      expect(Uploader).to receive(:default_images).with('opensymbols', ['bacon'], 'en', u).and_return({})
      expect(Uploader).to receive(:find_images).with('bacon', 'opensymbols', 'en', u).and_return([{'a' => 1}])
      i.generate_fallback
      expect(i.settings['fallback']).to_not eq(nil)
      expect(i.settings['fallback']['a']).to eq(1)
    end
  end

  describe "process_params" do
    it "should ignore unspecified parameters" do
      i = ButtonImage.new(:user_id => 1)
      expect(i.process_params({}, {})).to eq(true)
    end
    
    it "should raise if no user set" do
      i = ButtonImage.new
      expect { i.process_params({}, {}) }.to raise_error("user required as image author")
    end
    
    it "should set parameters" do
      u = User.new
      i = ButtonImage.new(:user_id => 1)
      expect(i.process_params({
        'content_type' => 'image/png',
        'suggestion' => 'hat',
        'public' => true
      }, {
        :user => u
      })).to eq(true)
      expect(i.settings['content_type']).to eq('image/png')
      expect(i.settings['license']).to eq(nil)
      expect(i.settings['suggestion']).to eq('hat')
      expect(i.settings['search_term']).to eq(nil)
      expect(i.settings['external_id']).to eq(nil)
      expect(i.public).to eq(true)
      expect(i.user).to eq(u)
    end
    
    it "should process the URL including non_user_params if sent" do
      u = User.new
      i = ButtonImage.new(:user_id => 1)
      expect(i.process_params({
        'url' => 'http://www.example.com'
      }, {})).to eq(true)
      expect(i.settings['url']).to eq(nil)
      expect(i.settings['pending_url']).to eq('http://www.example.com')
    end
  end
   
  it "should securely serialize settings" do
    u = User.create
    expect(GoSecure::SecureJson).to receive(:dump).with({:a=>1, "pending"=>true, "license"=>{"type"=>"private"}})
    ButtonImage.create(:user => u, :settings => {:a => 1})
  end
  
  it "should remove from remote storage if no longer in use" do
    u = User.create
    i = ButtonImage.create(:user => u)
    i.removable = true
    i.url = "asdf"
    i.settings['full_filename'] = "asdf"
    expect(Uploader).to receive(:remote_remove).with("asdf")
    i.destroy
    Worker.process_queues
  end
  
  describe "remove_connections" do
    it "should remove connections on destroy" do
      u = User.create
      b = Board.create(:user => u)
      s = ButtonImage.create(:user => u)
      BoardButtonImage.create(:board_id => b.id, :button_image_id => s.id)
      BoardButtonImage.create(:board_id => b.id, :button_image_id => s.id)
      BoardButtonImage.create(:board_id => b.id, :button_image_id => s.id)
      expect(BoardButtonImage.where(:button_image_id => s.id).count).to eq(3)
      s.destroy
      expect(BoardButtonImage.where(:button_image_id => s.id).count).to eq(0)
    end
  end

  # def check_for_variants(force=false)
  #   return false if self.settings['checked_for_variants'] && !force
  #   if self.url && !self.url.match(/\.varianted-skin\./) && !self.url.match(/-var\w+UNI/)
  #     if self.url.match(/\/libraries\/twemoji\//) && self.settings['external_id']
  #       token = ENV['OPENSYMBOLS_TOKEN']
  #       url = "https://www.opensymbols.org/api/v2/symbols/twemoji/#{self.settings['external_id']}"
  #       res = Typhoeus.get(url + "?search_token=#{token}", headers: { 'Accept-Encoding' => 'application/json' }, timeout: 10, :ssl_verifypeer => false)
  #       json = JSON.parse(res.body) rescue nil
  #       if json && json['symbol'] && json['symbol']['image_url'] && json['symbol']['image_url'] != self.url
  #         self.settings['pre_variant_url'] = self.url
  #         self.url = json['symbol']['image_url']
  #         self.settings['checked_for_variants'] = true
  #         self.save
  #         return true
  #       end
  #     elsif self.url.match(/\/libraries\//)
  #       extension = (self.url.split(/\//)[-1] || '').split(/\./)[-1]
  #       new_url = self.url + '.varianted-skin.' + extension
  #       req = Typhoeus.head(new_url)
  #       if req.success?
  #         self.settings['pre_variant_url'] = self.url
  #         self.url = new_url
  #         self.settings['checked_for_variants'] = true
  #         self.save
  #         return true
  #       end
  #     end
  #   end
  #   self.settings['checked_for_variants'] = true
  #   self.save
  #   return false
  # end
  describe "check_for_variants" do
    it "should not re-check if already checked and not forced" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/test/pic.png', settings: {'checked_for_variants' => true})
      expect(Typhoeus).to_not receive(:head)
      expect(Typhoeus).to_not receive(:get)
      expect(bi).to_not receive(:save)
      expect(bi.check_for_variants).to eq(false)
    end

    it "should re-check if forced, even if already checked" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/test/pic.png', settings: {'checked_for_variants' => true})
      obj = OpenStruct.new()
      expect(obj).to receive(:success?).and_return(true)
      expect(Typhoeus).to receive(:head).with("https://example.com/libraries/test/pic.png.varianted-skin.png").and_return(obj)
      expect(Typhoeus).to_not receive(:get)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants(true)).to eq(true)
      expect(bi.url).to eq("https://example.com/libraries/test/pic.png.varianted-skin.png")
      expect(bi.settings['pre_variant_url']).to eq("https://example.com/libraries/test/pic.png")
      expect(bi.settings['checked_for_variants']).to eq(true)
    end

    it "should return false if already a known variant url" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/test/pic.png.varianted-skin.png', settings: {})
      expect(Typhoeus).to_not receive(:head)
      expect(Typhoeus).to_not receive(:get)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants(true)).to eq(false)
      expect(bi.url).to eq("https://example.com/libraries/test/pic.png.varianted-skin.png")
      expect(bi.settings['checked_for_variants']).to eq(true)
      expect(bi.settings['pre_variant_url']).to eq(nil)

      bi = ButtonImage.create(url: 'https://example.com/libraries/twemoji/pic-var12345UNI.svg', settings: {'external_id' => 'asdf'})
      expect(bi).to receive(:save)
      expect(bi.check_for_variants(true)).to eq(false)
      expect(bi.url).to eq("https://example.com/libraries/twemoji/pic-var12345UNI.svg")
      expect(bi.settings['checked_for_variants']).to eq(true)
      expect(bi.settings['pre_variant_url']).to eq(nil)
    end

    it "should check twemoji urls with an external id" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/twemoji/pic-cool.svg', settings: {'external_id' => '1188'})
      obj = OpenStruct.new(body: {}.to_json)
      expect(Typhoeus).to_not receive(:head)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v2/symbols/twemoji/1188?search_token=#{ENV['OPENSYMBOLS_TOKEN']}", {headers: {'Accept-Encoding' => 'application/json'}, ssl_verifypeer: false, timeout: 10}).and_return(obj)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants).to eq(false)
      expect(bi.url).to eq("https://example.com/libraries/twemoji/pic-cool.svg")
      expect(bi.settings['pre_variant_url']).to eq(nil)
      expect(bi.settings['checked_for_variants']).to eq(true)
    end

    it "should update twemoji urls if a result is returned" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/twemoji/pic-cool.svg', settings: {'external_id' => '1188'})
      obj = OpenStruct.new(body: {
        'symbol' => {
          'image_url' => 'https://example.com/libraries/twemoji/pic-varfffUNI-cool.svg'
        }
      }.to_json)
      expect(Typhoeus).to_not receive(:head)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v2/symbols/twemoji/1188?search_token=#{ENV['OPENSYMBOLS_TOKEN']}", {headers: {'Accept-Encoding' => 'application/json'}, ssl_verifypeer: false, timeout: 10}).and_return(obj)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants).to eq(true)
      expect(bi.url).to eq("https://example.com/libraries/twemoji/pic-varfffUNI-cool.svg")
      expect(bi.settings['pre_variant_url']).to eq('https://example.com/libraries/twemoji/pic-cool.svg')
      expect(bi.settings['checked_for_variants']).to eq(true)
    end

    it "should check libary urls for a varianted url" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/test/pic.png', settings: {})
      obj = OpenStruct.new()
      expect(obj).to receive(:success?).and_return(false)
      expect(Typhoeus).to receive(:head).with("https://example.com/libraries/test/pic.png.varianted-skin.png").and_return(obj)
      expect(Typhoeus).to_not receive(:get)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants).to eq(false)
      expect(bi.url).to eq("https://example.com/libraries/test/pic.png")
      expect(bi.settings['pre_variant_url']).to eq(nil)
      expect(bi.settings['checked_for_variants']).to eq(true)
    end
    
    it "should update library urls if a result is returned" do
      bi = ButtonImage.create(url: 'https://example.com/libraries/test/pic.png', settings: {})
      obj = OpenStruct.new()
      expect(obj).to receive(:success?).and_return(true)
      expect(Typhoeus).to receive(:head).with("https://example.com/libraries/test/pic.png.varianted-skin.png").and_return(obj)
      expect(Typhoeus).to_not receive(:get)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants).to eq(true)
      expect(bi.url).to eq("https://example.com/libraries/test/pic.png.varianted-skin.png")
      expect(bi.settings['pre_variant_url']).to eq("https://example.com/libraries/test/pic.png")
      expect(bi.settings['checked_for_variants']).to eq(true)
    end

    it "should not check non-library urls" do
      bi = ButtonImage.create(url: 'https://example.com/libs/test/pic.png', settings: {})
      expect(Typhoeus).to_not receive(:head)
      expect(Typhoeus).to_not receive(:get)
      expect(bi).to receive(:save)
      expect(bi.check_for_variants).to eq(false)
      expect(bi.url).to eq("https://example.com/libs/test/pic.png")
      expect(bi.settings['pre_variant_url']).to eq(nil)
      expect(bi.settings['checked_for_variants']).to eq(true)
    end
  end

  describe "which_skinners" do
    it "should return the specified skin type" do
      ['default', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'].each do |skin|
        which = ButtonImage.which_skinner(skin)
        10.times do |i|
          expect(which.call("https://www.example.com/#{i}/pic.png")).to eq(skin)
        end
      end
    end

    it "should repeat the same values for the same urls" do
      which = ButtonImage.which_skinner('shuffle')
      which2 = ButtonImage.which_skinner('shufflf')
      skins = []
      skins2 = []
      10.times do |i|
        skin = which.call("pic#{i}")
        skins << skin
        skins2 << which2.call("pic#{i}")
        5.times{ expect(which.call("pic#{i}")).to eq(skin) }
      end
      expect(skins).to_not eq(skins2)
    end

    it "should honor weights correctly" do
      which = ButtonImage.which_skinner('pref-000011')
      skins = []
      25.times do |i|
        skins << which.call("pic#{i}")
        expect(which.call("pic#{i}")).to_not eq('default')
        expect(which.call("pic#{i}")).to_not eq('dark')
        expect(which.call("pic#{i}")).to_not eq('medium-dark')
        expect(which.call("pic#{i}")).to_not eq('medium')
      end
      expect(skins.uniq.sort).to eq(['light', 'medium-light'])

      which = ButtonImage.which_skinner('pref-095511')
      skins = []
      weights = {}
      1000.times do |i|
        skin = which.call("pic#{('a'.ord + i).chr}")
        weights[skin] ||= 0
        weights[skin] += 1
        skins << skin
        expect(skin).to_not eq('default')
      end
      expect(weights['dark']).to be > 400
      expect(weights['medium-dark']).to be > 200
      expect(weights['medium-dark']).to be < 300
      expect(weights['medium']).to be > 200
      expect(weights['medium']).to be < 300
      expect(weights['medium-light']).to be > 25
      expect(weights['medium-light']).to be < 75
      expect(weights['light']).to be > 25
      expect(weights['light']).to be < 75
      expect(skins.uniq.sort).to eq(['dark', 'light', 'medium', 'medium-dark', 'medium-light'])
    end
  end

  describe "skinned_url" do
    it "should return the correct value" do
      which = proc{|url| next 'medium-dark'; }
      expect(ButtonImage.skinned_url("https://www.example.com/pic.png", which)).to eq("https://www.example.com/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/pic-varianted-skin.png", which)).to eq("https://www.example.com/pic-variant-medium-dark.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic.png", which)).to eq("https://www.example.com/libraries/twemoji/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic-var1fffUNI-var1ab4UNI.png", which)).to eq("https://www.example.com/libraries/twemoji/pic-1f3fe-1f3fe.png")
      which = proc{|url| next 'light'; }
      expect(ButtonImage.skinned_url("https://www.example.com/pic.png", which)).to eq("https://www.example.com/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/pic-varianted-skin.png", which)).to eq("https://www.example.com/pic-variant-light.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic.png", which)).to eq("https://www.example.com/libraries/twemoji/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic-var1fffUNI.png", which)).to eq("https://www.example.com/libraries/twemoji/pic-1f3fb.png")
      which = proc{|url| next 'default'; }
      expect(ButtonImage.skinned_url("https://www.example.com/pic.png", which)).to eq("https://www.example.com/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/pic-varianted-skin.png", which)).to eq("https://www.example.com/pic-varianted-skin.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic.png", which)).to eq("https://www.example.com/libraries/twemoji/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic-var1fffUNI-var1ab4UNI.png", which)).to eq("https://www.example.com/libraries/twemoji/pic-var1fffUNI-var1ab4UNI.png")
      which = proc{|url| next 'bacon'; }
      expect(ButtonImage.skinned_url("https://www.example.com/pic.png", which)).to eq("https://www.example.com/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/pic-varianted-skin.png", which)).to eq("https://www.example.com/pic-varianted-skin.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic.png", which)).to eq("https://www.example.com/libraries/twemoji/pic.png")
      expect(ButtonImage.skinned_url("https://www.example.com/libraries/twemoji/pic-var1fffUNI-var1ab4UNI.png", which)).to eq("https://www.example.com/libraries/twemoji/pic-var1fffUNI-var1ab4UNI.png")
    end
  end

  describe "settings_for" do
    it "should not error on no user" do
      bi = ButtonImage.new
      bi.settings = {'a' => 1}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(nil, nil, nil)
      expect(hash).to eq({'a' => 1, 'url' => 'http://www.example.com/pic.png', 'protected' => false, 'used_library' => 'original'})
    end
    
    it "should return default settings if no alternates defined" do
      bi = ButtonImage.new
      bi.settings = {'a' => 1}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(nil, nil, nil)
      expect(hash).to eq({'a' => 1, 'url' => 'http://www.example.com/pic.png', 'protected' => false, 'used_library' => 'original'})
    end

    it "should not error on no preference or list of allowed sources" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, nil, nil)
      expect(hash).to eq({'a' => 1, 'url' => 'http://www.example.com/pic.png', 'protected' => false, 'used_library' => 'original'})
    end

    it "should return default settings if no matching alternates" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1, 'library_alternates' => {'bogus' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, [], 'bacon')
      expect(hash).to eq({
        'a' => 1, 
        'url' => 'http://www.example.com/pic.png', 
        'protected' => false, 
        'used_library' => 'original'
      })
    end

    it "should return default settings if preferred alternate not allowed" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1, 'library_alternates' => {'symbolstix' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, [], 'symbolstix')
      expect(hash).to eq({
        'a' => 1, 
        'url' => 'http://www.example.com/pic.png', 
        'protected' => false, 
        'used_library' => 'original'
      })
    end

    it "should return default settings if it matches the preferred alternate" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {
        'a' => 1, 
        'protected_source' => 'bacon',
        'library_alternates' => {'bogus' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, [], 'bacon')
      expect(hash).to eq({
        'a' => 1, 
        'url' => 'http://www.example.com/pic.png', 
        'protected' => false, 
        'protected_source' => 'bacon',
        'used_library' => 'bacon'
      })
    end

    it "should return the specified preference if available and allowed" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1, 'library_alternates' => {'bogus' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, [], 'bogus')
      expect(hash).to eq({
        'url' => 'http://www.example.com/bogus/pic.png', 
        'used_library' => 'bogus'
      })
    end

    it "should return protected status on an alternate only for a protected alternate" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1, 'library_alternates' => {'pcs' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, ['pcs'], 'pcs')
      expect(hash).to eq({
        'url' => 'http://www.example.com/bogus/pic.png', 
        'used_library' => 'pcs',
        'protected' => true,
        'protected_source' => 'pcs'
      })
    end

    it "should use arasaac as an acceptable alternate for opensymbols preference" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1, 'library_alternates' => {'arasaac' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, [], 'opensymbols')
      expect(hash).to eq({
        'url' => 'http://www.example.com/bogus/pic.png', 
        'used_library' => 'opensymbols',
      })
    end

    it "should use twemoji as an aceptable alternate for opensymbols preference" do
      bi = ButtonImage.new
      u = User.create
      bi.settings = {'a' => 1, 'library_alternates' => {'twemoji' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, [], 'opensymbols')
      expect(hash).to eq({
        'url' => 'http://www.example.com/bogus/pic.png', 
        'used_library' => 'opensymbols',
      })
    end

    it "should return user token if for a protected image api address" do
      bi = ButtonImage.new
      u = User.create
      u.settings['preferences']['preferred_symbols'] = 'pcs'
      expect(u).to receive(:enabled_protected_sources).with(true).and_return(['pcs'])
      bi.settings = {'a' => 1, 'library_alternates' => {'pcs' => {'url' => '/api/v1/users/asdf/protected_image'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, nil, nil)
      expect(hash).to eq({
        'url' => "/api/v1/users/asdf/protected_image?user_token=#{u.user_token}", 
        'used_library' => 'pcs',
        'protected' => true,
        'protected_source' => 'pcs',
      })      
    end

    it "should fall back to the user preference if none specified" do
      bi = ButtonImage.new
      u = User.create
      u.settings['preferences']['preferred_symbols'] = 'bacon'
      bi.settings = {'a' => 1, 'library_alternates' => {'bacon' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, nil, nil)
      expect(hash).to eq({
        'url' => 'http://www.example.com/bogus/pic.png', 
        'used_library' => 'bacon',
      })
    end

    it "should fall back to the user's allowed sources list if not specified" do
      bi = ButtonImage.new
      u = User.create
      u.settings['preferences']['preferred_symbols'] = 'pcs'
      expect(u).to receive(:enabled_protected_sources).with(true).and_return(['pcs'])
      bi.settings = {'a' => 1, 'library_alternates' => {'pcs' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, nil, nil)
      expect(hash).to eq({
        'url' => 'http://www.example.com/bogus/pic.png', 
        'used_library' => 'pcs',
        'protected' => true,
        'protected_source' => 'pcs',
      })
    end

    
    it "should fall back to the user's allowed sources list and preference if not specified" do
      bi = ButtonImage.new
      u = User.create
      u.settings['preferences']['preferred_symbols'] = 'pcs'
      expect(u).to receive(:enabled_protected_sources).with(true).and_return([])
      bi.settings = {'a' => 1, 'library_alternates' => {'pcs' => {'url' => 'http://www.example.com/bogus/pic.png'}}}
      bi.url = "http://www.example.com/pic.png"
      hash = bi.settings_for(u, nil, nil)
      expect(hash).to eq({
        'a' => 1,
        'protected' => false,
        'url' => 'http://www.example.com/pic.png', 
        'used_library' => 'original',
      })
    end
  end
end
