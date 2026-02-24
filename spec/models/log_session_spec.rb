require 'spec_helper'

describe LogSession, :type => :model do
  describe "paper trail" do
    it "should make sure paper trail is doing its thing"
  end
  
  describe "generate_defaults" do
    it "should generate default values" do
      s = LogSession.new
      s.generate_defaults rescue nil
      expect(s.data['events']).to eq([])
      expect(s.data['geo']).to eq(nil)
      expect(s.processed).to eq(false)
    end
    
    it "should not override existing values" do
      s = LogSession.new
      s.data = {}
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'geo' => ['1', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.processed = true
      s.generate_defaults rescue nil
      expect(s.data['events'].length).to eq(2)
      expect(s.data['geo']).to eq([1.0, 2.5, 0.0])
      expect(s.processed).to eq(true)
    end
    
    it "should generate summary data for log events or notes" do
      s = LogSession.new
      s.data = {}
      time1 = 10.minutes.ago
      time2 = 8.minutes.ago
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => time1.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'spoken' => true, 'board' => {'id' => '1_1'}}},
        {'geo' => ['1', '2'], 'timestamp' => time2.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'spoken' => true, 'board' => {'id' => '1_1'}}}
      ]
      s.generate_defaults rescue nil
      expect(s.data['button_count']).to eq(2)
      expect(s.data['utterance_count']).to eq(0)
      expect(s.data['utterance_word_count']).to eq(0)
      expect(s.data['duration']).to eq(120)
      expect(s.data['event_count']).to eq(2)
      expect(s.started_at.to_i).to eq(time1.to_i)
      expect(s.ended_at.to_i).to eq(time2.to_i)
      expect(s.data['event_summary']).to eq('hat.. cow')
      
      u = User.new(:user_name => "fred")
      s = LogSession.new(:author => u)
      s.data = {}
      s.data['note'] = {
        'text' => "I am happy"
      }
      s.generate_defaults rescue nil
      expect(s.data['button_count']).to eq(0)
      expect(s.data['utterance_count']).to eq(0)
      expect(s.data['utterance_word_count']).to eq(0)
      expect(s.data['duration']).to eq(nil)
      expect(s.data['event_count']).to eq(nil)
      expect(s.started_at).to be > 1.second.ago
      expect(s.ended_at).to be > 1.second.ago
      expect(s.data['event_summary']).to eq('Note by fred: I am happy')
    end

    it "should clear nil-valued attributes" do
      s = LogSession.new
      s.data = {}
      time1 = 10.minutes.ago
      time2 = 8.minutes.ago
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => time1.to_i, 'type' => 'button', 'bacon' => nil, 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'geo' => ['1', '2'], 'timestamp' => time2.to_i, 'type' => 'button', 'bacon' => 'some', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.generate_defaults rescue nil
      expect(s.data['events'][0].keys.include?('bacon')).to eq(false)
      expect(s.data['events'][1].keys.include?('bacon')).to eq(true)
    end

    it "should track hit locations" do
      s = LogSession.new
      s.data = {}
      time1 = 10.minutes.ago
      s.data['events'] = [
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.9, 'percent_y' => 0.051, 'board' => {'id' => '1_1'}}},
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.9, 'percent_y' => 0.052, 'board' => {'id' => '1_1'}}},
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.6, 'percent_y' => 0.051, 'board' => {'id' => '1_1'}}},
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.601, 'percent_y' => 0.051, 'board' => {'id' => '1_1'}}},
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.599, 'percent_y' => 0.052, 'board' => {'id' => '1_1'}}},
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.6, 'percent_y' => 0.053, 'board' => {'id' => '1_1'}}},
        {'timestamp' => time1.to_i, 'button' => {'percent_x' => 0.899, 'percent_y' => 0.054, 'board' => {'id' => '1_1'}}},
      ]
      s.generate_defaults rescue nil
      expect(s.data['touch_locations']).to eq({
        '1_1' => {
          0.6 => {
            0.05 => 4
          },
          0.9 => {
            0.05 => 3
          }
        }
      })
    end
    
    it "should track video attachments" do
      u = User.create
      s = LogSession.new(:author => u, :data => {
        'note' => {
          'text' => 'cool stuff',
          'video' => {
            'duration' => 90,
          }
        }
      })
      s.generate_defaults rescue nil
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: recording (1m) - cool stuff")
    end

    it "should track goal data" do
      u = User.create
      s = LogSession.new(:author => u, :data => {
        'goal' => {
          'status' => 0
        }
      })
      s.generate_defaults rescue nil
      expect(s.data['goal']).to eq({
        'status' => 0,
        'positives' => 0,
        'negatives' => 1
      })
      
      s2 = LogSession.new(:author => u, :data => {
        'goal' => {
          'status' => 3
        }
      })
      s2.generate_defaults rescue nil
      expect(s2.data['goal']).to eq({
        'status' => 3,
        'positives' => 1,
        'negatives' => 0
      })
      
      s3 = LogSession.new(:author => u, :data => {
        'goal' => {
          'status' => 0
        },
        'assessment' => {
          'totals' => {
            'correct' => 7,
            'incorrect' => 3
          }
        }
      })
      s3.generate_defaults rescue nil
      expect(s3.data['goal']).to eq({
        'status' => 0,
        'positives' => 7,
        'negatives' => 3
      })
    end
    
    it "should schedule log session tracking if goal attached"
    
    it "should mark as needing push if that's true" do
      s = LogSession.new
      u = User.create
      s.user = u
      s.data = {}
      time1 = 10.minutes.ago
      time2 = 8.minutes.ago
      time3 = 2.minutes.ago
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => time1.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'geo' => ['1', '2'], 'timestamp' => time2.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}},
        {'action' => {'action' => 'auto_home'}, 'timestamp' => time3.to_i, 'type' => 'action'},
        {'action' => {'action' => 'home'}, 'timestamp' => time3.to_i, 'type' => 'action'}
      ]
      expect(s.needs_remote_push).to eq(nil)
      s.generate_defaults rescue nil
      expect(s.needs_remote_push).to eq(true)
    end
    
    it "should not include auto_home events in the summary" do
      s = LogSession.new
      s.data = {}
      time1 = 10.minutes.ago
      time2 = 8.minutes.ago
      time3 = 2.minutes.ago
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => time1.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'spoken' => true, 'board' => {'id' => '1_1'}}},
        {'geo' => ['1', '2'], 'timestamp' => time2.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'spoken' => true, 'board' => {'id' => '1_1'}}},
        {'action' => {'action' => 'auto_home'}, 'timestamp' => time3.to_i, 'type' => 'action'},
        {'action' => {'action' => 'home'}, 'timestamp' => time3.to_i, 'type' => 'action'}
      ]
      s.generate_defaults rescue nil
      expect(s.data['button_count']).to eq(2)
      expect(s.data['utterance_count']).to eq(0)
      expect(s.data['utterance_word_count']).to eq(0)
      expect(s.data['duration']).to eq(480)
      expect(s.data['event_count']).to eq(4)
      expect(s.started_at.to_i).to eq(time1.to_i)
      expect(s.ended_at.to_i).to eq(time3.to_i)
      expect(s.data['event_summary']).to eq('hat.. cow... ⌂')
    end
    
    it "should mark buttons as modified_by_next" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'button' => {'label' => 'run'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'cat'}, 'timestamp' => 1444994882}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u'}, 'timestamp' => 1444994884},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n&&:back'}, 'timestamp' => 1444994885},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994886},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y&&+boy'}, 'timestamp' => 1444994887},
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      expect(s.data['events'].length).to eq(7)
      expect(s.data['events'][0]['modified_by_next']).to eq(nil)
      expect(s.data['events'][0]['spelling']).to eq(nil)
      expect(s.data['events'][1]['modified_by_next']).to eq(nil)
      expect(s.data['events'][1]['spelling']).to eq(nil)
      expect(s.data['events'][2]['modified_by_next']).to eq(true)
      expect(s.data['events'][2]['spelling']).to eq(nil)
      expect(s.data['events'][3]['modified_by_next']).to eq(true)
      expect(s.data['events'][3]['spelling']).to eq(nil)
      expect(s.data['events'][4]['modified_by_next']).to eq(true)
      expect(s.data['events'][4]['spelling']).to eq(nil)
      expect(s.data['events'][5]['modified_by_next']).to eq(true)
      expect(s.data['events'][5]['spelling']).to eq(nil)
      expect(s.data['events'][6]['modified_by_next']).to eq(false)
      expect(s.data['events'][6]['spelling']).to eq('funnyboy')
    end
    
    it "should mark spelling finishes correctly" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'button' => {'label' => 'run'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'cat'}, 'timestamp' => 1444994882}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u'}, 'timestamp' => 1444994883.1},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994883.2},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994883.3},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y'}, 'timestamp' => 1444994883.4},
        {'type' => 'button', 'button' => {'label' => ' ', 'vocalization' => ':space', 'completion' => 'funny'}, 'timestamp' => 1444994888}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      expect(s.data['events'].length).to eq(8)
      expect(s.data['events'][0]['modified_by_next']).to eq(nil)
      expect(s.data['events'][0]['spelling']).to eq(nil)
      expect(s.data['events'][1]['modified_by_next']).to eq(nil)
      expect(s.data['events'][1]['spelling']).to eq(nil)
      expect(s.data['events'][2]['modified_by_next']).to eq(true)
      expect(s.data['events'][2]['spelling']).to eq(nil)
      expect(s.data['events'][3]['modified_by_next']).to eq(true)
      expect(s.data['events'][3]['spelling']).to eq(nil)
      expect(s.data['events'][4]['modified_by_next']).to eq(true)
      expect(s.data['events'][4]['spelling']).to eq(nil)
      expect(s.data['events'][5]['modified_by_next']).to eq(true)
      expect(s.data['events'][5]['spelling']).to eq(nil)
      expect(s.data['events'][6]['modified_by_next']).to eq(true)
      expect(s.data['events'][6]['spelling']).to eq(nil)
      expect(s.data['events'][7]['modified_by_next']).to eq(nil)
      expect(s.data['events'][7]['spelling']).to eq(nil)
      expect(s.data['events'][7]['button']['completion']).to eq('funny')
    end
    
    it "should not mark spelling if the sequence includes a modifier" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'button' => {'label' => 'run'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'cat'}, 'timestamp' => 1444994882}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u'}, 'timestamp' => 1444994884},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => ':ing'}, 'timestamp' => 1444994885},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994886},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y'}, 'timestamp' => 1444994887},
        {'type' => 'button', 'button' => {'label' => ' ', 'vocalization' => ':space'}, 'timestamp' => 1444994888}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      expect(s.data['events'].length).to eq(8)
      expect(s.data['events'][0]['modified_by_next']).to eq(nil)
      expect(s.data['events'][0]['spelling']).to eq(nil)
      expect(s.data['events'][1]['modified_by_next']).to eq(nil)
      expect(s.data['events'][1]['spelling']).to eq(nil)
      expect(s.data['events'][2]['modified_by_next']).to eq(true)
      expect(s.data['events'][2]['spelling']).to eq(nil)
      expect(s.data['events'][3]['modified_by_next']).to eq(true)
      expect(s.data['events'][3]['spelling']).to eq(nil)
      expect(s.data['events'][4]['modified_by_next']).to eq(nil)
      expect(s.data['events'][4]['spelling']).to eq(nil)
      expect(s.data['events'][5]['modified_by_next']).to eq(true)
      expect(s.data['events'][5]['spelling']).to eq(nil)
      expect(s.data['events'][6]['modified_by_next']).to eq(true)
      expect(s.data['events'][6]['spelling']).to eq(nil)
      expect(s.data['events'][7]['modified_by_next']).to eq(nil)
      expect(s.data['events'][7]['spelling']).to eq(nil)
    end
    
    it "should check for word_data using the spelling attribute if set" do
      u = User.create
      d = Device.create(:user => u)
      allow(WordData).to receive(:find_words).and_return({'run' => {'word' => 'run', 'types' => ['verb']}, 'cat' => {'word' => 'cat', 'types' => ['noun']}})
      allow(WordData).to receive(:find_word).and_return(nil)
      allow(WordData).to receive(:find_word).with('funny').and_return({'word' => 'funny', 'types' => ['adjective', 'noun']})
      events = [
        {'type' => 'button', 'button' => {'label' => 'run'}, 'timestamp' => 1444994881.001}, 
        {'type' => 'button', 'button' => {'label' => 'cat'}, 'timestamp' => 1444994881.002}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f'}, 'timestamp' => 1444994881.003},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u'}, 'timestamp' => 1444994881.004},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994881.005},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994881.006},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y'}, 'timestamp' => 1444994881.007}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      expect(s.data['events'].length).to eq(7)
      expect(s.data['events'][0]['button']['label']).to eq('run')
      expect(s.data['events'][0]['id']).to eq(1)
      expect(s.data['events'][1]['button']['label']).to eq('cat')
      expect(s.data['events'][1]['id']).to eq(2)
      expect(s.data['events'][2]['button']['label']).to eq('f')
      expect(s.data['events'][2]['id']).to eq(3)
      expect(s.data['events'][3]['button']['label']).to eq('u')
      expect(s.data['events'][3]['id']).to eq(4)
      expect(s.data['events'][4]['button']['label']).to eq('n')
      expect(s.data['events'][4]['id']).to eq(5)
      expect(s.data['events'][5]['button']['label']).to eq('n')
      expect(s.data['events'][5]['id']).to eq(6)
      expect(s.data['events'][6]['button']['label']).to eq('y')
      expect(s.data['events'][6]['id']).to eq(7)
      expect(s.data['events'][6]['modified_by_next']).to eq(false)
      expect(s.data['events'][6]['spelling']).to eq('funny')
      expect(s.data['events'][6]['parts_of_speech']).to eq({'word' => 'funny', 'types' => ['adjective', 'noun']})
    end
    
    it "should tally button labels it doesn't know how to classify" do
      RedisInit.default.del('missing_words')
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'button' => {'label' => 'runxlify', 'type' => 'speak'}, 'timestamp' => 1444994881.001},
        {'type' => 'button', 'button' => {'label' => 'runxlify', 'type' => 'speak'}, 'timestamp' => 1444994881.005},
        {'type' => 'button', 'button' => {'label' => 'run', 'type' => 'speak'}, 'timestamp' => 1444994881.005}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      words = RedisInit.default.hgetall('missing_words')
      expect(words).not_to eq(nil)
      expect(words['runxlify']).to eq("2")
      expect(words['runx']).to eq(nil)
    end
    
    it "should check for word_data on the completion action" do
      u = User.create
      d = Device.create(:user => u)
      allow(WordData).to receive(:find_words).and_return({
        'run' => {'word' => 'run', 'types' => ['verb', 'usu participle verb', 'intransitive verb', 'transitive verb']},
        'cat' => {'word' => 'cat', 'types' => ['noun', 'verb', 'usu participle verb']},
        'funny' => {'word' => 'funny', 'types' => ['adjective', 'noun']}
      })
      events = [
        {'type' => 'button', 'button' => {'label' => 'run', 'type' => 'speak'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'cat', 'type' => 'speak'}, 'timestamp' => 1444994882}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f', 'type' => 'speak'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u', 'type' => 'speak'}, 'timestamp' => 1444994884},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n', 'type' => 'speak'}, 'timestamp' => 1444994885},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n', 'type' => 'speak'}, 'timestamp' => 1444994886},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y', 'type' => 'speak'}, 'timestamp' => 1444994887},
        {'type' => 'button', 'button' => {'label' => ' ', 'vocalization' => ':space', 'completion' => 'funny', 'type' => 'speak'}, 'timestamp' => 1444994888}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      expect(s.data['events'].length).to eq(8)
      expect(s.data['events'][7]['modified_by_next']).to eq(nil)
      expect(s.data['events'][7]['spelling']).to eq(nil)
      expect(s.data['events'][7]['button']['completion']).to eq('funny')
      expect(s.data['events'][0]['parts_of_speech']).to eq({'word' => 'run', 'types' => ['verb', 'usu participle verb', 'intransitive verb', 'transitive verb']})
      expect(s.data['events'][1]['parts_of_speech']).to eq({'word' => 'cat', 'types' => ['noun', 'verb', 'usu participle verb']})
      expect(s.data['events'][2]['parts_of_speech']).to eq(nil)
      expect(s.data['events'][3]['parts_of_speech']).to eq(nil)
      expect(s.data['events'][4]['parts_of_speech']).to eq(nil)
      expect(s.data['events'][5]['parts_of_speech']).to eq(nil)
      expect(s.data['events'][6]['parts_of_speech']).to eq(nil)
      expect(s.data['events'][7]['parts_of_speech']).to eq({'word' => 'funny', 'types' => ['adjective', 'noun']})
    end
    
    it "should set the word_data type to 'other' for appropriate cases" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'button' => {'label' => 'ruxl', 'type' => 'speak'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f', 'type' => 'speak'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+z', 'type' => 'speak'}, 'timestamp' => 1444994884}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      expect(s.data['events'].length).to eq(3)
      expect(s.data['events'][0]['parts_of_speech']).to eq({'types' => ['other']})
      expect(s.data['events'][1]['parts_of_speech']).to eq(nil)
      expect(s.data['events'][2]['spelling']).to eq('fz')
      expect(s.data['events'][2]['parts_of_speech']).to eq({'types' => ['other']})
    end

    it "should generate highlight summary" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'highlighted' => true, 'button' => {'label' => 'ruxl', 'spoken' => true, 'type' => 'speak'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'spoken' => true, 'vocalization' => '+f', 'type' => 'speak'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'highlighted' => true, 'button' => {'label' => 'u', 'spoken' => true, 'vocalization' => '+z', 'type' => 'speak'}, 'timestamp' => 1444994884}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.highlighted).to eq(true)
      expect(s.data['highlight_summary']).to eq('ruxl u')
    end

    it "should properly mark session as highlighted" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'highlighted' => true, 'button' => {'label' => 'ruxl', 'spoken' => true, 'type' => 'speak'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'spoken' => true, 'vocalization' => '+f', 'type' => 'speak'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'highlighted' => true, 'button' => {'label' => 'u', 'spoken' => true, 'vocalization' => '+z', 'type' => 'speak'}, 'timestamp' => 1444994884}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.highlighted).to eq(true)
      expect(s.data['highlight_summary']).to eq('ruxl u')
    end

    it "should include ellipses in highlight summary when appropriate" do
      u = User.create
      d = Device.create(:user => u)
      events = [
        {'type' => 'button', 'highlighted' => true, 'button' => {'label' => 'ruxl', 'spoken' => true, 'type' => 'speak'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'spoken' => true, 'vocalization' => '+f', 'type' => 'speak'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'highlighted' => true, 'button' => {'label' => 'u', 'spoken' => true, 'vocalization' => '+z', 'type' => 'speak'}, 'timestamp' => 1444995884}
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.highlighted).to eq(true)
      expect(s.data['highlight_summary']).to eq('ruxl.. u')
    end

    it "should generate a profile summary" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({'profile' => {
        'id' => 'aaa'
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.log_type).to eq('profile')
      expect(s.profile_id).to eq('aaa')
    end

    it "should set profile_id for the appropriate profile-type logs" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({'profile' => {
        'id' => 'aaa'
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.log_type).to eq('profile')
      expect(s.profile_id).to eq('aaa')


      s = LogSession.process_new({'profile' => {
        'id' => 'aaa',
        'type' => 'funding'
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s.log_type).to eq('profile')
      expect(s.profile_id).to eq(nil)
    end
  end
  
  describe "generate_stats" do
    it "should generate reasonable defaults" do
      s = LogSession.new(:data => {})
      s.generate_stats
      expect(s.data['stats']).not_to eql(nil)
      expect(s.data['stats']['session_seconds']).to eql(0)
      expect(s.data['stats']['utterances']).to eql(0.0)
      expect(s.data['stats']['utterance_words']).to eql(0.0)
      expect(s.data['stats']['utterance_buttons']).to eql(0.0)
      expect(s.data['stats']['parts_of_speech']).to eql({})
    end
    
    it "should correctly tally up totals" do
      allow(WordData).to receive(:find_words).and_return({
        'radish' => {'word' => 'radish', 'types' => ['noun']},
        'friend' => {'word' => 'friend', 'types' => ['noun']},
        'cheese' => {'word' => 'cheese', 'types' => ['noun']}
      })
      s = LogSession.new
      s.started_at = 6.hours.ago
      time = s.started_at.to_i
      s.ended_at = s.started_at + 100
      s.data = {}
      s.data['events'] = [
        {'type' => 'utterance', 'utterance' => {'text' => 'I am a good person', 'buttons' => [{}, {}]}, 'timestamp' => time},
        {'type' => 'utterance', 'utterance' => {'text' => 'are we friends', 'buttons' => [{}, {}, {}]}, 'timestamp' => time + 10},
        {'type' => 'utterance', 'utterance' => {'text' => 'what is your name', 'buttons' => [{}]}, 'timestamp' => time + 25},
        {'type' => 'button', 'button' => {'button_id' => 1, 'board' => {'id' => '1'}, 'label' => 'radish', 'spoken' => true}, 'timestamp' => time + 38},
        {'type' => 'button', 'button' => {'button_id' => 2, 'board' => {'id' => '1'}, 'label' => 'friend', 'spoken' => true}, 'timestamp' => time + 57},
        {'type' => 'button', 'button' => {'button_id' => 1, 'board' => {'id' => '1'}, 'label' => 'radish', 'spoken' => true}, 'timestamp' => time + 59},
        {'type' => 'button', 'button' => {'button_id' => 3, 'board' => {'id' => '1'}, 'label' => 'cheese'}, 'timestamp' => time + 100}
      ]
      s.generate_defaults rescue nil
      s.generate_stats
      expect(s.data['stats']['session_seconds']).to eql(100)
      expect(s.data['stats']['utterances']).to eql(3.0)
      expect(s.data['stats']['utterance_words']).to eql(12.0)
      expect(s.data['stats']['utterance_buttons']).to eql(6.0)
      expect(s.data['stats']['all_button_counts'].map{|k, v| v['count']}.sum).to eql(4)
      expect(s.data['stats']['all_word_counts'].map{|k, v| k}).to eql(['radish', 'friend'])
      expect(s.data['stats']['all_word_counts'].map{|k, v| v}).to eql([2, 1])
      expect(s.data['stats']['all_board_counts'].keys.length).to eql(1)
      expect(s.data['stats']['all_board_counts'].map{|k, v| v['count']}.sum).to eql(4)
      expect(s.data['stats']['parts_of_speech']).to eql({
        'noun' => 3
      })
    end
    
    it "should generate sensor stats" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'volume' => 0.75, 'screen_brightness' => 0.50, 'ambient_light' => 200, 'orientation' => {'alpha' => 355, 'beta' => 10, 'gamma' => 45, 'layout' => 'landscape-primary'}, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'volume' => 0.54, 'screen_brightness' => 0.50, 'ambient_light' => 1000, 'orientation' => {'alpha' => 90, 'beta' => 5, 'gamma' => 0, 'layout' => 'landscape-secondary'}, 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      day = s1.data['stats']
      expect(day['utterances']).to eq(1)
      expect(day['volume']['average']).to eq(64.5)
      expect(day['volume']['total']).to eq(2)
      expect(day['volume']['histogram']['50-60']).to eq(1)
      expect(day['volume']['histogram']['70-80']).to eq(1)
      expect(day['screen_brightness']['average']).to eq(50)
      expect(day['screen_brightness']['total']).to eq(2)
      expect(day['screen_brightness']['histogram']['50-60']).to eq(2)
      expect(day['ambient_light']['average']).to eq(600)
      expect(day['ambient_light']['total']).to eq(2)
      expect(day['ambient_light']['histogram']['100-250']).to eq(1)
      expect(day['ambient_light']['histogram']['1000-15000']).to eq(1)
      expect(day['orientation']['total']).to eq(2)
      expect(day['orientation']['alpha']['total']).to eq(2)
      expect(day['orientation']['alpha']['average']).to eq(222.5)
      expect(day['orientation']['alpha']['histogram']['N']).to eq(1)
      expect(day['orientation']['alpha']['histogram']['E']).to eq(1)
      expect(day['orientation']['beta']['total']).to eq(2)
      expect(day['orientation']['beta']['average']).to eq(7.5)
      expect(day['orientation']['beta']['histogram']['-20-20']).to eq(2)
      expect(day['orientation']['gamma']['total']).to eq(2)
      expect(day['orientation']['gamma']['average']).to eq(22.5)
      expect(day['orientation']['gamma']['histogram']['-18-18']).to eq(1)
      expect(day['orientation']['gamma']['histogram']['18-54']).to eq(1)
    end
    
    it "should track modeling events correctly" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 3},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      day = s1.data['stats']
      expect(day['utterances']).to eq(1)
      expect(day['all_button_counts']['1::1_1']).to eq({'button_id' => 1, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 2})
      expect(day['all_word_counts']).to eq({'ok' => 4, 'go' => 2})
      expect(day['modeled_button_counts']['1::1_1']).to eq({'button_id' => 1, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 1})
      expect(day['modeled_word_counts']).to eq({'ok' => 2, 'go' => 1})
      expect(day['modeled_core_words']).to eq({'not_core' => 1})
      expect(day['modeled_parts_of_speech']).to eq({'other' => 1})
    end

    it 'should track modeling user id tallies' do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 3},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      day = s1.data['stats']
      expect(day['modeling_events']).to eq(1)
      expect(day['modeling_user_ids'][u.global_id]).to eq(1)
    end
    
    it "should not include modeling events in regular stats" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 3},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      day = s1.data['stats']
      expect(day['utterances']).to eq(1)
      expect(day['utterances']).to eq(1)
      expect(day['all_button_counts']['1::1_1']).to eq({'button_id' => 1, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 2})
      expect(day['all_word_counts']).to eq({'ok' => 4, 'go' => 2})
      expect(day['modeled_button_counts']['1::1_1']).to eq({'button_id' => 1, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 1})
      expect(day['modeled_word_counts']).to eq({'ok' => 2, 'go' => 1})
    end
    
    it "should persist modeling events back (as non-modeling events) to the modeler's account where possible" do
      # TODO: should we implement this??
    end

    it "should track button depths and travel distances" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'depth' => 0, 'percent_travel' => 0.2, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
        {'type' => 'button', 'button' => {'depth' => 1, 'percent_travel' => 0.5, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 3},
        {'type' => 'button', 'button' => {'depth' => 0, 'percent_travel' => 0.1, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'button', 'button' => {'depth' => 0, 'percent_travel' => 0.3, 'label' => 'ok go ok', 'button_id' => 2, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'button', 'button' => {'depth' => 1, 'percent_travel' => 0.4, 'label' => 'ok go ok', 'button_id' => 3, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'button', 'button' => {'depth' => 2, 'percent_travel' => 0.6, 'label' => 'ok go ok', 'button_id' => 4, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      day = s1.data['stats']
      expect(day['utterances']).to eq(1)
      expect(day['utterances']).to eq(1)
      expect(day['all_button_counts']['1::1_1']).to eq({'button_id' => 1, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 3, 'depth_sum' => 1, 'spoken' => true, 'full_travel_sum' => 1.5})
      expect(day['all_button_counts']['2::1_1']).to eq({'button_id' => 2, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 1, 'depth_sum' => 0, 'spoken' => true, 'full_travel_sum' => 0.3})
      expect(day['all_button_counts']['3::1_1']).to eq({'button_id' => 3, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 1, 'depth_sum' => 1, 'spoken' => true, 'full_travel_sum' => 1.2})
      expect(day['all_button_counts']['4::1_1']).to eq({'button_id' => 4, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 1, 'depth_sum' => 2, 'spoken' => true, 'full_travel_sum' => 2.3})
    end
  end

  describe "split_out_later_sessions" do
    it "should do nothing if events are close enough together" do
      s = LogSession.new
      s.data = {}
      time1 = 10.minutes.ago
      time2 = 8.minutes.ago
      time3 = 8.minutes.ago + 5
      time4 = 8.minutes.ago + 10
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => time1.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'geo' => ['2', '3'], 'timestamp' => time2.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}},
        {'geo' => ['2', '3'], 'timestamp' => time3.to_i, 'type' => 'button', 'button' => {'label' => 'corn', 'board' => {'id' => '1_1'}}},
        {'geo' => ['2', '3'], 'timestamp' => time4.to_i, 'type' => 'button', 'button' => {'label' => 'hippo', 'board' => {'id' => '1_1'}}}
      ]
      s.split_out_later_sessions
      Worker.process_queues
      expect(s.data['events'].length).to eq(4)
      expect(LogSession.count).to eq(0)
    end
    
    it "should schedule a background job to split the event if frd=false" do
      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})
      5.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'sad', 'board' => {'id' => '1_1'}}
      events << e.merge({})
      3.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      s.id = 1
      s.split_out_later_sessions
      expect(Worker.scheduled?(LogSession, :perform_action, {'id' => 1, 'method' => 'split_out_later_sessions', 'arguments' => [true]})).to eq(true)
    end
    
    it "should break out (possibly-multiple) sessions from the existing session based on the cutoff" do
      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})
      5.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'sad', 'board' => {'id' => '1_1'}}
      events << e.merge({})
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      s.split_out_later_sessions(true)
      Worker.process_queues
      expect(s.data['events'].length).to eq(4)
      expect(s.data['events'].map{|e| e['button']['label']}.uniq).to eq(['hat'])
      expect(LogSession.count).to eq(3)
      sessions = LogSession.all
      session1 = sessions.detect{|s| s.data['events'].length == 6 }
      session2 = sessions.detect{|s| s.data['events'].length == 5 }
      session3 = sessions.detect{|s| s.data['events'].length == 4 }
      expect(session1).not_to eq(nil)
      expect(session1.data['events'].map{|e| e['button']['label'] }.uniq).to eq(['bad'])
      expect(session2).not_to eq(nil)
      expect(session2.data['events'].map{|e| e['button']['label'] }.uniq).to eq(['sad'])
      expect(session3).not_to eq(nil)
      expect(session3.data['events'].map{|e| e['button']['label'] }.uniq).to eq(['hat'])
    end

    it "should create and deliver 'share' events" do
      u2 = User.create

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'share',
        'share' => {
          'utterance' => [{'label' => 'how'}, {'label' => 'do'}, {'label' => 'you'}, {'label' => 'do'}],
          'recipient_id' => u2.global_id
        }
      }
      
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(Utterance.count).to eq(1)
      utterance = Utterance.last
      expect(utterance.user).to eq(u)
      expect(Worker.scheduled?(Utterance, :perform_action, {'id' => utterance.id, 'method' => 'share_with', 'arguments' => [{'user_id' => u2.global_id, 'reply_id' => nil, 'text_only' => nil}, u.global_id]})).to eq(true)
      Worker.process_queues
      expect(LogSession.count).to eq(2)
    end

    it "should create utterance for the specified user" do
      u2 = User.create
      Device.create(user: u2)
      u = User.create
      User.link_supervisor_to_user(u, u2)

      events = []
      e = {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'user_id' => u2.global_id,
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'share',
        'share' => {
          'utterance' => [{'label' => 'how'}, {'label' => 'do'}, {'label' => 'you'}, {'label' => 'do'}],
          'recipient_id' => u2.global_id
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(Utterance.count).to eq(1)
      utterance = Utterance.last
      expect(utterance.user).to eq(u2)
      expect(Worker.scheduled?(Utterance, :perform_action, {'id' => utterance.id, 'method' => 'share_with', 'arguments' => [{'user_id' => u2.global_id, 'reply_id' => nil, 'text_only' => nil}, u2.global_id]})).to eq(true)
      Worker.process_queues
      expect(LogSession.count).to eq(3)
    end

    it "should not create an utterance if the specified user isn't accessible" do
      u2 = User.create
      Device.create(user: u2)
      u = User.create
      
      events = []
      e = {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'user_id' => u2.global_id,
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'share',
        'share' => {
          'utterance' => [{'label' => 'how'}, {'label' => 'do'}, {'label' => 'you'}, {'label' => 'do'}],
          'recipient_id' => u2.global_id
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(Utterance.count).to eq(0)
      Worker.process_queues
      expect(LogSession.count).to eq(2)
    end

    it "should not deliver 'share' events more than once, even if processed more than once" do
      u = User.create
      cutoff = 12.weeks.ago.to_i

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => cutoff, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => cutoff + User.default_log_session_duration + 101,
        'type' => 'share',
        'share' => {
          'utterance' => [{'label' => 'how'}, {'label' => 'do'}, {'label' => 'you'}, {'label' => 'do'}],
          'message_uid' => 'asdf',
          'recipient_id' => u.global_id
        }
      }
      events << {
        'timestamp' => cutoff + User.default_log_session_duration + 103,
        'type' => 'share',
        'share' => {
          'utterance' => [{'label' => 'how'}, {'label' => 'do'}, {'label' => 'you'}, {'label' => 'do'}],
          'message_uid' => 'asdf',
          'recipient_id' => u.global_id
        }
      }
      
      d = Device.create(user: u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(Utterance.count).to eq(1)
      utterance = Utterance.last
      expect(utterance.nonce).to eq(GoSecure.sha512('asdf', 'utterance_message_uid'))
      expect(utterance.user).to eq(u)
      expect(Worker.scheduled?(Utterance, :perform_action, {'id' => utterance.id, 'method' => 'share_with', 'arguments' => [{'user_id' => u.global_id, 'reply_id' => nil, 'text_only' => nil}, u.global_id]})).to eq(true)

      Worker.process_queues
      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['note', 'session', 'session'])
      expect(LogSession.find_by(log_type: 'note').started_at).to eq(Time.at(cutoff + User.default_log_session_duration + 101))

      actions = Worker.scheduled_actions('priority')
      expect(actions.select{|a| a['args'][0] == 'Utterance' && a['args'][2]['method'] == 'deliver_to' }.length).to eq(1)
    end

    it 'should handle alert events' do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'alert',
        'user_id' => u2.global_id,
        'alert' => {
          'a' => 1
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(Worker.scheduled?(LogSession, :perform_action, {'method' => 'handle_alert', 'arguments' => [{'a' => 1, 'author_id' => u.global_id}]})).to eq(true)
    end

    it 'should handle eval events' do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'a' => 1
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
    end

    it "should store evals to the correct user" do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'a' => 1
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log = LogSession.find_by(log_type: 'eval')
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
    end

    it "should not duplicate resumed evals" do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'a' => 1,
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)

      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log = LogSession.find_by(log_type: 'eval')
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'a' => 1})

      events = [{
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'b' => 1,
          'log_session_id' => log.global_id
        }
      }]
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      s.split_out_later_sessions(true)
      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log.reload
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'b' => 1, 'log_session_id' => log.global_id})
    end

    it "should record log errors" do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end

      events << {
        'timestamp' => 12.weeks.ago.to_i + 30,
        'type' => 'error',
        'error' => {
          'type' => 'bad one',
          'a' => 1,
          'b' => 2
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)
      ae = AuditEvent.last
      expect(ae).to_not eq(nil)
      expect(ae.event_type).to eq('log_error')
      expect(ae.data).to eq({"a"=>1, "b"=>2, "type"=>"bad one"})
    end

    it "should not allow overwriting a non-eval log" do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'a' => 1,
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)

      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log = LogSession.find_by(log_type: 'eval')
      ses = LogSession.find_by(log_type: 'session')
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'a' => 1})

      events = [{
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'b' => 1,
          'log_session_id' => ses.global_id
        }
      }]
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      s.split_out_later_sessions(true)
      expect(LogSession.count).to eq(4)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'eval', 'session', 'session'])
      log.reload
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'a' => 1})
      log2 = LogSession.last
      expect(log2.user).to eq(u2)
      expect(log2.author).to eq(u)
      expect(log2.data['eval']).to eq({'b' => 1, 'log_session_id' => ses.global_id})
    end

    it "should create a new copy if the eval was resumed by a different author" do
      u2 = User.create
      u3 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)
      User.link_supervisor_to_user(u3, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'a' => 1,
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)

      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log = LogSession.find_by(log_type: 'eval')
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'a' => 1})

      events = [{
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'b' => 1,
          'log_session_id' => log.global_id
        }
      }]
      s = LogSession.new(:data => {'events' => events}, :user => u3, :author => u3, :device => d)
      s.split_out_later_sessions(true)
      expect(LogSession.count).to eq(4)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'eval', 'session', 'session'])
      log.reload
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'a' => 1})
      log2 = LogSession.last
      expect(log2.user).to eq(u2)
      expect(log2.author).to eq(u3)
      expect(log2.data['eval']).to eq({'b' => 1, 'log_session_id' => log.global_id})
    end

    it "should process resumed evals by ref_id" do
      u2 = User.create
      u = User.create
      User.link_supervisor_to_user(u, u2, nil, true)

      events = []
      e = {'geo' => ['1', '2'], 'timestamp' => 12.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}}
      4.times do |i|
        e['timestamp'] += 30
        events << e.merge({})
      end
      e['timestamp'] += User.default_log_session_duration + 100
      e['button'] = {'label' => 'bad', 'board' => {'id' => '1_1'}}
      events << e.merge({})

      ref_id = "tmp.#{Time.now.to_i * 1000}.0.232523523"
      events << {
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'a' => 1,
          'ref_id' => ref_id
        }
      }
      
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      expect(LogSession.count).to eq(0)

      s.split_out_later_sessions(true)

      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log = LogSession.find_by(log_type: 'eval')
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'a' => 1, 'ref_id' => ref_id})

      events = [{
        'timestamp' => User.default_log_session_duration + 101,
        'type' => 'eval',
        'user_id' => u2.global_id,
        'eval' => {
          'b' => 1,
          'ref_id' => ref_id
        }
      }]
      s = LogSession.new(:data => {'events' => events}, :user => u, :author => u, :device => d)
      s.split_out_later_sessions(true)
      expect(LogSession.count).to eq(3)
      expect(LogSession.all.map(&:log_type).sort).to eq(['eval', 'session', 'session'])
      log.reload
      expect(log.user).to eq(u2)
      expect(log.author).to eq(u)
      expect(log.data['eval']).to eq({'b' => 1, 'ref_id' => ref_id})
    end
  end

  describe "handle_alert" do
    it "should return without valid user and author" do
      expect(LogSession.handle_alert(nil)).to eq(false)
      expect(LogSession.handle_alert({'user_id' => 'asdf', 'author_id' => 'qwer'})).to eq(false)
      u = User.create
      expect(LogSession.handle_alert({'user_id' => u.global_id, 'author_id' => 'asdf'})).to eq(false)
      expect(LogSession.handle_alert({'user_id' => 'asdf', 'author_id' => u.global_id})).to eq(false)
    end

    it "should return without valid record" do
      u = User.create
      expect(LogSession.handle_alert({'user_id' => u.global_id, 'author_id' => u.global_id, 'alert_id' => 'bacon'})).to eq(false)
    end
    
    it "should return with invalid log record" do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u, log_type: 'session')
      expect(LogSession.handle_alert({'user_id' => u.global_id, 'author_id' => u.global_id, 'alert_id' => Webhook.get_record_code(s)})).to eq(false)
    end

    it "should return with mismatched user" do
      u = User.create
      u2 = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u, log_type: 'note', data: {'notify_user' => true, 'note' => {'text' => 'asdf'}})
      expect(LogSession.handle_alert({'user_id' => u2.global_id, 'author_id' => u.global_id, 'alert_id' => Webhook.get_record_code(s)})).to eq(false)
    end

    it "should clear valid alert" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u2, log_type: 'note', data: {'notify_user' => true, 'note' => {'text' => 'asdf'}})
      expect(s.reload.data['cleared']).to eq(nil)
      expect(LogSession.handle_alert({'user_id' => u.global_id, 'author_id' => u2.global_id, 'alert_id' => Webhook.get_record_code(s), 'cleared' => true})).to eq(true)
      expect(s.reload.data['cleared']).to eq(true)
    end

    it "should mark valid alert as read" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u2, log_type: 'note', data: {'notify_user' => true, 'unread' => true, 'note' => {'text' => 'asdf'}})
      expect(s.reload.data['unread']).to eq(true)
      expect(LogSession.handle_alert({'user_id' => u.global_id, 'author_id' => u2.global_id, 'alert_id' => Webhook.get_record_code(s), 'read' => true})).to eq(true)
      expect(s.reload.data['unread']).to eq(nil)
      expect(s.reload.data['read_receipt']).to be > 5.seconds.ago.to_i
    end
  end

  describe "message" do
    it "should require needed parameters" do
      expect(LogSession.message({})).to eq(false)
    end

    it "should create a reply message" do
      u = User.create
      d = Device.create(user: u)
      res = LogSession.message(recipient: u, sender: u, message: 'hello myself')
      expect(res).to_not eq(nil)
      expect(res.log_type).to eq('note')
      expect(res.data['note']['text']).to eq('hello myself')
    end

    it "should support session replies" do
      u1 = User.create
      u2 = User.create
      d = Device.create(user: u1)
      d2 = Device.create(user: u2)
      res = LogSession.message(recipient: u2, sender: u1, message: 'hello you')
      expect(res).to_not eq(nil)
      expect(res.log_type).to eq('note')
      expect(res.data['note']['text']).to eq('hello you')
      res2 = LogSession.message(recipient: u1, sender: u2, reply_id: res.global_id, message: 'hello back')
      expect(res2).to_not eq(nil)
      expect(res2.log_type).to eq('note')
      expect(res2.data['note']['text']).to eq('hello back')
      expect(res2.data['note']['prior']).to eq('hello you')
    end

    it "should support utterance replies" do
      u1 = User.create
      u2 = User.create
      d = Device.create(user: u1)
      d2 = Device.create(user: u2)
      u = Utterance.process_new({
        button_list: [{'label' => 'bacon'}, {'label' => 'stinks'}]
      }, {user: u1})
      res2 = LogSession.message(recipient: u1, sender: u2, reply_id: u.global_id, message: 'hello back')
      expect(res2).to_not eq(nil)
      expect(res2.log_type).to eq('note')
      expect(res2.data['note']['text']).to eq('hello back')
      expect(res2.data['note']['prior']).to eq('bacon stinks')
    end

    it "should record the author contact info if generated by a user contact" do
      u1 = User.create
      d = Device.create(user: u1)
      u1.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'name' => 'Fred', 'contact' => '8123123'}}]})
      contact_hash = u1.settings['contacts'][0]['hash']
      contact_id = "#{u1.global_id}x#{contact_hash}"
      res = LogSession.message({
        recipient: u1,
        sender: u1,
        sender_id: contact_id,
        message: "any better"
      })
      expect(res).to_not eq(nil)
      expect(res.log_type).to eq('note')
      expect(res.data['author_contact']['name']).to eq('Fred')
      expect(res.data['note']['text']).to eq('any better')
    end

    it "should generate a summary with the correct (contact) name" do
      u1 = User.create
      d = Device.create(user: u1)
      u1.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'name' => 'Fred', 'contact' => '8123123'}}]})
      contact_hash = u1.settings['contacts'][0]['hash']
      contact_id = "#{u1.global_id}x#{contact_hash}"
      res = LogSession.message({
        recipient: u1,
        sender: u1,
        sender_id: contact_id,
        message: "any better"
      })
      expect(res).to_not eq(nil)
      expect(res.log_type).to eq('note')
      expect(res.data['event_summary']).to eq('Note by Fred: any better')
    end
  end

  describe "find_reply" do
    it "should return nil on invalid record" do
      expect(LogSession.find_reply(nil, nil, nil)).to eq(nil)
      expect(LogSession.find_reply('asdf', nil, nil)).to eq(nil)
    end

    it 'should return nil if the reply object is not connected to the user somehow' do
      u = User.create
      u2 = User.create
      u3 = User.create
      u.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'name' => 'Stacy', 'contact' => '12345'}}]})
      d = Device.create(user: u)
      note = LogSession.create(log_type: 'note', user: u2, author: u2, device: d, data: {'note' => {'text' => 'asdf'}})
      expect(LogSession.find_reply(note.global_id, u, u)).to eq(nil)
      expect(LogSession.find_reply(note.global_id, nil, nil)).to_not eq(nil)
      expect(LogSession.find_reply(note.global_id, u, nil)).to_not eq(nil)
      expect(LogSession.find_reply(note.global_id, u, u2)).to_not eq(nil)
    end

    it "should return the record information" do
      u = User.create
      u.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'name' => 'Stacy', 'contact' => '12345'}}]})
      d = Device.create(user: u)
      note = LogSession.create(log_type: 'note', user: u, author: u, device: d, data: {'note' => {'text' => 'asdf'}})
      session = LogSession.create(log_type: 'session', user: u, author: u, device: d)
      utterance = Utterance.create(user: u, data: {'sentence' => 'something cool'})
      contact_note = LogSession.create(log_type: 'note', user: u, author: u, device: d, data: {'author_contact' => {'name' => 'Stace'}, 'note' => {'text' => 'asdf'}})
      expect(LogSession.find_reply(note.global_id, nil, nil)).to eq({
        :message => 'asdf',
        :contact => {
          'id' => u.global_id,
          'image_url' => u.generated_avatar_url,
          'name' => u.user_name
        },
        :record_code => Webhook.get_record_code(note)
      })
      expect(LogSession.find_reply(Webhook.get_record_code(note), nil, nil)).to eq({
        :message => 'asdf',
        :contact => {
          'id' => u.global_id,
          'image_url' => u.generated_avatar_url,
          'name' => u.user_name
        },
        :record_code => Webhook.get_record_code(note)
      })
      expect(LogSession.find_reply(Webhook.get_record_code(session), nil, nil)).to eq(nil)
      expect(LogSession.find_reply(utterance.global_id, nil, nil)).to eq({
        :message => 'something cool',
        :contact => {
          'id' => u.global_id,
          'image_url' => u.generated_avatar_url,
          'name' => u.user_name
        },
        :record_code => Webhook.get_record_code(utterance)
      })
      expect(LogSession.find_reply(contact_note.global_id, nil, nil)).to eq({
        :message => 'asdf',
        :contact => {'name' => 'Stace'},
        :record_code => Webhook.get_record_code(contact_note)
      })
    end
  end

  describe "process_as_follow_on" do
    before(:each) { JobStash.delete_all }
    it "should append to the latest log if still active" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(JobStash.where(user_id: nil).count).to eq(1)
      expect(JobStash.where(user_id: u.id).count).to eq(0)
      Worker.process_queues
      expect(JobStash.where(user_id: nil).count).to eq(0)
      expect(JobStash.where(user_id: u.id).count).to eq(1)
      
      s.reload
      expect(s.data['events'].length).to eq(4)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow', 'chicken', 'radish'])
      expect(LogSession.count).to eq(1)
    end

    it "should force unique ids on all event entries" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'id' => 1, 'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'id' => 2, 'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      
      LogSession.process_as_follow_on({
        'events' => [
          {'id' => 1, 'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'id' => 2, 'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(JobStash.where(user_id: nil).count).to eq(1)
      expect(JobStash.where(user_id: u.id).count).to eq(0)
      Worker.process_queues
      expect(JobStash.where(user_id: nil).count).to eq(0)
      expect(JobStash.where(user_id: u.id).count).to eq(1)
      
      s.reload
      expect(s.data['events'].length).to eq(4)
      expect(s.data['events'].map{|e| e['id']}).to eq([1,2,3,4])
      expect(LogSession.count).to eq(1)
    end

    it "should stash the params data to the db" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(JobStash.where(user_id: nil).count).to eq(1)
      expect(JobStash.where(user_id: u.id).count).to eq(0)
      Worker.process_queues
      expect(JobStash.where(user_id: nil).count).to eq(0)
      expect(JobStash.where(user_id: u.id).count).to eq(1)
      
      s.reload
      expect(s.data['events'].length).to eq(4)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow', 'chicken', 'radish'])
      expect(LogSession.count).to eq(1)
    end    
    
    it "should create a new log if no active log" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:user => u, :device => d, :author => u)
      s.data = {}
      s.data['events'] = [
        {'geo' => ['1', '2'], 'timestamp' => 3.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'geo' => ['2', '3'], 'timestamp' => (3.hours.ago.to_i + 10), 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      Worker.process_queues
      
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      expect(LogSession.count).to eq(2)
      expect(LogSession.last.data['events'].length).to eq(2)
      expect(LogSession.last.data['events'].map{|e| e['button']['label'] }).to eq(['chicken', 'radish'])
    end
    
    it "should create a new log if there was a long delay" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 90.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 89.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      Worker.process_queues
      
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      expect(LogSession.count).to eq(2)
      s2 = LogSession.last
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['button']['label'] }).to eq(['chicken', 'radish'])
    end

    it "should create a new log if the last log wasn't a session type" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {'assessment' => {
        'totals' => {
          'correct' => 5,
          'incorrect' => 4
        }
      }}
      s.save
      s.reload
      expect(s.log_type).to eq('assessment')
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      Worker.process_queues
      
      s.reload
      expect(LogSession.count).to eq(2)
      s2 = LogSession.last
      expect(s.data['events'].length).to eq(0)
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['button']['label'] }).to eq(['chicken', 'radish'])
    end
    
    it "should not create a new log if the user_id changed and the author is not allowed to log for that user" do
      u = User.create
      d = Device.create(:user => u)
      u2 = User.create
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 9.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      expect { Worker.process_queues }.to raise_error("no valid events to process out of 2 #{u2.global_id}")
      
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.user_id).to eq(u.id)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      expect(LogSession.count).to eq(1)

      Worker.process_queues
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.user_id).to eq(u.id)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      expect(LogSession.count).to eq(1)
    end
    
    it "should create a new log if the user_id changed and allowed" do
      u = User.create
      d = Device.create(:user => u)
      u2 = User.create
      User.link_supervisor_to_user(u, u2)
      u.reload
      u2.reload
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 9.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s.reload
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow'])
      
      LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'paste', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {:device => d, :author => u, :user => u})
      Worker.process_queues
      Worker.process_queues
      
      s.reload
      expect(s.data['events'].length).to eq(3)
      expect(s.user_id).to eq(u.id)
      expect(s.data['events'].map{|e| e['button']['label'] }).to eq(['hat', 'cow', 'paste'])
      expect(LogSession.count).to eq(2)
      s2 = LogSession.last
      expect(s2.user_id).to eq(u2.id)
      expect(s2.author_id).to eq(u.id)
      expect(s2.device_id).to eq(d.id)
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['button']['label'] }).to eq(['chicken', 'radish'])
    end
    
    it "should process a daily_use-type session" do
      u = User.create
      d = Device.create(:user => u)
      res = LogSession.process_as_follow_on({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-01', 'active' => true, 'activity_level' => 4},
          {'date' => '2016-01-03', 'active' => false, 'activity_level' => 0}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(res.log_type).to eq('daily_use')
      expect(res.data['days']).to eq({
        '2016-01-01' => {'date' => '2016-01-01', 'active' => true, 'activity_level' => 4},
        '2016-01-03' => {'date' => '2016-01-03', 'active' => false, 'activity_level' => 0}
      })
      res2 = LogSession.process_as_follow_on({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-03', 'active' => true, 'activity_level' => 2},
          {'date' => '2016-01-05', 'active' => false}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(res2).to eq(res)
      expect(res2.log_type).to eq('daily_use')
      expect(res2.data['days']).to eq({
        '2016-01-01' => {'date' => '2016-01-01', 'active' => true, 'activity_level' => 4},
        '2016-01-03' => {'date' => '2016-01-03', 'active' => true, 'activity_level' => 2},
        '2016-01-05' => {'date' => '2016-01-05', 'active' => false, 'activity_level' => nil}
      })
    end
    
    it "should put log events on the right user, even if the wrong user is specified first" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2)
      u1.reload
      u2.reload
      d = Device.create(:user => u1)
      s = LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'paste', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 7.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'together', 'board' => {'id' => '1_1'}}},
          {'user_id' => u1.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u1.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {device: d, author: u1, user: u1})
      
      expect(s.user).to eq(nil)
      Worker.process_queues
      Worker.process_queues
      
      s1 = LogSession.where(:user_id => u1.id).last
      expect(s1).to_not eq(nil)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.user_id).to eq(u1.id)
      expect(s1.author_id).to eq(u1.id)
      expect(s1.device_id).to eq(d.id)
      expect(s1.data['events'].map{|e| e['button']['label'] }).to eq(['chicken', 'radish'])
      expect(LogSession.count).to eq(2)
      s2 = LogSession.where(:user_id => u2.id).last
      expect(s2).to_not eq(nil)
      expect(s2.user_id).to eq(u2.id)
      expect(s2.author_id).to eq(u1.id)
      expect(s2.device_id).to eq(d.id)
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['button']['label'] }).to eq(['paste', 'together'])
    end
    
    it "should filter to only events for users the author has supervise permissions for" do
      u1 = User.create
      u2 = User.create
      d = Device.create(:user => u1)
      s = LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'paste', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 7.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'together', 'board' => {'id' => '1_1'}}},
          {'user_id' => u1.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u1.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {device: d, author: u1, user: u1})
      
      expect(s.user).to eq(nil)
      Worker.process_queues
      Worker.process_queues
      
      s1 = LogSession.where(:user_id => u1.id).last
      expect(s1).to_not eq(nil)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.user_id).to eq(u1.id)
      expect(s1.author_id).to eq(u1.id)
      expect(s1.device_id).to eq(d.id)
      expect(s1.data['events'].map{|e| e['button']['label'] }).to eq(['chicken', 'radish'])
      expect(LogSession.count).to eq(1)
      s2 = LogSession.where(:user_id => u2.id).last
      expect(s2).to eq(nil)
    end
    
    it "should error if all events are filtered out" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      d = Device.create(:user => u1)
      s = LogSession.process_as_follow_on({
        'events' => [
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'paste', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 7.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'together', 'board' => {'id' => '1_1'}}},
          {'user_id' => u3.global_id, 'geo' => ['2', '3'], 'timestamp' => 3.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'chicken', 'board' => {'id' => '1_1'}}},
          {'user_id' => u3.global_id, 'geo' => ['2', '3'], 'timestamp' => 2.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'radish', 'board' => {'id' => '1_1'}}}
        ]
      }, {device: d, author: u1, user: u1})
      
      expect(s.user).to eq(nil)
      expect { Worker.process_queues }.to raise_error("no valid events to process out of 4 #{u2.global_id},#{u3.global_id}")
    end

    it "should create a journal log if specified" do
      u1 = User.create
      d = Device.create(:user => u1)
      s = LogSession.process_as_follow_on({
        'type' => 'journal',
        'vocalization' => [{'label' => 'what'}, {'label' => 'now'}],
        'category' => 'journal'
      }, {:user => u1, :device => d, :author => u1})
      
      Worker.process_queues
      s2 = LogSession.last
      expect(s2.log_type).to eq('journal')
      expect(s2.data['journal']['timestamp']).to be > 10.seconds.ago.to_i
      expect(s2.data['journal']['sentence']).to eq('what now')
    end

    it "should create a note entry" do
      u1 = User.create
      d = Device.create(:user => u1)
      s = LogSession.process_as_follow_on({
        'type' => 'note',
        'note' => {'text' => 'bacon', 'timestamp' => Time.parse('2020-01-01').to_i},
      }, {:user => u1, :device => d, :author => u1})
      
      Worker.process_queues
      s2 = LogSession.last
      expect(s2.log_type).to eq('note')
      expect(s2.started_at).to eq(Time.parse('2020-01-01'))
      expect(s2.data['note']['text']).to eq('bacon')
    end

    it "should add a manual log entry when submitted with a note" do
      allow(WordData).to receive(:find_words).and_return({
        'good' => {'word' => 'good', 'types' => ['adjective', 'interjection', 'noun']},
        'bad' => {'word' => 'bad', 'types' => ['adjective', 'noun', 'adverb', 'verb', 'usu participle verb']},
        'ugly' => {'word' => 'ugly', 'types' => ['adjective']}
      })
      u1 = User.create
      d = Device.create(:user => u1)
      s = LogSession.process_as_follow_on({
        'type' => 'note',
        'note' => {'text' => 'bacon', 'log_events_string' => "good\nbad\nugly", 'timestamp' => Time.parse('2020-01-01').to_i},
      }, {:user => u1, :device => d, :author => u1})
      s2 = LogSession.last
      expect(s2.log_type).to eq('note')
      expect(s2.started_at).to eq(Time.parse('2020-01-01'))
      expect(s2.data['note']['text']).to eq('bacon')
      expect(s2.data['note']['log_events_string']).to eq(nil)
      
      Worker.process_queues
      s1 = LogSession.last
      expect(s1.log_type).to eq('session')
      expect(s1.started_at).to eq(Time.parse('2020-01-01') - 25)
      expect(s1.data['events']).to eq([
        {"button"=>
          {
            "button_id"=>"e1577861975",
            "label"=>"good",
            "spoken"=>true,
            "type"=>"speak"
          },
          "core_word"=>true,
          "id"=>1,
          "parts_of_speech"=>
          {"types"=>["adjective", "interjection", "noun"], "word"=>"good"},
          "timestamp"=>1577861975.0,
          "type"=>"button",
          "user_id"=>u1.global_id
        },
        {"button"=>
          {
            "button_id"=>"e1577861980",
            "label"=>"bad",
            "spoken"=>true,
            "type"=>"speak"
          },
          "core_word"=>true,
          "id"=>2,
          "parts_of_speech"=>
          {"types"=>["adjective", "noun", "adverb", "verb", "usu participle verb"],
            "word"=>"bad"},
          "timestamp"=>1577861980.0,
          "type"=>"button",
          "user_id"=>u1.global_id
        },
        {"button"=>
          {
            "button_id"=>"e1577861985",
            "label"=>"ugly",
            "spoken"=>true,
            "type"=>"speak"
          },
          "core_word"=>true,
          "id"=>3,
          "parts_of_speech"=>{"types"=>["adjective"], "word"=>"ugly"},
          "timestamp"=>1577861985.0,
          "type"=>"button",
          "user_id"=>u1.global_id
        }
      ])
    end
  end

  describe "process_params" do
    it "should require user, author and device" do
      s = LogSession.new
      expect { s.process_params({}, {}) }.to raise_error("user required")
      u = User.create
      expect { s.process_params({}, {:user => u}) }.to raise_error("author required")
      expect { s.process_params({}, {:user => u, :author => u}) }.to raise_error("device required")
      d = Device.create(:user => u)
      expect { s.process_params({}, {:user => u, :author => u, :device => d}) }.to_not raise_error
    end
    it "should ignore unsent parameters" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new
      s.process_params({}, {:user => u, :author => u, :device => d})
      expect(s.data['events']).to eq(nil)
      expect(s.data['note']).to eq(nil)
      expect(s.data['ip_address']).to eq(nil)
    end
    
    it "should update attributes" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new
      s.process_params({
        'events' => [{'timestamp' => 123}]
      }, {:user => u, :author => u, :device => d})
      expect(s.data['events']).to eq([{'timestamp' => 123, 'ip_address' => nil, 'id' => 1}])
      expect(s.data['note']).to eq(nil)
      expect(s.data['ip_address']).to eq(nil)
    end
    
    it "should append to, not replace events list" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:data => {'events' => [{'timestamp' => 122}]})
      s.process_params({
        'events' => [{'timestamp' => 123}]
      }, {:user => u, :author => u, :device => d})
      expect(s.data['events']).to eq([{'timestamp' => 122}, {'timestamp' => 123, 'ip_address' => nil, 'id' => 1}])
    end
    
    it "should restrict some data to only be non-user params settable" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:user => u, :author => u, :device => d)
      s.process_params({
        'ip_address' => '8.8.8.8',
        'device' => {},
        'user' => {},
        'events' => [{}],
        'author' => {}
      }, {})
      expect(s.data['events'].length).to eq(1)
      expect(s.data['events'][0]['ip_address']).to eq(nil)
      expect(s.data['ip_address']).to eq(nil)
      expect(s.device).to eq(d)
      expect(s.user).to eq(u)
      expect(s.author).to eq(u)

      d = Device.new
      u = User.new
      s.process_params({'events' => [{}]}, {
        :ip_address => '8.8.8.8',
        :device => d,
        :user => u,
        :author => u
      })
      expect(s.data['events'].length).to eq(2)
      expect(s.data['events'][1]['ip_address']).to eq('8.8.8.8')
      s.save
      expect(s.data['ip_address']).to eq('0000:0000:0000:0000:0000:ffff:0808:0808')
      expect(s.user).to eq(u)
      expect(s.author).to eq(u)
      expect(s.device).to eq(d)
    end

    it "should process standalone notes" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => true
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.instance_variable_get('@pushed_message')).to eq(true)
    end
    
    it "should deliver notes to only the user if specified" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => 'user_only'
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['notify_user']).to eq(true)
      expect(s.data['notify_user_only']).to eq(true)
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.instance_variable_get('@pushed_message')).to eq(true)
    end

    it "should exclude specific supervisors if specified" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => 'true',
        'notify_exclude_ids' => [u2.global_id]
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['notify_exclude_ids']).to eq([u2.global_id])
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.instance_variable_get('@pushed_message')).to eq(true)
    end

    it "should include status-check footer if specified" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => 'true',
        'include_status_footer' => true
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['include_status_footer']).to eq(true)
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.instance_variable_get('@pushed_message')).to eq(true)
    end

    it "should mark user-delivered messages as unread alerts" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => 'user_only'
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['notify_user']).to eq(true)
      expect(s.data['notify_user_only']).to eq(true)
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.instance_variable_get('@pushed_message')).to eq(true)
      expect(u.reload.settings['unread_alerts']).to eq(nil)
      Worker.process_queues
      expect(u.reload.settings['unread_alerts']).to eq(1)
    end

    it "should include an alert for the user if notify set to include_user" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => 'include_user'
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['notify_user']).to eq(true)
      expect(s.data['notify_user_only']).to eq(nil)
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.instance_variable_get('@pushed_message')).to eq(true)
      expect(u.reload.settings['unread_alerts']).to eq(nil)
      Worker.process_queues
      expect(u.reload.settings['unread_alerts']).to eq(1)
    end
    
    it "should process standalone assessments" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'assessment' => {
          'description' => 'Simple eval',
          'totals' => {
            'correct' => 5,
            'incorrect' => 6
          },
          'tallies' => [
            {'correct' => true, 'timestamp' => 1431461182},
            {'correct' => false, 'timestamp' => 1431461185},
            {'correct' => false, 'timestamp' => 1431461189},
            {'correct' => true, 'timestamp' => 1431461193},
            {'correct' => true, 'timestamp' => 1431461198},
            {'correct' => true, 'timestamp' => 1431461204}
          ]
        }
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '2.3.4.5'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461204)
      expect(s.log_type).to eq('assessment')
      expect(s.data['event_summary']).to eq("Assessment by #{u.user_name}: Simple eval (5 correct, 6 incorrect, 45.5%)")
      expect(s.data['stats']['total_correct']).to eq(5)
      expect(s.data['stats']['total_incorrect']).to eq(6)
      expect(s.data['stats']['recorded_correct']).to eq(4)
      expect(s.data['stats']['recorded_incorrect']).to eq(2)
      expect(s.data['stats']['longest_correct_streak']).to eq(3)
      expect(s.data['stats']['longest_incorrect_streak']).to eq(2)
      expect(s.data['assessment']['manual']).to eq(true)
      expect(s.data['assessment']['automatic']).to eq(false)
    end

    it "should pull out embedded note events" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u)
      User.link_supervisor_to_user(u, u2, nil, true)
      s = LogSession.process_new({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461204, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 1431461206, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461207, 'type' => 'note', 'note' => {'note' => {'text' => 'ok cool', 'timestamp' => 1431461208}, 'notify' => false}}
        ]
      }, {:user => u, :author => u, :device => d})
      
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(3)
      expect(LogSession.count).to eq(1)
      Worker.process_queues
      s.reload
      expect(LogSession.count).to eq(2)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(2)
      s2 = LogSession.last
      expect(s2).not_to eq(s)
      expect(s2.user).to eq(u2)
      expect(s2.log_type).to eq('note')
      expect(s2.started_at.to_i).to eq(1431461208)
      expect(s2.ended_at.to_i).to eq(1431461208)
      expect(s2.data['note']['text']).to eq('ok cool')
    end

    it "should attach referenced user if specified and allowed" do
      u = User.create
      u2 = User.create
      u3 = User.create
      d = Device.create(:user => u)
      User.link_supervisor_to_user(u, u2, nil, true)
      s = LogSession.process_new({
        'events' => [
          {'user_id' => u.global_id, 'referenced_user_id' => u2.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461204, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'referenced_user_id' => u3.global_id, 'geo' => ['2', '3'], 'timestamp' => 1431461206, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}},
        ]
      }, {:user => u, :author => u, :device => d})
      
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(2)
      expect(LogSession.count).to eq(1)
      
      expect(s.data['events'][0]['referenced_user_id']).to eq(u2.global_id)
      expect(s.data['events'][1]['referenced_user_id']).to eq(nil)
    end

    it "should stash events as they're recorded for the first time" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'events' => [
          {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461204, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 1431461206, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}},
        ]
      }, {:user => u, :author => u, :device => d})
      
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(2)
      expect(LogSession.count).to eq(1)
      expect(JobStash.events_for(s).length).to eq(2)
      
    end

    it "should not attach referenced user if not valid" do
      u = User.create
      u2 = User.create
      u3 = User.create
      d = Device.create(:user => u)
      User.link_supervisor_to_user(u, u2, nil, true)
      s = LogSession.process_new({
        'events' => [
          {'user_id' => u.global_id, 'referenced_user_id' => 'asdf', 'geo' => ['1', '2'], 'timestamp' => 1431461204, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'referenced_user_id' => u3.global_id, 'geo' => ['2', '3'], 'timestamp' => 1431461206, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}},
        ]
      }, {:user => u, :author => u, :device => d})
      
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(2)
      expect(LogSession.count).to eq(1)
      
      expect(s.data['events'][0]['referenced_user_id']).to eq(nil)
      expect(s.data['events'][1]['referenced_user_id']).to eq(nil)
    end

    it "should pull out embedded note events even at the beginning of the list" do
      u = User.create
      d = Device.create(:user => u)
      u2 = User.create
      User.link_supervisor_to_user(u, u2, nil, true)
      s = LogSession.process_new({
        'events' => [
          {'user_id' => u2.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461200, 'type' => 'note', 'note' => {'note' => {'text' => 'ok cool', 'timestamp' => 1431461200}, 'notify' => false}},
          {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461204, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
          {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 1431461206, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :author => u, :device => d})
      
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(3)
      expect(LogSession.count).to eq(1)
      Worker.process_queues
      s.reload
      expect(LogSession.count).to eq(2)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(2)
      s2 = LogSession.last
      expect(s2).not_to eq(s)
      expect(s2.user).to eq(u2)
      expect(s2.log_type).to eq('note')
      expect(s2.started_at.to_i).to eq(1431461200)
      expect(s2.ended_at.to_i).to eq(1431461200)
      expect(s2.data['event_summary']).to eq("Note by #{u.user_name}: ok cool")
      expect(s2.data['note']['text']).to eq('ok cool')
    end
    
    it "should pull out embedded assessment events" do
      u = User.create
      d = Device.create(:user => u)
      u2 = User.create
      User.link_supervisor_to_user(u, u2, nil, true)
      s = LogSession.process_new({
        'events' => [
          {'user_id' => u2.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461200, 'type' => 'note', 'note' => {'text' => 'ok cool', 'timestamp' => 1431461200}, 'notify' => false},
          {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 1431461204, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
          {'user_id' => u2.global_id, 'geo' => ['2', '3'], 'timestamp' => 1431461206, 'type' => 'assessment', 'assessment' => {'assessment' => {
            'start_timestamp' => 1431461200,
            'end_timestamp' => 1431461206,
            'totals' => {
              'correct' => 12,
              'incorrect' => 3
            }
          }}}
        ]
      }, {:user => u, :author => u, :device => d})
      
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(3)
      expect(LogSession.count).to eq(1)
      Worker.process_queues
      s.reload
      expect(LogSession.count).to eq(3)
      expect(s.user).to eq(u)
      expect(s.data['events'].length).to eq(1)
      s3 = LogSession.find_by(:log_type => 'assessment', :user_id => u2.id)
      s2 = LogSession.find_by(:log_type => 'note', :user_id => u2.id)
      expect(s2).not_to eq(nil)
      expect(s2.user).to eq(u2)
      expect(s2.log_type).to eq('note')
      expect(s2.data['event_summary']).to eq("Note by #{u.user_name}: ok cool")
      expect(s2.started_at.to_i).to eq(1431461200)
      expect(s2.ended_at.to_i).to eq(1431461200)

      expect(s3).not_to eq(nil)
      expect(s3.user).to eq(u2)
      expect(s3.log_type).to eq('assessment')
      expect(s3.data['event_summary']).to eq("Assessment by #{u.user_name}: Quick assessment (12 correct, 3 incorrect, 80.0%)")
    end
    
    it "should attach user video if specified" do
      u = User.create
      v = UserVideo.create(:user => u, :settings => {'duration' => 12})
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'video_id' => v.global_id
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: recording (12s) - ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.data['note']['video']).to eq({'id' => v.global_id, 'duration' => 12})
    end
    
    it "should not attach invalid video" do
      u = User.create
      v = UserVideo.create(:user => u, :settings => {'duration' => 12})
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'video_id' => v.id
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['event_summary']).to eq("Note by #{u.user_name}: ahem")
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.data['note']['video']).to eq(nil)
    end
    
    it "should attach goal data if specified" do
      u = User.create
      g = UserGoal.create(:user => u)
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'goal_id' => g.global_id,
        'goal_status' => 3,
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.goal_id).to eq(g.id)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.data['goal']).to eq({
        'id' => g.global_id, 
        'negatives' => 0,
        'positives' => 1,
        'status' => 3,
        'summary' => 'user goal'
      })
    end

    it "should attach global status goal if specified" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'goal_id' => 'status',
        'goal_status' => 3,
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.goal_id).to eq(0)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.data['goal']).to eq({
        'negatives' => 0,
        'positives' => 1,
        'status' => 3,
        'summary' => '',
        'global' => true
      })
    end
    
    it "should not attach a goal if not valid" do
      u = User.create
      u2 = User.create
      g = UserGoal.create(:user => u2)
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'goal_id' => g.global_id,
        'goal_status' => 3,
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4'})
      expect(s).not_to eq(nil)
      expect(s.errored?).to eq(false)
      expect(s.started_at.to_i).to eq(1431461182)
      expect(s.ended_at.to_i).to eq(1431461182)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('ahem')
      expect(s.data['goal']).to eq(nil)
    end
    
    it "should mark as imported if specified" do
      u = User.create
      u2 = User.create
      g = UserGoal.create(:user => u2)
      d = Device.create(:user => u)
      s = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'goal_id' => g.global_id,
        'goal_status' => 3,
      }, {'user' => u, 'author' => u, 'device' => d, 'ip_address' => '1.2.3.4', 'imported' => true})
      expect(s.data['imported']).to eq(true)
    end

    it "should process a journal entry" do
      u1 = User.create
      d = Device.create(:user => u1)
      s2 = LogSession.process_new({
        :type => 'journal',
        :vocalization => [{'label' => 'what'}, {'label' => 'now'}],
        :category => 'journal'
      }, {:user => u1, :device => d, :author => u1})
      expect(s2.log_type).to eq('journal')
      expect(s2.data['journal']['timestamp']).to be > 10.seconds.ago.to_i
      expect(s2.data['journal']['sentence']).to eq('what now')
    end

    it "should process an eval entry" do
      u1 = User.create
      d = Device.create(:user => u1)
      s2 = LogSession.process_new({
        :type => 'eval',
        :eval => {a: 1},
      }, {:user => u1, :device => d, :author => u1})
      expect(s2.log_type).to eq('eval')
      expect(s2.data['eval']).to eq({'a' => 1})
    end
  end

  describe "process_raw_log" do
    it "should do something spec-worthy"
  end
  
  it "should securely serialize settings" do
    l = LogSession.new(:user => User.create, :device => Device.create(:user => User.create), :author => User.create)
    l.generate_defaults rescue nil
    expect(GoSecure::SecureJson).to receive(:dump).with(l.data)
    l.save
  end
  
  describe "event notes" do
    it "should generate ids for any events that don't have them" do
      u = User.create
      d = Device.create(:user => u)
      l = LogSession.new(:user => u, :author => u, :device => d)
      l.data = {}
      now = 1415689201
      l.data['events'] = [
        {'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10},
        {'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
        {'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
      ]
      l.save
      expect(l.data['events'].map{|e| e['id'] }).to eql([1, 2, 3])
    end
    
    it "should process notes on update" do
      u = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      expect(l.data['events'].map{|e| e['notes'] }).to eql([nil, nil, nil])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'}
          ]},
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now, 'notes' => [
            {'note' => 'that is good'}
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      note = l.data['events'][0]['notes'][0]
      expect(note['note']).to eql('ok cool')
      expect(note['timestamp']).to be > 0
      expect(note['author']).to eql({
        'id' => u.global_id,
        'user_name' => u.user_name
      })

      note = l.data['events'][2]['notes'][0]
      expect(note['note']).to eql('that is good')
      expect(note['timestamp']).to be > 0
      expect(note['author']).to eql({
        'id' => u.global_id,
        'user_name' => u.user_name
      })
    end
    
    it "should generate ids for any notes that don't have them" do
      u = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'}
          ]},
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now, 'notes' => [
            {'note' => 'that is good'}
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      note = l.data['events'][0]['notes'][0]
      expect(note['id']).to eql(1)
      expect(note['note']).to eql('ok cool')

      note = l.data['events'][2]['notes'][0]
      expect(note['id']).to eql(1)
      expect(note['note']).to eql('that is good')
    end
    
    it "should attribute any new notes to the current author" do
      u = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      expect(l.data['events'].map{|e| e['notes'] }).to eql([nil, nil, nil])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool', 'author' => {}}
          ]},
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now, 'notes' => [
            {'note' => 'that is good'}
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      note = l.data['events'][0]['notes'][0]
      expect(note['note']).to eql('ok cool')
      expect(note['author']).to eql({})

      note = l.data['events'][2]['notes'][0]
      expect(note['note']).to eql('that is good')
      expect(note['author']).to eql({
        'id' => u.global_id,
        'user_name' => u.user_name
      })
    end
    
    it "should not allow deleting events on update" do
      u = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      expect(l.data['events'].map{|e| e['notes'] }).to eql([nil, nil, nil])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'}
          ]},
          {'id' => 'jef', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
    end
    
    it "should not allow deleting notes without permission on update" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc'])
      expect(l.data['events'].map{|e| e['notes'] }).to eql([nil])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'},
            {'note' => 'never mind'}
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u2,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc'])
      notes = l.data['events'][0]['notes']
      expect(notes.length).to eql(2)
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => []}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u2,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc'])
      notes2 = l.data['events'][0]['notes']
      expect(notes2.length).to eql(2)
    end
    
    it "should allow deleting notes with permission on update" do
      u = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc'])
      expect(l.data['events'].map{|e| e['notes'] }).to eql([nil])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'},
            {'note' => 'never mind'}
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc'])
      notes = l.data['events'][0]['notes']
      expect(notes.length).to eql(2)
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            notes[1]
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['events'].map{|e| e['id'] }).to eql(['abc'])
      notes2 = l.data['events'][0]['notes']
      expect(notes2.length).to eql(1)
      expect(notes2[0]['id']).to eql(notes[1]['id'])
    end
    
    it "should record the event's current note count and set has_note correctly" do
      u = User.create
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
        ]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['event_note_count']).to eql(0)
      expect(l.has_notes).to eql(false)
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'},
            {'note' => 'never mind'}
          ]}
        ]
      }
      l.process(params, {
        :update_only => true,
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.data['event_note_count']).to eql(2)
      expect(l.has_notes).to eql(true)
    end
  end

  describe "notifications" do
    it "should return a valid set of default_listeners" do
        u = User.create
        u2 = User.create
        u3 = User.create
        User.link_supervisor_to_user(u2, u)
        User.link_supervisor_to_user(u3, u)
        u.reload
      
        d = Device.create(:user => u)
        now = 1415689201
        params = {
          'events' => [
            {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          ]
        }
        l = LogSession.process_new(params, {
          :user => u,
          :author => u,
          :device => d
        })
        expect(l.default_listeners('push_message').sort).to eq([u2, u3].map(&:record_code).sort)

        l = LogSession.process_new(params, {
          :user => u,
          :author => u2,
          :device => d
        })
        expect(l.default_listeners('push_message').sort).to eq([u, u3].map(&:record_code).sort)
    end

    it "should exclude specified supervisors" do
      u = User.create
      u2 = User.create
      u3 = User.create
      User.link_supervisor_to_user(u2, u)
      User.link_supervisor_to_user(u3, u)
      u.reload
    
      d = Device.create(:user => u)
      now = 1415689201
      params = {
        'note' => {'text' => 'asdf'},
        'notify' => 'true', 
        'notify_exclude_ids' => [u3.global_id]
      }
      l = LogSession.process_new(params, {
        :user => u,
        :author => u,
        :device => d
      })
      expect(l.default_listeners('push_message').sort).to eq([u2].map(&:record_code).sort)

      l = LogSession.process_new(params, {
        :user => u,
        :author => u2,
        :device => d
      })
      expect(l.default_listeners('push_message').sort).to eq([u].map(&:record_code).sort)
  end
  
    it "should notify users when a pushed message is added to their log" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u2)
      l = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => true
      }, {:user => u, :author => u2, :device => d})
      Worker.process_queues
      expect(u.reload.settings['unread_messages']).to eq(1)
      expect(u.settings['user_notifications']).to eq([{
        'id' => l.global_id,
        'type' => 'push_message',
        'user_name' => u.user_name,
        'author_user_name' => u2.user_name,
        'text' => 'ahem',
        'occurred_at' => "2015-05-12T20:06:22Z",
        'added_at' => Time.now.utc.iso8601
      }])
      expect(u2.reload.settings['user_notifications']).to eq(nil)
    end
  
    it "should notify supervisors when a pushed message is added to their supervisee's log" do
      u = User.create
      u2 = User.create
      u3 = User.create
      User.link_supervisor_to_user(u3, u)
      d = Device.create(:user => u2)
      l = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => true
      }, {:user => u, :author => u2, :device => d})
      Worker.process_queues
      expect(u.reload.settings['unread_messages']).to eq(1)
      expect(u.settings['user_notifications'].length).to eq(1)
      expect(u.settings['user_notifications'][0].except('added_at')).to eq({
        'id' => l.global_id,
        'type' => 'push_message',
        'user_name' => u.user_name,
        'author_user_name' => u2.user_name,
        'text' => 'ahem',
        'occurred_at' => "2015-05-12T20:06:22Z"
      })
      expect(u.settings['user_notifications'][0]['added_at']).to be >= (Time.now - 5).utc.iso8601
      expect(u.settings['user_notifications'][0]['added_at']).to be <= (Time.now + 5).utc.iso8601

      expect(u2.reload.settings['user_notifications']).to eq(nil)
      expect(u3.reload.settings['unread_messages']).to eq(nil)
      expect(u3.settings['user_notifications'].length).to eq(1)
      expect(u3.settings['user_notifications'][0].except('added_at')).to eq({
        'id' => l.global_id,
        'type' => 'push_message',
        'user_name' => u.user_name,
        'author_user_name' => u2.user_name,
        'text' => 'ahem',
        'occurred_at' => "2015-05-12T20:06:22Z"
      })
    end
    
    it "should email everyone except the author when a pushed message is added to a user's log" do
      u = User.create
      u2 = User.create
      u3 = User.create
      User.link_supervisor_to_user(u3, u)
      d = Device.create(:user => u2)
      l = LogSession.process_new({
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'notify' => true
      }, {:user => u, :author => u2, :device => d})

      expect(UserMailer).to receive(:schedule_delivery).with(:log_message, u.global_id, l.global_id)
      expect(UserMailer).to receive(:schedule_delivery).with(:log_message, u3.global_id, l.global_id)
      Worker.process_queues
    end
  end
  
  it "should schedule a summary processing event" do
    l = LogSession.new(:user => User.create, :device => Device.create(:user => User.create), :author => User.create)
    l.data = {}
    now = 1415689201
    l.data['events'] = [
      {'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10},
      {'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
      {'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
    ]
    l.save    
    expect(RemoteAction.where(action: 'weekly_stats_update', path: "#{l.user_id}::#{WeeklyStatsSummary.date_to_weekyear(Time.at(now))}").count).to eq(1)
  end
  
  describe "push_logs_remotely" do
    it "should only notify applicable logs" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.create!(:needs_remote_push => true, :ended_at => 12.days.ago, :user => u, :device => d, :author => u)
      LogSession.where(:id => s1.id).update_all(:ended_at => 12.days.ago)
      s2 = LogSession.create!(:needs_remote_push => true, :ended_at => 1.day.ago, :user => u, :device => d, :author => u)
      LogSession.where(:id => s2.id).update_all(:ended_at => 1.days.ago)
      s3 = LogSession.create!(:needs_remote_push => true, :ended_at => Time.now, :user => u, :device => d, :author => u)
      LogSession.where(:id => s3.id).update_all(:ended_at => Time.now)
      s4 = LogSession.create!(:needs_remote_push => nil, :ended_at => 6.hours.ago, :user => u, :device => d, :author => u)
      LogSession.where(:id => s4.id).update_all(:ended_at => 6.hours.ago, :needs_remote_push => nil)
      expect(LogSession.where(:needs_remote_push => true).count).to eq(3)
      LogSession.push_logs_remotely
      expect(Worker.scheduled_for?(:slow, Webhook, 'notify_all_with_code', s1.record_code, 'new_session', {'slow' => true})).to eq(false)
      expect(Worker.scheduled_for?(:slow, Webhook, 'notify_all_with_code', s2.record_code, 'new_session', {'slow' => true})).to eq(true)
      expect(Worker.scheduled_for?(:slow, Webhook, 'notify_all_with_code', s3.record_code, 'new_session', {'slow' => true})).to eq(false)
      expect(Worker.scheduled_for?(:slow, Webhook, 'notify_all_with_code', s4.record_code, 'new_session', {'slow' => true})).to eq(false)
      expect(s1.reload.needs_remote_push).to eq(true)
      expect(s2.reload.needs_remote_push).to eq(false)
      expect(s3.reload.needs_remote_push).to eq(true)
      expect(s4.reload.needs_remote_push).to eq(nil)
    end
    
    it "should notify a listener of a new session", skip: "slow queue not processed in test worker" do
      u = User.create
      d = Device.create(:user => u)
      h = Webhook.process_new({
        'webhooks' => ['new_session', 'new_board'],
        'url' => 'http://www.example.com/callback',
        'include_content' => true,
        'webhook_type' => 'user'
      }, {'user' => u})
      s = LogSession.create(:user => u, :device => d, :author => u, :log_type => 'session')
      LogSession.where(:id => s.id).update_all(:needs_remote_push => true, :ended_at => 6.hours.ago)
      expect(Typhoeus).to receive(:post){|url, args|
        expect(url).to eq('http://www.example.com/callback')
        expect(args[:body][:content]).to_not eq(nil)
        expect(args[:body][:notification]).to eq('new_session')
        expect(args[:body][:record]).to eq(s.record_code)
      }.and_return(OpenStruct.new(code: 200))
      LogSession.push_logs_remotely
      Worker.process_queues
      Worker.process_queues
    end

    it "should notify a research listener of a new session", skip: "slow queue not processed in test worker" do
      u = User.create
      u.settings['preferences']['allow_log_repors'] = true
      u.save

      d = Device.create(:user => u)
      ui = UserIntegration.create(:user => u)
      ui.settings ||= {}
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings ||= {}
      h.settings['notifications'] ||= {}
      h.settings['include_content'] = true
      h.settings['url'] = 'http://www.example.com/callback2'
      h.settings['webhook_type'] = 'research'
      h.settings['content_types'] = ['anonymized_summary']
      h.settings['notifications']['new_session'] = [{
        'callback' => 'http://www.example.com/callback',
        'include_content' => true,
        'content_type' => 'anonymized_summary'
      }]
      h.save

      s = LogSession.create(:user => u, :device => d, :author => u, :log_type => 'session')
      s.data['allow_research'] = true
      s.save
      expect(s.data['allow_research']).to eq(true)
      LogSession.where(:id => s.id).update_all(:needs_remote_push => true, :ended_at => 6.hours.ago)
      expect(Typhoeus).to receive(:post){|url, args|
        expect(url).to eq('http://www.example.com/callback')
        expect(args[:body][:notification]).to eq('new_session')
        expect(args[:body][:record]).to eq(s.record_code)
        expect(args[:body][:content]).to eq({
          uid: ui.user_token(u),
          active_weeks: nil
        }.to_json)
      }.and_return(OpenStruct.new(code: 200))
      LogSession.push_logs_remotely
      Worker.process_queues
      Worker.process_queues
    end
  end

  describe "generate_log_summaries" do
    it "should not generate for non-premium communicators" do
      u = User.create(:expires_at => 2.weeks.ago, :next_notification_at => 2.weeks.ago)
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(false)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end
    
    it "should not generate for supervisor role users with no supervisees" do
      u = User.create(:next_notification_at => 2.weeks.ago)
      u.settings['preferences']['role'] = 'supervisor'
      u.save
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end
    
    it "should not generate for supervisor roel users with only expired supervisees" do
      u = User.create(:next_notification_at => 2.weeks.ago)
      u2 = User.create(:expires_at => 2.weeks.ago)
      d = Device.create(:user => u)
      User.link_supervisor_to_user(u, u2)
      u.settings['preferences']['role'] = 'supervisor'
      u.save

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u2, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u2.any_premium_or_grace_period?).to eq(false)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end
    
    it "should not generate for users with no recent logs" do
      u = User.create(:next_notification_at => 2.weeks.ago)
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 11.weeks.ago.to_time.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 11.weeks.ago.to_time.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end

    it "should generate for users with sort-of recent logs" do
      u = User.create(:next_notification_at => 2.weeks.ago)
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 3.weeks.ago.to_time.to_i + 100},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 3.weeks.ago.to_time.to_i + 50}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(true)
    end

    it "should not generate for premium users with recent logs but no notification preference set" do
      u = User.create(:next_notification_at => nil)
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end
    
    it "should generate for premium users with recent logs" do
      u = User.create(:next_notification_at => 2.weeks.ago)
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(true)
    end
    
    it "should generate for supervisors with one or more premium communicators with recent logs" do
      u = User.create(:next_notification_at => 2.weeks.ago)
      u2 = User.create
      d = Device.create(:user => u)
      User.link_supervisor_to_user(u, u2)
      u.settings['preferences']['role'] = 'supervisor'
      u.save

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u2, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u2.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(true)
    end
    
    it "should not generate for user with 2-week preference and no logs for 6 weeks" do
      u = User.create(:settings => {'preferences' => {'notification_frequency' => '2_weeks'}})
      expect(u.next_notification_at).to be > Time.now
      u.next_notification_at = 2.weeks.ago
      u.save
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 6.weeks.ago.to_time.to_i - 101},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 6.weeks.ago.to_time.to_i - 100}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end
    
    it "should generate for user with 2-week preference and logs within last 6 weeks" do
      u = User.create(:settings => {'preferences' => {'notification_frequency' => '2_weeks'}})
      expect(u.next_notification_at).to be > Time.now
      u.next_notification_at = 2.weeks.ago
      u.save
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 6.weeks.ago.to_time.to_i + 101},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 6.weeks.ago.to_time.to_i + 100}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(true)
    end

    it "should not generate for user with 1-month preference and no logs for 3 months" do
      u = User.create(:settings => {'preferences' => {'notification_frequency' => '1_month'}})
      expect(u.next_notification_at).to be > Time.now
      u.next_notification_at = 2.weeks.ago
      u.save
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 3.months.ago.to_time.to_i - 101},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 3.months.ago.to_time.to_i - 100}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(false)
    end
    
    it "should generate for user with 1-month preference and logs within last 3 months" do
      u = User.create(:settings => {'preferences' => {'notification_frequency' => '1_month'}})
      expect(u.next_notification_at).to be > Time.now
      u.next_notification_at = 2.weeks.ago
      u.save
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 3.months.ago.to_time.to_i + 101},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 3.months.ago.to_time.to_i + 100}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(u.any_premium_or_grace_period?).to eq(true)
      LogSession.generate_log_summaries
      expect(Worker.scheduled?(Webhook, :notify_all_with_code, u.record_code, 'log_summary', nil)).to eq(true)
    end
  end
  
  describe "generate_speech_combinations" do
    before do
      allow(WordData).to receive(:find_words).and_return({
        'boy' => {'word' => 'boy', 'types' => ['noun']},
        'girl' => {'word' => 'girl', 'types' => ['noun']},
        'hand' => {'word' => 'hand', 'types' => ['noun']},
        'dog' => {'word' => 'dog', 'types' => ['noun']},
        'run' => {'word' => 'run', 'types' => ['verb']},
        'cat' => {'word' => 'cat', 'types' => ['noun']},
        'funny' => {'word' => 'funny', 'types' => ['adjective']},
        'ugly' => {'word' => 'ugly', 'types' => ['adjective']}
      })
    end

    it "should combine all parts_of_speech values" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037743}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'run', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'cat', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'funny', 'spoken' => true}, 'timestamp' => 1444994886}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,noun,adjective"=>1, "noun,adjective"=>1})
    end
    
    it "should create parts_of_speech 2-step and 3-step sequences" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037743}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'run', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'cat', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'funny', 'spoken' => true}, 'timestamp' => 1444994886}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,noun,adjective"=>1, "noun,adjective"=>1})
    end
    
    it "should not create multi-step sequences across a clear action" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037744}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'run', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'cat', 'spoken' => true}, 'timestamp' => 1444994887}, {'type' => 'action', 'action' => 'clear', 'timestamp' => 1444994888}, {'type' => 'button', 'button' => {'label' => 'funny', 'spoken' => true}, 'timestamp' => 1444994889}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,noun"=>1})
    end
    
    it "should not create multi-step sequences across a vocalize action" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037744}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'run', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'cat', 'spoken' => true}, 'timestamp' => 1444994887}, {'type' => 'utterance', 'utterance' => {'text' => 'ok cool'}, 'timestamp' => 1444994888}, {'type' => 'button', 'button' => {'label' => 'funny', 'spoken' => true}, 'timestamp' => 1444994889}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,noun"=>1})
    end
    
    it "should create consecutive mutli-step sequences" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037743}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'run', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'cat', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'funny', 'spoken' => true}, 'timestamp' => 1444994886}, {'type' => 'button', 'button' => {'label' => 'ugly', 'spoken' => true}, 'timestamp' => 1444994887}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,noun,adjective"=>1, "noun,adjective,adjective"=>1, "adjective,adjective"=>1})
    end
    
    it "should handle spelling within sequences" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037744}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      events = [
        {'type' => 'button', 'button' => {'label' => 'run'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u'}, 'timestamp' => 1444994884},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994885},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994886},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y'}, 'timestamp' => 1444994887},
        {'type' => 'button', 'button' => {'label' => ' ', 'vocalization' => ':space', 'completion' => 'funny'}, 'timestamp' => 1444994888},
        {'type' => 'button', 'button' => {'label' => 'cat'}, 'timestamp' => 1444994889}, 
      ]
      s4 = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,adjective,noun"=>1, "adjective,noun"=>1})
    end
    
    it "should handle spelling at the end of a sequence" do
      u = User.create
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'boy', 'spoken' => true}, 'timestamp' => 1445037743}, {'type' => 'button', 'button' => {'label' => 'girl', 'spoken' => true}, 'timestamp' => 1445037744}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'hand', 'spoken' => true}, 'timestamp' => 1445044954}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'dog', 'spoken' => true}, 'timestamp' => 1444994571}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      events = [
        {'type' => 'button', 'button' => {'label' => 'run', 'spoken' => true}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'cat', 'spoken' => true}, 'timestamp' => 1444994882}, 
        {'type' => 'button', 'button' => {'label' => 'f', 'vocalization' => '+f'}, 'timestamp' => 1444994883},
        {'type' => 'button', 'button' => {'label' => 'u', 'vocalization' => '+u'}, 'timestamp' => 1444994884},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994885},
        {'type' => 'button', 'button' => {'label' => 'n', 'vocalization' => '+n'}, 'timestamp' => 1444994886},
        {'type' => 'button', 'button' => {'label' => 'y', 'vocalization' => '+y'}, 'timestamp' => 1444994887},
      ]
      s4 = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['parts_of_speech_combinations']).to eq("noun,noun" => 1)
      expect(s2.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s3.data['stats']['parts_of_speech_combinations']).to eq({})
      expect(s4.data['stats']['parts_of_speech_combinations']).to eq({"verb,noun,adjective"=>1, "noun,adjective"=>1})
    end
  end

  describe "generate_button_usage" do
    it 'should include button ids used' do
      u = User.create
      b = Board.create(user: u, public: true)
      d = Device.create(:user => u)
      i = 0
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => i, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
#          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 2, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 3},
#          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 3, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['buttons_used']).to eq({"button_ids"=>["#{b.global_id}:0"], "button_chains"=>{}})
    end
    
    it 'should include valid button chains' do
      u = User.create
      b = Board.create(user: u, public: true)
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 2, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 3},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 3, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['buttons_used']).to eq({"button_ids"=>["#{b.global_id}:1", "#{b.global_id}:2", "#{b.global_id}:3"], "button_chains"=>{"this, that, then"=>1}})
    end

    it 'should include long-delay button chains' do
      u = User.create
      b = Board.create(user: u, public: true)
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 5},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 2, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 10000},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 3, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 10001}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['buttons_used']).to eq({"button_ids"=>["#{b.global_id}:3", "#{b.global_id}:2", "#{b.global_id}:1"], "button_chains"=>{}})
    end
  end
  
  describe "additional_webhook_record_codes" do
    it "should return correct values" do
      u = User.create
      s = LogSession.new
      expect(s.additional_webhook_record_codes('bacon', nil)).to eq([])
      expect(s.additional_webhook_record_codes('something', nil)).to eq([])
      expect(s.additional_webhook_record_codes('new_session', nil)).to eq([])
      s.user = u
      expect(s.additional_webhook_record_codes('new_session', nil)).to eq(["#{u.record_code}::*", "#{u.record_code}::log_session:*"])
    end
  end

  describe "webhook_content" do
    it "should return the correct content" do
      s = LogSession.new
      expect(s.webhook_content(nil, 'bacon', nil)).to eq(nil)
      expect(s.webhook_content(nil, 'new_utterance', nil)).to eq(nil)
      expect(Stats).to receive(:lam).with([s]).and_return("asdf")
      expect(s.webhook_content(nil, 'lam', nil)).to eq('asdf')
    end
  end
  
  describe "process_daily_use" do
    it "should process correctly" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_daily_use({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-01', 'active' => true},
          {'date' => '2016-01-03', 'active' => false}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(s.log_type).to eq('daily_use')
      expect(s.data['days']).to eq({
        '2016-01-01' => {'date' => '2016-01-01', 'active' => true, 'activity_level' => nil},
        '2016-01-03' => {'date' => '2016-01-03', 'active' => false, 'activity_level' => nil}
      })
      s2 = LogSession.process_daily_use({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-03', 'active' => true, 'activity_level' => nil},
          {'date' => '2016-01-05', 'active' => false, 'activity_level' => nil}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(s2).to eq(s)
      expect(s2.log_type).to eq('daily_use')
      expect(s2.data['days']).to eq({
        '2016-01-01' => {'date' => '2016-01-01', 'active' => true, 'activity_level' => nil},
        '2016-01-03' => {'date' => '2016-01-03', 'active' => true, 'activity_level' => nil},
        '2016-01-05' => {'date' => '2016-01-05', 'active' => false, 'activity_level' => nil}
      })
    end

    it "should include daily event types when specified" do
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.process_daily_use({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-01', 'active' => true, 'models' => 3, 'bacon' => 5},
          {'date' => '2016-01-03', 'active' => false, 'models' => 2, 'goals' => 1}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(s.log_type).to eq('daily_use')
      expect(s.data['days']).to eq({
        '2016-01-01' => {'date' => '2016-01-01', 'active' => true, 'activity_level' => nil, 'bacon' => 5, 'models' => 3},
        '2016-01-03' => {'date' => '2016-01-03', 'active' => false, 'activity_level' => nil, 'models' => 2, 'goals' => 1}
      })
      s2 = LogSession.process_daily_use({
        'type' => 'daily_use',
        'events' => [
          {'date' => '2016-01-03', 'active' => true, 'activity_level' => nil, 'focus_words' => 2, 'cheddar' => 9},
          {'date' => '2016-01-05', 'active' => false, 'activity_level' => nil, 'remote_models' => 15}
        ]
      }, {:device => d, :author => u, :user => u})
      expect(s2).to eq(s)
      expect(s2.log_type).to eq('daily_use')
      expect(s2.data['days']).to eq({
        '2016-01-01' => {'date' => '2016-01-01', 'active' => true, 'activity_level' => nil, 'bacon' => 5, 'models' => 3},
        '2016-01-03' => {'date' => '2016-01-03', 'active' => true, 'activity_level' => nil, 'models' => 2, 'goals' => 1, 'focus_words' => 2},
        '2016-01-05' => {'date' => '2016-01-05', 'active' => false, 'activity_level' => nil, 'remote_models' => 15}
      })
    end
  end

  describe "check_for_merger" do
    it "should merge two matching logs" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 100},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(1)
      s1.reload
      expect(s1.data['events'].length).to eq(4)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2, 3, 4])
    end

    it "should intermingle events from two matching logs" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 30},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 205}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s1.data['events'].map{|e| e['timestamp']}).to eq([ts, ts + 105])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].map{|e| e['timestamp']}).to eq([ts + 30, ts + 205])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(1)
      s1.reload
      expect(s1.data['events'].length).to eq(4)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 3, 2, 4])
      expect(s1.data['events'].map{|e| e['timestamp']}).to eq([ts, ts + 30, ts + 105, ts + 205])
    end

    it "should not merge two logs with different authors" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 30},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 205}
      ]}, {:user => u, :author => u2, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])
    end

    it "should not merge two logs with different devices" do
      u = User.create
      d = Device.create(:user => u)
      d2 = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 30},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 205}
      ]}, {:user => u, :author => u, :device => d2, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])
    end

    it "should not merge two logs with different users" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 30},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 205}
      ]}, {:user => u2, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])
    end

    it "should not merge logs that are too far apart" do
      User.default_log_session_duration
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 60 + User.default_log_session_duration},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 60 + User.default_log_session_duration}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])
    end

    it "should merge five overlapping logs" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 10}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 2}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 3},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 9}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 7},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 8}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s5 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 4},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(5)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s3.data['events'].length).to eq(2)
      expect(s3.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s4.data['events'].length).to eq(2)
      expect(s4.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s5.data['events'].length).to eq(2)
      expect(s5.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(1)
      s1.reload
      expect(s1.data['events'].length).to eq(10)
      expect(s1.data['events'].map{|e| e['timestamp']}).to eq([ts, ts + 1, ts + 2, ts + 3, ts + 4, ts + 5, ts + 7, ts + 8, ts + 9, ts + 10])
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 3, 4, 5, 9, 10, 7, 8, 6, 2])
    end

    it "should de-dup two copies of the same events" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(1)
      s1.reload
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
    end

    it "should keep the older session, even if called for the younger session" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s2.check_for_merger(true)
      expect(LogMerger.count).to eq(0)
      Worker.process_queues
      expect(LogMerger.count).to eq(1)
      LogMerger.all.update_all(merge_at: 6.hours.ago)
      LogSession.check_possible_mergers
      Worker.process_queues

      expect(LogSession.count).to eq(1)
      s1.reload
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
    end

    it "should partially merge logs when the new event has some from the same user and some from a different user" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'user_id' => 'abc', 'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'user_id' => 'abc', 'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'user_id' => 'abc', 'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 100},
        {'user_id' => 'bcd', 'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      s1.check_for_merger(true)

      expect(LogSession.count).to eq(2)
      s1.reload
      expect(s1.data['events'].length).to eq(3)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2, 3])
      s2.reload
      expect(s2.data['events'].length).to eq(1)
      expect(s2.data['events'].map{|e| e['id']}).to eq([2])
    end

    it "should find dup logs in background task" do
      u = User.create
      d = Device.create(:user => u)
      time = 20.minutes.ago
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      LogSession.all.update_all(created_at: 20.minutes.ago)

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      LogSession.check_possible_mergers
      Worker.process_queues
      Worker.process_queues

      expect(LogMerger.count).to eq(1)
      LogMerger.all.update_all(merge_at: 6.hours.ago)
      LogSession.check_possible_mergers
      Worker.process_queues

      expect(LogSession.count).to eq(1)
      s1.reload
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
    end
    
    it "should schedule a merger check if changes found and not frd" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 100},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      expect(LogMerger.count).to eq(0)
      s1.check_for_merger
      expect(LogMerger.count).to eq(1)
      expect(LogMerger.first.log_session_id).to eq(s1.id)
      expect(LogMerger.first.started).to eq(false)
      expect(LogSession.count).to eq(2)
    end

    it "should not schedule a merger check if one is already scheduled" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 100},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      expect(LogMerger.count).to eq(0)
      LogMerger.create(log_session_id: s1.id, started: false)
      expect(LogMerger.count).to eq(1)
      s1.check_for_merger
      expect(LogMerger.count).to eq(1)
      expect(LogMerger.first.log_session_id).to eq(s1.id)
      expect(LogMerger.first.started).to eq(false)
      expect(LogSession.count).to eq(2)
    end

    it "should schedule a new far-off merger check if one is already in progress" do
      u = User.create
      d = Device.create(:user => u)
      time = Time.parse("2018-06-06T20:18:19Z")
      ts = time.to_f
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 5}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => ts + 100},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts + 105}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

      expect(LogSession.count).to eq(2)
      expect(s1.data['events'].length).to eq(2)
      expect(s1.data['events'].map{|e| e['id']}).to eq([1, 2])
      expect(s2.data['events'].length).to eq(2)
      expect(s2.data['events'].map{|e| e['id']}).to eq([1, 2])

      expect(LogMerger.count).to eq(0)
      LogMerger.create(log_session_id: s1.id, started: true)
      expect(LogMerger.count).to eq(1)
      s1.check_for_merger
      expect(LogMerger.count).to eq(2)
      expect(LogMerger.last.started).to eq(false)
      expect(LogMerger.last.merge_at).to be > 25.minutes.from_now
      expect(LogSession.count).to eq(2)
    end

  end

  describe "process_modeling_event" do
    it "should create a modeling log session if not created" do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.find_by(log_type: 'modeling_activities', user_id: u.id)
      expect(s).to eq(nil)

      LogSession.process_modeling_event({
        'asdf' => true
      }, {
        user: u, device: d
      })
      s = LogSession.find_by(log_type: 'modeling_activities', user_id: u.id)
      expect(s).to_not eq(nil)
    end

    it "should reuse an existing modeling log session for the user" do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, author: u, device: d, log_type: 'modeling_activities', user_id: u.id)
      LogSession.process_modeling_event({
        'asdf' => true
      }, {
        user: u, device: d
      })
      expect(LogSession.where(log_type: 'modeling_activities', user_id: u.id).count).to eq(1)
      s.reload
      expect(s.data['events'].length).to eq(1)
    end

    it "should process an activation event" do
      u = User.create
      d = Device.create(user: u)

      LogSession.process_modeling_event({
        'asdf' => true
      }, {
        user: u, device: d
      })
      s = LogSession.find_by(log_type: 'modeling_activities', user_id: u.id)
      expect(s).to_not eq(nil)
      expect(s.data['events'].length).to eq(1)
    end

    it "should handle a dismissal event, including updating any previus action events" do
      u = User.create
      d = Device.create(user: u)

      LogSession.process_modeling_event({
        'modeling_action' => 'dismiss',
        'modeling_activity_id' => '1f',
        'modeling_user_ids' => ['1']
      }, {
        user: u, device: d
      })
      s = LogSession.find_by(log_type: 'modeling_activities', user_id: u.id)
      expect(s).to_not eq(nil)
      expect(s.data['events'].length).to eq(1)

      LogSession.process_modeling_event({
        'modeling_action' => 'start',
        'modeling_activity_id' => '1f',
        'repeats' => 0,
        'timestamp' => 1,
        'modeling_user_ids' => ['1', '2', '3']
      }, {
        user: u, device: d
      })
      s.reload
      expect(s.data['events'].length).to eq(2)
      
      LogSession.process_modeling_event({
        'modeling_action' => 'dismiss',
        'modeling_activity_id' => '1f',
        'timestamp' => 6.hours.ago.to_i,
        'modeling_user_ids' => ['1', '2']
      }, {
        user: u, device: d
      })
      s.reload
      expect(s.data['events'].length).to eq(3)
      expect(s.data['events'][-1]).to eq({
        'modeling_action' => 'dismiss',
        'modeling_activity_id' => '1f',
        'repeats' => 1,
        'id' => 3,
        'timestamp' => 6.hours.ago.to_i,
        'modeling_user_ids' => ['1', '2'],
        'related_user_ids' => []
      })
    end

    it "should schedule process_external_callbacks" do
      u = User.create
      d = Device.create(user: u)

      LogSession.process_modeling_event({
        'asdf' => true
      }, {
        user: u, device: d
      })
      s = LogSession.find_by(log_type: 'modeling_activities', user_id: u.id)
      expect(s).to_not eq(nil)
      expect(s.data['events'].length).to eq(1)
      expect(Worker.scheduled?(LogSession, :perform_action, {'id' => s.id, 'method' => 'process_external_callbacks', 'arguments' => []})).to eq(true)
    end
  end

  describe "process_external_callbacks" do
    it "should use the same user_id as returned in a Token api call" do
      user = User.create
      dk = DeveloperKey.create
      device = Device.create(user: user, developer_key_id: dk.id)
      ui = UserIntegration.create(user: user, device: device, integration_key: 'communication_workshop')
      s = LogSession.create(user: user, author: user, device: device)
      s.log_type = 'modeling_activities'
      s.data = {'events' => [
        {'modeling_action' => 'asdf', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123'},
        {'modeling_action' => 'jkl', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123', 'modeling_action_score' => 4},
      ]}
      token = JsonApi::Token.as_json(user, device)
      user_id = token['anonymized_user_id']
      expect(Typhoeus).to receive(:post).with("https://workshop.openaac.org/api/v1/external", body: {
        integration_id: dk.key,
        integration_secret: dk.secret,
        user_id: user_id,
        updates: [{
          action: 'asdf',
          word: 'with',
          locale: 'en',
          activity_id: '123',
          score: nil       
        }, {
          action: 'jkl',
          word: 'with',
          locale: 'en',
          activity_id: '123',
          score: 4       
        }]
      }, timeout: 10).and_return(OpenStruct.new(body: {
        accepted: true
      }.to_json))
      expect(s.process_external_callbacks).to eq(true)
      expect(s.data['events'].map{|e| e['external_processed']}).to eq([true, true])
    end

    it "should only update if any external events haven't been processed" do
      user = User.create
      dk = DeveloperKey.create
      device = Device.create(user: user, developer_key_id: dk.id)
      ui = UserIntegration.create(user: user, device: device, integration_key: 'communication_workshop')
      s = LogSession.create(user: user, author: user, device: device)
      s.log_type = 'modeling_activities'
      s.data = {'events' => [
        {'external_processed' => true, 'modeling_action' => 'asdf', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123'},
        {'external_processed' => true, 'modeling_action' => 'jkl', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123', 'modeling_action_score' => 4},
      ]}
      token = JsonApi::Token.as_json(user, device)
      user_id = token['anonymized_user_id']
      expect(Typhoeus).to_not receive(:post)
      expect(s.process_external_callbacks).to eq(true)
    end
    
    it "should send the modeling information to the communication_workshop endpoint if specified" do
      user = User.create
      dk = DeveloperKey.create
      device = Device.create(user: user, developer_key_id: dk.id)
      ui = UserIntegration.create(user: user, device: device, integration_key: 'communication_workshop')
      s = LogSession.create(user: user, author: user, device: device)
      s.log_type = 'modeling_activities'
      s.data = {'events' => [
        {'modeling_action' => 'asdf', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123'},
        {'external_processed' => true, 'modeling_action' => 'jkl', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123', 'modeling_action_score' => 4},
      ]}
      user_id = user.anonymized_identifier("external_for_#{device.developer_key_id}")
      expect(Typhoeus).to receive(:post).with("https://workshop.openaac.org/api/v1/external", body: {
        integration_id: dk.key,
        integration_secret: dk.secret,
        user_id: user_id,
        updates: [{
          action: 'asdf',
          word: 'with',
          locale: 'en',
          activity_id: '123',
          score: nil       
        }]
      }, timeout: 10).and_return(OpenStruct.new(body: {
        accepted: true
      }.to_json))
      expect(s.process_external_callbacks).to eq(true)
    end

    it "should not update on error" do
      user = User.create
      dk = DeveloperKey.create
      device = Device.create(user: user, developer_key_id: dk.id)
      ui = UserIntegration.create(user: user, device: device, integration_key: 'communication_workshop')
      s = LogSession.create(user: user, author: user, device: device)
      s.user = user
      s.log_type = 'modeling_activities'
      s.data = {'events' => [
        {'modeling_action' => 'asdf', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123'},
        {'external_processed' => true, 'modeling_action' => 'jkl', 'modeling_word' => 'with', 'modeling_locale' => 'en', 'modeling_activity_id' => '123', 'modeling_action_score' => 4},
      ]}
      user_id = user.anonymized_identifier("external_for_#{device.developer_key_id}")
      expect(Typhoeus).to receive(:post).with("https://workshop.openaac.org/api/v1/external", body: {
        integration_id: dk.key,
        integration_secret: dk.secret,
        user_id: user_id,
        updates: [{
          action: 'asdf',
          word: 'with',
          locale: 'en',
          activity_id: '123',
          score: nil       
        }]
      }, timeout: 10).and_return(OpenStruct.new(body: {
        accepted: false
      }.to_json))
      expect(s).to_not receive(:save!)
      expect(s.process_external_callbacks).to eq(false)
    end
  end

  describe "message_all" do
    it "should require a device and sender" do
      expect(LogSession.message_all([], {})).to eq(false)
    end

    it "should return a list of session ids" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      d = Device.create(user: u3)
      list = LogSession.message_all([u1.global_id, u2.global_id], {
        'device_id' => d.global_id,
        'sender_id' => u3.global_id,
        'message' => "Howdy",
        'video' => {a: 1},
        'include_footer' => true,
        'notify_exclude_ids' => [1,2,3]
      })
      expect(list.length).to eq(2)
      expect(LogSession.find_all_by_global_id(list).length).to eq(2)
    end

    it "should create a notifying note on each user" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      d = Device.create(user: u3)
      list = LogSession.message_all([u1.global_id, u2.global_id], {
        'device_id' => d.global_id,
        'sender_id' => u3.global_id,
        'message' => "Howdy",
        'video' => {a: 1},
        'include_footer' => true,
        'notify_exclude_ids' => [1,2,3]
      })
      expect(list.length).to eq(2)
      logs = LogSession.find_all_by_global_id(list).sort_by{|l| l.user_id}
      expect(logs.length).to eq(2)
      expect(logs[0].user).to eq(u1);
      expect(logs[0].data['note']['text']).to eq('Howdy');
      expect(logs[0].data['note']['video']).to eq({'a' => 1});
      expect(logs[0].data['note']['timestamp']).to be > 5.seconds.ago.to_i
      expect(logs[0].data['note']['timestamp']).to be < 5.seconds.from_now.to_i
      expect(logs[0].data['include_status_footer']).to eq(true)
      expect(logs[0].data['notify_exclude_ids']).to eq([1,2,3])

      expect(logs[1].user).to eq(u2);
      expect(logs[1].data['note']['text']).to eq('Howdy');
      expect(logs[1].data['note']['video']).to eq({'a' => 1});
      expect(logs[1].data['note']['timestamp']).to be > 5.seconds.ago.to_i
      expect(logs[1].data['note']['timestamp']).to be < 5.seconds.from_now.to_i
      expect(logs[1].data['include_status_footer']).to eq(true)
      expect(logs[1].data['notify_exclude_ids']).to eq([1,2,3])
    end
  end

  describe "update_profile_summaries" do
    it "should schedule profile summary updates" do
      s = LogSession.new
      s.log_type = 'profile'
      s.data = {'profile' => {}}
      s.profile_id = 0
      s.user = User.new
      expect(s).to receive(:schedule).with(:update_profile_summaries, true)
      expect(UserExtra).to_not receive(:find_or_create_by)
      s.update_profile_summaries
    end

    it "should not schedule for non-profile-type sessions" do
      s = LogSession.new
      s.log_type = 'session'
      s.data = {'profile' => {}}
      s.profile_id = 0
      s.user = User.new
      expect(s).to_not receive(:schedule).with(:update_profile_summaries, true)
      expect(UserExtra).to_not receive(:find_or_create_by)
      s.update_profile_summaries
    end

    it "should call process_profile for user extras" do
      u = User.create
      s = LogSession.new
      s.log_type = 'profile'
      s.data = {'profile' => {'template_id' => 'aaa'}}
      s.profile_id = 0
      s.user = u
      ue = UserExtra.find_or_create_by(user: u)
      expect(s).to_not receive(:schedule).with(:update_profile_summaries, true)
      expect(UserExtra).to receive(:find_or_create_by).and_return(ue)
      expect(ue).to receive(:process_profile).with('0', 'aaa')
      s.update_profile_summaries(true)
    end
  end

  describe "anonymous_logs" do
    it "should create a zip file" do
      expect(OBF::Utils).to receive(:build_zip)
      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.zip"})
      expect(LogSession.anonymous_logs).to eq({urls: ["http://www.example.com/file.zip"]})
      expect(Permissable.permissions_redis.get('global/anonymous/logs/url')).to eq(["http://www.example.com/file.zip"].to_json)
    end

    it "should only include users who have un-opted for publishing" do
      ts = (Date.today << 1).to_time.to_i
      u1 = User.create
      u1.settings['preferences']['allow_log_reports'] = true
      u1.settings['preferences']['allow_log_publishing'] = true
      u1.save
      d1 = Device.create(user: u1)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u1, :author => u1, :device => d1, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)

      u2 = User.create
      u2.settings['preferences']['allow_log_reports'] = true
      u2.settings['preferences']['allow_log_publishing'] = false
      u2.save
      d2 = Device.create(user: u2)
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.track_trends(WeeklyStatsSummary.date_to_weekyear(Date.today << 1))

      u3 = User.create
      d3 = Device.create(user: u3)
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u3, :author => u3, :device => d3, :ip_address => '1.2.3.4'})

      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.zip"})
      expect(Exporter).to receive(:export_logs) do |user_id, anon, zipper|
        expect(anon).to eq(true)
        expect(zipper).to_not eq(nil)
        expect(user_id).to eq(u1.global_id)
      end
      expect(LogSession.anonymous_logs).to eq({urls: ["http://www.example.com/file.zip"]})
      expect(Permissable.permissions_redis.get('global/anonymous/logs/url')).to eq(["http://www.example.com/file.zip"].to_json)
    end


    it "should only export anonymized logs" do
      u1 = User.create
      u1.settings['preferences']['allow_log_reports'] = true
      u1.settings['preferences']['allow_log_publishing'] = true
      u1.save
      d1 = Device.create(user: u1)
      ts = (Date.today << 1).to_time.to_i
      puts Time.at(ts)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u1, :author => u1, :device => d1, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)
      WeeklyStatsSummary.track_trends(WeeklyStatsSummary.date_to_weekyear(Date.today << 1))

      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.zip"})
      expect(Exporter).to receive(:export_logs) do |user_id, anon, zipper|
        expect(anon).to eq(true)
        expect(zipper).to_not eq(nil)
        expect(user_id).to eq(u1.global_id)
      end
      expect(LogSession.anonymous_logs).to eq({urls: ["http://www.example.com/file.zip"]})
      expect(Permissable.permissions_redis.get('global/anonymous/logs/url')).to eq(["http://www.example.com/file.zip"].to_json)
    end
  end
end
