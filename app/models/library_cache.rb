class LibraryCache < ApplicationRecord
  include GlobalId
  include SecureSerialize
  include Async

  secure_serialize :data
  before_save :generate_defaults

  def generate_defaults
    self.data ||= {}
    self.data['defaults'] ||= {}
    self.data['fallbacks'] ||= {}
    self.data['missing'] ||= {}
    @words_changed = false
    true
  end

  def self.invalidate_all(locale=nil)
    caches = locale ? LibraryCache.where(locale: locale) : LibraryCache.all
    caches.update_all(invalidated_at: Time.now)
  end

  def self.flush_all(locale=nil)
    count = 0
    caches = locale ? LibraryCache.where(locale: locale) : LibraryCache.all
    caches.find_in_batches(batch_size: 1) do |batch|
      batch.each do |cache|
        if !locale || locale == cache.locale
          count += 1
          ['defaults', 'fallbacks', 'missing'].each do |key|
            cache.data.delete(key)
          end
          cache.save
        end
      end
    end
    count
  end

  def self.normalize(hash)
    word_data = hash.slice('url', 'thumbnail_url', 'content_type', 'name', 'width', 'height', 'external_id', 'public', 'protected', 'protected_source', 'license')
    # Normalize the stored data
    if !word_data['url'] && hash['image_url']
      word_data['url'] = hash['image_url']
      word_data['thumbnail_url'] = hash['image_url']
      word_data['external_id'] = hash['id']
      word_data['license'] = {
        'type' => hash['licence'],
        'copyright_notice_url' => hash['license_url'],
        'source_url' => hash['source_url'],
        'author_name' => hash['author'],
        'author_url' => hash['author_url'],
        'uneditable' => true
      }
    end
    word_data
  end

  def add_word(word, hash, cache_forever=false)
    return nil unless word && hash
    # puts "  ADDING found word: #{word} #{cache_forever}"
    # puts hash.to_json
    word = word.downcase
    word_data = LibraryCache.normalize(hash)
    return nil unless word_data['url']
    return nil if word.match(/\s/) && !hash['default'] && !cache_forever # (prevent too much stuffing with whitespace words)
    category = hash['default'] ? 'defaults' : 'fallbacks'
    cutoff = hash['default'] ? 2.months.ago.to_i :  4.weeks.ago.to_i
    cutoff = [cutoff, self.invalidated_at.to_i].max
    # Don't update if it's the same result as stored recently
    if self.data[category][word] && self.data[category][word]['added'] > cutoff && self.data[category][word]['image_id'] && self.data[category][word]['url'] == word_data['url']
      return self.data[category][word]['image_id']  
    end
    # Try to find any cached record with the same url
    # Also mark old results as needing a refresh
    image_id = nil
    needs_refresh = false
    added = (self.data[category][word] || {})['added']
    category_cutoff = [self.invalidated_at.to_i, 6.months.ago.to_i].max
    ['defaults', 'fallbacks'].each do |cat|
      self.data[cat].each do |k, h|
        if h['added'] < category_cutoff && self.data[cat][k] && !self.data[cat][k]['flagged']
          self.data[cat][k]['flagged'] = true
          needs_refresh = true
        end
        image_id ||= h['image_id'] if h['image_id'] && h['url'] == word_data['url']
      end
    end
    if self.data['missing'] && self.data['missing'][word.downcase]
      self.data['missing'].delete(word.downcase)
      @words_changed = true
    end
    (self.data['missing'] || {}).each do |k, h|
      if h['added'] < category_cutoff && !h['flagged']
        self.data['missing'][k]['flagged'] = true
        needs_refresh = true
      end
    end
    image_id = nil if !ButtonImage.select('id, nonce').find_by_global_id(image_id)
    if !image_id
      # Create a new image record if none exists already
      # NOTE: As long as we cache the same URL that came originally from
      # LessonPix then the cached_copy_url code should get applied
      # once that background job finishes
      bi = ButtonImage.find_by(url: word_data['url'], user_id: nil)
      bi ||= ButtonImage.process_new(word_data.merge({'search_term' => word}), {no_author: true})
      # if bi && bi.settings['cached_copy_url']
      #   word_data['url'] = bi.settings['cached_copy_url']
      # end
      image_id = bi.global_id
    end
    added = [cache_forever ? 10.years.from_now.to_i : Time.now.to_i, added || Time.now.to_i].max
    self.data[category][word] = {
      'data' => word_data,
      'image_id' => image_id,
      'word' => word,
      'last' => Time.now.to_i,
      'url' => word_data['url'],
      'added' => added
    }
    @words_changed = true
    # puts "   check"
    if @ease_saving
      @save_counter ||= 0
      @save_counter += 1
    end
    if needs_refresh
      ra_cnt = RemoteAction.where(path: "#{self.global_id}", action: 'update_library_cache').count
      RemoteAction.create(path: "#{self.global_id}", act_at: 12.hours.from_now, action: 'update_library_cache') if ra_cnt == 0
    end
    return image_id
  end 

  def add_missing_word(word, cache_forever=false)
    return false unless word
    puts "  ADDING missing word: #{word}"
    self.data['missing'] ||= {}
    if self.data['missing'][word.downcase] && self.data['missing'][word.downcase]['added'] > 2.weeks.ago.to_i
      true
    else
      self.data['missing'][word.downcase] = {'added' => cache_forever ? 6.months.from_now.to_i : Time.now.to_i}
      @words_changed = true
    end
  end

  def find_expired_words
    words = []
    cache = self
    category_cutoff = [self.invalidated_at.to_i, 6.months.ago.to_i].max
    ['defaults', 'fallbacks'].each do |cat|
      cache.data[cat].each do |k, h|
        if h['added'] < category_cutoff || (cache.data[cat][k] && cache.data[cat][k]['flagged'])
          words << k
        end
      end
    end
    (cache.data['missing'] || {}).each do |word, hash|
      words << word
    end
    # batch lookup, and add words
    tmp_user = OpenStruct.new(subscription_hash: {'extras_enabled' => true, 'skip_cache' => true})
    words.uniq.each_slice(50) do |list|
      Uploader.default_images(cache.library, list.uniq, cache.locale, tmp_user, true)
    end

    cache.reload
    # remove any flagged words that didn't get updated
    ['defaults', 'fallbacks'].each do |cat|
      cache.data[cat].each do |k, h|
        if cache.data[cat][k]['flagged']
          cache.data[cat].delete(k)
        end
      end
    end
    cache.save
  end

  def find_words(words, user)
    found = {}
    no_extras = !user || !user.subscription_hash['extras_enabled']
    lessonpix = user && Uploader.lessonpix_credentials(user)
    if self.library == 'pcs' && no_extras
      return found
    elsif self.library == 'symbolstix' && no_extras
      return found
    elsif self.library == 'lessonpix' && no_extras && !lessonpix
      return found
    end

    did_update = false
    words.each do |word|
      orig = word
      word = word.downcase
      ['defaults', 'fallbacks'].each do |cat|
        cutoff = [(cat == 'defaults') ? 18.months.ago.to_i : 9.months.ago.to_i, self.invalidated_at.to_i].max
        if !found[word] && self.data[cat][word] && self.data[cat][word]['data'] #&& self.data[cat][word]['added'] > cutoff
          self.data[cat][word]['last'] ||= Time.now.to_i
          if self.data[cat][word]['last'] < 2.weeks.ago.to_i
            self.data[cat][word]['last'] = Time.now.to_i
            did_update = true
          end
          if self.data[cat][word]['added'] > self.invalidated_at.to_i
            found[orig] = {}.merge(self.data[cat][word]['data'])
            found[orig]['lingolinq_image_id'] = self.data[cat][word]['image_id']
          end
        end
      end
      if (self.data['missing'] || {})[word] && !found[orig]
        found[orig] = {'missing' => true}        
      end
    end
    # Prune out cached words that aren't getting accessed often enough
    ['defaults', 'fallbacks'].each do |cat|
      self.data[cat].each do |word, hash|
        if hash['last'] && hash['last'] < 6.months.ago.to_i
          self.data[cat].delete(word)
          did_update = true
        end
      end
    end
    if did_update
      if @ease_saving
        @words_changed = true
      else
        self.save 
      end
    end

    found
  end

  # TODO: save is timing out on Uploader.find_images from search#protected_symbols
  def save_if_added
    @save_counter ||= 0
    if @words_changed && (!@ease_saving || @save_counter > 25)
      @save_counter = nil
      # puts "  ** SAVING #{@save_counter}"
      self.save
      self.reload if @ease_saving
      @words_changed = false
    elsif @ease_saving
      # puts "  WAITING #{@words_changed} #{@save_counter}"
    end
  end
end
