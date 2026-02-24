require 'spec_helper'

describe JsonApi::Log do
  it "should have defined pagination defaults" do
    expect(JsonApi::Log::TYPE_KEY).to eq('log')
    expect(JsonApi::Log::DEFAULT_PAGE).to eq(10)
    expect(JsonApi::Log::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should not include unlisted settings" do
      l = LogSession.new(data: {'hat' => 'black'})
      expect(JsonApi::Log.build_json(l).keys).not_to be_include('hat')
    end

    it "should include appropriate values" do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      ['id', 'started_at', 'ended_at', 'summary'].each do |key|
        expect(JsonApi::Log.build_json(l).keys).to be_include(key)
      end
    end
    
    it "should return fake author information if there is no author" do
      u = User.create
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      json = JsonApi::Log.build_json(l)
      expect(json['author']).not_to eq(nil)
      expect(json['author']['user_name']).to eq('unknown')
      expect(json['author']['id']).to eq(nil)
    end
    
    it "should return real author information if there is an author" do
      u = User.create
      l = LogSession.new(author: u, data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      json = JsonApi::Log.build_json(l)
      expect(json['author']).not_to eq(nil)
      expect(json['author']['user_name']).to eq(u.user_name)
      expect(json['author']['id']).to eq(u.global_id)
    end
        
    it "should include either not or log duration information" do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      l.data['note'] = 'hello'
      expect(JsonApi::Log.build_json(l).keys).to be_include('note')
      expect(JsonApi::Log.build_json(l).keys).not_to be_include('duration')
      
      l.data['note'] = nil
      expect(JsonApi::Log.build_json(l).keys).not_to be_include('note')
      expect(JsonApi::Log.build_json(l).keys).to be_include('duration')
      expect(JsonApi::Log.build_json(l).keys).to be_include('button_count')
      expect(JsonApi::Log.build_json(l).keys).to be_include('utterance_count')
      expect(JsonApi::Log.build_json(l).keys).to be_include('utterance_word_count')
    end
  end
  
  describe "extra_includes" do
    it "should include the events attribute" do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['events']).to eql([])
    end

    it 'should include encryption settings and url if allowed' do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      l.data['events'] = [
        {'id' => 1, 'timestamp' => 12345, 'button' => {'spoken' => true, 'label' => 'hat'}, 'parts_of_speech' => {}},
        {'id' => 2, 'timestamp' => 12346, 'button' => {'label' => 'hat', 'percent_x' => 0.5, 'percent_y' => 0.32, 'board' => {}}, 'parts_of_speech' => {}},
        {'id' => 3, 'timestamp' => 12347, 'action' => {'action' => 'open_board', 'new_id' => {}}},
        {'id' => 4, 'timestamp' => 12348, 'action' => {'action' => 'auto_home'}},
        {'id' => 5, 'timestamp' => 12349, 'utterance' => {'spoken' => true, }},
        {'id' => 6, 'timestamp' => 12350},
        {'id' => 7, 'timestamp' => 12351, 'notes' => [
          {'id' => 1, 'note' => 'happy', 'author' => {}},
          {'id' => 2, 'note' => 'sad', 'author' => {'id' => '123'}}
        ]},
      ]
      l.data['extra_data_encryption'] = ExternalNonce.init_client_encryption
      l.data['extra_data_public'] = true
      l.data['extra_data_nonce'] = 'asdfasdf'
      json = JsonApi::Log.as_json(l, :wrapper => true, :encryption_allowed => true)
      expect(json['log']['data_url']).to_not eq(nil)
      expect(json['log']['encryption_settings']).to eq(l.data['extra_data_encryption'])
      expect(json['log']['events']).to eq(nil)
    end
    
    it 'should not include encryption settings and url if not allowed' do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      l.data['events'] = [
        {'id' => 1, 'timestamp' => 12345, 'button' => {'spoken' => true, 'label' => 'hat'}, 'parts_of_speech' => {}},
        {'id' => 2, 'timestamp' => 12346, 'button' => {'label' => 'hat', 'percent_x' => 0.5, 'percent_y' => 0.32, 'board' => {}}, 'parts_of_speech' => {}},
        {'id' => 3, 'timestamp' => 12347, 'action' => {'action' => 'open_board', 'new_id' => {}}},
        {'id' => 4, 'timestamp' => 12348, 'action' => {'action' => 'auto_home'}},
        {'id' => 5, 'timestamp' => 12349, 'utterance' => {'spoken' => true, }},
        {'id' => 6, 'timestamp' => 12350},
        {'id' => 7, 'timestamp' => 12351, 'notes' => [
          {'id' => 1, 'note' => 'happy', 'author' => {}},
          {'id' => 2, 'note' => 'sad', 'author' => {'id' => '123'}}
        ]},
      ]
      l.data['extra_data_encryption'] = ExternalNonce.init_client_encryption
      l.data['extra_data_public'] = true
      l.data['extra_data_nonce'] = 'asdfasdf'
      json = JsonApi::Log.as_json(l, :wrapper => true, :encryption_allowed => false)
      expect(json['log']['data_url']).to eq(nil)
      expect(json['log']['encryption_settings']).to eq(nil)
      expect(json['log']['events']).to_not eq(nil)
    end

    it "should include the device" do
      l = LogSession.new(:log_type => 'session', data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['device']).to eql({
        'id' => nil,
        'name' => 'Unknown device'
      })
    end
    
    it "should include data for known event types" do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      l.data['events'] = [
        {'id' => 1, 'timestamp' => 12345, 'button' => {'spoken' => true, 'label' => 'hat'}, 'parts_of_speech' => {}},
        {'id' => 2, 'timestamp' => 12346, 'button' => {'label' => 'hat', 'percent_x' => 0.5, 'percent_y' => 0.32, 'board' => {}}, 'parts_of_speech' => {}},
        {'id' => 3, 'timestamp' => 12347, 'action' => {'action' => 'open_board', 'new_id' => {}}},
        {'id' => 4, 'timestamp' => 12348, 'action' => {'action' => 'auto_home'}},
        {'id' => 5, 'timestamp' => 12349, 'utterance' => {'spoken' => true, }},
        {'id' => 6, 'timestamp' => 12350},
        {'id' => 7, 'timestamp' => 12351, 'notes' => [
          {'id' => 1, 'note' => 'happy', 'author' => {}},
          {'id' => 2, 'note' => 'sad', 'author' => {'id' => '123'}}
        ]},
      ]
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['data_url']).to eql(nil)
      expect(json['log']['events'].length).to eql(7)
      expect(json['log']['events'][0]).to eql({
        'id' => 1,
        'parts_of_speech' => {},
        'spoken' => true,
        'summary' => 'hat',
        'timestamp' => 12345,
        'type' => 'button'
      })
      expect(json['log']['events'][1]).to eql({
        'id' => 2,
        'parts_of_speech' => {},
        'spoken' => false,
        'summary' => 'hat',
        'timestamp' => 12346,
        'type' => 'button',
        'board' => {},
        'touch_percent_x' => 0.5,
        'touch_percent_y' => 0.32
      })
      expect(json['log']['events'][2]).to eql({
        'id' => 3,
        'summary' => '[open_board]',
        'new_board' => {},
        'timestamp' => 12347,
        'type' => 'action'
      })
      expect(json['log']['events'][3]).to eql({
        'id' => 4,
        'summary' => '[auto_home]',
        'timestamp' => 12348,
        'type' => 'action'
      })
      expect(json['log']['events'][4]).to eql({
        'id' => 5,
        'summary' => '[vocalize]',
        'timestamp' => 12349,
        'type' => 'utterance',
        'utterance_text' => nil
      })
      expect(json['log']['events'][5]).to eql({
        'id' => 6,
        'summary' => 'unrecognized event',
        'timestamp' => 12350,
        'type' => 'other'
      })
      expect(json['log']['events'][6]).to eql({
        'id' => 7,
        'summary' => 'unrecognized event',
        'timestamp' => 12351,
        'type' => 'other',
        'notes' => [
          {
            'id' => 1,
            'note' => 'happy',
            'author' => {'id' => nil, 'user_name' => nil}
          },
          {
            'id' => 2,
            'note' => 'sad',
            'author' => {'id' => '123', 'user_name' => nil}
          }
        ]
      })
    end

    it "should include highlighted information" do
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now)
      l.data['events'] = [
        {'id' => 1, 'highlighted' => true, 'timestamp' => 12345, 'button' => {'spoken' => true, 'label' => 'hat'}, 'parts_of_speech' => {}},
        {'id' => 2, 'highlighted' => true, 'timestamp' => 12346, 'button' => {'spoken' => true, 'label' => 'hat', 'percent_x' => 0.5, 'percent_y' => 0.32, 'board' => {}}, 'parts_of_speech' => {}},
        {'id' => 3, 'highlighted' => true, 'timestamp' => 12347, 'action' => {'action' => 'open_board', 'new_id' => {}}},
        {'id' => 4, 'highlighted' => true, 'timestamp' => 12348, 'action' => {'action' => 'auto_home'}},
        {'id' => 5, 'timestamp' => 12349, 'utterance' => {'spoken' => true, }},
        {'id' => 6, 'timestamp' => 12350},
        {'id' => 7, 'timestamp' => 12351},
      ]
      l.user_id = 9
      l.author_id = 9
      l.device_id = 12
      l.generate_defaults
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['highlighted']).to eq(true)
      expect(json['log']['highlight_summary']).to eq('hat hat _')
      expect(json['log']['events'][0]['highlighted']).to eq(true)
      expect(json['log']['events'][1]['highlighted']).to eq(true)
      expect(json['log']['events'][2]['highlighted']).to eq(true)
      expect(json['log']['events'][3]['highlighted']).to eq(true)
      expect(json['log']['events'][4]['highlighted']).to eq(nil)
    end
    
    it "should include next_log_id and previous_log_id if found" do
      u = User.create
      d = Device.create(:user => u)
      l = LogSession.new(data: {'hat' => 'black'}, started_at: Time.now, ended_at: Time.now, :user => u, :device => d, :author => u)
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['new_log_id']).to eql(nil)
      expect(json['log']['previous_log_id']).to eql(nil)
      
      l.user = u
      l.save!
      LogSession.where(:id => l.id).update_all(:started_at => 2.hours.ago)
      l_pre = LogSession.create(:user => u)
      LogSession.where(:id => l_pre.id).update_all(:started_at => 3.hours.ago)
      l_post = LogSession.create(:user => u)
      LogSession.where(:id => l_post.id).update_all(:started_at => 1.hour.ago)
      l.reload
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['next_log_id']).to eql(l_post.global_id)
      expect(json['log']['previous_log_id']).to eql(l_pre.global_id)
    end
    
    it "should include assessment data" do
      u = User.create
      d = Device.create(:user => u)
      l = LogSession.new(data: {'assessment' => {'asdf' => 1}, 'stats' => {'bob' => 2}}, :log_type => 'assessment', started_at: Time.now, ended_at: Time.now, :user => u, :device => d, :author => u)
      l.save
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['assessment']).to eq({
        'asdf' => 1,
        'tallies' => [],
        'summary' => '(0 correct, 0 incorrect)',
        'totals' => {
          'correct' => 0,
          'incorrect' => 0
        },
        'stats' => {
          'avg_speech_length' => 0,
          'avg_utterance_length' => 0,
          'session_seconds' => 0,
          'total_correct' => 0,
          'total_incorrect' => 0,
          'recorded_correct' => 0,
          'recorded_incorrect' => 0,
          'total_tallies' => 0,
          'total_recorded_tallies' => 0,
          'percent_correct' => 0.0,
          'percent_incorrect' => 0.0,
          'longest_correct_streak' => 0,
          'longest_incorrect_streak' => 0
        }
      })
      
      l.log_type = 'note'
      json = JsonApi::Log.as_json(l, :wrapper => true)
      expect(json['log']['assessment']).to eq({
        'asdf' => 1,
        'tallies' => [],
        'summary' => '(0 correct, 0 incorrect)',
        'totals' => {
          'correct' => 0,
          'incorrect' => 0
        }
      })
    end
    
    it "should include video data" do
      u = User.create
      d = Device.create(:user => u)
      v = UserVideo.create(:user => u, :url => 'http://www.example.com/video.mp4')
      l = LogSession.new(data: {'note' => {'note' => 'howdy', 'video' => {'id' => v.global_id}}, 'stats' => {'bob' => 2}}, :log_type => 'note', started_at: Time.now, ended_at: Time.now, :user => u, :device => d, :author => u)
      json = JsonApi::Log.as_json(l, :wrapper => true, :permissions => u)
      expect(json['log']['video']).to eq({
        'duration' => nil,
        'id' => v.global_id,
        'url' => 'http://www.example.com/video.mp4'
      })

      l.data['note']['video']['id'] = 'asdf'
      json = JsonApi::Log.as_json(l, :wrapper => true, :permissions => u)
      expect(json['log']['video']).to eq(nil)

      v.url = nil
      v.save
      l.data['note']['video']['id'] = v.global_id
      json = JsonApi::Log.as_json(l, :wrapper => true, :permissions => u)
      expect(json['log']['video']).to eq(nil)
    end
    
    it "should include goal data" do
      u = User.create
      d = Device.create(:user => u)
      g = UserGoal.create(:settings => {'summary' => 'awesomeness'})
      l = LogSession.new(data: {'note' => {'note' => 'howdy'}, 'goal' => {'id' => g.global_id, 'summary' => 'something', 'status' => 3}, 'stats' => {'bob' => 2}}, :log_type => 'note', started_at: Time.now, ended_at: Time.now, :user => u, :device => d, :author => u)
      json = JsonApi::Log.as_json(l)
      expect(json['goal']).to eq({
        'id' => g.global_id,
        'summary' => 'something',
        'status' => 3
      })

      l.data['goal'] = nil
      json = JsonApi::Log.as_json(l)
      expect(json['goal']).to eq(nil)

      
      l.data['goal'] = {'id' => g.global_id, 'summary' => 'something', 'status' => 3}
      json = JsonApi::Log.as_json(l, :wrapper => true, :permissions => u)
      expect(json['log']['goal']).to eq({
        'id' => g.global_id,
        'summary' => 'awesomeness',
        'status' => 3
      })
    end

    it "should return journal data for a journal entry" do
      @user = User.create
      @device = Device.create(user: @user)
      j = LogSession.process_new({
        :type => 'journal',
        :vocalization => [{'label' => 'cat'}, {'label' => 'frog'}],
        :category => 'journal'
      }, {:user => @user, :device => @device, :author => @user})
      expect(j.id).to_not eq(nil)

      json = JsonApi::Log.as_json(j, :wrapper => true, :permissions  => @user)
      expect(json['log']['id']).to eq(j.global_id)
      expect(json['log']['type']).to eq('journal')
      expect(json['log']['journal']['sentence']).to eq('cat frog')
    end
  end
  
  describe "days" do
    it "should include daily use data for individual results" do
      u = User.create
      d = Device.create(:user => u)
      days = {}
      days[3.months.ago.to_date.iso8601] = {'a' => 1, 'date' => 5}
      days[1.month.ago.to_date.iso8601] = {'a' => 2, 'date' => 4}
      days[2.weeks.ago.to_date.iso8601] = {'a' => 3, 'date' => 3}
      l = LogSession.new(data: {'days' => days}, :log_type => 'daily_use')
      json = JsonApi::Log.as_json(l, :permissions => u, :wrapper => true)
      expect(json['log']['daily_use']).to eq([
        {'date' => 3, 'a' => 3},
        {'date' => 4, 'a' => 2},
        {'date' => 5, 'a' => 1}
      ])
    end
  end
end
