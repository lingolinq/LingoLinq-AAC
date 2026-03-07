require 'spec_helper'

describe WeeklyStatsSummary, :type => :model do
  it "should error if no index defined" do
    expect { WeeklyStatsSummary.create }.to raise_error("no summary index defined")
  end
  
  it "should generate cached stats tied to a specific log" do
    u = User.create
    d = Device.create(:user => u)
    expect(ClusterLocation).to receive(:clusterize_cutoff).and_return(Date.parse('2015-01-01')).at_least(1).times
    s1 = LogSession.process_new({'events' => [
      {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
    ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s2 = LogSession.process_new({'events' => [
      {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
    ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
    ClusterLocation.clusterize_ips(u.global_id)
    ClusterLocation.clusterize_geos(u.global_id)
    ip_cluster = ClusterLocation.where(:cluster_type => 'ip_address').last
    expect(ip_cluster).not_to eq(nil)
    WeeklyStatsSummary.update_for(s2.global_id)
    summary = WeeklyStatsSummary.last
    
    expect(summary.user_id).to eq(u.id)
    data = summary.data['stats']
    expect(data['started_at']).not_to eq(nil)
    expect(data['ended_at']).not_to eq(nil)
    expect(data['devices']).not_to eq(nil)
    expect(data['locations']).not_to eq(nil)
    expect(data['all_button_counts']).not_to eq(nil)
    expect(data['all_word_counts']).not_to eq(nil)
    expect(data['total_sessions']).to eq(2)
    expect(data['total_session_seconds']).to eq(6.0)
    expect(data['total_utterance_buttons']).to eq(0.0)
    expect(data['total_utterance_words']).to eq(5.0)
    expect(data['total_utterances']).to eq(2.0)
    expect(data['days'].keys.sort).to eq(["2015-05-03", "2015-05-04", "2015-05-05", "2015-05-06", "2015-05-07", "2015-05-08", "2015-05-09"])
    expect(data['days']["2015-05-05"]['total']['total_sessions']).to eq(1)
    expect(data['days']["2015-05-05"]['total']['devices']).not_to eq(nil)
    expect(data['days']["2015-05-05"]['group_counts'].length).to eq(1)
    expect(data['days']["2015-05-05"]['group_counts'][0]['device_id']).to eq(d.global_id)
    expect(data['days']["2015-05-05"]['group_counts'][0]['geo_cluster_id']).to eq(nil)
    expect(data['days']["2015-05-05"]['group_counts'][0]['ip_cluster_id']).to eq(ip_cluster.global_id)
    expect(data['days']["2015-05-07"]['total']['total_sessions']).to eq(1)
    expect(data['days']["2015-05-07"]['total']['locations']).not_to eq(nil)
    expect(data['days']["2015-05-07"]['group_counts'].length).to eq(1)
    expect(data['days']["2015-05-07"]['group_counts'][0]['device_id']).to eq(d.global_id)
    expect(data['days']["2015-05-07"]['group_counts'][0]['geo_cluster_id']).to eq(nil)
    expect(data['days']["2015-05-07"]['group_counts'][0]['ip_cluster_id']).to eq(ip_cluster.global_id)
    expect(data['modeled_word_counts']).to eq({'ok' => 2, 'go' => 1})
    expect(data['modeled_button_counts']).to eq({'1::1_1' => {'button_id' => 1, 'board_id' => '1_1', 'text' => 'ok go ok', 'count' => 2}})
  end

  it "should schedule board stats generation (only for popular boards?)" do
    u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
    d = Device.create(:user => u)
    s1 = LogSession.process_new({'events' => [
      {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
    ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s2 = LogSession.process_new({'events' => [
      {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
    ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
  
    u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
    d2 = Device.create(:user => u2)
    s3 = LogSession.process_new({'events' => [
      {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
      {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
    ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
    s4 = LogSession.process_new({'events' => [
      {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
    ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
  
    expect(Worker).to receive(:schedule_for) do |queue, sum, action, args|
      if(args && args['method'] == 'update_for_board')
        expect(queue.to_s).to eq('slow')
        expect(sum).to_not eq(nil)
        expect(action).to eq(:perform_action)
        expect(args).to eq({
          'method' => 'update_for_board',
          'arguments' => [s2.global_id]
        })
      end
    end.at_least(1).times
    WeeklyStatsSummary.update_for(s2.global_id)
  end

  describe "update_for_board" do
    it "should have specs" do
    end
  end
  
  describe "track_for_trends" do
    it 'should collect data from all summaries for the specified weekyear' do
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d2 = Device.create(:user => u2)
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s4.global_id)

      summary = WeeklyStatsSummary.last
      expect(summary.weekyear).to eq(201518)
      
      sum = WeeklyStatsSummary.track_trends(201518)
      expect(sum).to_not eq(nil)
      
      expect(sum.data['totals']['total_users']).to eq(2)
      expect(sum.data['totals']['total_buttons']).to eq(6)
    end
    
    it 'should include basic totals' do
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          
      u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d2 = Device.create(:user => u2)
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s4.global_id)

      summary = WeeklyStatsSummary.last
      expect(summary.weekyear).to eq(201518)
      
      sum = WeeklyStatsSummary.track_trends(201518)
      expect(sum).to_not eq(nil)
      
      expect(sum.data['totals']['total_users']).to eq(2)
      expect(sum.data['totals']['total_modeled_words']).to eq(6)
      expect(sum.data['totals']['total_modeled_buttons']).to eq(4)
      expect(sum.data['totals']['total_words']).to eq(9)
      expect(sum.data['totals']['total_buttons']).to eq(6)
      expect(sum.data['totals']['total_core_words']).to eq(0)
      expect(sum.data['word_counts']).to eq({'ok' => 2, 'go' => 1})
    end
    
    it 'should include word counts, travel sums and depth counts' do
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'ok go ok', 'depth' => 0, 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'depth' => 0, 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'depth' => 1, 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.data['stats']['all_button_counts']['1::1_1']['depth_sum']).to eq(0)
    
      u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d2 = Device.create(:user => u2)
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'ok go ok', 'depth' => 5, 'percent_travel' => 0.2, 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'depth' => 2, 'percent_travel' => 0.8, 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'depth' => 2, 'percent_travel' => 0.5, 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => 1431029747 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1431029747}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
      expect(s3.data['stats']['all_button_counts']['1::1_1']['depth_sum']).to eq(5)
      s4 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 1430856977}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s4.global_id)

      summary = WeeklyStatsSummary.last
      expect(summary.weekyear).to eq(201518)
      
      sum = WeeklyStatsSummary.track_trends(201518)
      expect(sum).to_not eq(nil)
      
      expect(sum.data['word_counts']).to eq({
        'ok' => 4,
        'go' => 2
      })
      expect(sum.data['depth_counts']).to eq({
        '0' => 1,
        '5' => 1
      })
      expect(sum.data['word_travels']).to eq({'ok go ok' => 0.7})
    end
    
    it 'should include words available in user button sets' do
      expect(WordData.standardized_words['good']).to eq(true)
      expect(WordData.standardized_words['with']).to eq(true)
      expect(WordData.standardized_words['when']).to eq(true)
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      
      threes = ['me', 'me', 'that', 'that', 'baegwgaweg']
      10.times do |i|
        u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
        d = Device.create(:user => u)
        b = Board.create(:user => u, :settings => {
          'buttons' => [
            {'id' => '1', 'label' => 'good'},
            {'id' => '2', 'label' => 'with'},
            {'id' => '3', 'label' => threes[i]}
          ]
        })
        u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
        u.save
        BoardDownstreamButtonSet.update_for(b.global_id)
        s1 = LogSession.process_new({'events' => [
          {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      
      sum = WeeklyStatsSummary.last
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      expect(sum).to_not eq(nil)
      expect(sum.data['available_words']['good'].length).to eq(10)
      expect(sum.data['available_words']['with'].length).to eq(10)
      expect(sum.data['available_words']['me']).to eq(nil)
      expect(sum.data['available_words']['that']).to eq(nil)
    end
    
    it 'should include only public user home board roots' do
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      b = Board.create(:user => u, :public => true)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      s1 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts.to_i}
      ]}, {:user => u, :author => u, :device => Device.create(:user => u), :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)
      
      u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      b2 = Board.create(:user => u2)
      u2.settings['preferences']['home_board'] = {'id' => b2.global_id, 'key' => b2.key}
      u2.save
      s2 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts.to_i}
      ]}, {:user => u2, :author => u2, :device => Device.create(:user => u2), :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s2.global_id)
      
      5.times do |i|
        u3 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
        b3 = Board.create(:user => u, :public => false, :parent_board => b)
        u3.settings['preferences']['home_board'] = {'id' => b3.global_id, 'key' => b3.key}
        u3.save
        s3 = LogSession.process_new({'events' => [
          {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts.to_i}
        ]}, {:user => u3, :author => u3, :device => Device.create(:user => u3), :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s3.global_id)
        
        u4 = User.create
        b4 = Board.create(:user => u, :public => false, :parent_board => b2)
        u4.settings['preferences']['home_board'] = {'id' => b4.global_id, 'key' => b4.save}
        u4.save
        s4 = LogSession.process_new({'events' => [
          {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts.to_i}
        ]}, {:user => u4, :author => u4, :device => Device.create(:user => u4), :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s4.global_id)
      end
      
      sum = WeeklyStatsSummary.last
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      expect(sum.data['home_boards']).to_not eq({})
      expect(sum.data['home_boards'][b.key].length).to eq(6)
    end
    
    it 'should include word matches' do
      user_ids = []
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      6.times do
        u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
        user_ids << u.id
        d = Device.create(:user => u)
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      
      sum = WeeklyStatsSummary.last
      expect(sum.data['stats']['word_pairs']).to eq({"4ef675c7908e29474e184f185134bfd6"=>{"a"=>"this", "b"=>"that", "count"=>1}, "51122eaf1983d05e75976c574d8530ef"=>{"a"=>"that", "b"=>"then", "count"=>1}})
      
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      expect(sum.data['word_pairs']).to eq({
        "4ef675c7908e29474e184f185134bfd6"=>{"count"=>6, "a"=>"this", "b"=>"that", "user_ids"=>user_ids, 'user_count' => 6}, 
        "51122eaf1983d05e75976c574d8530ef"=>{"count"=>6, "a"=>"that", "b"=>"then", "user_ids"=>user_ids, 'user_count' => 6}
      })
    end

    it 'should not include users in word stats who have not enabled log reports' do
      user_ids = []
      all_user_ids = []
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      6.times do
        u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
        user_ids << u.id
        all_user_ids << u.global_id
        d = Device.create(:user => u)
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      sum = WeeklyStatsSummary.last
      expect(sum.data['stats']['word_pairs']).to eq({"4ef675c7908e29474e184f185134bfd6"=>{"a"=>"this", "b"=>"that", "count"=>1}, "51122eaf1983d05e75976c574d8530ef"=>{"a"=>"that", "b"=>"then", "count"=>1}})
      6.times do
        u = User.create(:settings => {'preferences' => {'allow_log_reports' => false}})
        all_user_ids << u.global_id
        d = Device.create(:user => u)
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'big', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'bad', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'bold', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      sum = WeeklyStatsSummary.last
      expect(sum.data['stats']['word_pairs']).to eq({"1f265e9248329382b176b97963cb0d75" => {"a"=>"big", "b"=>"bad", "count"=>1}})
      
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      expect(sum.data['totals']['total_users']).to eq(12)
      expect(sum.data['totals']['total_words']).to eq(18) # not 36
      expect(sum.data['totals']['admin_total_words']).to eq(36)
      expect(sum.data['user_ids'].sort).to eq(all_user_ids.sort)
      expect(sum.data['word_counts']).to eq({
        'this' => 6, 'that' => 6, 'then' => 6
      })
      expect(sum.data['word_pairs']).to eq({
        "4ef675c7908e29474e184f185134bfd6"=>{"count"=>6, "a"=>"this", "b"=>"that", "user_ids"=>user_ids, 'user_count' => 6}, 
        "51122eaf1983d05e75976c574d8530ef"=>{"count"=>6, "a"=>"that", "b"=>"then", "user_ids"=>user_ids, 'user_count' => 6}
      })
    end

    it "should update a user's target_list if for the current week" do
      u = User.create
      d = Device.create(:user => u)
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      10.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'good', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 10 - (i * 60)},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'want', 'button_id' => 2, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 9 - (i * 60)},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'like', 'button_id' => 3, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 8 - (i * 60)},
          {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'like', 'button_id' => 4, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 7 - (i * 60)},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 5, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 6 - (i * 60)},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'wait', 'button_id' => 6, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5 - (i * 60)},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'like', 'button_id' => 7, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 4 - (i * 60)},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'like', 'button_id' => 8, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3 - (i * 60)},
          {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'with', 'button_id' => 9, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      
      sum = WeeklyStatsSummary.last
      expect(sum.data['stats']['watchwords']).to eq({
        'popular_modeled_words' => {'with' => 1.0},
        'suggestions' => []
      })
    end
    
      
    it "should include goal data" do
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      mid_week = Time.at(ts).utc.iso8601
      week_start = Time.at(ts).utc.beginning_of_week(:sunday)
      tg = UserGoal.create(template: true, global: true, settings: {'summary' => 'template goal'})
      g1 = UserGoal.create(:user => u, active: true, settings: {'summary' => 'good goal', 'started_at' => (2.weeks.ago.beginning_of_week(:sunday) + 4.days).iso8601})
      g2 = UserGoal.create(:user => u, active: true, settings: {'template_id' => tg.global_id, 'summary' => 'temp goal', 'started_at' => (1.week.ago.beginning_of_week(:sunday) + 4.days).iso8601})
      g3 = UserGoal.create(:user => u, active: false, settings: {'summary' => 'old goal', 'started_at' => (week_start - 1.day).iso8601, 'ended_at' => (week_start + 3.days + 12.hours).iso8601})
      g4 = UserGoal.create(:user => u, settings: {'summary' => 'really old goal', 'started_at' => 6.weeks.ago.iso8601, 'ended_at' => (2.weeks.ago.beginning_of_week(:sunday) + 4.days).iso8601})
      b1 = UserBadge.create(user: u, user_goal: g2, level: 1, earned: true, data: {'earn_recorded' => mid_week})
      b2 = UserBadge.create(user: u, user_goal: tg, level: 2, earned: true, data: {'earn_recorded' => mid_week})

      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)

      sum = WeeklyStatsSummary.last
      hash = {
        'goals_set' => {},
        'badges_earned' => {}
      }
      hash['goals_set'][g1.global_id] = {'template_goal_id' => nil, 'name' => 'good goal'}
      hash['goals_set'][g2.global_id] = {'template_goal_id' => tg.global_id, 'name' => 'template goal'}
      hash['goals_set'][g3.global_id] = {'template_goal_id' => nil, 'name' => 'old goal'}
      hash['badges_earned'][b1.global_id] = {'goal_id' => g2.global_id, 'template_goal_id' => tg.global_id, 'level' => 1, 'global' => nil, 'shared' => nil, 'name' => 'Unnamed Badge', 'image_url' => nil}
      hash['badges_earned'][b2.global_id] = {'goal_id' => tg.global_id, 'template_goal_id' => tg.global_id, 'level' => 2, 'global' => true, 'shared' => nil, 'name' => 'Unnamed Badge', 'image_url' => nil}
      expect(sum.data['stats']['goals']).to eq(hash)
      
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      hash['goals_set'] = {}
      hash['goals_set']['private'] = {'ids' => [g1.global_id, g3.global_id], 'user_ids' => [u.id, u.id]}
      hash['goals_set'][tg.global_id] = {'name' => 'template goal', 'user_ids' => [u.id]}
      hash['badges_earned'] = {}
      hash['badges_earned'][tg.global_id] = {'goal_id' => tg.global_id, 'name' => 'Unnamed Badge', 'global' => nil, 'levels' => [1, 2], 'user_ids' => [u.id, u.id], 'shared_user_ids' => []}
      expect(sum.data['goals']['goals_set']['private']['ids'].sort).to eq(hash['goals_set']['private']['ids'].sort)
      expect(sum.data['goals']['goals_set']['private']['user_ids']).to eq(hash['goals_set']['private']['user_ids'])
      expect(sum.data['goals']['goals_set'][tg.global_id]).to eq(hash['goals_set'][tg.global_id])
      expect(sum.data['goals']['badges_earned'][tg.global_id]).to eq(hash['badges_earned'][tg.global_id])
    end
    
    it "should include buttons used data" do
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      b = Board.create(user: u, public: true)
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      6.times do
        sub_b = Board.create!(user: u, public: true, parent_board_id: b.id)
        u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
        d = Device.create(:user => u)
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 2, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 3, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      expect(b.reload.child_boards.count).to eq(6)
      b.generate_stats
      expect(b.settings['forks']).to eq(6)
      b.save

      sum = WeeklyStatsSummary.last
      expect(sum.data['stats']['buttons_used']).to eq({
        'button_ids' => ["#{b.global_id}:1", "#{b.global_id}:2", "#{b.global_id}:3"],
        'button_chains' => {
          'this, that, then' => 1
        }
      })
      
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      hash = {}
      hash[b.key] = 18
      expect(sum.data['board_usages']).to eq(hash)
    end
  end
  
  describe "trends" do
    it 'should include basic totals' do
      start = 1.month.ago.to_date
      cweek = start.beginning_of_week(:sunday).cweek
      cwyear = start.beginning_of_week(:sunday).cwyear
      cw1 = (cwyear * 100) + cweek
      cw2 = (cwyear * 100) + cweek + 1
      
      sum1 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw1, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum2 = WeeklyStatsSummary.create(:user_id => 1, :weekyear => cw1, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum3 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw2, :data => {
        'totals' => {
          'total_modeled_buttons' => 2,
          'total_buttons' => 11,
          'total_core_words' => 5,
          'total_words' => 18,
          'total_modeled_words' => 6,
          'total_session_seconds' => 456,
          'total_sessions' => 3
        },
        'user_ids' => ['a', 'c', 'd', 'e']
      })
      res = WeeklyStatsSummary.trends
      expect(res).to_not eq(nil)
      expect(res[:core_percent]).to eq((9.0 / (14+18).to_f * 10.0).round(1) * 10.0)
      expect(res[:modeled_percent]).to eq((7.0 / (8 + 11).to_f * 10.0).round(1) / 10.0 * 100.0)
      expect(res[:total_session_seconds]).to eq(123+456)
      expect(res[:words_per_minute]).to eq(((2+12+12+6).to_f / (123+456).to_f * 60.0).round(1))
    end
    
    it 'should include board usages' do
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      b = Board.create(user: u, public: true)
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      6.times do
        sub_b = Board.create!(user: u, public: true, parent_board_id: b.id)
        u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
        d = Device.create(:user => u)
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 2, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
          {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 3, 'board' => {'id' => b.global_id}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
      end
      b.reload.generate_stats
      b.save

      sum = WeeklyStatsSummary.last
      expect(sum.data['stats']['buttons_used']).to eq({
        'button_ids' => ["#{b.global_id}:1", "#{b.global_id}:2", "#{b.global_id}:3"],
        'button_chains' => {
          'this, that, then' => 1
        }
      })
      
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      hash = {}
      hash[b.key] = 18
      expect(sum.data['board_usages']).to eq(hash)
      
      res = WeeklyStatsSummary.trends
      hash[b.key] = 1.0
      expect(res[:board_usages]).to eq(hash)
    end
    
    it 'should include goals data' do
      ts = (Time.now.beginning_of_week(:sunday) + 4.days).to_i
      mid_week = Time.at(ts).utc.iso8601
      week_start = Time.at(ts).utc.beginning_of_week(:sunday)
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      tg = UserGoal.create(template: true, global: true, settings: {'summary' => 'template goal'})
      g1 = UserGoal.create(:user => u, active: true, settings: {'summary' => 'good goal', 'started_at' => (2.weeks.ago.beginning_of_week(:sunday) + 4.day).iso8601})
      g2 = UserGoal.create(:user => u, active: true, settings: {'template_id' => tg.global_id, 'summary' => 'temp goal', 'started_at' => (1.week.ago.beginning_of_week(:sunday) + 4.days).iso8601})
      g3 = UserGoal.create(:user => u, active: false, settings: {'summary' => 'old goal', 'started_at' => (week_start - 1.day).iso8601, 'ended_at' => (week_start + 3.days + 12.hours).iso8601})
      g4 = UserGoal.create(:user => u, settings: {'summary' => 'really old goal', 'started_at' => 6.weeks.ago.iso8601, 'ended_at' => (2.weeks.ago.beginning_of_week(:sunday) + 4.days).iso8601})
      b1 = UserBadge.create(user: u, user_goal: g2, level: 1, earned: true, data: {'earn_recorded' => mid_week})
      b2 = UserBadge.create(user: u, user_goal: tg, level: 2, earned: true, data: {'earn_recorded' => mid_week})

      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 5},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i - 3},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)

      sum = WeeklyStatsSummary.last
      hash = {
        'goals_set' => {},
        'badges_earned' => {}
      }
      hash['goals_set'][g1.global_id] = {'template_goal_id' => nil, 'name' => 'good goal'}
      hash['goals_set'][g2.global_id] = {'template_goal_id' => tg.global_id, 'name' => 'template goal'}
      hash['goals_set'][g3.global_id] = {'template_goal_id' => nil, 'name' => 'old goal'}
      hash['badges_earned'][b1.global_id] = {'goal_id' => g2.global_id, 'template_goal_id' => tg.global_id, 'level' => 1, 'global' => nil, 'shared' => nil, 'name' => 'Unnamed Badge', 'image_url' => nil}
      hash['badges_earned'][b2.global_id] = {'goal_id' => tg.global_id, 'template_goal_id' => tg.global_id, 'level' => 2, 'global' => true, 'shared' => nil, 'name' => 'Unnamed Badge', 'image_url' => nil}
      expect(sum.data['stats']['goals']).to eq(hash)
      
      sum = WeeklyStatsSummary.track_trends(sum.weekyear)
      hash['goals_set'] = {}
      hash['goals_set']['private'] = {'ids' => [g1.global_id, g3.global_id], 'user_ids' => [u.id, u.id]}
      hash['goals_set'][tg.global_id] = {'name' => 'template goal', 'user_ids' => [u.id]}
      hash['badges_earned'] = {}
      hash['badges_earned'][tg.global_id] = {'goal_id' => tg.global_id, 'name' => 'Unnamed Badge', 'global' => nil, 'levels' => [1, 2], 'user_ids' => [u.id, u.id], 'shared_user_ids' => []}
      expect(sum.data['goals']).to eq(hash)
      
      res = WeeklyStatsSummary.trends
      hash = {}
      hash[tg.global_id] = {'id' => tg.global_id, 'name' => 'template goal', 'users' => 1.0, 'image_url' => nil}
      expect(res[:goals]).to eq(hash)
      hash[tg.global_id] = {'template_goal_id' => tg.global_id, 'name' => 'Unnamed Badge', 'levels' => {'1' => 0.5, '2' => 0.5}, 'users' => 1.0, 'image_url' => nil}
      expect(res[:badges]).to eq(hash)
    end

    it 'should include basic totals for each week' do
      start = 1.month.ago.to_date
      cweek = start.beginning_of_week(:sunday).cweek
      cwyear = start.beginning_of_week(:sunday).cwyear
      cw1 = (cwyear * 100) + cweek
      cw2 = (cwyear * 100) + cweek + 1
      
      sum1 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw1, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum3 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw2, :data => {
        'totals' => {
          'total_modeled_buttons' => 2,
          'total_buttons' => 11,
          'total_core_words' => 5,
          'total_words' => 18,
          'total_modeled_words' => 6,
          'total_session_seconds' => 456,
          'total_sessions' => 3
        },
        'user_ids' => ['a', 'c', 'd', 'e']
      })
      res = WeeklyStatsSummary.trends
      expect(res).to_not eq(nil)
      expect(res['weeks'][cw1]).to eq({
        'modeled_percent' => (5.0 / 8.0 * 10.0).round(1) / 10.0 * 100.0,
        'core_percent' => (4.0 / 14.0 * 10.0).round(1) * 10.0,
        'words_per_minute' => (14.0 / 123.0 * 60.0).round(1),
        'badges_percent' => 0.0,
        'goals_percent' => 0.0
      })
      expect(res['weeks'][cw2]).to eq({
        'modeled_percent' => (2.0 / 11.0 * 10.0).round(1) / 10.0 * 100.0,
        'core_percent' => (5.0 / 18.0 * 10.0).round(1) * 10.0,
        'words_per_minute' => (18.0 / 456.0 * 60.0).round(1),
        'badges_percent' => 0.0,
        'goals_percent' => 0.0
      })
    end
    
    it 'should not include really old trend data' do
      start = 1.month.ago.to_date
      cweek = start.beginning_of_week(:sunday).cweek
      cwyear = start.beginning_of_week(:sunday).cwyear
      cw1 = (cwyear * 100) + cweek
      cw2 = (cwyear * 100) + cweek + 1
      start = 4.months.ago.to_date
      cweek = start.beginning_of_week(:sunday).cweek
      cwyear = start.beginning_of_week(:sunday).cwyear
      cw3 = (cwyear * 100) + cweek
      
      sum1 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw1, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum2 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw3, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum3 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw2, :data => {
        'totals' => {
          'total_modeled_buttons' => 2,
          'total_buttons' => 11,
          'total_core_words' => 5,
          'total_words' => 18,
          'total_modeled_words' => 6,
          'total_session_seconds' => 456,
          'total_sessions' => 3
        },
        'user_ids' => ['a', 'c', 'd', 'e']
      })
      res = WeeklyStatsSummary.trends
      expect(res).to_not eq(nil)
      expect(res[:core_percent]).to eq((9.0 / (14+18).to_f * 10.0).round(1) * 10.0)
      expect(res[:modeled_percent]).to eq((7.0 / (8 + 11).to_f * 10.0).round(1) / 10.0 * 100.0)
      expect(res[:total_session_seconds]).to eq(123+456)
      expect(res[:words_per_minute]).to eq(((2+12+12+6).to_f / (123+456).to_f * 60.0).round(1))
      expect(res[:total_users]).to eq(nil)
      expect(res[:total_sessions]).to eq(nil)
      expect(res[:total_words]).to eq(32)
      expect(res[:sessions_per_user]).to eq(1.8)
    end
    
    it 'should include extra data for admins' do
      start = 1.month.ago.to_date
      cweek = start.beginning_of_week(:sunday).cweek
      cwyear = start.beginning_of_week(:sunday).cwyear
      cw1 = (cwyear * 100) + cweek
      cw2 = (cwyear * 100) + cweek + 1
      
      sum1 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw1, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum3 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw2, :data => {
        'totals' => {
          'total_modeled_buttons' => 2,
          'total_buttons' => 11,
          'total_core_words' => 5,
          'total_words' => 18,
          'total_modeled_words' => 6,
          'total_session_seconds' => 456,
          'total_sessions' => 3
        },
        'user_ids' => ['a', 'c', 'd', 'e']
      })
      res = WeeklyStatsSummary.trends(true)
      expect(res).to_not eq(nil)
      expect(res[:core_percent]).to eq((9.0 / (14+18).to_f * 10.0).round(1) * 10.0)
      expect(res[:modeled_percent]).to eq((7.0 / (8 + 11).to_f * 10.0).round(1) / 10.0 * 100.0)
      expect(res[:total_session_seconds]).to eq(123+456)
      expect(res[:words_per_minute]).to eq(((2+12+12+6).to_f / (123+456).to_f * 60.0).round(1))
      expect(res[:total_users]).to eq(nil)
      expect(res[:total_sessions]).to eq(nil)
      expect(res[:sessions_per_user]).to eq(9.0 / 5.0)
      expect(res[:total_words]).to eq(32)
      json = JSON.parse(Permissable.permissions_redis.get('global/stats/trends'))
      expect(json['admin']).to_not eq(nil)
      expect(json['admin']['total_users']).to eq(5)
      expect(json['admin']['total_sessions']).to eq(9)
    end

    it 'should cache admin data but not include it in the results' do
      start = 1.month.ago.to_date
      cweek = start.beginning_of_week(:sunday).cweek
      cwyear = start.beginning_of_week(:sunday).cwyear
      cw1 = (cwyear * 100) + cweek
      cw2 = (cwyear * 100) + cweek + 1
      
      sum1 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw1, :data => {
        'totals' => {
          'total_modeled_buttons' => 5,
          'total_buttons' => 8,
          'total_core_words' => 4,
          'total_words' => 14,
          'total_modeled_words' => 12,
          'total_session_seconds' => 123,
          'total_sessions' => 6
        },
        'user_ids' => ['a', 'b', 'c']
      })
      sum3 = WeeklyStatsSummary.create(:user_id => 0, :weekyear => cw2, :data => {
        'totals' => {
          'total_modeled_buttons' => 2,
          'total_buttons' => 11,
          'total_core_words' => 5,
          'total_words' => 18,
          'total_modeled_words' => 6,
          'total_session_seconds' => 456,
          'total_sessions' => 3
        },
        'user_ids' => ['a', 'c', 'd', 'e']
      })
  
      res = WeeklyStatsSummary.trends()
      expect(res[:admin]).to eq(nil)
      json = JSON.parse(Permissable.permissions_redis.get('global/stats/trends'))
      expect(json['admin']).to_not eq(nil)
      expect(json['admin']['total_users']).to eq(5)
      expect(json['admin']['total_sessions']).to eq(9)
      expect(res).to_not eq(nil)
      expect(res[:core_percent]).to eq((9.0 / (14+18).to_f * 10.0).round(1) * 10.0)
      expect(res[:modeled_percent]).to eq((7.0 / (8 + 11).to_f * 10.0).round(1) / 10.0 * 100.0)
      expect(res[:total_session_seconds]).to eq(123+456)
      expect(res[:words_per_minute]).to eq(((2+12+12+6).to_f / (123+456).to_f * 60.0).round(1))
      expect(res[:sessions_per_user]).to eq(9.0 / 5.0)
      expect(res[:total_words]).to eq(32)
    end
  end
  
  describe "word_trends" do
    it 'should return a trends object' do
      res = WeeklyStatsSummary.word_trends('like')
      expect(res).to eq({
        :pairs => [],
        :usage_count => 0.0,
        :weeks => {}
      })
    end

    it 'should combine values' do
      cweek = Date.today.beginning_of_week(:sunday).cweek
      cwyear = Date.today.beginning_of_week(:sunday).cwyear
      current_weekyear = (cwyear * 100) + cweek
      sum = WeeklyStatsSummary.create(weekyear: current_weekyear, user_id: 0, data: {
        'totals' => {}, 
        'available_words' => {'like' => ['1_1', '1_2'], 'most' => ['1_1']},
        'home_board_user_ids' => ['1_1', '1_2'],
        'word_counts' => {'like' => 10, 'most' => 15},
        'word_matches' => {
          'like' => [
            {
            'a' => 'like',
            'b' => 'you',
            'count' => 4,
            'user_ids' => ['1_1', '1_2']
            },
            {
            'a' => 'not',
            'b' => 'like',
            'count' => 10,
            'user_ids' => ['1_1']
            },
          ]
        }
      })

      cweek = 2.weeks.ago.to_date.beginning_of_week(:sunday).cweek
      cwyear = 2.weeks.ago.to_date.beginning_of_week(:sunday).cwyear
      old_weekyear = (cwyear * 100) + cweek
      sum = WeeklyStatsSummary.create(weekyear: old_weekyear, user_id: 0, data: {
        'totals' => {}, 
        'available_words' => {'like' => ['1_1'], 'most' => ['1_1']},
        'home_board_user_ids' => ['1_1', '1_2', '1_4'],
        'word_counts' => {'like' => 5, 'most' => 3},
        'word_matches' => {
          'like' => [
            {
            'a' => 'like',
            'b' => 'you',
            'count' => 5,
            'user_ids' => ['1_1', '1_4']
            },
          ]
        }
      })      
      res = WeeklyStatsSummary.word_trends('like')
      weeks = {}
      weeks[current_weekyear] = {'available_for' => 1.0, 'usage_count' => 0.67}
      weeks[old_weekyear] = {'available_for' => 0.33, 'usage_count' => 1.0}
      expect(res).to eq({
        :available_for => 0.67,
        :pairs => [
          {'a' => 'like', 'b' => 'you', 'partner' => 'you', 'users' => 1.0, 'usages' => 0.9},
          {'a' => 'not', 'b' => 'like', 'partner' => 'not', 'users' => 0.33, 'usages' => 1.0},
        ],
        :usage_count => 0.75,
        :weeks => weeks
      })
    end
  end

  describe "trends_for" do
    it "should summarize trends only for the specified users" do
      ts = (3.weeks.ago.beginning_of_week(:sunday) + 4.days).to_i
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          
      u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d2 = Device.create(:user => u2)
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s4.global_id)

      summary = WeeklyStatsSummary.last
      expect(summary.weekyear).to eq(WeeklyStatsSummary.date_to_weekyear(3.weeks.ago.to_date))

      data = WeeklyStatsSummary.trends_for([u.global_id, u2.global_id])
      expect(data[:total_session_seconds]).to eq(12.0)
      expect(data[:modeled_percent]).to eq(67.0)
      expect(data[:words_per_minute]).to eq(45.0)
      expect(data[:total_words]).to eq(9)
      expect(data[:sessions_per_user]).to eq(2.0)
      expect(data[:admin][:total_users]).to eq(2)
      expect(data[:admin][:total_sessions]).to eq(4)
      expect(data[:word_counts]).to_not eq({})
      expect(data[:word_counts]).to eq({'ok' => 1.0, 'go' => 0.5})

      data = WeeklyStatsSummary.trends_for([u.global_id])
      expect(data[:total_session_seconds]).to eq(6.0)
      expect(data[:modeled_percent]).to eq(67.0)
      expect(data[:words_per_minute]).to eq(30.0)
      expect(data[:total_words]).to eq(3)
      expect(data[:sessions_per_user]).to eq(2.0)
      expect(data[:admin][:total_users]).to eq(1)
      expect(data[:admin][:total_sessions]).to eq(2)
    end

    it "should not include summaries outside the date range" do
      ts = (3.weeks.ago.beginning_of_week(:sunday) + 4.days).to_i
      u = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d = Device.create(:user => u)
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          
      u2 = User.create(:settings => {'preferences' => {'allow_log_reports' => true}})
      d2 = Device.create(:user => u2)
      ts = 20.weeks.ago.to_i
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'button', 'modeling' => true, 'button' => {'spoken' => true, 'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12'], 'timestamp' => ts - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => ts}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => ts}
      ]}, {:user => u2, :author => u2, :device => d2, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s4.global_id)

      summary = WeeklyStatsSummary.last
      expect(summary.weekyear).to eq(WeeklyStatsSummary.date_to_weekyear(20.weeks.ago.to_date))

      data = WeeklyStatsSummary.trends_for([u.global_id, u2.global_id])
      expect(data[:total_session_seconds]).to eq(6.0)
      expect(data[:modeled_percent]).to eq(67.0)
      expect(data[:words_per_minute]).to eq(30.0)
      expect(data[:total_words]).to eq(3)
      expect(data[:sessions_per_user]).to eq(2.0)
      expect(data[:admin][:total_users]).to eq(1)
      expect(data[:admin][:total_sessions]).to eq(2)
      expect(data[:word_counts]).to_not eq({})

      data = WeeklyStatsSummary.trends_for([u.global_id])
      expect(data[:total_session_seconds]).to eq(6.0)
      expect(data[:modeled_percent]).to eq(67.0)
      expect(data[:words_per_minute]).to eq(30.0)
      expect(data[:total_words]).to eq(3)
      expect(data[:sessions_per_user]).to eq(2.0)
      expect(data[:admin][:total_users]).to eq(1)
      expect(data[:admin][:total_sessions]).to eq(2)
    end
  end
end
