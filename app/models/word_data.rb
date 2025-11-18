class WordData < ActiveRecord::Base
  include SecureSerialize
  include Async
  include GlobalId
  include Processable
  INFLECTIONS_VERSION = 2

  # https://www.enchantedlearning.com/wordlist/opposites.shtml
  # https://www.talkenglish.com/vocabulary/top-50-prepositions.aspx
  # http://frequencylists.blogspot.com/2016/05/the-500-most-frequently-used-spanish.html

  secure_serialize :data
  include Replicate
  before_save :generate_defaults
  after_save :assert_missing_priority
  
  def generate_defaults
    self.data ||= {}
    self.reviews = (self.data['reviewer_ids'] || []).length
    true
  end

  def assert_missing_priority
    if !self.priority && self.locale
      self.priority = -1
      self.schedule(:assert_priority)
    end
    true
  end

  def reviewed_by?(user)
    return (self.data['reviewer_ids'] || []).include?(user && user.global_id)
  end

  def self.extract(locale)
    words = {}
    str = "{\n"
    str += "  \"_locale\": #{locale.to_json},\n"
    str += "  \"_version\": \"0.1\",\n"
    WordData.where(locale: locale).find_in_batches(batch_size: 500) do |batch|
      batch.each do |wd|
        hash = {}
        hash[:pos] = wd.data['types'] || []
        hash[:ovr] = {}.merge(wd.data['inflection_overrides'] || {})
        hash[:ant] = wd.data['antonyms'] || []
        if (wd.data['reviews'] || {}).keys.length > 0 && hash[:pos].length > 0
          words[wd.word] = hash
        end
      end
      # puts "..."
    end
    words.to_a.sort_by(&:first).each do |word, hash|
      if hash[:pos].length > 0
        str += "  #{word.to_json}: {\n"
        str += "    \"types\": #{hash[:pos].to_json},\n"
        str += "    \"inflections\": #{hash[:ovr].to_json},\n"
        str += "    \"antonyms\": #{hash[:ant].to_json},\n" if hash[:ant].length > 0
        str = str.sub(/,\n$/, "\n")
        str += "  },\n"
      end
    end
    str = str.sub(/,\n$/, "\n")
    str += "}\n"
    # puts str
    
    file = Tempfile.new("stash")
    file.write(str)
    file.close
    remote_path = "downloads/exports/words-#{locale}-#{Time.now.to_i}.json"
    res = Uploader.remote_upload(remote_path, file.path, 'text/json')
    res[:url]
  end

  def self.ingest(url)
    req = Typhoeus.get(url)
    json = JSON.parse(req.body)
    locale = json['_locale']
    updates = []
    if json['_type'] == 'words'
      json.each do |word, hash|
        if !word.match(/^_/)
          updates << word
          wd = WordData.find_or_create_by(word: word, locale: locale)
          wd.data['reviewer_ids'] = ((wd.data['reviewer_ids'] || []) + ['ext']).uniq
          wd.data['reviews'] ||= {}
          wd.data['reviews']['ext'] = {
            'updated' => Time.now.iso8601,
            'primary_part_of_speech' => (hash['types'] || hash['pos'] || [])[0],
            'inflection_overrides' => hash['inflections'] || hash['ovr'] || {},
            'antonyms' => hash['antonyms'] || hash['ant'] || [],
            'parts_of_speech' => hash['types'] || hash['pos']
          }
          if (hash['types'] || hash['pos'] || [])[0]
            wd.data['types'] = hash['types'] || hash['pos']
          end
          if (hash['antonyms'] || hash['ant'] || [])[0]
            wd.data['antonyms'] = hash['antonyms'] || hash['ant']
          end
          if hash['inflections'] || hash['ovr']
            wd.data['inflection_overrides'] = hash['inflections'] || hash['ovr']
          end
          wd.save
        end
      end
    elsif json['_type'] == 'rules'
      Setting.set("rules/#{locale}", json.slice('rules', 'inflection_locations', 'contractions', 'default_contractions'), true)
      updates << "rules/#{locale}"
    end
    updates
  end
  
  def process_params(params, non_user_params)
    updater = non_user_params[:updater]
    if updater && updater.allows?(non_user_params[:updater], 'admin_support_actions')
      if params['skip']
        self.updated_at = Time.now
      else
        self.data['reviewer_ids'] = ((self.data['reviewer_ids'] || []) + [updater.global_id]).uniq
        self.data['reviews'] ||= {}
        self.data['reviews'][updater.global_id] = {
          'updated' => Time.now.iso8601,
          'primary_part_of_speech' => params['primary_part_of_speech'],
          'inflection_overrides' => params['inflect_overrides'],
          'antonyms' => params['antonyms'],
          'parts_of_speech' => params['parts_of_speech']
        }
        if params['parts_of_speech']
          parts = params['parts_of_speech']
          parts = parts.split(/,/) if parts.is_a?(String)
          self.data['types'] = parts.map{|s| s.strip.downcase }
        end
        if params['primary_part_of_speech']
          self.data['types'] = ([params['primary_part_of_speech']] + (self.data['types'] || [])).uniq
        end
        if params['antonyms']
          parts = params['antonyms']
          parts = parts.split(/,/) if parts.is_a?(String)
          self.data['antonyms'] = parts.map{|s| s.strip }
        end
        if params['inflection_overrides']
          hash = self.data['inflection_overrides'] || {}
          params['inflection_overrides'].each do |key, str|
            if str == "" || str == nil || str == 'N/A'
              hash.delete(key)
            else
              hash[key] = str
            end
          end
          self.data['inflection_overrides'] = hash
        end
      end
    else
      add_processing_error('only admins can update currently')
    end
  end

  def self.assert_priority(relation)
    bs = Board.find_by_path('example/core-112').board_downstream_button_set rescue nil
    buttons = nil
    if bs
      bs.assert_extra_data
      buttons = bs.buttons
    end
    req = Typhoeus.get("https://lingolinq.s3.amazonaws.com/language/english_with_counts.txt")
    lines = req.body.split(/\n/)
    counts = lines.map{|s| s.split(/\t/)[0] }
    cores = WordData.core_lists.select{|l| l['locale'] == 'en' }
    fringes = WordData.fringe_lists.select{|l| l['locale'] == 'en' }
    relation.find_in_batches(batch_size: 20) do |batch|
      batch.each do |wd|
        wd.assert_priority({'buttons' => buttons, 'counts' => counts, 'cores' => cores, 'fringes' => fringes})
      end
      puts "..."
    end
  end

  ## TODO: add antonyms, https://words.bighugelabs.com/api.php
  def assert_priority(opts=nil)
    cores = (opts && opts['cores']) || WordData.core_lists.select{|l| l['locale'] == self.locale }
    fringes = (opts && opts['fringes']) || WordData.fringe_lists.select{|l| l['locale'] == self.locale }
    scores = []
    return unless self.locale == 'en'
    buttons = nil
    if !opts
      bs = Board.find_by_path('example/core-112').board_downstream_button_set rescue nil
      if bs
        bs.assert_extra_data
        # priority = 8 if it's in core-112
        bs
        buttons = bs.buttons
      end
    end
    if buttons
      scores << 8 if buttons.any?{|b| b['label'] == self.word }
    end
    if cores.length > 0
      core_count = cores.select{|l| l['words'].include?(self.word) }.length
      fringe_count = fringes.select{|l| l['categories'].any?{|c| c['words'].include?(self.word) } }.length
      # something in all the core lists is top priority
      scores << 10 if core_count == cores.length
      # something  in some of the core lists is high priority
      scores << 9 if core_count > 0
      # something in the fringe lists is moderate priority
      scores << 7 if fringe_count > 0
    end
    if scores.empty?
      # download word frequency list
      counts = opts && opts['counts']
      if !opts
        req = Typhoeus.get("https://lingolinq.s3.amazonaws.com/language/english_with_counts.txt") 
        lines = req.body.split(/\n/)
        counts = lines.map{|s| s.split(/\t/)[0] }
      end
      if counts
        hash = {}
        # top 5,000 - 5 points
        # top 10,000 - 4 points
        # top 25,000 - 3 points
        # top 50,000 - 2 points
        # any        - 1 point
        idx = counts.index(self.word)
        # score it from 0-5 based on word frequency
        scores << 5 if idx && idx < 5000
        scores << 4 if idx && idx < 10000
        scores << 3 if idx && idx < 25000
        scores << 2 if idx && idx < 50000
        scores << 1 if idx
      end
    end
    score = scores.max || 0
    if score
      self.priority = score
      self.save
    end
    true
  end
  
  def self.find_word(text, locale='en') 
    word = find_word_record(text, locale)
    word && word.data
  end

  def self.find_words(list, locale='en')
    locale ||= 'en'
    root_locale = locale.split(/-/)[0]
    res = {}
    map = {}
    list.each{|t| map[t.downcase] = t }
    WordData.where(locale: [locale, root_locale], word: list.compact.map(&:downcase)).each do |word|
      res[map[word.word]] = word.data
    end
    res
  end
  
  def self.find_word_record(text, locale='en')
    return nil if text && text.match(/^[\+\:]/)
    locale ||= 'en'
    word = self.find_by(:word => text.downcase, :locale => locale)
    word ||= self.find_by(:word => text.downcase.gsub(/[^A-Za-z0-9'\s]/, ''), :locale => locale)
    if !word && locale.match(/-/)
      locale = locale.split(/-/)[0]
      word ||= self.find_by(:word => text.downcase, :locale => locale)
      word ||= self.find_by(:word => text.downcase.gsub(/[^A-Za-z0-9'\s]/, ''), :locale => locale)
    end
    word
  end
  
  def self.add_suggestion(word, sentence, locale='en')
    word = find_word_record(word, locale)
    return false unless word
    word.data['sentences'] ||= []
    word.data['sentences'] << {
      'sentence' => sentence,
      'approved' => true
    }
    word.data['sentences'].uniq!
    word.save
    true
  end
  
  def self.add_activities_for(user, hash)
    return true if !user.any_premium_or_grace_period?
    act = (user.settings['target_words'] || {})['activities'] || {}
    fresh = true
    hash['generated'] = [hash['generated'], act['generated'] || Time.at(0).iso8601].compact.min
    (act['words'] || []).each do |word|
      existing = hash['words'].detect{|w| w['word'] == word['word'] && w['locale'] == word['locale'] }
      if existing
        existing['user_ids'] << user.global_id
      else
        word['user_ids'] = [user.global_id]
        hash['words'] << word
      end
    end
    (act['list'] || []).each do |sug|
      existing = hash['list'].detect{|s| s['id'] == sug['id']}
      if existing
        existing['score'] += sug['score']
        existing['user_ids'] << user.global_id
      else
        sug['user_ids'] = [user.global_id]
        hash['list'] << sug
      end
    end
    # If the target word list has updated more recently than the activity list, then
    # the activity list is out of date
    if user.settings['target_words'] && act['generated'] && user.settings['target_words']['generated'] > act['generated']
      fresh = false
    end

    fresh
  end
  
  def self.activities_for(user, include_supervisees=false)
    res = {
      'words' => [],
      'list' => [],
      'log' => [],
      'checked' => Time.now.iso8601
    }
    all_fresh = add_activities_for(user, res)
    if include_supervisees
      user.supervisees.each do |sup|
        sup_fresh = add_activities_for(sup, res)
        all_fresh = all_fresh && sup_fresh
      end
    end
    session = LogSession.find_by(log_type: 'modeling_activities', user_id: user.id)
    res['log'] = session.modeling_log if session
    res['list'] = res['list'].sort_by{|s| [s['score'], rand] }.reverse
    # If all the activity lists are more recent than the word lists they were derived
    # from, and all the activity lists were generated no less than two weeks ago,
    # then mark this list as fresh.
    res.instance_variable_set('@fresh', !!(all_fresh && res['generated'] && res['generated'] > 2.weeks.ago.iso8601))
#    res.instance_variable_set('@fresh', true) if !user.settings['target_words']
    res
  end
  
  def self.update_activities_for(user_id, include_supervisees=false)
    user = User.find_by_global_id(user_id)
    return nil unless user

    if !user.settings['target_words']
      user.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'list' => []
      }
    end
    
    if include_supervisees
      user.supervisees.each{|u| WordData.update_activities_for(u.global_id, false) }
    end
    
    # short-circuit if recently-generated
    activities_session = LogSession.find_by(log_type: 'activities', user_id: user.id)
    existing = activities_for(user, include_supervisees)
    if existing.instance_variable_get('@fresh') && existing['words'].length >= 3
      generated = Time.parse(existing['generated'])
      more_recent_goals = UserGoal.where(active: true, user_id: user.id).where(['created_at > ?', generated]).count > 0
      more_recent_activities = activities_session && activities_session.updated_at > generated
      return existing unless more_recent_goals || more_recent_activities
    end
    
    # get the user's suggested words
    lists = self.core_and_fringe_for(user, true)
    available_words = lists[:reachable_for_user] + lists[:reachable_fringe_for_user]
    basic_core = self.basic_core_list

    suggestions = []
    suggestions += ((user.settings['target_words'] || {})['list'] || []).select{|w| available_words.include?(w['word']) }
    # unless there are lots of options available, add some fallbacks in case
    # comm workshop doesn't have results for words
    if suggestions.length < 10
      # add from the basic word list, indexed by weeks having daily_use or created_at
      daily_use = LogSession.find_by(log_type: 'daily_use', user_id: user.id)
      units = ((Time.now - user.created_at) / 1.day) / 10
      if daily_use
        units = (daily_use.data['days'] || []).keys.length / 5
      end
      index = [0, units % (basic_core.length - 5)].max
      basic_core[index, 5].each do |word|
        if !suggestions.detect{|w| w['word'] == word }
          suggestions << {
            'word' => word,
            'locale' => 'en', # TODO: i18n
            'reasons' => ['fallback']
          }
        end
      end
    end
    
    # make an API call to comm workshop to get activities for the words
    activities = []
    found_words = []
    word_re = Regexp.new("\\b(" + suggestions.map{|s| s['word'].sub(/\+/, '') }.join('|') + ")\\b")
    quote_re = Regexp.new("\"(" + suggestions.map{|s| s['word'].sub(/\+/, '') }.join('|') + ")\"")
    suggestions.each_with_index do |suggestion, idx|
      next if found_words.length > 5
      word = suggestion['word']
      next unless available_words.include?(word)
      locale = suggestion['locale'] || 'en'
      req = Typhoeus.get("https://workshop.openaac.org/api/v1/words/#{CGI.escape(word + ":" + locale)}", timeout: 10)
      json = JSON.parse(req.body) rescue nil
      word = json && json['word']
      if word && !word['pending']
        found_words << {
          'word' => word['word'],
          'score' => word['score'] || 0,
          'locale' => word['locale'],
          'reasons' => suggestion['reasons']
        }
        ['learning_projects', 'activity_ideas', 'topic_starters', 'books', 'videos', 'send_homes'].each do |key|
          list = (word[key] || [])
          list.each do |a|
            a['type'] = key
            a['word'] = suggestion['word']
            a['locale'] = locale
            a['score'] = 5.0 * (suggestions.length - idx) / suggestions.length.to_f
            a['score'] += 5.0 * ((word['score'] || 0 / 100.0))
            a['score'] += 1.0 if ['learning_projects', 'activity_ideas', 'send_homes'].include?(key)
            text = "#{a['text']} #{a['description']}"
            a['score'] += 0.3 * text.scan(word_re).length
            a['score'] += 0.5 * text.scan(quote_re).length
            a['score'] = a['score'].round(3)
          end
          activities += list
        end
      else
        RedisInit.default.hincrby('missing_workshop_words', suggestion['word'].to_s, 1)
      end
    end
    # TODO: boost activities that:
    # - have multiple words from the suggestion list
    # - represent an actual activity
    # - have more user likes
    # - match the type the user usually implements
    # - come from the same author as previous successful activities
    # - does not come from authors of previous flopped activities
    
    # mark which activities have been used (and how recently) by the user
    if activities_session && activities_session.data['activities']
      activities.each do |a|
        if activities_session.data['activities'][a['id']]
          ref = activities_session.data['activities'][a['id']]
          # Have a weighted history so after like a year there's little discount for
          # having been tried already
          a['handled'] = ref['updated']
          a['attempted'] = false
          a['skipped'] = true
        end
      end
    end
    
    # prioritize based on activities that have words in the user's vocab?
    available_words.include?('')
    activities.each do |a|
      # TODO: ...
      # a['score'] += extra_words_in(a, available_words)
    end
    
    # add the activities to the user object for quick retrieval
    # TODO: store these somewhere other than on the user record and
    # bump the result list to 50, that's way too much data for that model
    user.settings['target_words']['activities'] = {
      'generated' => Time.now.iso8601,
      'words' => found_words,
      'list' => activities.sort_by{|a| [a['score'] || 0, WordData.rand] }.reverse[0, 25]
    }
    user.save(touch: false)
    
    activities_for(user, include_supervisees)
  end

  def self.rand
    Random.rand
  end
  
# word types:
#  'noun', 'plural noun', 'noun phrase', 'nominative'
#  'verb', 'usu participle verb', 'transitive verb', 'intransitive verb',
#  'adjective',
#  'adverb',
#  'conjunction',
#  'preposition',
#  'interjection',
#  'pronoun',
#  'article', 'definite article', 'indefinite article',
#  'numeral'
  def self.update_word_type(text, locale, type)
    wd = find_word_record(text, locale)
    locales = []
    raise "word not found" unless wd
    if wd.data['types']
      wd.data['types'] = ([type] + wd.data['types']).uniq
      wd.save
      locales << locale
    end
    (wd.data['translations'] || {}).each do |loc, str|
      trans = find_word_record(str, loc)
      if trans.data['types']
        trans.data['types'] = ([type] | trans.data['types']).uniq
        trans.save
        locales << loc
      end
    end
    locales
  end
  
  def self.translate(text, source_lang, dest_lang, type=nil)
    batch = translate_batch([{text: text, type: type}], source_lang, dest_lang)
    batch[:translations][text]
  end
  
  def self.translate_batch(batch, source_lang, dest_lang)
    res = {source: source_lang, dest: dest_lang, translations: {}}
    found = {}
    missing = batch
    batch.each do |obj|
      text = obj[:text]
      word = find_word_record(text, source_lang)
      new_text = nil
      if word && word.data
        word.data['translations'] ||= {}
        new_text ||= word.data['translations'][dest_lang]
        new_text ||= word.data['translations'][dest_lang.split(/-/)[0]]
      end
      if new_text
        res[:translations][text] = new_text
        missing = missing.select{|e| e[:text] != text }
      end
    end
    
    # API call to look up all missing strings
    query_translations(missing, source_lang, dest_lang).each do |obj|
      if obj[:translation]
        res[:translations][obj[:text]] = obj[:translation]
        schedule(:persist_translation, obj[:text], obj[:translation], source_lang, dest_lang, obj[:type])
      end
    end
    
    return res
  end

  def self.translate_locale_batch(locale, nopes=nil)
    nopes ||= []
    fn = File.expand_path("../../../public/locales/#{locale}.json", __FILE__)
    json = JSON.parse(File.read(fn))
    subs = {}
    temps = {}
    json.each do |key, str|
      if str.match(/^\*\*\*\s/) && subs.keys.length < 100 && !nopes.include?(key)
        temp_str = str.sub(/^\*\*\*\s/, '').sub(/\%app_name\%/, '_TR1A_').sub(/\%app_name_upper\%/, '_TR2A_')
        temp_str = temp_str.sub(/\s\|\|\s/, ' _._ ')
        while temp_str.match(/\%\{\w+\}/)
          match = temp_str.match(/\%\{\w+\}/)[0]
          name = "_TR#{temps.keys.length + 1}B_";
          temp_str = temp_str.sub(match, name)
          temps[name] = match
        end
        subs[key] = temp_str
      end
    end
    ref = []
    subs.each{|k, s| ref << {text: s, key: k}}
    res = query_translations(ref, 'en', locale.sub(/_/, '-'))
    found = {}
    res.each do |trans|
      if trans[:key] && json[trans[:key]]
        found[trans[:key]] = true
        str = trans[:translation]
        text = trans[:text]
        str = str.sub(/_TR1A_/, '%app_name%').sub(/_TR2A_/, '%app_name_upper%').sub(/\s+_\._\s+/, ' || ')
        text = text.sub(/_TR1A_/, '%app_name%').sub(/_TR2A_/, '%app_name_upper%').sub(/\s+_\._\s+/, ' || ')
        while str.match(/_TR\d+B_/)
          match = str.match(/_TR\d+B_/)[0]
          str = str.sub(match, temps[match])
        end
        while text.match(/_TR\d+B_/)
          match = text.match(/_TR\d+B_/)[0]
          text = text.sub(match, temps[match])
        end
        json[trans[:key]] = "#{str} [[ #{text}"
        puts json[trans[:key]]
      end
    end
    ref.each do |obj|
      if !found[obj[:key]]
        nopes << obj[:key]
      end
    end
    f = File.open(fn, 'w')
    f.write JSON.pretty_generate(json)
    f.close
    nopes
  end

  def self.check_inflections
    b = Board.find_by_path('example/core-112')
    ids = [b.global_id] + b.settings['downstream_board_ids']
    buttons = []
    Board.find_all_by_global_id(ids).each do |board|
      board.buttons.each do |button|
        buttons << button if button['part_of_speech']
      end
    end
    f = URI.parse("https://lingolinq.s3.amazonaws.com/language/ngrams.arpa.json").open
    json = Oj.load(f.read); 0
    buttons.each do |button|
      if json[button['label']]
        print "\n#{button['label']}  "
        json[button['label']].each do |word, score|
          if ['i', 'you', 'your', 'yours', 'yourself', 'me', 'my', 'myself', 'mine', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'they', 'them', 'their', 'theirs', 'themself', 'themselves', 'us', 'we', 'our', 'ours', 'ourselves'].include?(word)
            button['pronouns'] = (button['pronouns'] || []) + [word]
          elsif word == 'to' || (!word.match(/thing$/) && !word.match(/ning$/) && word.match(/ing$/)) || word.match(/ed$/)
            button['verbs'] = (button['verbs'] || []) + [word]
          elsif word == 'less' || word == 'more' || word.match(/er$/) || word.match(/est$/)
            button['ads'] = (button['ads'] || []) + [word]
          end
        end
      else
        print " #{button['label']}"
      end
    end; buttons.length
    buttons.select{|b| b['pronouns']}.each do |button|
      if ['i', 'he', 'she', 'you', 'they', 'we'].include?(button['pronouns'][0])
      else
        puts "#{button['label']}\t\t#{button['pronouns'].join(',')}"
      end
    end.length
    buttons.each do |button|
      if button['verbs']
        puts "#{button['label']}\t\t#{button['verbs'][0,15].join(',')}"
      end
    end.length
    buttons.each do |button|
      if button['ads'] && button['ads'].length > 1
        puts "#{button['label']}\t\t#{button['ads'][0,5].join(',')}"
      end
    end.length
  end
  
  def self.query_translations(words, source_lang, dest_lang)
    return [] unless ENV['GOOGLE_TRANSLATE_TOKEN']
    idx = 0
    res = []
    while idx < words.length
      list = words[idx, 20]
      # https://translation.googleapis.com/language/translate/v2?api_key=KEY&target=dest_lang
      strings = list.map{|obj| obj[:text] }
      key = ENV['GOOGLE_TRANSLATE_TOKEN']

      langs = {source: source_lang, dest: dest_lang}
      langs.each do |key, val|
        if val == 'zh-CN' || val.match(/zh_Hans/)
          langs[key] = 'zh-CN'
        elsif val == 'zh-TW' || val.match(/zh_Hant/)
          langs[key] = 'zh-TW'
        elsif val.match(/zh/) && !val.match(/-/)
          langs[key] = 'zh-CN'
        elsif val.match(/[_-]/)
          langs[key] = val.split(/[_-]/)[0].downcase
        end
      end
      source_lang = langs[:source]
      dest_lang = langs[:dest]

      url = "https://translation.googleapis.com/language/translate/v2?key=#{key}&target=#{dest_lang}&source=#{source_lang}&format=text"
      url += '&' + strings.map{|str| "q=#{CGI.escape(str || '')}" }.join('&')
      data = Typhoeus.get(url, timeout: 3)
      json = data && JSON.parse(data.body) rescue nil
      if json && json['data'] && json['data']['translations']
        json['data']['translations'].each_with_index do |trans, idx|
          obj = list[idx]
          if obj && trans['translatedText'] != obj[:text]
            obj[:translation] = trans['translatedText']
            res << obj
          end
        end
      end
      idx += 20
    end
    res
  end
  
  def self.persist_translation(text, translation, source_lang, dest_lang, type)
    # record the translations on the source word
    word = find_word_record(text, source_lang)
    if !word && !text.match(/^[\+\:]/)
      word ||= WordData.find_or_create_by(:word => text.downcase.strip, :locale => source_lang) rescue nil
      word ||= WordData.find_or_create_by(:word => text.downcase.strip, :locale => source_lang)
      word.data ||= {}
      word.data['word'] ||= text.downcase.strip
    end
    if word && word.data
      word.data['translations'] ||= {}
      word.data['translations'][dest_lang] ||= translation
      word.data['translations'][dest_lang.split(/-/)[0]] ||= translation
      word.save
    end
    # record the reverse translation on the 
    backwards_word = find_word_record(translation, dest_lang)
    if !backwards_word && !translation.match(/^[\+\:]/)
      backwards_word ||= WordData.find_or_create_by(:word => translation.downcase.strip, :locale => dest_lang)
      backwards_word.data = {:word => translation.downcase.strip}
    end
    if backwards_word && backwards_word.data
      backwards_word.data['translations'] ||= {}
      backwards_word.data['translations'][source_lang] ||= text
      backwards_word.data['translations'][source_lang.split(/-/)[0]] ||= text
      if type
        # TODO: right now this just assumes the first-translated is the most common usage for a homonym
        backwards_word.data['types'] ||= []
        backwards_word.data['types'] << type
        backwards_word.data['types'].uniq!
      end
      if word && word.data && word.data['types'] && word.data['types'][0]
        backwards_word.data['types'] ||= []
        backwards_word.data['types'] << word.data['types'][0]
        backwards_word.data['types'].uniq!
      end
      backwards_word.save
    end
  end

  def self.inflection_locations_for(words, locale)
    hash = {}
    return hash if words.blank? || !locale || locale.blank?
    locales = [locale.downcase, locale.split(/-|_/)[0].downcase]
    known_types = ['adjective', 'noun', 'verb', 'adverb', 'pronoun']
    rules = Setting.get_cached("rules/#{locale}") || Setting.get_cached("rules/#{locale.split(/-|_/)[0]}")
    infl_rules = rules && rules['inflection_locations']
    WordData.where(locale: locales, word: words.map(&:downcase)).each do |word_data|
      data = word_data.data || {}
      types = data['types'] || []
      overrides = {}.merge(data['inflection_overrides'] || {})
      overrides['antonym'] ||= (data['antonyms'] || [])[0]
      overrides.keys.each do |key|
        overrides.delete(key) if overrides[key] == 'N/A' || overrides[key] == 'na' || overrides[key] == 'NA' || overrides[key] == 'n/a'
      end
      overrides['regulars'] ||= []
      pos = nil
      types.each{|t| pos ||= t if known_types.include?(t) }
      pos = types[0]
      locations = {}
      known_locations = {}
      set_location = lambda{|loc, key|
        if !overrides[key].blank? && !locations[loc] && !known_locations[loc]
          locations[loc] = overrides[key] if !(overrides['regulars'] || []).include?(key)
          known_locations[loc] = overrides[key]
        end
      }
      if infl_rules && infl_rules.length > 0
        if infl_rules[pos]
          checks = infl_rules[pos].map{|r| r['required']}.compact
          if (overrides.keys & checks).length == checks.length
            location_rules = infl_rules[pos].select{|r| r['location'] }
            location_rules.each do |rule|
              if rule['type']
                if types.include?(rule['type'])
                  set_location.call(rule['location'], rule['inflection'])
                end
              elsif rule['if_empty']
                locations[rule['location']] = overrides[rule['inflection']] if locations.keys.length == 0
              elsif rule['override_if_same']
                if locations[rule['location']] == locations[rule['override_if_same']] && overrides[rule['inflection']]
                  locations[rule['location']] = nil
                  known_locations[rule['location']] = nil
                  set_location.call(rule['location'], rule['inflection'])
                end
              else
                set_location.call(rule['location'], rule['inflection'])
              end
            end
          end
        end
      elsif locale.match(/^en/i)
        #// N - more/plural
        #// S - for me/possessive
        #// NW - negation
        #// W - in the past
        #// E - in the future
        #// SW - opposite
        # If not the primary type, check for the secondmost-primary type.
        # Fill in with fallback types if the word has multiple types
        if pos == 'adjective' && overrides['superlative']
#          locations['n'] = overrides['plural'] if !overrides['plural'].blank? && !overrides['regulars'].include?('plural')
          set_location.call('ne', 'comparative')
          set_location.call('e', 'superlative')
          set_location.call('w', 'negative_comparative')
          set_location.call('nw', 'negation')
          set_location.call('c', 'base')
          locations['c'] = overrides['base'] if locations.keys.length == 0
          # if also a noun... (225: dead, American, hollow, perfect, private, upset, fat)
          if types.include?('noun')
            set_location.call('n', 'plural')
            set_location.call('s', 'possessive')
          end
          # if also a verb... (102: fancy, loose, smooth, long, yellow)
          if types.include?('verb')
            set_location.call('nw', 'simple_past')
            set_location.call('w', 'past')
            set_location.call('s', 'present_participle')
            set_location.call('sw', 'past_participle')
            set_location.call('ne', 'plural_present')
            set_location.call('n', 'simple_present')
            set_location.call('e', 'infinitive')
          end
          # if also an adverb... (88: bright, low, loud, long)
          if types.include?('adverb')
            # adverbs and adjectives are basically the same
          end
        elsif pos == 'noun' && overrides['plural']
          set_location.call('n', 'plural')
          set_location.call('c', 'base')
          set_location.call('s', 'possessive')
          locations['c'] = overrides['base'] if locations.keys.length == 0
          # if also a verb... (740: thumb, age, date, hiccup, rock)
          if types.include?('verb')
            set_location.call('nw', 'simple_past')
            set_location.call('w', 'past')
            set_location.call('s', 'present_participle')
            set_location.call('sw', 'past_participle')
            set_location.call('ne', 'plural_present')
            set_location.call('n', 'simple_present')
            set_location.call('e', 'infinitive')              
          end
          # if also an adjective... (138: alien, foul, light)
          if types.include?('adjective')
            set_location.call('ne', 'comparative')
            set_location.call('e', 'superlative')
            set_location.call('w', 'negative_comparative')
          end
          # if also an adverb... (29: grave, light, top)
          if types.include?('adverb')
            set_location.call('ne', 'comparative')
            set_location.call('e', 'superlative')
            set_location.call('w', 'negative_comparative')
          end
          set_location.call('nw', 'negation')
        elsif pos == 'verb' && overrides['infinitive']
          # missing: "am" doesn't offer "be" in its inflection list currently
          # non-progressive verbs are not flagged here for use in 
          # expanding (i.e. "jump" => "am jumping", "will be jumping", etc.)
          set_location.call('w', 'past')
          set_location.call('s', 'present_participle')
          set_location.call('sw', 'past_participle')
          set_location.call('n', 'simple_present')
          set_location.call('e', 'infinitive')
          set_location.call('c', 'present')
          set_location.call('c', 'base')
          locations['c'] = (overrides['present'] || overrides['base']) if locations.keys.length == 0
          if locations['n'] == locations['c']
            if overrides['personal_present']
              locations['n'] = nil
              known_locations['n'] = nil
              set_location.call('n', 'personal_present')
            end
          end
          if locations['c'] == 'am' && overrides['base'] != 'am' && locations['e'] == 'to be'
            locations['e'] = 'am'
          end         
          # if also a noun... (340: work, bark, invite, kill, shop, worry)
          if types.include?('noun')
            set_location.call('n', 'plural')
            set_location.call('s', 'possessive')
          end
          # if also an adjective... (37: fell, mute, shut)
          if types.include?('adjective')
            set_location.call('ne', 'comparative')
            set_location.call('e', 'superlative')
            set_location.call('w', 'negative_comparative')
          end
          set_location.call('nw', 'simple_past')
          set_location.call('ne', 'plural_present')
        elsif pos == 'adverb' && overrides['superlative']
          set_location.call('ne', 'comparative')
          set_location.call('e', 'superlative')
          set_location.call('w', 'negative_comparative')
          set_location.call('nw', 'negation')
          set_location.call('c', 'base')
          locations['c'] = overrides['base'] if locations.keys.length == 0
          # if also an adjective... (30: alone, rough, down, sorry)
          if types.include?('adjective')
            # adverbs and adjectives are basically the same
          end
          # if also a verb... (6: forward, down, well)
          if types.include?('verb')
            set_location.call('nw', 'simple_past')
            set_location.call('w', 'past')
            set_location.call('s', 'present_participle')
            set_location.call('sw', 'past_participle')
            set_location.call('ne', 'plural_present')
            set_location.call('n', 'simple_present')
            set_location.call('e', 'infinitive')              
          end
        elsif pos == 'pronoun' && overrides['objective']
          set_location.call('c', 'subjective')
          set_location.call('c', 'base')
          set_location.call('s', 'possessive')
          set_location.call('n', 'objective')
          set_location.call('w', 'possessive_adjective')
          set_location.call('e', 'reflexive')
          locations['c'] = overrides['base'] if locations.keys.length == 0
        end
      end
      # If there are explicitly-set overrides and they don't match the expected inflection,
      # make sure they get included.
      ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE', 'C'].each do |extra|
        locations[extra.downcase] = overrides[extra] if !overrides[extra].blank? && known_locations[extra.downcase] != overrides[extra]
      end
      if locations.keys.length > 0
        locations.keys.each{|k| locations.delete(k) if locations[k] == nil }
        locations['v'] = WordData::INFLECTIONS_VERSION
        locations['src'] = word_data.word
        locations['c'] ||= word_data.word
        if !locations['c'].blank? && !overrides['base'].blank? && locations['c'] != overrides['base']
          locations['base'] = overrides['base']
        end
        if locations['se'] && locale.match(/^en/i)
          locations['no'] = 1
        elsif word_data.data['antonyms'] && word_data.data['antonyms'][0] && locale.match(/^en/i)
          locations['se'] ||= word_data.data['antonyms'][0]
        end
      end
      locations['types'] = types
      words.select{|w| w.downcase == word_data.word}.each do |match|
        hash[match] = locations
      end
    end
    hash
  end

  def self.core_for?(word, user)
    self.core_list_for(user).map(&:downcase).include?(word.downcase.sub(/[^\w]+$/, ''))
  end
  
  def self.core_and_fringe_for(user, allow_slow=false)
    res = {}
    res[:for_user] = WordData.core_list_for(user)
    button_sets = BoardDownstreamButtonSet.for_user(user, allow_slow, false)
    cache_key = "reachable_phrases_and_words/#{user.cache_key}/#{button_sets.map(&:cache_key).join('/')}"
    hashes = user.get_cached(cache_key)
    if !hashes
      hashes = {}
      # These lists don't contain any user-specific information and so can be safely
      # cached in Redis
      button_sets.each{|bs| bs.assert_extra_data }
      hashes['reachable_for_user'] = WordData.reachable_core_list_for(user, button_sets)
      hashes['reachable_fringe_for_user'] = WordData.fringe_list_for(user, button_sets)
      hashes['reachable_requested_phrases'] = WordData.reachable_requested_phrases_for(user, button_sets)
      user.set_cached(cache_key, hashes, 48.hours.to_i)
    end
    hashes['requested_phrases_for_user'] = []
    phrases = (user.settings && user.settings['preferences'] && user.settings['preferences']['requested_phrases']) || []
    phrases.each do |str|
      word = {text: str}
      if hashes['reachable_requested_phrases'].include?(str.downcase.sub(/[^\w]+$/, ''))
        word[:used] = true
      end
      hashes['requested_phrases_for_user'] << word
    end
    
    hashes.each{|k, v| res[k.to_sym] = v }
    res
  end
  
  def self.core_list_for(user)
    template = user && UserIntegration.find_by(:template => true, :integration_key => 'core_word_list')
    ui = template && UserIntegration.find_by(:template_integration => template, :user => user)
    if ui
      ui.settings['core_word_list']['words']
    else
      self.default_core_list
    end
  end
  
  def self.basic_core_list_for(user)
    self.basic_core_list[0, 25]
  end
  
  def self.reachable_requested_phrases_for(user, button_sets)
    phrases = (user.settings && user.settings['preferences'] && user.settings['preferences']['requested_phrases']) || []
    button_sets ||= BoardDownstreamButtonSet.for_user(user)
    res = []
    words = {}
    button_sets.each do |bs|
      bs.buttons.each do |b| 
        if b['hidden']
          nil
        elsif b['linked_board_id'] && !b['link_disabled']
          nil
        else
          if b['label'] || b['vocalization']
            words[(b['label'] || b['vocalization']).downcase.sub(/[^\w]+$/, '')] = true
          end
        end
      end
    end
    phrases.each do |str|
      if words[str.downcase.sub(/[^\w]+$/, '')]
        res << str
      end
    end
    res
  end
  
  def self.fringe_list_for(user, button_sets=nil)
    list = self.fringe_lists[0]
    button_sets ||= BoardDownstreamButtonSet.for_user(user)
    res = []
    words = {}
    button_sets.each do |bs| 
      bs.buttons.each do |b| 
        if b['hidden']
          nil
        elsif b['linked_board_id'] && !b['link_disabled']
          nil
        else
          if b['label'] || b['vocalization']
            words[(b['label'] || b['vocalization']).downcase.sub(/[^\w]+$/, '')] = true
          end
        end
      end
    end
    list['categories'].each do |category|
      category['words'].each do |word|
        if words[word.downcase.sub(/[^\w]+$/, '')]
          res << word
        end
      end
    end
    res.uniq
  end
  
  def self.reachable_core_list_for(user, button_sets=nil)
    list = self.core_list_for(user)
    button_sets ||= BoardDownstreamButtonSet.for_user(user)
    reachable_hash = {}
    button_sets.each{|bs| 
      (bs.buttons || []).each{|b| 
        if b['hidden']
          nil
        elsif b['linked_board_id'] && !b['link_disabled']
          nil
        else
          word = b['label'] || b['vocalization']
          reachable_hash[word.downcase.sub(/[^\w]+$/, '') ] = true if word
        end
      }
    }
    reachable_hash.to_a.map(&:first).map{|w| w.downcase.sub(/[^\w]+$/, '') }
    res = []
    list.each do |word|
      res << word if reachable_hash[word.downcase.sub(/[^\w]+$/, '')]
    end
    res
  end

  def self.clear_lists
    @@default_core_list = nil
    @@basic_core_list = nil
    @@core_lists = nil
    @@fringe_lists = nil
  end
  
  def self.default_core_list
    @@default_core_list ||= nil
    return @@default_core_list if @@default_core_list
    lists = self.core_lists || []
    if lists
      @@default_core_list = lists[0]['words']
    end
    @@default_core_list ||= []
    @@default_core_list
  end

  def self.basic_core_list
    @@basic_core_list ||= nil
    return @@basic_core_list if @@basic_core_list
    lists = self.core_lists || []
    if lists
      @@basic_core_list = (lists.detect{|l| l['id'] == 'basic_core'} || {})['words']
    end
    @@basic_core_list ||= []
    @@basic_core_list
  end
  
  # see also, http://praacticalaac.org/praactical/aac-vocabulary-lists/
  def self.core_lists
    @@core_lists ||= nil
    return @@core_lists if @@core_lists
    json = JSON.parse(File.read('./lib/core_lists.json')) rescue nil
    if json
      @@core_lists = json
    end
    @@core_lists ||= []
    @@core_lists
  end
  
  def self.fringe_lists
    @@fringe_lists ||= nil
    return @@fringe_lists if @@fringe_lists
    json = JSON.parse(File.read('./lib/fringe_suggestions.json')) rescue nil
    if json
      @@fringe_lists = json
    end
    @@fringe_lists ||= []
    @@fringe_lists
  end

  def self.focus_word_lists
    @@focus_lists
  end
  
  def self.import_suggestions
    suggestions = JSON.parse(File.read('./lib/core_suggestions.json')) rescue nil
    return false unless suggestions
    suggestions.each do |word, list|
      list.each do |idx, sentence|
        puts "#{word}: #{sentence}"
        WordData.add_suggestion(word, sentence)
      end
    end
    true
  end
  
  def self.standardized_words
    @@standardized_words ||= nil
    return @@standardized_words if @@standardized_words
    hash = {}
    (self.core_lists || []).each do |list|
      (list['words'] || []).each do |word|
        hash[word] = true
      end
    end
    @@standardized_words = hash
    @@standardized_words
  end
  
  def self.message_bank_suggestions
    @@message_bank_suggestions ||= nil
    return @@message_bank_suggestions if @@message_bank_suggestions
    json = JSON.parse(File.read('./lib/message_bank_suggestions.json')) rescue nil
    if json
      @@message_bank_suggestions = json
    end
    @@message_bank_suggestions ||= []
    @@message_bank_suggestions
  end

  def self.revert_board_inflections(board)
    buttons = board.buttons
    buttons.each do |btn|
      if !btn['suggested_part_of_speech'] && !btn['painted_part_of_speech'] && btn['part_of_speech']
        btn['suggested_part_of_speech'] = btn['part_of_speech']
      end
    end
    board.settings['buttons'] = buttons 
    board.check_for_parts_of_speech_and_inflections(true)
  end
end
