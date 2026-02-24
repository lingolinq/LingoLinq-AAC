require 'spec_helper'

describe ButtonSound, :type => :model do
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
      i = ButtonSound.new
      i.generate_defaults
      expect(i.settings['license']).to eq({'type' => 'private'})
      expect(i.public).to eq(false)
    end
    
    it "should not override existing values" do
      i = ButtonSound.new(public: true, settings: {'license' => {'type' => 'nunya'}})
      i.generate_defaults
      expect(i.settings['license']).to eq({'type' => 'nunya'})
      expect(i.public).to eq(true)
    end
  end

  describe "process_params" do
    it "should ignore unspecified parameters" do
      i = ButtonSound.new(:user_id => 1)
      expect(i.process_params({}, {})).to eq(true)
    end
    
    it "should raise if no user set" do
      i = ButtonSound.new
      expect { i.process_params({}, {}) }.to raise_error("user required as sound author")
    end
    
    it "should set parameters" do
      u = User.new
      i = ButtonSound.new(:user_id => 1)
      expect(i.process_params({
        'content_type' => 'audio/mp3',
        'suggestion' => 'hat',
        'public' => true
      }, {
        :user => u
      })).to eq(true)
      expect(i.settings['content_type']).to eq('audio/mp3')
      expect(i.settings['license']).to eq(nil)
      expect(i.settings['suggestion']).to eq('hat')
      expect(i.settings['search_term']).to eq(nil)
      expect(i.settings['external_id']).to eq(nil)
      expect(i.public).to eq(true)
      expect(i.user).to eq(u)
    end
    
    it "should process the URL including non_user_params if sent" do
      u = User.new
      i = ButtonSound.new(:user_id => 1)
      expect(i.process_params({
        'url' => 'http://www.example.com'
      }, {})).to eq(true)
      expect(i.settings['url']).to eq(nil)
      expect(i.settings['pending_url']).to eq('http://www.example.com')
    end
    
    it "should include transcription" do
      u = User.new
      s = ButtonSound.new(:user_id => 1)
      expect(s.process_params({
        'transcription' => 'good stuff'
      }, {})).to eq(true)
      expect(s.settings['transcription']).to eq('good stuff')
    end
    
    it "should include tags" do
      u = User.new
      s = ButtonSound.new(:user_id => 1)
      expect(s.process_params({
        'tag' => 'bacon'
      }, {})).to eq(true)
      expect(s.settings['tags']).to eq(['bacon'])
      expect(s.process_params({
        'tag' => 'cheddar'
      }, {})).to eq(true)
      expect(s.settings['tags']).to eq(['bacon', 'cheddar'])
      expect(s.process_params({
        'tag' => 'bacon'
      }, {})).to eq(true)
      expect(s.settings['tags']).to eq(['bacon', 'cheddar'])
    end
    
    it "should correctly clear related tags" do
      u = User.new
      s = ButtonSound.new(:user_id => 1)
      expect(s.process_params({
        'tag' => 'bacon'
      }, {})).to eq(true)
      expect(s.settings['tags']).to eq(['bacon'])
      expect(s.process_params({
        'tag' => 'not:bacon'
      }, {})).to eq(true)
      expect(s.settings['tags']).to eq(['not:bacon'])
      expect(s.process_params({
        'tag' => 'bacon'
      }, {})).to eq(true)
      expect(s.settings['tags']).to eq(['bacon'])
    end
  end
    
  it "should securely serialize settings" do
    u = User.create
    b = ButtonSound.new(:user => u, :settings => {'a' => 1, 'license' => {'type' => 'private'}})
    expect(b.settings['a']).to eq(1)
    b.generate_defaults
    b.save
    b.reload
    expect(b.settings['a']).to eq(1)
  end
  
  it "should remove from remote storage if no longer in use" do
    u = User.create
    i = ButtonSound.create(:user => u)
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
      board = Board.create(:user => u)
      s = ButtonSound.create(:user => u)
      BoardButtonSound.create(:board_id => board.id, :button_sound_id => s.id)
      BoardButtonSound.create(:board_id => board.id, :button_sound_id => s.id)
      BoardButtonSound.create(:board_id => board.id, :button_sound_id => s.id)
      expect(BoardButtonSound.where(:button_sound_id => s.id).count).to eq(3)
      s.destroy
      expect(BoardButtonSound.where(:button_sound_id => s.id).count).to eq(0)
    end
  end
  
  describe "secondary_url" do
    it "should return the correct value" do
      u = User.create
      s = ButtonSound.new(:user => u)
      expect(s.secondary_url).to eq(nil)
      expect(s).to receive(:remote_upload_params).and_return({
        :upload_url => 'http://www.example.com/uploads/'
      })
      s.save
      s.settings['secondary_output'] = {'filename' => 'something.wav'}
      expect(s.secondary_url).to eq('http://www.example.com/uploads/something.wav')
    end
  end
  
  describe "generate_zip_for" do
    it "should call generate_zip with correct parameters" do
      u = User.create
      bs1 = ButtonSound.create(user: u, settings: {
        'content_type' => 'audio/mp3',
        'name' => 'Sound 1'
      }, url: 'http://www.example.com/sound1.mp3')
      bs2 = ButtonSound.create(user: u, settings: {
        'content_type' => 'audio/mp3',
        'name' => 'Sound 2',
        'transcription' => 'This is good stuff',
        'duration' => 1.5
      }, url: 'http://www.example.com/sound2.mp3')
      bs3 = ButtonSound.create(user: u, settings: {
        'content_type' => 'audio/wav',
        'name' => 'Sound 3',
        'transcription' => 'I love this part',
        'transcription_by_user' => true
      }, url: 'http://www.example.com/sound3.wav')
      bs4 = ButtonSound.create(user: u, settings: {
        'content_type' => 'audio/mp3',
        'name' => 'Sound 4',
        'duration' => 1.7,
        'secondary_output' => {
          'filename' => 'sound4.wav',
          'content_type' => 'audio/wav'
        }
      }, url: 'http://www.example.com/sound4.mp3')
      expect(Uploader).to receive(:generate_zip) do |opts, filename|
        params = Uploader.remote_upload_params('something.mp3', 'audio/mp3')
        expect(filename).to eq("sounds-#{u.user_name}.zip")
        expect(opts.length).to eq(5)
        opts = opts.sort_by{|o| o['url'] || 'zzzz' }
        expect(opts[0]['url']).to eq('http://www.example.com/sound1.mp3')
        n1 = opts[0]['name']
        expect(opts[1]['url']).to eq('http://www.example.com/sound2.mp3')
        n2 = opts[1]['name']
        expect(opts[2]['url']).to eq('http://www.example.com/sound3.wav')
        n3 = opts[2]['name']
        expect(opts[3]['url']).to eq("#{params[:upload_url]}sound4.wav")
        n4 = opts[3]['name']
        expect(opts[4]['name']).to eq("MessageBank.json")
        json = JSON.parse(opts[4]['data'])
        expect(json['RecordedMessages'].length).to eq(4)
        json['RecordedMessages'] = json['RecordedMessages'].sort_by{|m| m['Id'] }
        expect(json['RecordedMessages'][0]).to eq({
          'Id' => bs1.global_id,
          'FileName' => n1,
          'Label' => 'Sound 1',
          'Length' => '00:00:00',
          'LastModified' => bs1.updated_at.iso8601,
          'CreatedTime' => bs1.created_at.iso8601
        })
        expect(json['RecordedMessages'][1]).to eq({
          'Id' => bs2.global_id,
          'FileName' => n2,
          'Label' => 'Sound 2',
          'Length' => '00:00:01.5',
          'LastModified' => bs2.updated_at.iso8601,
          'CreatedTime' => bs2.created_at.iso8601,
          'Transcription' => {'Text' => 'This is good stuff', 'Source' => 'auto', 'Verified' => false}
        })
        expect(json['RecordedMessages'][2]).to eq({
          'Id' => bs3.global_id,
          'FileName' => n3,
          'Label' => 'Sound 3',
          'Length' => '00:00:00',
          'LastModified' => bs3.updated_at.iso8601,
          'CreatedTime' => bs3.created_at.iso8601,
          'Transcription' => {'Text' => 'I love this part', 'Source' => 'user', 'Verified' => true}
        })
        expect(json['RecordedMessages'][3]).to eq({
          'Id' => bs4.global_id,
          'FileName' => n4,
          'Label' => 'Sound 4',
          'Length' => '00:00:01.7',
          'LastModified' => bs4.updated_at.iso8601,
          'CreatedTime' => bs4.created_at.iso8601
        })
      end
      ButtonSound.generate_zip_for(u)
    end
  end
  describe "import_for" do
    class TestZipper
      def glob(search)
        if search == 'MessageBank.json'
          if @no_json
            return []
          else          
            return ['MessageBank.json']
          end
        elsif search == '*.mp3'
          return ['sound1.mp3', 'sound2.mp3']
        elsif search == '*.wav'
          return ['sound3.wav']
        else
          return []
        end
      end
      
      def read(filename)
        return {
          'RecordedMessages' => [
            {
              'Id' => 'abc1',
              'FileName' => 'sound1.mp3',
              'Label' => 'Sound 1'
            },
            {
              'Id' => 'abc2',
              'FileName' => 'sound2.mp3',
              'Label' => 'Sound 2',
              'Duration' => '00:01:11',
              'Transcription' => {
                'Text' => 'How are you',
                'Source' => 'user',
                'Verified' => true
              }
            }
          ]
        }.to_json
      end
      
      def read_as_data(filename)
        if filename == 'sound1.mp3'
          return {'data' => 'data:audio/mp3;base64,000'}
        elsif filename == 'sound2.mp3'
          return {'data' => 'data:audio/mp3;base64,111'}
        elsif filename == 'sound3.wav'
          return {'data' => 'data:audio/wav;base64,222'}
        end
      end
    end
    it "should import sounds" do
      allow_any_instance_of(ButtonSound).to receive(:upload_to_remote).with('data_uri').and_return(true)
      expect(Uploader).to receive(:remote_zip).with('http://www.example.com/import.zip').and_yield(TestZipper.new)
      u = User.create
      res = ButtonSound.import_for(u.global_id, 'http://www.example.com/import.zip')
      expect(res.length).to eq(3)
      expect(ButtonSound.where(:user_id => u.id).count).to eq(3)
      bs1 = ButtonSound.where(:user_id => u.id).find_by_global_id(res[0]['id'])
      bs2 = ButtonSound.where(:user_id => u.id).find_by_global_id(res[1]['id'])
      bs3 = ButtonSound.where(:user_id => u.id).find_by_global_id(res[2]['id'])
      expect(bs1.settings['content_type']).to eq('audio/mpeg')
      expect(bs1.settings['data_uri']).to eq('data:audio/mp3;base64,000')
      expect(bs1.settings['transcription']).to eq(nil)
      expect(bs1.settings['transcription_by_user']).to eq(nil)
      expect(bs1.settings['duration']).to eq(nil)
      expect(bs2.settings['content_type']).to eq('audio/mpeg')
      expect(bs2.settings['data_uri']).to eq('data:audio/mp3;base64,111')
      expect(bs2.settings['transcription']).to eq('How are you')
      expect(bs2.settings['transcription_by_user']).to eq(true)
      expect(bs2.settings['duration']).to eq(nil)
      expect(bs3.settings['content_type']).to be_in(['audio/wav', 'audio/vnd.wave'])
      expect(bs3.settings['data_uri']).to eq('data:audio/wav;base64,222')
      expect(bs3.settings['transcription']).to eq(nil)
      expect(bs3.settings['transcription_by_user']).to eq(nil)
      expect(bs3.settings['duration']).to eq(nil)
    end
    
    it "should work even without MessageBank.json" do
      allow_any_instance_of(ButtonSound).to receive(:upload_to_remote).with('data_uri').and_return(true)
      zipper = TestZipper.new
      zipper.instance_variable_set('@no_json', true)
      expect(Uploader).to receive(:remote_zip).with('http://www.example.com/import.zip').and_yield(zipper)
      u = User.create
      res = ButtonSound.import_for(u.global_id, 'http://www.example.com/import.zip')
      expect(res.length).to eq(3)
      expect(ButtonSound.where(:user_id => u.id).count).to eq(3)
      bs1 = ButtonSound.where(:user_id => u.id).find_by_global_id(res[0]['id'])
      bs2 = ButtonSound.where(:user_id => u.id).find_by_global_id(res[1]['id'])
      bs3 = ButtonSound.where(:user_id => u.id).find_by_global_id(res[2]['id'])
      expect(bs1.settings['content_type']).to eq('audio/mpeg')
      expect(bs1.settings['data_uri']).to eq('data:audio/mp3;base64,000')
      expect(bs1.settings['transcription']).to eq(nil)
      expect(bs1.settings['transcription_by_user']).to eq(nil)
      expect(bs2.settings['content_type']).to eq('audio/mpeg')
      expect(bs2.settings['data_uri']).to eq('data:audio/mp3;base64,111')
      expect(bs2.settings['transcription']).to eq(nil)
      expect(bs2.settings['transcription_by_user']).to eq(nil)
      expect(bs3.settings['content_type']).to be_in(['audio/wav', 'audio/vnd.wave'])
      expect(bs3.settings['data_uri']).to eq('data:audio/wav;base64,222')
      expect(bs3.settings['transcription']).to eq(nil)
      expect(bs3.settings['transcription_by_user']).to eq(nil)
    end
  end
  
  describe "schedule_transcription" do
    it "should do nothing without a secondary url" do
      bs = ButtonSound.new(:settings => {})
      bs.schedule_transcription
      expect(Worker.scheduled_actions.length).to eq(0)
    end
    
    it "should do nothing if there's already a transcription set for the sound" do
      bs = ButtonSound.new({
        :settings => {
          'transcription' => 'aha'
        }
      })
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
      bs.schedule_transcription
      expect(Worker.scheduled_actions.length).to eq(0)
    end
    
    it "should schedule if not manually running" do
      u = User.create
      bs = ButtonSound.create(:user => u, :settings => {})
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav")
      bs.schedule_transcription
      expect(Worker.scheduled?(ButtonSound, :perform_action, {:id => bs.id, :method => 'schedule_transcription', :arguments => [true]})).to eq(true)
    end
    
    it "should query for a transcription" do
      bs = ButtonSound.new(:settings => {
      })
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav").at_least(1).times
      expect(Typhoeus).to receive(:get).with("http://www.example.com/sound.wav").and_return(OpenStruct.new({
        body: 'asdf'
      }))
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'tokeny'
      expect(Typhoeus).to receive(:post).with("https://speech.googleapis.com/v1/speech:recognize?key=tokeny", {
        body: {config: {encoding: 'LINEAR16', sampleRateHertz: 44100, languageCode: 'en', profanityFilter: true}, audio: {content: 'YXNkZg'}}.to_json, 
        headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}
      }).and_return(OpenStruct.new({
        body: {
          results: [
            {alternatives: [
              transcript: 'ahem',
              confidence: 0.45
            ]}
          ]
        }.to_json
      }))
      expect(Uploader).to receive(:remote_remove).with("http://www.example.com/sound.wav").and_return(true)
      bs.schedule_transcription(true)
      expect(bs.settings['transcription']).to eq('ahem')
      expect(bs.settings['transcription_confidence']).to eq(0.45)
    end
    
    it "should set the transcription on query success" do
      bs = ButtonSound.new(:settings => {
      })
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav").at_least(1).times
      expect(Typhoeus).to receive(:get).with("http://www.example.com/sound.wav").and_return(OpenStruct.new({
        body: 'asdf'
      }))
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'tokeny'
      expect(Typhoeus).to receive(:post).with("https://speech.googleapis.com/v1/speech:recognize?key=tokeny", {
        body: {config: {encoding: 'LINEAR16', sampleRateHertz: 44100, languageCode: 'en', profanityFilter: true}, audio: {content: 'YXNkZg'}}.to_json, 
        headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}
      }).and_return(OpenStruct.new({
        body: {
          results: [
            {alternatives: [
              transcript: 'ahem',
              confidence: 0.45
            ]}
          ]
        }.to_json
      }))
      expect(Uploader).to receive(:remote_remove).with("http://www.example.com/sound.wav").and_return(true)
      bs.schedule_transcription(true)
      expect(bs.settings['transcription']).to eq('ahem')
      expect(bs.settings['transcription_confidence']).to eq(0.45)
    end
    
    it "should not set the transcription if too low a confidence" do
      bs = ButtonSound.new(:settings => {
      })
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav").at_least(1).times
      expect(Typhoeus).to receive(:get).with("http://www.example.com/sound.wav").and_return(OpenStruct.new({
        body: 'asdf'
      }))
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'tokeny'
      expect(Typhoeus).to receive(:post).with("https://speech.googleapis.com/v1/speech:recognize?key=tokeny", {
        body: {config: {encoding: 'LINEAR16', sampleRateHertz: 44100, languageCode: 'en', profanityFilter: true}, audio: {content: 'YXNkZg'}}.to_json, 
        headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}
      }).and_return(OpenStruct.new({
        body: {
          results: [
            {alternatives: [
              transcript: 'ahem',
              confidence: 0.11
            ]}
          ]
        }.to_json
      }))
      expect(Uploader).to receive(:remote_remove).with("http://www.example.com/sound.wav").and_return(true)
      bs.schedule_transcription(true)
      expect(bs.settings['transcription']).to eq(nil)
      expect(bs.settings['transcription_confidence']).to eq(nil)
      expect(bs.settings['transcription_uncertain']).to eq(true)
    end
    
    it "should reschedule transcription if there is an error" do
      bs = ButtonSound.new(:settings => {
      })
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav").at_least(1).times
      expect(Typhoeus).to receive(:get).with("http://www.example.com/sound.wav").and_return(OpenStruct.new({
        body: 'asdf'
      }))
      ENV['GOOGLE_TRANSLATE_TOKEN'] = 'tokeny'
      expect(Typhoeus).to receive(:post).with("https://speech.googleapis.com/v1/speech:recognize?key=tokeny", {
        body: {config: {encoding: 'LINEAR16', sampleRateHertz: 44100, languageCode: 'en', profanityFilter: true}, audio: {content: 'YXNkZg'}}.to_json, 
        headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'}
      }).and_return(OpenStruct.new({
        body: {
          error: "no"
        }.to_json
      }))
      expect(Uploader).to_not receive(:remote_remove).with("http://www.example.com/sound.wav")
      bs.schedule_transcription(true)
      expect(bs.settings['transcription']).to eq(nil)
      expect(bs.settings['transcription_confidence']).to eq(nil)
      expect(bs.settings['transcription_uncertain']).to eq(nil)
      expect(bs.settings['transcription_errors']).to eq(1)
    end
    
    it "should do nothing if too many attempts have been made" do
      bs = ButtonSound.new(:settings => {
        'transcription_errors' => 3
      })
      expect(bs).to receive(:secondary_url).and_return("http://www.example.com/sound.wav").at_least(1).times
      bs.schedule_transcription(true)
      expect(Typhoeus).to_not receive(:get)
    end
  end
  
  describe "schedule_missing_transcodings" do
    it "should schedule missing sound transcodings" do
      u = User.create
      bs = ButtonSound.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf'})
      bs.settings['transcoding_in_progress'] = nil
      bs.save
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(Worker).to receive(:schedule){|k, m, id, path, key|
        expect(k).to eq(Transcoder)
        expect(m).to eq(:convert_audio)
        expect(id).to eq(bs.global_id)
      }
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(true)
      expect(bs.settings['extra_transcoding_attempts']).to eq(1)
    end
    
    it "should not schedule for old sounds" do
      u = User.create
      bs = ButtonSound.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf'})
      bs.settings['transcoding_in_progress'] = nil
      bs.save
      ButtonSound.where(:id => bs.id).update_all(:created_at => 3.weeks.ago)
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(Worker).to_not receive(:schedule)
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(bs.settings['extra_transcoding_attempts']).to eq(nil)
    end
    
    it "should not schedule for sounds with too many prior attempts" do
      u = User.create
      bs = ButtonSound.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf', 'extra_transcoding_attempts' => 5})
      bs.settings['transcoding_in_progress'] = nil
      bs.save
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(Worker).to_not receive(:schedule)
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(bs.settings['extra_transcoding_attempts']).to eq(5)
    end
    
    it "should not schedule for sounds marked as in progress" do
      u = User.create
      bs = ButtonSound.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf'})
      expect(bs.settings['transcoding_in_progress']).to eq(true)
      expect(Worker).to_not receive(:schedule)
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(true)
      expect(bs.settings['extra_transcoding_attempts']).to eq(nil)
    end
    
    it "should schedule missing video transcodings" do
      u = User.create
      bs = UserVideo.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf'})
      bs.settings['transcoding_in_progress'] = nil
      bs.save
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(Worker).to receive(:schedule){|k, m, id, path, key|
        expect(k).to eq(Transcoder)
        expect(m).to eq(:convert_video)
        expect(id).to eq(bs.global_id)
      }
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(true)
      expect(bs.settings['extra_transcoding_attempts']).to eq(1)
    end
    
    it "should not schedule for old videos" do
      u = User.create
      bs = UserVideo.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf'})
      bs.settings['transcoding_in_progress'] = nil
      bs.save
      UserVideo.where(:id => bs.id).update_all(:created_at => 3.weeks.ago)
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(Worker).to_not receive(:schedule)
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(bs.settings['extra_transcoding_attempts']).to eq(nil)
    end
    
    it "should not schedule for videos with too many prior attempts" do
      u = User.create
      bs = UserVideo.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf', 'extra_transcoding_attempts' => 5})
      bs.settings['transcoding_in_progress'] = nil
      bs.save
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(Worker).to_not receive(:schedule)
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(nil)
      expect(bs.settings['extra_transcoding_attempts']).to eq(5)
    end
    
    it "should not schedule for videos marked as in progress" do
      u = User.create
      bs = UserVideo.create(:user => u, :url => 'asdf', :settings => {'full_filename' => 'asdf'})
      expect(bs.settings['transcoding_in_progress']).to eq(true)
      expect(Worker).to_not receive(:schedule)
      ButtonSound.schedule_missing_transcodings
      bs.reload
      expect(bs.settings['transcoding_in_progress']).to eq(true)
      expect(bs.settings['extra_transcoding_attempts']).to eq(nil)
    end
  end
end
