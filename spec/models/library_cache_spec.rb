require 'spec_helper'

describe LibraryCache, :type => :model do
  describe "invalidate_all" do
    it "should invalidate all caches" do
      cache = LibraryCache.create
      expect(cache.invalidated_at).to eq(nil)
      LibraryCache.invalidate_all
      expect(cache.reload.invalidated_at).to_not eq(nil)
    end

    it "should write over fresh cache records that are invalidated" do
      cache = LibraryCache.create
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => 6.hours.ago.to_i, 'url' => 'http://www.example.com/bacon.png'}
      cache.invalidated_at = Time.now
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['data']).to_not eq(nil)
    end

    it "should not use invalidated caches" do
      cache = LibraryCache.create
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.hours.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['bacon'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.days.ago.to_i, 'data' => {'b' => 1}}
      cache.invalidated_at = Time.now
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to eq(nil)
    end
  end

  describe "add_word" do
    it "should require a valid word and hash" do
      cache = LibraryCache.create
      expect(cache.add_word(nil, nil)).to eq(nil)
      expect(cache.add_word('bacon', nil)).to eq(nil)
      expect(cache.add_word(nil, {'url' => 'http://www.example.com/bacon.png'})).to eq(nil)
    end

    it "should not add words with spaces" do
      cache = LibraryCache.create
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq(nil)
      expect(cache.add_word('bacon master', {'url' => 'http://www.example.com/bacon.png'})).to eq(nil)
    end

    it "should not overwrite recently-written words" do
      cache = LibraryCache.create
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => Time.now.to_i, 'url' => 'http://www.example.com/bacon.png'}
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to eq('aaa')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['data']).to eq(nil)
    end

    it "should overwrite outdated words" do
      cache = LibraryCache.create
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => 12.months.ago.to_i, 'url' => 'http://www.example.com/bacon.png'}
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['data']).to_not eq(nil)
    end

    it "should remove as missing words" do
      cache = LibraryCache.create
      cache.data['missing']['bacon'] = {'added' => Time.now.to_i}
      cache.save
      expect(cache.data['missing']['bacon']).to_not eq(nil)
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['missing']['bacon']).to eq(nil)
    end

    it "should overwrite recent-but-invalidated words" do
      cache = LibraryCache.create
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => 6.hours.ago.to_i, 'url' => 'http://www.example.com/bacon.png'}
      cache.invalidated_at = Time.now
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['data']).to_not eq(nil)
    end

    it "should add words with spaces if they are default words" do
      cache = LibraryCache.create
      res = cache.add_word('bacon master', {'default' => true, 'url' => 'http://www.example.com/bacon.png'})
      expect(res).to_not eq(nil)
      expect(cache.data['defaults']['bacon master']).to_not eq(nil)
      expect(cache.data['defaults']['bacon master']['url']).to eq('http://www.example.com/bacon.png')
    end

    it "should add words with spaces if they are 'important' words" do
      cache = LibraryCache.create
      expect(cache.add_word('bacon master', {'url' => 'http://www.example.com/bacon.png'}, true)).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon master']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon master']['added']).to be > 5.years.from_now.to_i
      expect(cache.data['fallbacks']['bacon master']['data']).to_not eq(nil)
    end

    it "should flag outdated results when adding" do
      cache = LibraryCache.create
      cache.data['defaults']['chocolate'] = {'added' => 0, 'data' => {'a' => 1}}
      cache.data['missing']['whickle'] = {'added' => 6.months.ago}
      res = cache.add_word('bacon', {'default' => true, 'url' => 'http://www.example.com/bacon.png'})
      expect(res).to_not eq(nil)
      expect(cache.data['defaults']['bacon']).to_not eq(nil)
      expect(cache.data['defaults']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['defaults']['bacon']['data']).to_not eq(nil)
      expect(cache.data['defaults']['chocolate']).to_not eq(nil)
      expect(cache.data['defaults']['chocolate']['data']).to eq({'a' => 1})
      expect(cache.data['defaults']['chocolate']['flagged']).to eq(true)
      expect(cache.data['missing']['whickle']['flagged']).to eq(true)
    end

    it "should create a button_image record if not already available" do
      cache = LibraryCache.create
      image_id = cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})
      expect(image_id).to_not eq(nil)
      bi = ButtonImage.find_by_global_id(image_id)
      expect(bi.url).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['data']).to_not eq(nil)
    end

    it "should use an existing button_image record referenced in the cache for the same url if available" do
      cache = LibraryCache.create
      image_id = cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})
      expect(image_id).to_not eq(nil)
      bi = ButtonImage.find_by_global_id(image_id)
      expect(bi.url).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon']['data']).to_not eq(nil)
      image_id = cache.add_word('bacons', {'url' => 'http://www.example.com/bacon.png'})
      expect(image_id).to eq(bi.global_id)
    end

    it "should use a button_image that matches without a user if none found in the cache" do
      cache = LibraryCache.create
      bi = ButtonImage.create(url: 'http://www.example.com/bacon.png')
      image_id = cache.add_word('bacons', {'url' => 'http://www.example.com/bacon.png'})
      expect(image_id).to eq(bi.global_id)
    end

    it "should return an image_id" do
      cache = LibraryCache.create
      image_id = cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})
      expect(image_id).to_not eq(nil)
    end

    it "should use the cached image_id on old results only if still a valid record" do
      cache = LibraryCache.create
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => 4.months.ago.to_i, 'url' => 'http://www.example.com/bacon.png'}
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.add_word('bacon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq(nil)
    end

    it "should schedule a batch update if any found words are expired" do
      cache = LibraryCache.create
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => 12.months.ago.to_i, 'url' => 'http://www.example.com/bacon.png'}
      expect(RemoteAction.count).to eq(0)
      expect(cache.add_word('bracon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']['flagged']).to eq(true)
      ra = RemoteAction.last
      expect(ra).to_not eq(nil)
      expect(ra.action).to eq('update_library_cache')
      expect(ra.path).to eq(cache.global_id)
    end

    it "should not re-schedule after expired words are addressed, even if they aren't found" do
      cache = LibraryCache.create(library: 'twemoji', locale: 'en')
      cache.data['fallbacks']['bacon'] = {'image_id' => 'aaa', 'added' => 12.months.ago.to_i, 'url' => 'http://www.example.com/bacon.png'}
      expect(RemoteAction.count).to eq(0)
      expect(cache.add_word('bracon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']['flagged']).to eq(true)
      cache.save
      ra = RemoteAction.last
      expect(ra).to_not eq(nil)
      expect(ra.action).to eq('update_library_cache')
      expect(ra.path).to eq(cache.global_id)
      expect(Uploader).to receive(:default_images) do |lib, list, loc, usr, bool|
        expect(lib).to eq(cache.library)
        expect(list).to eq(['bacon'])
        expect(loc).to eq(cache.locale)
        expect(usr.subscription_hash['skip_cache']).to eq(true)
        expect(bool).to eq(true)
      end
      ra.process_action
      ra.destroy
      Worker.process_queues
      cache.reload
      expect(cache.add_word('bracon', {'url' => 'http://www.example.com/bacon.png'})).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon']).to eq(nil)
      expect(cache.data['fallbacks']['bracon']).to_not eq(nil)
      expect(RemoteAction.count).to eq(0)
    end

    it "should cache long-term if specified" do
      cache = LibraryCache.create
      expect(cache.add_word('bacon master', {'url' => 'http://www.example.com/bacon.png'}, true)).to_not eq('aaa')
      expect(cache.data['fallbacks']['bacon master']['url']).to eq('http://www.example.com/bacon.png')
      expect(cache.data['fallbacks']['bacon master']['added']).to be > 5.years.from_now.to_i
      expect(cache.data['fallbacks']['bacon master']['data']).to_not eq(nil)
    end
  end

  describe "add_missing_word" do
    it "should return false on no word" do
      cache = LibraryCache.create
      expect(cache.add_missing_word(nil, true)).to eq(false)
    end

    it "should not update if already marked as missing" do
      cache = LibraryCache.create
      cache.data['missing']['bacon'] = {'added' => 6.hours.ago.to_i}
      expect(cache.add_missing_word('Bacon')).to eq(true)
      expect(cache.data['missing']['Bacon']).to eq(nil)
      expect(cache.data['missing']['bacon']['added']).to be < 1.hour.ago.to_i
      expect(cache.instance_variable_get('@words_changed')).to eq(false)
    end

    it "should mark as changed if old" do
      cache = LibraryCache.create
      cache.data['missing']['bacon'] = {'added' => 6.months.ago.to_i}
      expect(cache.add_missing_word('Bacon')).to eq(true)
      expect(cache.data['missing']['Bacon']).to eq(nil)
      expect(cache.data['missing']['bacon']['added']).to be > 8.hours.ago.to_i
      expect(cache.instance_variable_get('@words_changed')).to eq(true)
    end

    it "should mark as changed if new word" do
      cache = LibraryCache.create
      expect(cache.add_missing_word('Bacon')).to eq(true)
      expect(cache.data['missing']['Bacon']).to eq(nil)
      expect(cache.data['missing']['bacon']['added']).to be > 8.hours.ago.to_i
      expect(cache.instance_variable_get('@words_changed')).to eq(true)
    end
  end

  describe "find_words" do
    it "should prefer default words over fallback words" do
      cache = LibraryCache.create
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 12.days.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['bacon'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.days.ago.to_i, 'data' => {'b' => 1}}
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to_not eq(nil)
      expect(res['bacon']['a']).to eq(1)
      expect(res['bacon']['lingolinq_image_id']).to eq('aaa')
    end
    
    it "should use expired results" do
      cache = LibraryCache.create
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['bacon'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.days.ago.to_i, 'data' => {'b' => 1}}
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to_not eq(nil)
      expect(res['bacon']['a']).to eq(1)
      expect(res['bacon']['lingolinq_image_id']).to eq('aaa')
    end

    it "should not use invalidated results" do
      cache = LibraryCache.create
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['bacon'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.days.ago.to_i, 'data' => {'b' => 1}}
      cache.invalidated_at = Time.now
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to eq(nil)
    end

    it "should not allow unauthorized access to premium symbols" do
      cache = LibraryCache.create(library: 'pcs')
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['bacon'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.days.ago.to_i, 'data' => {'b' => 1}}
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to eq(nil)

      u = User.create
      u.subscription_override('enable_extras')
      res = cache.find_words(['bacon'], u.reload)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to_not eq(nil)
    end

    it "should return lingolinq_image_id in the results" do
      cache = LibraryCache.create
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['bacon'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.days.ago.to_i, 'data' => {'b' => 1}}
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to_not eq(nil)
      expect(res['bacon']['a']).to eq(1)
      expect(res['bacon']['lingolinq_image_id']).to eq('aaa')
    end

    it "should pruen words that haven't been searched in a while" do
      cache = LibraryCache.create
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'last' => 12.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['defaults']['cheddar'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.months.ago.to_i, 'last' => 12.months.ago.to_i, 'data' => {'b' => 1}}
      res = cache.find_words(['bacon'], nil)
      expect(res).to_not eq(nil)
      expect(res['bacon']).to_not eq(nil)
      expect(res['bacon']['a']).to eq(1)
      expect(res['bacon']['lingolinq_image_id']).to eq('aaa')
      expect(cache.data['defaults']['bacon']).to_not eq(nil)
      expect(cache.data['defaults']['cheddar']).to eq(nil)
    end
  end

  describe "find_expired_words" do
    it "should find all expired words" do
      cache = LibraryCache.create(library: 'twemoji', locale: 'en')
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['cheddar'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.months.ago.to_i, 'data' => {'b' => 1}}
      cache.data['defaults']['whittle'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 3.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['missing']['scarble'] = {'added' => 6.months.ago.to_i}
      cache.save
      expect(Uploader).to receive(:default_images) do |lib, list, loc, u, bool|
        expect(lib).to eq(cache.library)
        expect(list).to eq(['bacon', 'cheddar', 'scarble'])
        expect(loc).to eq('en')
        expect(u.subscription_hash['skip_cache']).to eq(true)
        expect(bool).to eq(true)
      end
      cache.find_expired_words
    end

    it "should clear flagged words that aren't found" do
      cache = LibraryCache.create(library: 'twemoji', locale: 'en')
      cache.data['defaults']['bacon'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 24.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['fallbacks']['cheddar'] = {'url' => 'http://www.example.com/bacon2.png', 'image_id' => 'bbb', 'added' => 12.months.ago.to_i, 'flagged' => true, 'data' => {'b' => 1}}
      cache.data['defaults']['whittle'] = {'url' => 'http://www.example.com/bacon.png', 'image_id' => 'aaa', 'added' => 3.months.ago.to_i, 'data' => {'a' => 1}}
      cache.data['missing']['flugly'] = {'added' => 6.years.ago.to_i, 'flagged' => true}
      cache.save
      expect(Uploader).to receive(:default_images) do |lib, list, loc, u, bool|
        expect(lib).to eq(cache.library)
        expect(list).to eq(['bacon', 'cheddar', 'flugly'])
        expect(loc).to eq('en')
        expect(u.subscription_hash['skip_cache']).to eq(true)
        expect(bool).to eq(true)
      end
      cache.find_expired_words
      expect(cache.data['defaults']['bacon']).to_not eq(nil)
      expect(cache.data['fallbacks']['cheddar']).to eq(nil)
      expect(cache.data['defaults']['whittle']).to_not eq(nil)
      expect(cache.data['missing']['flugly']).to_not eq(nil)
    end
  end

  describe "save_if_added" do
    it "should not save if no words have been added" do
      cache = LibraryCache.create
      expect(cache).to_not receive(:save)
      cache.save_if_added
    end

    it "should only save if words have been added" do
      cache = LibraryCache.create
      expect(cache).to receive(:save)
      cache.instance_variable_set('@words_changed', true)
      cache.save_if_added
      expect(cache.instance_variable_get('@words_changed')).to eq(false)
    end
  end
end
