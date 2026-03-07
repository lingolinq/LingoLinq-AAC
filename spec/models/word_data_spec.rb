require 'spec_helper'

RSpec.describe WordData, :type => :model do
  describe "find_word" do
    it "should find matching words" do
      WordData.create(:word => "troixlet", :locale => 'en', :data => {'a' => 'b'})
      WordData.create(:word => "runshkable", :locale => 'es', :data => {'b' => 'c'})
      expect(WordData.find_word('troixlet')).to eq({'a' => 'b'})
      expect(WordData.find_word('runshkable')).to eq(nil)
      expect(WordData.find_word('chuckxflem')).to eq(nil)
      expect(WordData.find_word('Troixlet')).to eq({'a' => 'b'})
      expect(WordData.find_word('Troixlet!!')).to eq({'a' => 'b'})
      expect(WordData.find_word('troixlet', 'es')).to eq(nil)
      expect(WordData.find_word('runshkable', 'es')).to eq({'b' => 'c'})
      expect(WordData.find_word('runshkABLE__', 'es')).to eq({'b' => 'c'})
      expect(WordData.find_word('runshkABLE ', 'es')).to eq(nil)
    end
  end
  
  describe "core_for" do
    it "should recognize core words for no user" do
      expect(WordData.core_for?("has", nil)).to eq(true)
      expect(WordData.core_for?("What", nil)).to eq(true)
      expect(WordData.core_for?("when?", nil)).to eq(true)
      expect(WordData.core_for?("that", nil)).to eq(true)
      expect(WordData.core_for?("always", nil)).to eq(true)
      expect(WordData.core_for?("bacon", nil)).to eq(false)
      expect(WordData.core_for?("asdf", nil)).to eq(false)
      expect(WordData.core_for?("awiulghuawihguwa", nil)).to eq(false)
      expect(WordData.core_for?("trinket", nil)).to eq(false)
    end
  end
  
  describe "generate_defaults" do
    it "should have generate defaults" do
      w = WordData.new
      w.generate_defaults
      expect(w.data).to eq({})
    end
  end
  
  describe "find_word_record" do
    it "should find the correct word" do
      a = WordData.create(:word => "troixlet", :locale => 'en', :data => {'a' => 'b'})
      b = WordData.create(:word => "runshkable", :locale => 'es', :data => {'b' => 'c'})
      expect(WordData.find_word_record('troixlet')).to eq(a)
      expect(WordData.find_word_record('runshkable')).to eq(nil)
      expect(WordData.find_word_record('chuckxflem')).to eq(nil)
      expect(WordData.find_word_record('Troixlet')).to eq(a)
      expect(WordData.find_word_record('Troixlet!!')).to eq(a)
      expect(WordData.find_word_record('troixlet', 'es')).to eq(nil)
      expect(WordData.find_word_record('runshkable', 'es')).to eq(b)
      expect(WordData.find_word_record('runshkABLE__', 'es')).to eq(b)
      expect(WordData.find_word_record('runshkABLE__', 'es-US')).to eq(b)
      expect(WordData.find_word_record('runshkABLE ', 'es')).to eq(nil)
    end
  end

  describe "translate" do
    it "should translate individual words" do
      expect(WordData).to receive(:query_translations).with([{:text => 'hat', :type => nil}], 'en', 'es').and_return([{:text => 'hat', :type => nil, :translation => 'cap'}])
      expect(WordData.translate('hat', 'en', 'es')).to eq('cap')
    end
    
    it "should persist found translations" do
      expect(WordData).to receive(:query_translations).with([{:text => 'hat', :type => nil}], 'en', 'es').and_return([{:text => 'hat', :type => nil, :translation => 'cap'}])
      expect(WordData.translate('hat', 'en', 'es')).to eq('cap')
      Worker.process_queues
      w = WordData.last
      expect(w.locale).to eq('es')
      expect(w.data).to include('word' => 'cap', 'translations' => {'en' => 'hat'})
      w2 = WordData.where(:word => 'hat', :locale => 'en').first
      expect(w2).to_not eq(nil)
      expect(w2.data).to include('word' => 'hat', 'translations' => {'es' => 'cap'})
    end
  end
  
  describe "query_translations" do
    it "should return an empty list of no search available" do
      ENV['GOOGLE_TRANSLATE_TOKEN'] = nil
      expect(Typhoeus).to_not receive(:get)
      res = WordData.query_translations([{text: 'hat'}], 'en', 'es')
      expect(res).to eq([])
    end
    
    it "should query translations" do
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'secrety'
      response = OpenStruct.new(body: {
        data: {
          translations: [
            {translatedText: 'top'},
            {translatedText: 'meow'}
          ]
        }
      }.to_json)
      expect(Typhoeus).to receive(:get).with('https://translation.googleapis.com/language/translate/v2?key=secrety&target=es&source=en&format=text&q=hat&q=cat', {timeout: 3}).and_return(response)
      res = WordData.query_translations([{text: 'hat'}, {text: 'cat'}], 'en', 'es')
      expect(res).to eq([
        {text: 'hat', translation: 'top'},
        {text: 'cat', translation: 'meow'}
      ])
    end
    
    it "should only return results that have a translation" do
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'secrety'
      response = OpenStruct.new(body: {
        data: {
          translations: [
            {translatedText: 'top'},
            {translatedText: 'cat'}
          ]
        }
      }.to_json)
      expect(Typhoeus).to receive(:get).with('https://translation.googleapis.com/language/translate/v2?key=secrety&target=es&source=en&format=text&q=hat&q=cat', {timeout: 3}).and_return(response)
      res = WordData.query_translations([{text: 'hat'}, {text: 'cat'}], 'en', 'es')
      expect(res).to eq([
        {text: 'hat', translation: 'top'}
      ])
    end
    
    it "should correct locale settings" do
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'secrety'
      response = OpenStruct.new(body: {
        data: {
          translations: [
            {translatedText: 'top'},
            {translatedText: 'cat'}
          ]
        }
      }.to_json)
      expect(Typhoeus).to receive(:get).with('https://translation.googleapis.com/language/translate/v2?key=secrety&target=zh-CN&source=en&format=text&q=hat&q=cat', {timeout: 3}).and_return(response)
      res = WordData.query_translations([{text: 'hat'}, {text: 'cat'}], 'en_US', 'zh')
      expect(res).to eq([
        {text: 'hat', translation: 'top'}
      ])
    end
  end
  
  describe "translate_batch" do
    it "should translate a batch of words as well as possible" do
      a = WordData.create(:word => "troixlet", :locale => 'en', :data => {'a' => 'b', 'translations' => {'es' => 'trunket'}})
      b = WordData.create(:word => "runshkable", :locale => 'en', :data => {'a' => 'b', 'translations' => {'es-US' => 'rushef'}})
      expect(WordData).to receive(:query_translations).with([{:text => 'forshdeg'}, {:text => 'wilmerding'}], 'en', 'es-US').and_return([{:text => 'forshdeg', :type => nil, :translation => 'milnar'}])
      res = WordData.translate_batch([
        {:text => 'troixlet'},
        {:text => 'runshkable'},
        {:text => 'forshdeg'},
        {:text => 'wilmerding'}
      ], 'en', 'es-US')
      expect(res[:source]).to eq('en')
      expect(res[:dest]).to eq('es-US')
      expect(res[:translations]).to eq({
        'troixlet' => 'trunket',
        'runshkable' => 'rushef',
        'forshdeg' => 'milnar'
      })
    end
  end

  describe "persist_translation" do
    it "should persist translations correctly" do
      b = WordData.create(:word => "runshkable", :locale => 'en', :data => {'a' => 'b', 'types' => ['something']})
      w = WordData.create(:word => 'railymop', :locale => 'es', :data => {'types' => ['verb']})
      WordData.persist_translation('runshkable', 'railymop', 'en', 'es-US', 'noun')
      expect(WordData.find_word_record('runshkable', 'en')).to eq(b)
      b.reload
      expect(b.data['translations']).to eq({'es' => 'railymop', 'es-US' => 'railymop'})
      w1 = WordData.find_word_record('railymop', 'es')
      expect(w1).to eq(w)
      expect(w1).to_not eq(nil)
      expect(w1.data['translations']).to eq({'en' => 'runshkable'})
      expect(w1.data['types']).to eq(['verb', 'noun', 'something'])
    end

    it "should use the original word type if needed as fallback" do
      b = WordData.create(:word => "runshkable", :locale => 'en', :data => {'a' => 'b', 'types' => ['something']})
      WordData.persist_translation('runshkable', 'railymop', 'en', 'es-US', nil)
      expect(WordData.find_word_record('runshkable', 'en')).to eq(b)
      b.reload
      expect(b.data['translations']).to eq({'es' => 'railymop', 'es-US' => 'railymop'})
      
      w1 = WordData.find_word_record('railymop', 'es-US')
      expect(w1).to_not eq(nil)
      expect(w1.data['translations']).to eq({'en' => 'runshkable'})
      expect(w1.data['types']).to eq(['something'])
    end
  end
  
  describe "core_list_for" do
    it "should return the default core list" do
      expect(WordData).to receive(:default_core_list).and_return('list!');
      expect(WordData.core_list_for(nil)).to eq('list!')
    end
    
    it "should return a user's personalized list" do
      t = UserIntegration.create(:template => true, :integration_key => 'core_word_list')
      u = User.create
      ui = UserIntegration.create(:user => u, :template_integration_id => t.id)
      ui.settings['core_word_list'] = {'id' => 'bacon', 'words' => ['a', 'b', 'c', 'd']}
      ui.save
      expect(WordData.core_list_for(u)).to eq(['a', 'b', 'c', 'd'])
    end
  end
  
  describe "reachable_core_list_for" do
    it "should return a list of words" do
      u = User.create
      b = Board.create(:user => u)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'you'},
          {'id' => 2, 'label' => 'he'},
          {'id' => 3, 'label' => 'I'},
          {'id' => 4, 'label' => 'like'},
          {'id' => 5, 'label' => 'snooze'},
          {'id' => 6, 'label' => 'pretend'},
          {'id' => 7, 'label' => 'wonder'},
          {'id' => 8, 'label' => 'think'},
          {'id' => 9, 'label' => 'favorite'},
        ]
      })
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      BoardDownstreamButtonSet.last_scheduled_stamp = nil
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      bs = BoardDownstreamButtonSet.update_for(b.global_id, true)
      expect(bs).to_not eq(nil)
      expect(bs.data['buttons']).to_not eq(nil)
      expect(WordData.reachable_core_list_for(u)).to eq(["i", "you", "like", "he", "think", "pretend"])
    end
    
    it "should return words available from the root board" do
      u = User.create
      b = Board.create(:user => u)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'you'},
          {'id' => 2, 'label' => 'he'},
          {'id' => 3, 'label' => 'I'},
          {'id' => 4, 'label' => 'like'},
          {'id' => 5, 'label' => 'snooze'},
          {'id' => 6, 'label' => 'pretend'},
          {'id' => 7, 'label' => 'wonder'},
          {'id' => 8, 'label' => 'think'},
          {'id' => 9, 'label' => 'favorite'},
        ]
      })
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      BoardDownstreamButtonSet.last_scheduled_stamp = nil
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      WordData.clear_lists
      expect(WordData.reachable_core_list_for(u)).to eq(["i", "you", "like", "he", "think", "pretend"])
    end
    
    it "should return words available from the sidebar" do
      u = User.create
      b = Board.create(:user => u)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'yes'},
          {'id' => 2, 'label' => 'no'},
          {'id' => 3, 'label' => 'I'},
          {'id' => 4, 'label' => 'like'},
          {'id' => 5, 'label' => 'snooze'},
          {'id' => 6, 'label' => 'pretend'},
          {'id' => 7, 'label' => 'wonder'},
          {'id' => 8, 'label' => 'think'},
          {'id' => 9, 'label' => 'favorite'},
        ]
      })
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      BoardDownstreamButtonSet.last_scheduled_stamp = nil
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      WordData.clear_lists
      expect(WordData.reachable_core_list_for(u)).to eq(["i", "like", "no", "yes", "think", "pretend"])
    end
    
    it "should not return words that aren't accessible, even if they're core words" do
      u = User.create
      b = Board.create(:user => u)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'you'},
          {'id' => 2, 'label' => 'bacon'},
          {'id' => 3, 'label' => 'radish'},
          {'id' => 4, 'label' => 'like'},
          {'id' => 5, 'label' => 'snooze'},
          {'id' => 6, 'label' => 'watercolor'},
          {'id' => 7, 'label' => 'wonder'},
          {'id' => 8, 'label' => 'splendid'},
          {'id' => 9, 'label' => 'favorite'},
        ]
      })
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      BoardDownstreamButtonSet.last_scheduled_stamp = nil
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      WordData.clear_lists
      expect(WordData.reachable_core_list_for(u)).to eq(["you", "like"])
    end
  end
  
  describe "add_suggestion" do
    it "should return false on missing word" do
      expect(WordData.add_suggestion('awgoawtiawt', 'this is a good one', 'bleh')).to eq(false)
    end
    
    it "should add the sentence" do
      WordData.create(:word => 'hat', :locale => 'en', :data => {'word' => 'hat'})
      res = WordData.add_suggestion('hat', 'I like my hat', 'en')
      expect(res).to eq(true)
      word = WordData.find_word('hat')
      expect(word['sentences']).to eq([{'sentence' => 'I like my hat', 'approved' => true}])
    end
  end
  
  describe "core_and_fringe_for" do
    it "should include core and fringe lists" do
      u = User.create
      u.settings['preferences']['requested_phrases'] = ['d', 'xxxxx']
      expect(WordData).to receive(:core_list_for).with(u).and_return(['a'])
      expect(WordData).to receive(:reachable_core_list_for).with(u, []).and_return(['b'])
      expect(WordData).to receive(:fringe_list_for).with(u, []).and_return(['c'])
      expect(WordData).to receive(:reachable_requested_phrases_for).with(u, []).and_return(['d'])
      expect(WordData.core_and_fringe_for(u)).to eq({
        :for_user => ['a'],
        :reachable_for_user => ['b'],
        :reachable_fringe_for_user => ['c'],
        :requested_phrases_for_user => [{:text=>"d", :used=>true}, {:text=>"xxxxx"}],
        :reachable_requested_phrases => ['d']
      })
    end
  end

  describe "requested_phrases_for" do
    it "should return a list with used buttons marked" do
      bs = BoardDownstreamButtonSet.new(:data => {
        'buttons' => [
          {'label' => 'hipster'},
          {'label' => 'hippie'},
          {'label' => 'hippo', 'hidden' => true},
          {'label' => 'hipchat', 'linked_board_id' => 'asdf', 'link_disabled' => true},
          {'label' => 'hipmonk', 'linked_board_id' => 'asdf'}
        ]
      })
      u = User.new(:settings => {
        'preferences' => {
          'requested_phrases' => [
            'hippie', 'hippo', 'hipchat', 'hipmonk'
          ]
        }
      })
      expect(WordData.reachable_requested_phrases_for(u, [bs])).to eq(["hippie", "hipchat"])
    end
  end
  
  describe "fringe_lists" do
    it "should return a list of lists" do
      expect(WordData.fringe_lists[0]['id']).to eq('common_fringe')
    end
  end
 
  describe "fringe_list_for" do
    it "should return only accessible fringe words" do
      u = User.create
      b1 = Board.create(:user => u)
      b1.settings['buttons'] = [{'id' => 1, 'label' => 'pizza'}]
      b1.save
      b2 = Board.create(:user => u)
      b2.settings['buttons'] = [{'id' => 2, 'label' => 'flower'}, {'id' => 3, 'label' => 'rose'}, {'id' => 4, 'label' => 'where'}]
      b2.save
      
      u.settings['preferences']['home_board'] = {'id' => b1.global_id, 'key' => b1.key}
      u.settings['preferences']['sidebar_boards'] = [{'key' => b2.key}]
      u.save
      BoardDownstreamButtonSet.update_for(b1.global_id)
      BoardDownstreamButtonSet.update_for(b2.global_id)
      expect(u.sidebar_boards).to eq([{'key' => b2.key}])
      expect(BoardDownstreamButtonSet.for_user(u).map(&:board_id).sort).to eq([b1.id, b2.id].sort)
      expect(WordData.fringe_list_for(u)).to eq([
        "pizza", "flower", "rose"
      ])
    end
  end
  
  describe "message_bank_suggestions" do
    it "should return a list" do
      expect(WordData.message_bank_suggestions.length).to be > 0
      expect(WordData.message_bank_suggestions[0]['id']).to eq('boston_childrens')
    end
  end
  
  describe "standardized_words" do
    it 'should return a hash of words' do
      expect(WordData.standardized_words['this']).to eq(true)
      expect(WordData.standardized_words['golem']).to eq(nil)
    end
  end
  
  describe "basic_core_list_for" do
    it 'should return a list' do
      res = WordData.basic_core_list_for(nil)
      expect(res.length).to be > 10
    end
  end
  
  describe "activities_for" do
    it 'should return nothing for non-premium users' do
      u = User.create
      User.where(id: u.id).update_all(created_at: 6.months.ago, expires_at: 4.months.ago)
      u.reload
      expect(u.full_premium?).to eq(false)
      expect(u.any_premium_or_grace_period?).to eq(false)
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      res = WordData.activities_for(u)
      expect(res).to eq({
        'checked' => Time.now.iso8601,
        'list' => [],
        'log' => [],
        'words' => []
      })
    end

    it 'should retrieve activities for a free trial user' do
      u = User.create
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      res = WordData.activities_for(u)
      expect(res.instance_variable_get('@fresh')).to eq(true)
      expect(res.except('generated', 'checked')).to eq({
        'list' => [
          {"id"=>"1", "score"=>5, "user_ids"=>[u.global_id]}, 
          {"id"=>"2", "score"=>3, "user_ids"=>[u.global_id]}, 
          {"id"=>"3", "score"=>1, "user_ids"=>[u.global_id]}
        ],
        'log' => [],
        'words' => [
          {"word"=>"good", "locale"=>"en", "user_ids"=>[u.global_id]}, 
          {"word"=>"bad", "locale"=>"en", "user_ids"=>[u.global_id]}
        ]
      })
      expect(res['generated']).to be > (Time.now - 10.seconds).iso8601
      expect(res['checked']).to be > (Time.now - 10.seconds).iso8601
    end

    it 'should retrieve activities for the user' do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      res = WordData.activities_for(u)
      expect(res.instance_variable_get('@fresh')).to eq(true)
      expect(res.except('checked', 'generated')).to eq({
        'list' => [
          {"id"=>"1", "score"=>5, "user_ids"=>[u.global_id]}, 
          {"id"=>"2", "score"=>3, "user_ids"=>[u.global_id]}, 
          {"id"=>"3", "score"=>1, "user_ids"=>[u.global_id]}
        ],
        'log' => [],
        'words' => [
          {"word"=>"good", "locale"=>"en", "user_ids"=>[u.global_id]}, 
          {"word"=>"bad", "locale"=>"en", "user_ids"=>[u.global_id]}
        ]
      })
      expect(res['checked']).to be > (Time.now - 5).iso8601
      expect(res['checked']).to be < (Time.now + 5).iso8601
      expect(res['generated']).to be > (Time.now - 5).iso8601
      expect(res['generated']).to be < (Time.now + 5).iso8601
    end

    it 'should include supervisees if specified' do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 6},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      u2 = User.create
      u2.settings['subscription'] = {'never_expires' => true}
      u2.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'most', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '4', 'score' => 4},
            {'id' => '5', 'score' => 10}
          ]
        }
      }
      u2.save!
      User.link_supervisor_to_user(u, u2)
      res = WordData.activities_for(u.reload, true)
      expect(res.instance_variable_get('@fresh')).to eq(true)
      expect(res.except('generated')).to eq({
        'checked' => Time.now.iso8601,
        'list' => [
          {"id"=>"1", "score"=>11, "user_ids"=>[u.global_id, u2.global_id]}, 
          {"id"=>"5", "score"=>10, "user_ids"=>[u2.global_id]}, 
          {"id"=>"4", "score"=>4, "user_ids"=>[u2.global_id]}, 
          {"id"=>"2", "score"=>3, "user_ids"=>[u.global_id]}, 
          {"id"=>"3", "score"=>1, "user_ids"=>[u.global_id]}
        ],
        'log' => [],
        'words' => [
          {"word"=>"good", "locale"=>"en", "user_ids"=>[u.global_id, u2.global_id]}, 
          {"word"=>"bad", "locale"=>"en", "user_ids"=>[u.global_id]}, 
          {"word"=>"most", "locale"=>"en", "user_ids"=>[u2.global_id]}
        ]
      })
      expect(res['generated']).to be > (Time.now - 5).iso8601
      expect(res['generated']).to be < (Time.now + 5).iso8601
    end

    it 'should as fresh if all are fresh' do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 6},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      u2 = User.create
      u2.settings['subscription'] = {'never_expires' => true}
      u2.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'most', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '4', 'score' => 4},
            {'id' => '5', 'score' => 10}
          ]
        }
      }
      u2.save!
      User.link_supervisor_to_user(u, u2)
      res = WordData.activities_for(u.reload, true)
      expect(res.instance_variable_get('@fresh')).to eq(true)
      expect(res).to eq({
        'generated' => res['generated'],
        'checked' => res['checked'],
        'list' => [
          {"id"=>"1", "score"=>11, "user_ids"=>[u.global_id, u2.global_id]}, 
          {"id"=>"5", "score"=>10, "user_ids"=>[u2.global_id]}, 
          {"id"=>"4", "score"=>4, "user_ids"=>[u2.global_id]}, 
          {"id"=>"2", "score"=>3, "user_ids"=>[u.global_id]}, 
          {"id"=>"3", "score"=>1, "user_ids"=>[u.global_id]}
        ],
        'log' => [],
        'words' => [
          {"word"=>"good", "locale"=>"en", "user_ids"=>[u.global_id, u2.global_id]}, 
          {"word"=>"bad", "locale"=>"en", "user_ids"=>[u.global_id]}, 
          {"word"=>"most", "locale"=>"en", "user_ids"=>[u2.global_id]}
        ]
      })
      expect(res['generated']).to be > (Time.now - 5).iso8601
      expect(res['checked']).to be > (Time.now - 5).iso8601
    end

    it 'should not mark as fresh if one is more than 2 weeks old' do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 6},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      u2 = User.create
      u2.settings['subscription'] = {'never_expires' => true}
      u2.settings['target_words'] = {
        'generated' => 4.weeks.ago.iso8601,
        'activities' => {
          'generated' => 3.weeks.ago.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'most', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '4', 'score' => 4},
            {'id' => '5', 'score' => 10}
          ]
        }
      }
      u2.save!
      User.link_supervisor_to_user(u, u2)
      res = WordData.activities_for(u.reload, true)
      expect(res.instance_variable_get('@fresh')).to eq(false)
      expect(res.except('generated', 'checked')).to eq({
        'list' => [
          {"id"=>"1", "score"=>11, "user_ids"=>[u.global_id, u2.global_id]}, 
          {"id"=>"5", "score"=>10, "user_ids"=>[u2.global_id]}, 
          {"id"=>"4", "score"=>4, "user_ids"=>[u2.global_id]}, 
          {"id"=>"2", "score"=>3, "user_ids"=>[u.global_id]}, 
          {"id"=>"3", "score"=>1, "user_ids"=>[u.global_id]}
        ],
        'log' => [],
        'words' => [
          {"word"=>"good", "locale"=>"en", "user_ids"=>[u.global_id, u2.global_id]}, 
          {"word"=>"bad", "locale"=>"en", "user_ids"=>[u.global_id]}, 
          {"word"=>"most", "locale"=>"en", "user_ids"=>[u2.global_id]}
        ]
      })
      expect(res['generated']).to be > (3.weeks.ago - 5).iso8601
      expect(res['generated']).to be < (3.weeks.ago + 5).iso8601
      expect(res['checked']).to be > (Time.now - 5).iso8601
      expect(res['checked']).to be < (Time.now + 5).iso8601
    end

    it 'should not mark as fresh if there is a newer generated set' do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      u.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => 1.week.ago,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'bad', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 6},
            {'id' => '2', 'score' => 3},
            {'id' => '3', 'score' => 1}
          ]
        }
      }
      u.save!
      u2 = User.create
      u2.settings['subscription'] = {'never_expires' => true}
      u2.settings['target_words'] = {
        'generated' => Time.now.iso8601,
        'activities' => {
          'generated' => Time.now.iso8601,
          'words' => [
            {'word' => 'good', 'locale' => 'en'},
            {'word' => 'most', 'locale' => 'en'}
          ],
          'list' => [
            {'id' => '1', 'score' => 5},
            {'id' => '4', 'score' => 4},
            {'id' => '5', 'score' => 10}
          ]
        }
      }
      u2.save!
      User.link_supervisor_to_user(u, u2)
      res = WordData.activities_for(u.reload, true)
      expect(res.instance_variable_get('@fresh')).to eq(false)
    end
  end

  describe "update_activities_for" do
    it 'should call for any supervisees' do
      u = User.create
      u2 = User.create
      expect(u).to receive(:supervisees).and_return([u2]).at_least(1).times
      expect(User).to receive(:find_by_global_id).with(u.global_id).and_return(u)
      expect(WordData).to receive(:update_activities_for).with(u2.global_id, false)
      expect(WordData).to receive(:update_activities_for).with(u.global_id, true).and_call_original
      WordData.update_activities_for(u.global_id, true)
    end

    it 'should generate a result' do
      u = User.create
      u.settings['subscription'] = {'never_expires' => true}
      u.settings['target_words'] = {
        'generated' => 3.hours.ago.iso8601,
        'list' => [
          {'word' => 'about', 'locale' => 'en'},
          {'word' => 'flummox', 'locale' => 'en'}
        ]
      }
      u.save!
      expect(WordData).to receive(:core_and_fringe_for).with(u,  true).and_return({
        :reachable_for_user => ['about', 'more', 'want', 'like', 'not'],
        :reachable_fringe_for_user => []
      })
      expect(WordData).to receive(:rand).and_return(1.0).at_least(1).times

      expect(Typhoeus).to receive(:get).with("https://workshop.openaac.org/api/v1/words/about%3Aen", {timeout: 10}).and_return(OpenStruct.new(body: {
        'word' => {
          'word' => 'about',
          'locale' => 'en',
          'learning_projects' => [{'id': 'lp1', 'text' => 'about something'}],
          'activity_ideas' => [{'id': 'ai1', 'description' => 'about it'}],
          'topic_starters' => [{'id' => 'ts1'}],
          'books' => [{'id' => 'b1'}],
          'videos' => [{'id' => 'v1'}],
          'send_homes' => [{'id' => 'sh1'}]
        }
      }.to_json))
      expect(Typhoeus).to receive(:get).with("https://workshop.openaac.org/api/v1/words/want%3Aen", {timeout: 10}).and_return(OpenStruct.new(body: {
        'word' => {
          'word' => 'want',
          'locale' => 'en',
          'learning_projects' => [{'id': 'lp2', 'text' => 'I want to know about it, not'}],
          'activity_ideas' => [{'id': 'ai2', 'description' => 'sometime'}],
          'topic_starters' => [{'id' => 'ts2'}],
          'books' => [{'id' => 'b2'}],
          'videos' => [{'id' => 'v2'}],
          'send_homes' => [{'id' => 'sh2'}]
        }
      }.to_json))
      expect(Typhoeus).to receive(:get).with("https://workshop.openaac.org/api/v1/words/more%3Aen", {timeout: 10}).and_return(OpenStruct.new(body: {
      }.to_json))
      expect(Typhoeus).to receive(:get).with("https://workshop.openaac.org/api/v1/words/like%3Aen", {timeout: 10}).and_return(OpenStruct.new(body: {
      }.to_json))
      res = WordData.update_activities_for(u.global_id, false)
      activities = u.reload.settings['target_words']['activities']
      expect(activities['generated']).to eq(Time.now.iso8601)
      expect(activities['words']).to eq([{"word"=>"about", "locale"=>"en", "reasons"=>nil, 'score' => 0}, {"word"=>"want", "locale"=>"en", "reasons"=>["fallback"], 'score' => 0}])
      expect(activities['list'].sort_by{|h| [h['word'], h['type'], h['id']]}).to eq([
          {"id"=>"ai1", "description"=>"about it", "type"=>"activity_ideas", "word"=>"about", "locale"=>"en", "score"=>6.3}, 
          {"id"=>"lp1", "text"=>"about something", "type"=>"learning_projects", "word"=>"about", "locale"=>"en", "score"=>6.3}, 
          {"id"=>"sh1", "type"=>"send_homes", "word"=>"about", "locale"=>"en", "score"=>6.0}, 
          {"id"=>"ts1", "type"=>"topic_starters", "word"=>"about", "locale"=>"en", "score"=>5.0}, 
          {"id"=>"b1", "type"=>"books", "word"=>"about", "locale"=>"en", "score"=>5.0}, 
          {"id"=>"v1", "type"=>"videos", "word"=>"about", "locale"=>"en", "score"=>5.0}, 
          {"id"=>"lp2", "text"=>"I want to know about it, not", "type"=>"learning_projects", "word"=>"want", "locale"=>"en", "score"=>4.933}, 
          {"id"=>"sh2", "type"=>"send_homes", "word"=>"want", "locale"=>"en", "score"=>4.333}, 
          {"id"=>"ai2", "description"=>"sometime", "type"=>"activity_ideas", "word"=>"want", "locale"=>"en", "score"=>4.333}, 
          {"id"=>"ts2", "type"=>"topic_starters", "word"=>"want", "locale"=>"en", "score"=>3.333}, 
          {"id"=>"b2", "type"=>"books", "word"=>"want", "locale"=>"en", "score"=>3.333},
          {"id"=>"v2", "type"=>"videos", "word"=>"want", "locale"=>"en", "score"=>3.333}, 
        ].sort_by{|h| [h['word'], h['type'], h['id']]})
      expect(res).to eq({
        'checked' => Time.now.iso8601,
        'generated' => Time.now.iso8601,
        'list' => [
          {"id"=>"lp1", "text"=>"about something", "type"=>"learning_projects", "word"=>"about", "locale"=>"en", "score"=>6.3, "user_ids"=>[u.global_id]}, 
          {"id"=>"ai1", "description"=>"about it", "type"=>"activity_ideas", "word"=>"about", "locale"=>"en", "score"=>6.3, "user_ids"=>[u.global_id]}, 
          {"id"=>"sh1", "type"=>"send_homes", "word"=>"about", "locale"=>"en", "score"=>6.0, "user_ids"=>[u.global_id]}, 
          {"id"=>"ts1", "type"=>"topic_starters", "word"=>"about", "locale"=>"en", "score"=>5.0, "user_ids"=>[u.global_id]}, 
          {"id"=>"b1", "type"=>"books", "word"=>"about", "locale"=>"en", "score"=>5.0, "user_ids"=>[u.global_id]}, 
          {"id"=>"v1", "type"=>"videos", "word"=>"about", "locale"=>"en", "score"=>5.0, "user_ids"=>[u.global_id]}, 
          {"id"=>"lp2", "text"=>"I want to know about it, not", "type"=>"learning_projects", "word"=>"want", "locale"=>"en", "score"=>4.933, "user_ids"=>[u.global_id]}, 
          {"id"=>"ai2", "description"=>"sometime", "type"=>"activity_ideas", "word"=>"want", "locale"=>"en", "score"=>4.333, "user_ids"=>[u.global_id]}, 
          {"id"=>"sh2", "type"=>"send_homes", "word"=>"want", "locale"=>"en", "score"=>4.333, "user_ids"=>[u.global_id]}, 
          {"id"=>"ts2", "type"=>"topic_starters", "word"=>"want", "locale"=>"en", "score"=>3.333, "user_ids"=>[u.global_id]}, 
          {"id"=>"b2", "type"=>"books", "word"=>"want", "locale"=>"en", "score"=>3.333, "user_ids"=>[u.global_id]}, 
          {"id"=>"v2", "type"=>"videos", "word"=>"want", "locale"=>"en", "score"=>3.333, "user_ids"=>[u.global_id]}
        ],
        'log' => [],
        'words' => [{"word"=>"about", "locale"=>"en", "reasons"=>nil, "user_ids"=>[u.global_id], 'score' => 0}, {"word"=>"want", "locale"=>"en", "reasons"=>["fallback"], "user_ids"=>[u.global_id], 'score' => 0}]
      })
    end

    it 'should use existing activities_for result if still fresh' do
      u = User.create
      LogSession.create(log_type: 'activities', user_id: u.id)
      res = {'words' => [{}, {}, {}, {}], 'generated' => 4.hours.ago.iso8601}
      res.instance_variable_set('@fresh', true)
      expect(WordData).to receive(:activities_for).with(u, false).and_return(res)
      act = WordData.update_activities_for(u.global_id, false)
      expect(act).to eq(res)
    end

    it 'should update based on the user activity_session data'
  end

  describe "process_params" do
    it "should skip if requested" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.create(word: 'blechy', locale: 'en')
      WordData.where(id: w.id).update_all(updated_at: 6.hours.ago)
      w.reload
      w.process({
        skip: true
      }, {updater: u.reload})
      expect(w.errored?).to eq(false)
    end

    it "should require an admin updater" do
      u = User.create
      w = WordData.create(word: 'blechy', locale: 'en')
      WordData.where(id: w.id).update_all(updated_at: 6.hours.ago)
      w.reload
      w.process({
        skip: true
      }, {updater: u.reload})
      expect(w.errored?).to eq(true)
      expect(w.processing_errors).to eq(['only admins can update currently'])
    end

    it "should recored each reviewer" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      u2 = User.create
      o.add_manager(u2.user_name, true)
      w = WordData.create(word: 'blechy', locale: 'en')
      WordData.where(id: w.id).update_all(updated_at: 6.hours.ago)
      w.reload
      w.process({
        primary_part_of_speech: 'noun'
      }, {updater: u.reload})
      expect(w.data['types']).to eq(['noun'])
      w.process({
        primary_part_of_speech: 'verb'
      }, {updater: u2.reload})
      expect(w.errored?).to eq(false)
      expect(w.data['types']).to eq(['verb', 'noun'])
      expect(w.data['reviewer_ids'].sort).to eq([u.global_id, u2.global_id])
      expect(w.data['reviews'].keys.sort).to eq([u.global_id, u2.global_id])
    end

    it "should record data as specified" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.create(word: 'blechy', locale: 'en')
      WordData.where(id: w.id).update_all(updated_at: 6.hours.ago)
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        parts_of_speech: 'verb, adjective',
        antonyms: 'nicey, awesomey',
        inflection_overrides: {
          bacon: nil,
          plural: 'blechies',
          regulars: ['a', 'b']
        }
      }, {updater: u.reload})
      expect(w.errored?).to eq(false)
      expect(w.data['types']).to eq(['noun', 'verb', 'adjective'])
      expect(w.data['antonyms']).to eq(['nicey', 'awesomey'])
      expect(w.data['inflection_overrides']).to eq({
        'plural' => 'blechies',
        'regulars' => ['a', 'b']
      })
    end
  end

  describe "inflection_locations_for" do
    it "should return an empty hash for no words or locales" do
      expect(WordData).to_not receive(:where)
      expect(WordData.inflection_locations_for([], 'en')).to eq({})
      expect(WordData.inflection_locations_for(['a'], nil)).to eq({})
    end

    it "should not barf on empty string locale" do
      expect(WordData).to_not receive(:where)
      expect(WordData.inflection_locations_for([], '')).to eq({})
      expect(WordData.inflection_locations_for(['a'], '')).to eq({})
    end

    it "should return parts of speech for matching words" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      %w[hat want angrily I he].each do |word|
        w = WordData.find_or_create_by(word: word.downcase, locale: 'en')
        w.data ||= {}
        w.data['types'] ||= case word.downcase
          when 'hat' then ['noun']
          when 'want' then ['verb']
          when 'angrily' then ['adverb']
          when 'i', 'he' then ['noun']
          else ['noun']
        end
        w.save!
      end
      hash = WordData.inflection_locations_for(['hat', 'want', 'angrily', 'I', 'he'], 'en')
      expect(hash['angrily']['types'][0]).to eq('adverb')
      expect(hash['want']['types'][0]).to eq('verb')
      expect(hash['hat']['types'][0]).to eq('noun')
      expect(hash['he']['types'][0]).to eq('noun')
      expect(hash['I']['types'][0]).to eq('noun')
    end

    it "should return default inflection locations for known word types" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'he', locale: 'en')
      w.data ||= {}
      w.save!
      w.process({
        primary_part_of_speech: 'pronoun',
        antonyms: 'she',
        inflection_overrides: {
          base: 'he',
          plural: 'hes',
          subjective: 'he',
          possessive: 'his',
          objective: 'him',
          possessive_adjective: 'his',
          reflexive: 'himself',
          regulars: ['possessive', 'base']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'ugly', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adjective',
        antonyms: 'pretty',
        inflection_overrides: {
          base: 'ugly',
          comparative: 'uglier',
          superlative: 'ugliest',
          negative_comparative: 'less ugly',
          plural: 'uglies',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'mask', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        inflection_overrides: {
          base: 'mask',
          plural: 'masks',
          possessive: "mask's",
          regulars: ['plural']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'run', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'verb',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          infinitive: 'to run',
          present: 'run',
          simple_present: 'runs',
          plural_present: 'run',
          personal_past: 'ran',
          past: 'ran',
          simple_past: '',
          present_participle: 'running',
          past_participle: 'run',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'angrily', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adverb',
        inflection_overrides: {
          base: 'angrily',
          comparative: 'more angrily',
          superlative: 'most angrily',
          negative_comparative: 'N/A',
          regulars: ['comparative']
        }
      }, {updater: u.reload})
      hash = WordData.inflection_locations_for(['he', 'ugly', 'mask', 'run', 'angrily'], 'en-AU')
      expect(hash['he']).to include(
        'c' => 'he',
        'e' => 'himself',
        'n' => 'him',
        'src' => 'he',
        'se' => 'she',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'his'
      )
      expect(hash['he']['types']).to include('pronoun')
      expect(hash['ugly']).to eq({
        "c"=>"ugly", 
        "e"=>"ugliest", 
#        "n"=>"uglies", 
        "ne"=>"uglier", 
        'se' => 'pretty',
        "src"=>"ugly", 
        "types"=>["adjective"], 
        "v"=>WordData::INFLECTIONS_VERSION, 
        "w"=>"less ugly"
      })
      expect(hash['mask']).to include(
        "c"=>"mask", 
        "s"=>"mask's", 
        "src"=>"mask", 
        "v"=>WordData::INFLECTIONS_VERSION
      )
      expect(hash['mask']['types']).to include('noun')
      expect(hash['run']).to include(
        "c"=>"run", 
        "e"=>"to run", 
        "n"=>"runs", 
        "ne"=>"run", 
        "s"=>"running", 
        "se"=>"walk", 
        'sw' => 'run',
        'src' => 'run',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'ran'
      )
      expect(hash['run']['types']).to include('verb')
      expect(hash['angrily']).to eq({
        'c' => 'angrily',
        'e' => 'most angrily',
        'src' => 'angrily',
        'types' => ['adverb'],
        'v' => WordData::INFLECTIONS_VERSION
      })
    end

    it "should use locale-specific settings when available" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'he', locale: 'zz')
      w.process({
        primary_part_of_speech: 'pronoun',
        antonyms: 'xo',
        inflection_overrides: {
          humor: 'heh',
          explicit: 'h***',
          extended: 'hee-hee',
          regulars: ['explicit']
        },
        parts_of_speech: ['pronoun', 'weird']
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'ugly', locale: 'zz')
      w.process({
        primary_part_of_speech: 'adjective',
        antonyms: 'xox',
        inflection_overrides: {
          humor: 'yuck',
          explicit: 'u****',
          extended: 'uuuuugly',
          plural: 'uglies'
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'sad', locale: 'zz')
      w.process({
        primary_part_of_speech: 'adjective',
        antonyms: 'xox',
        inflection_overrides: {
          humor: 'bummed',
          explicit: 's****',
          extended: 'saaaaad',
          plural: 'sads',
          regulars: ['humor', 'plural']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'mask', locale: 'zz')
      w.process({
        primary_part_of_speech: 'noun',
        inflection_overrides: {
          humor: 'veil',
          explicit: 'm****',
          theme: 'halloween',
          regulars: ['humor', 'explicit']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'run', locale: 'zz')
      w.process({
        primary_part_of_speech: 'verb',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          explicit: 'r****',
          theme: 'racing',
        }
      }, {updater: u.reload})
      Setting.set('rules/zz', {
        'rules' => [],
        'inflection_locations' => {
          'pronoun' => [
            {'required' => 'humor'},
            {'location' => 'n', 'inflection' => 'bacon'},
            {'location' => 'e', 'inflection' => 'explicit', 'if_empty' => true},
            {'location' => 'n', 'inflection' => 'humor'},
            {'location' => 's', 'inflection' => 'extended'},
            {'location' => 'nw', 'inflection' => 'antonym', 'type' => 'weird'},
          ],
          'adjective' => [
            {'required' => 'humor'},
            {'location' => 'n', 'inflection' => 'humor'},
            {'location' => 'e', 'inflection' => 'explicit'},
            {'location' => 's', 'inflection' => 'extended'},
            {'location' => 'w', 'inflection' => 'plural'},
            {'location' => 'ne', 'inflection' => 'antonym'},
          ],
          'noun' => [
            {'required' => 'humor'},
            {'required' => 'hangover'},
            {'location' => 'n', 'inflection' => 'humor'},
            {'location' => 'e', 'inflection' => 'explicit'},
            {'location' => 's', 'inflection' => 'theme'},
          ],
          'verb' => [
            {'required' => 'base'},
            {'location' => 'n', 'inflection' => 'base'},
            {'location' => 'e', 'inflection' => 'explicit'},
            {'location' => 's', 'inflection' => 'theme'},
            {'location' => 'c', 'inflection' => 'base'},
            {'location' => 'se', 'inflection' => 'antonym'},
            {'location' => 'n', 'inflection' => 'explicit', 'override_if_same' => 'c'},
          ]
        }
      }, true)
      hash = WordData.inflection_locations_for(['he', 'ugly', 'sad', 'mask', 'run', 'angrily'], 'zz-AU')
      expect(hash['he']).to eq({
        'e' => 'h***',
        'n' => 'heh',
        'src' => 'he',
        'nw' => 'xo',
        'c' => 'he',
        'types' => ['pronoun', 'weird'],
        'v' => WordData::INFLECTIONS_VERSION,
        's' => 'hee-hee'
      })
      expect(hash['ugly']).to eq({
        "c"=>"ugly", 
        "n"=>"yuck", 
        "ne"=>"xox", 
        'e' => 'u****',
        "s"=>"uuuuugly",
        "w"=>"uglies",
        "src"=>"ugly", 
        "types"=>["adjective"], 
        "v"=>WordData::INFLECTIONS_VERSION, 
      })
      expect(hash['sad']).to eq({
        "c"=>"sad", 
        "e"=>"s****", 
        "s"=>"saaaaad", 
        "ne"=>"xox", 
        "src"=>"sad", 
        "types"=>["adjective"], 
        "v"=>WordData::INFLECTIONS_VERSION, 
      })
      expect(hash['flask']).to eq(nil)
      expect(hash['mask']).to eq({
        "types"=>["noun"], 
      })
      expect(hash['run']).to eq({
        "c"=>"run", 
        "e"=>"r****", 
        "n"=>"r****", 
        "se"=>"walk", 
        "s"=>"racing", 
        'src' => 'run',
        'types' => ['verb'],
        'v' => WordData::INFLECTIONS_VERSION,
      })
    end

    it "should not return inflection locations for unrecognized locales" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.create(word: 'he', locale: 'fr')
      w.process({
        primary_part_of_speech: 'pronoun',
        antonyms: 'she',
        inflection_overrides: {
          base: 'he',
          plural: 'hes',
          subjective: 'he',
          possessive: 'his',
          objective: 'him',
          possessive_adjective: 'his',
          reflexive: 'himself',
          regulars: ['possessive', 'base']
        }
      }, {updater: u.reload})
      w = WordData.create(word: 'ugly', locale: 'fr')
      w.process({
        primary_part_of_speech: 'adjective',
        antonyms: 'pretty',
        inflection_overrides: {
          base: 'ugly',
          comparative: 'uglier',
          superlative: 'ugliest',
          negative_comparative: 'less ugly',
          plural: 'uglies',
        }
      }, {updater: u.reload})
      w = WordData.create(word: 'mask', locale: 'fr')
      w.process({
        primary_part_of_speech: 'noun',
        inflection_overrides: {
          base: 'mask',
          plural: 'masks',
          possessive: "mask's",
          regulars: ['plural']
        }
      }, {updater: u.reload})
      w = WordData.create(word: 'run', locale: 'fr')
      w.process({
        primary_part_of_speech: 'verb',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          infinitive: 'to run',
          present: 'run',
          simple_present: 'runs',
          plural_present: 'run',
          personal_past: 'ran',
          past: 'ran',
          simple_past: '',
          present_participle: 'running',
          past_participle: 'run',
        }
      }, {updater: u.reload})
      w = WordData.create(word: 'angrily', locale: 'fr')
      w.process({
        primary_part_of_speech: 'adverb',
        inflection_overrides: {
          base: 'angrily',
          comparative: 'more angrily',
          superlative: 'most angrily',
          negative_comparative: 'N/A',
          regulars: ['comparative']
        }
      }, {updater: u.reload})
      hash = WordData.inflection_locations_for(['he', 'ugly', 'mask', 'run', 'angrily'], 'fr')
      expect(hash).to eq({
        "angrily"=>{"types"=>["adverb"]}, 
        "he"=>{"types"=>["pronoun"]}, 
        "mask"=>{"types"=>["noun"]}, 
        "run"=>{"types"=>["verb"]}, 
        "ugly"=>{"types"=>["adjective"]}
      })
    end

    it "should override with extras settings if defined" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'he', locale: 'en')
      w.data ||= {}
      w.save!
      w.process({
        primary_part_of_speech: 'pronoun',
        antonyms: 'she',
        inflection_overrides: {
          base: 'he',
          plural: 'hes',
          subjective: 'hee',
          possessive: 'his',
          N: 'bacon',
          objective: 'him',
          possessive_adjective: 'his',
          reflexive: 'himself',
          regulars: ['possessive', 'base']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'ugly', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adjective',
        antonyms: 'pretty',
        inflection_overrides: {
          base: 'ugly',
          comparative: 'uglier',
          superlative: 'ugliest',
          NW: 'water',
          NE: 'wet',
          S: 'washing',
          negative_comparative: 'less ugly',
          plural: 'uglies',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'mask', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        inflection_overrides: {
          base: 'mask',
          plural: 'masks',
          SW: 'masking',
          possessive: "mask's",
          regulars: ['plural']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'run', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'verb',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          infinitive: 'to run',
          present: 'run',
          simple_present: 'runs',
          plural_present: 'run',
          S: 'mother',
          SE: 'monkey',
          personal_past: 'ran',
          past: 'ran',
          simple_past: '',
          present_participle: 'running',
          past_participle: 'run',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'angrily', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adverb',
        inflection_overrides: {
          base: 'angrily',
          comparative: 'more angrily',
          superlative: 'most angrily',
          N: 'broccoli',
          S: 'brother',
          negative_comparative: 'N/A',
          regulars: ['comparative']
        }
      }, {updater: u.reload})
      hash = WordData.inflection_locations_for(['he', 'ugly', 'mask', 'run', 'angrily'], 'en-AU')
      expect(hash['he']).to include(
        'c' => 'hee',
        'base' => 'he',
        'e' => 'himself',
        'n' => 'bacon',
        'src' => 'he',
        'se' => 'she',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'his'
      )
      expect(hash['ugly']).to eq({
        "c"=>"ugly", 
        "e"=>"ugliest", 
#        "n"=>"uglies", 
        "ne"=>"wet", 
        "nw"=>"water",
        "s"=>"washing",
        'se' => 'pretty',
        "src"=>"ugly", 
        "types"=>["adjective"], 
        "v"=>WordData::INFLECTIONS_VERSION, 
        "w"=>"less ugly"
      })
      expect(hash['mask']).to include(
        "c"=>"mask", 
        "s"=>"mask's", 
        "sw"=>"masking",
        "src"=>"mask", 
        "v"=>WordData::INFLECTIONS_VERSION
      )
      expect(hash['mask']['types']).to include('noun')
      expect(hash['run']).to include(
        "c"=>"run", 
        "e"=>"to run", 
        "n"=>"runs", 
        "ne"=>"run", 
        'no'=>1,
        "s"=>"mother", 
        "se"=>"monkey", 
        'sw' => 'run',
        'src' => 'run',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'ran'
      )
      expect(hash['run']['types']).to include('verb')
      expect(hash['angrily']).to eq({
        'c' => 'angrily',
        'e' => 'most angrily',
        'n' => 'broccoli',
        's' => 'brother',
        'src' => 'angrily',
        'types' => ['adverb'],
        'v' => WordData::INFLECTIONS_VERSION
      })
    end

    it "should ignore extras settings if same as the expected inflection" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'he', locale: 'en')
      w.data ||= {}
      w.save!
      w.process({
        primary_part_of_speech: 'pronoun',
        antonyms: 'she',
        inflection_overrides: {
          base: 'he',
          plural: 'hes',
          subjective: 'he',
          possessive: 'his',
          N: 'him',
          objective: 'him',
          possessive_adjective: 'his',
          reflexive: 'himself',
          regulars: ['possessive', 'base', 'objective']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'run', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'verb',
        parts_of_speech: 'verb',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          infinitive: 'to run',
          present: 'run',
          simple_present: 'runs',
          plural_present: 'run',
          S: 'running',
          NE: 'run',
          personal_past: 'ran',
          past: 'ran',
          simple_past: '',
          present_participle: 'running',
          past_participle: 'run',
          regulars: ['present_participle', 'plural_present']
        }
      }, {updater: u.reload})
      hash = WordData.inflection_locations_for(['he', 'ugly', 'mask', 'run', 'angrily'], 'en-AU')
      expect(hash['he']).to include(
        'c' => 'he',
        'e' => 'himself',
        'src' => 'he',
        'se' => 'she',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'his'
      )
      expect(hash['he']['types']).to include('pronoun')
      expect(hash['run']).to eq({
        "c"=>"run", 
        "e"=>"to run", 
        "n"=>"runs", 
        "sw"=>"run", 
        "se"=>"walk", 
        'src' => 'run',
        'types' => ['verb'],
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'ran'
      })
    end

    it "should include secondary parts of speech inflections where possible" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'he', locale: 'en')
      w.data ||= {}
      w.save!
      w.process({
        primary_part_of_speech: 'pronoun',
        
        antonyms: 'she',
        inflection_overrides: {
          base: 'he',
          plural: 'hes',
          subjective: 'he',
          possessive: 'his',
          objective: 'him',
          possessive_adjective: 'his',
          reflexive: 'himself',
          regulars: ['possessive', 'base']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'ugly', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adjective',
        parts_of_speech: 'adjective,noun,verb',
        antonyms: 'pretty',
        inflection_overrides: {
          base: 'ugly',
          comparative: 'uglier',
          superlative: 'ugliest',
          negative_comparative: 'less ugly',
          plural: 'uglies',
          possessive: "ugly's",
          simple_past: 'uglied',
          past: 'uglified',
          present_participle: 'uglying',
          past_participle: 'uglificated',
          plural_present: 'uglyo',
          simple_present: 'uglya',
          infinitive: 'to ugly'
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'mask', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        parts_of_speech: 'noun,verb',
        inflection_overrides: {
          base: 'mask',
          plural: 'masks',
          possessive: "mask's",
          simple_past: 'masked',
          past: 'maskeded',
          present_participle: 'masking',
          past_participle: 'maskered',
          plural_present: 'masks',
          simple_present: 'maskss',
          infinitive: 'to mask',
          regulars: ['plural', 'possessive', 'plural_present']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'foul', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        parts_of_speech: 'noun,adjective',
        inflection_overrides: {
          base: 'foul',
          plural: 'fouls',
          possessive: "foul's",
          comparative: "fouler",
          superlative: "foulest",
          negative_comparative: "less foul",
          regulars: ['plural', 'superlative']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'grave', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        parts_of_speech: 'noun,adverb',
        inflection_overrides: {
          base: 'grave',
          plural: 'graves',
          possessive: "grave's",
          comparative: "graver",
          superlative: "gravest",
          negative_comparative: "less grave",
          regulars: ['plural', 'comparative']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'run', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'verb',
        parts_of_speech: 'verb,noun',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          infinitive: 'to run',
          present: 'run',
          plural_present: 'run',
          personal_past: 'ran',
          past: 'ran',
          simple_past: '',
          plural: 'runs',
          possessive: "run's",
          present_participle: 'running',
          past_participle: 'run',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'mute', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'verb',
        parts_of_speech: 'verb,adjective',
        antonyms: 'vocal',
        inflection_overrides: {
          base: 'mute',
          infinitive: 'to mute',
          present: 'mutee',
          simple_present: 'mutes',
          plural_present: 'mute',
          personal_past: 'muted',
          past: 'muted',
          simple_past: '',
          comparative: 'muter',
          superlative: 'mutest',
          negative_comparative: 'less mute',
          present_participle: 'muting',
          past_participle: 'muten',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'down', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adverb',
        parts_of_speech: 'adverb,verb',
        inflection_overrides: {
          base: 'down',
          comparative: 'downer',
          superlative: 'downest',
          negative_comparative: 'N/A',
          infinitive: 'to down',
          present: 'down',
          simple_present: 'downs',
          plural_present: 'down',
          personal_past: 'downed',
          past: 'downed',
          simple_past: '',
          present_participle: 'downing',
          past_participle: 'downelly',
          regulars: ['comparative', 'past', 'personal_past']
        }
      }, {updater: u.reload})
      hash = WordData.inflection_locations_for(['he', 'ugly', 'mask', 'foul', 'grave', 'run', 'mute', 'down'], 'en-AU')
      expect(hash['he']).to include(
        'c' => 'he',
        'e' => 'himself',
        'n' => 'him',
        'src' => 'he',
        'se' => 'she',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'his'
      )
      expect(hash['he']['types']).to include('pronoun')
      expect(hash['ugly']).to eq({
        "c"=>"ugly", 
        "e"=>"ugliest", 
        "n"=>"uglies", 
        "nw"=>"uglied",
        "s"=>"ugly's",
        "sw"=>"uglificated",
        "ne"=>"uglier", 
        'se' => 'pretty',
        "src"=>"ugly", 
        "types"=>["adjective","noun","verb"], 
        "v"=>WordData::INFLECTIONS_VERSION, 
        "w"=>"less ugly"
      })
      expect(hash['mask']).to eq({
        "c"=>"mask",
        "e"=>"to mask",
        "nw"=>"masked",
        "sw"=>"maskered",
        "w"=>"maskeded",
        "src"=>"mask", 
        "types"=>["noun", "verb"], 
        "v"=>WordData::INFLECTIONS_VERSION
      })
      expect(hash['run']).to eq({
        "c"=>"run", 
        "e"=>"to run", 
        "n"=>"runs", 
        "ne"=>"run", 
        "s"=>"running", 
        "se"=>"walk", 
        'sw' => 'run',
        'src' => 'run',
        'types' => ['verb', 'noun'],
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'ran'
      })
      expect(hash['foul']).to eq({
        "c"=>"foul", 
        "ne"=>"fouler", 
        "s"=>"foul's", 
        'src'=>'foul',
        'types' => ['noun', 'adjective'],
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'less foul'
      })
      expect(hash['grave']).to eq({
        "c"=>"grave", 
        "s"=>"grave's", 
        'src'=>'grave',
        'e'=>'gravest',
        'w'=>'less grave',
        'types' => ['noun', 'adverb'],
        'v' => WordData::INFLECTIONS_VERSION,
      })
      expect(hash['mute']).to eq({
        'c' => 'mutee',
        'base' => 'mute',
        'n' => 'mutes',
        'e' => 'to mute',
        'w' => 'muted',
        'ne' => 'muter',
        'sw' => 'muten',
        's' => 'muting',
        'se' => 'vocal',
        'src' => 'mute',
        'types' => ['verb', 'adjective'],
        'v' => WordData::INFLECTIONS_VERSION
      })
      expect(hash['down']).to eq({
        'c' => 'down',
        'e' => 'downest',
        's' => 'downing',
        'n' => 'downs',
        'sw' => 'downelly',
        'src' => 'down',
        'types' => ['adverb', 'verb'],
        'v' => WordData::INFLECTIONS_VERSION
      })
    end
  end
end
