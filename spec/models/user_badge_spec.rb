require 'spec_helper'

describe UserBadge, type: :model do
  describe "check_for" do
    it "should mark a simple badge as earned when it's earned" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 1}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(1)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['samples']).to eq([])
      expect(badges[0].data['explanation']).to eq("3 words")
    end
    
    it "should not mark a simple badge as earned if it isn't" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 4, 'word_instances' => 4, 'interval' => 'date', 'matching_instances' => 1}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)
    end

    it "should not award for outside the date range" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("August 29, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 1, 'unit_range' => 7}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)
    end
    
    it "should award if inside the date range" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("August 29, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 1, 'unit_range' => 100}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(1)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['explanation']).to eq("3 words")
    end
        
    it "should allow retroactive badge checking" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("August 29, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 1, 'unit_range' => 7}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id, nil, true)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(1)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['explanation']).to eq("3 words")
    end
    
    it "should award a badge for using at least 10 buttons 5 days in a row" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 10},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 200},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 214},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 230},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 245}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 514},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 516}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 24.hours).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 1},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 5},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 10}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['max_level']).to eq(nil)
      expect(badges[0].data['explanation']).to eq("10 buttons")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['max_level']).to eq(nil)
      expect(badges[1].data['explanation']).to eq("10 buttons")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(0.5)
      expect(badges[2].data['max_level']).to eq(true)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['explanation']).to eq(nil)
    end
    
    it "should award a badge for speaking at least 10 words 5 weeks in a row" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016") + 4.weeks).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 512},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 514}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 7.days).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 1},
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 5},
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 10}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['explanation']).to eq("12 words")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['explanation']).to eq("12 words")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(0.5)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['explanation']).to eq(nil)
    end
    
    it "should award a badge for having a least 5 sessions 3 months in a row" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016") + 4.months).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 512}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s3 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 800}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s4 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 914}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s5 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 1122}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 31.days).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 5, 'session_instances' => 5, 'interval' => 'monthyear', 'consecutive_units' => 1},
          {'instance_count' => 5, 'session_instances' => 5, 'interval' => 'monthyear', 'consecutive_units' => 3},
          {'instance_count' => 5, 'session_instances' => 5, 'interval' => 'monthyear', 'consecutive_units' => 6}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['explanation']).to eq("5 sessions")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['explanation']).to eq("5 sessions")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(5.0 / 6.0)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['explanation']).to eq(nil)
    end
    
    it "should award a badge for using at least 3 of the watchwords twice every day for 3 weeks" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 28, 2016")).at_least(1).times
      ts = 1465279200
      21.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'cat rat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'fat cat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s3 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'fat rat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 800}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        if i > 5
          s4 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'fat rat cat sat sat sat sat sat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 800}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 24.hours).to_i
      end

      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat'], 'watch_type_minimum' => 1, 'watch_type_count' => 2, 'interval' => 'date', 'consecutive_units' => 21},
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat'], 'watch_type_minimum' => 2, 'watch_type_count' => 3, 'interval' => 'date', 'consecutive_units' => 21},
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat'], 'watch_type_minimum' => 3, 'watch_type_count' => 4, 'interval' => 'date', 'consecutive_units' => 21},
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['samples'].sort).to eq(["cat rat", "cat sat sat sat sat", "fat cat", "fat rat", "fat rat cat", "fat rat cat sat", "fat rat cat sat sat", "rat cat sat sat sat", "sat sat sat", "sat sat sat sat", "sat sat sat sat sat"])
      expect(badges[0].data['explanation']).to eq("cat rat, cat sat sat sat sat, fat cat, fat rat, fat rat cat, fat rat cat sat, fat rat cat sat sat, rat cat sat sat sat, sat sat sat, sat sat sat sat, sat sat sat sat sat")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['samples'].sort).to eq(["cat rat", "cat sat sat sat sat", "fat cat", "fat rat", "fat rat cat", "fat rat cat sat", "fat rat cat sat sat", "rat cat sat sat sat", "sat sat sat", "sat sat sat sat", "sat sat sat sat sat"])
      expect(badges[1].data['explanation']).to eq("cat rat, cat sat sat sat sat, fat cat, fat rat, fat rat cat, fat rat cat sat, fat rat cat sat sat, rat cat sat sat sat, sat sat sat, sat sat sat sat, sat sat sat sat sat")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(15.0 / 21.0)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['samples']).to eq(nil)
      expect(badges[2].data['explanation']).to eq(nil)
    end
    
    it "should award a badge for using at least 3 of the watchwords twice every day for 3 weeks, with at least 5 different watchwords each week" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 28, 2016")).at_least(1).times
      ts = 1465279200
      21.times do |i|
        if i % 2 == 0
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'cat rat fat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          s2 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'fat rat cat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        else
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'sat mat fat splat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          s2 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'splat sat on the mat with fat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        if i > 5
          s4 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'fat cat rat sat mat pat dat dat dat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 800}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 24.hours).to_i
      end

      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat', 'mat', 'pat', 'dat'], 'watch_type_minimum' => 1, 'watch_type_count' => 2, 'interval' => 'date', 'consecutive_units' => 21, 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 5},
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat', 'mat', 'pat', 'dat'], 'watch_type_minimum' => 2, 'watch_type_count' => 3, 'interval' => 'date', 'consecutive_units' => 21, 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 5},
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat', 'mat', 'pat', 'dat'], 'watch_type_minimum' => 3, 'watch_type_count' => 4, 'interval' => 'date', 'consecutive_units' => 21, 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 5},
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['samples'].sort).to eq(["cat rat fat","cat rat sat mat pat","dat dat dat","fat cat rat","fat cat rat sat","fat cat rat sat mat","fat rat cat","mat pat dat dat dat","pat dat dat dat","rat sat mat pat dat","sat mat pat dat dat"])
      expect(badges[0].data['explanation']).to eq("cat rat fat, cat rat sat mat pat, dat dat dat, fat cat rat, fat cat rat sat, fat cat rat sat mat, fat rat cat, mat pat dat dat dat, pat dat dat dat, rat sat mat pat dat, sat mat pat dat dat")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['samples'].sort).to eq(["cat rat fat","cat rat sat mat pat","dat dat dat","fat cat rat","fat cat rat sat","fat cat rat sat mat","fat rat cat","mat pat dat dat dat","pat dat dat dat","rat sat mat pat dat","sat mat pat dat dat"])
      expect(badges[1].data['explanation']).to eq("cat rat fat, dat dat dat, fat cat rat, fat cat rat sat, fat cat rat sat mat, fat rat cat, mat pat dat dat dat, pat dat dat dat")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(15.0 / 21.0)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['samples']).to eq(nil)
      expect(badges[2].data['explanation']).to eq(nil)
    end

    it "should award a partial badge for using at least 2 of the multi-part watchwords once every day for 3 weeks, with at least 2 different watchwords each week" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 28, 2016")).at_least(1).times
      ts = 1465279200
      21.times do |i|
        if i % 2 == 0
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'cat rat fat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          s2 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'fat rat cat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        else
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'sat mat fat splat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          s2 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'splat sat on the mat with fat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        if i > 5
          s4 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'fat cat rat sat mat pat dat dat dat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 800}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 24.hours).to_i
      end

      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'watchlist' => true, 'words_list' => ['cat rat', 'fat rat', 'sat mat', 'fat cat'], 'watch_type_minimum' => 1, 'watch_type_count' => 1, 'interval' => 'date', 'consecutive_units' => 21, 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 2},
          {'watchlist' => true, 'words_list' => ['cat rat', 'fat rat', 'sat mat', 'fat cat'], 'watch_type_minimum' => 1, 'watch_type_count' => 2, 'interval' => 'date', 'consecutive_units' => 21, 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 2},
          {'watchlist' => true, 'words_list' => ['cat rat', 'fat rat', 'sat mat', 'fat cat'], 'watch_type_minimum' => 2, 'watch_type_count' => 3, 'interval' => 'date', 'consecutive_units' => 21, 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 2},
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(2)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['samples'].sort).to eq(["cat rat fat", "fat cat rat sat mat pat", "fat rat cat", "cat rat sat mat pat dat dat", "fat cat rat sat mat"].sort)
      expect(badges[0].data['explanation']).to eq("cat rat fat, cat rat sat mat pat dat dat, fat cat rat sat mat, fat cat rat sat mat pat, fat rat cat")
      expect(badges[1].earned).to eq(false)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['percent']).to eq(15.0 / 21.0)
      expect(badges[1].data['samples']).to eq(nil)
      expect(badges[1].data['explanation']).to eq(nil)
    end    
    it "should award a badge for using at least 3 different parts of speech at least 5 days" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016") + 3.days).at_least(1).times
      ts = 1465279200
      5.times do |i|
        if i % 2 == 0
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'part_of_speech' => 'noun', 'label' => 'cat', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
            {'type' => 'button', 'button' => {'part_of_speech' => 'verb', 'label' => 'ran', 'button_id' => 2, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5},
            {'type' => 'button', 'button' => {'part_of_speech' => 'adjective', 'label' => 'fast', 'button_id' => 3, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 12}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        else
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'part_of_speech' => 'pronoun', 'label' => 'you', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
            {'type' => 'button', 'button' => {'part_of_speech' => 'verb', 'label' => 'ran', 'button_id' => 2, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5},
            {'type' => 'button', 'button' => {'part_of_speech' => 'adjective', 'label' => 'fast', 'button_id' => 3, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 12}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        if i > 3
          s2 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'part_of_speech' => 'pronoun', 'label' => 'you', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 21},
            {'type' => 'button', 'button' => {'part_of_speech' => 'noun', 'label' => 'dog', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 25}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        end
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 24.hours).to_i
      end
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'watchlist' => true, 'parts_of_speech_list' => ['noun', 'verb', 'adjective', 'pronoun'], 'watch_type_minimum' => 1, 'watch_type_count' => 2, 'interval' => 'date', 'matching_units' => 5},
          {'watchlist' => true, 'parts_of_speech_list' => ['noun', 'verb', 'adjective', 'pronoun'], 'watch_type_minimum' => 1, 'watch_type_count' => 3, 'interval' => 'date', 'matching_units' => 5},
          {'watchlist' => true, 'parts_of_speech_list' => ['noun', 'verb', 'adjective', 'pronoun'], 'watch_type_minimum' => 1, 'watch_type_count' => 4, 'interval' => 'date', 'matching_units' => 5},
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['samples']).to eq([])
      expect(badges[0].data['explanation']).to eq("")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['samples']).to eq([])
      expect(badges[1].data['explanation']).to eq("")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(0.2)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['samples']).to eq(nil)
      expect(badges[2].data['explanation']).to eq(nil)
    end
    
    it "should award three levels of badges at once for using at least 5, 10, and 100 buttons" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016") + 4.weeks).at_least(1).times
      ts = 1465279200
      50.times do |i|
        if i % 2 == 0
          s1 = LogSession.process_new({'events' => [
            {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
            {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5},
            {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 51},
            {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 59},
            {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 75}
          ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
          WeeklyStatsSummary.update_for(s1.global_id)
        end
        ts = (Time.at(ts) + 24.hours).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 1, 'button_instances' => 1, 'interval' => 'date', 'matching_instances' => 5},
          {'instance_count' => 1, 'button_instances' => 1, 'interval' => 'date', 'matching_instances' => 10},
          {'instance_count' => 1, 'button_instances' => 1, 'interval' => 'date', 'matching_instances' => 100}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].data['samples']).to eq([])
      expect(badges[0].data['explanation']).to eq("5 buttons")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[1].data['samples']).to eq([])
      expect(badges[1].data['explanation']).to eq("5 buttons")
      expect(badges[2].earned).to eq(true)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(1.0)
      expect(badges[2].data['name']).to eq("Good Goal")
      expect(badges[2].data['samples']).to eq([])
      expect(badges[2].data['explanation']).to eq("5 buttons")
    end
    
    it "should not award the next level of badge even if the next level is easier than the current level" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016") + 4.weeks).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 512},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 514}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 7.days).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 10},
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 5},
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 1}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(1)
      expect(badges[0].earned).to eq(false)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Good Goal")
      expect(badges[0].current_progress).to eq(0.5)
    end
    
    it "should not award if the streak is too old" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2017")).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 10},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 200},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 214},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 230},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 245}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 514},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 516}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 24.hours).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 1},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 5},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 10}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)
    end
    
    it "should not re-award an existing badge" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016") + 4.weeks).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 512},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 24.hours.to_i + 514}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 7.days).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 1},
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 5},
          {'instance_count' => 10, 'word_instances' => 10, 'interval' => 'weekyear', 'consecutive_units' => 10}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save
      b = UserBadge.create(:user => u, :user_goal => g, :level => 1, :earned => true)

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(3)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Unnamed Badge")
      expect(badges[0]).to eq(b)
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Good Goal")
      expect(badges[2].earned).to eq(false)
      expect(badges[2].level).to eq(3)
      expect(badges[2].current_progress).to eq(0.5)
      expect(badges[2].data['name']).to eq("Good Goal")
    end
    
    it "should not award if the streak ran before the goal started" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 1}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 20, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)
    end
    
    it "should track progress toward the assessment badge" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      ts = 1465279200
      5.times do |i|
        s1 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 1},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 5},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 10},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 200},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 214},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 230},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 245}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 512},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 514},
          {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => ts + 516}
        ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        WeeklyStatsSummary.update_for(s1.global_id)
        ts = (Time.at(ts) + 48.hours).to_i
      end
    
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 10, 'button_instances' => 10},
        badges: [
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 1},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 5},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 10}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      UserBadge.check_for(u.global_id)     
      UserBadge.check_for(u.global_id)     
      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(2)
      
      auto_tracks = LogSession.where(:log_type => 'assessment', :user_id => u.id).order('id DESC')

      expect(auto_tracks.count).to eq(5)
      expect(auto_tracks.map{|s| s.started_at.to_date.iso8601 }).to eq(["2016-06-09", "2016-06-08", "2016-06-07", "2016-06-06", "2016-06-05"])
      expect(auto_tracks.map{|s| s.data['assessment']['totals']['correct']}).to eq([1, 0, 1, 0, 0])
      expect(auto_tracks.map{|s| s.data['assessment']['totals']['incorrect']}).to eq([0, 1, 0, 1, 1])
      expect(auto_tracks.map{|s| s.data['assessment']['automatic']}).to eq([true, true, true, true, true])
      expect(auto_tracks.map{|s| s.data['assessment']['explanation']}).to eq(["10 buttons", false, "10 buttons", false, false])
      expect(auto_tracks.map{|s| s.data['assessment']['manual']}).to eq([false, false, false, false, false])
    end

    it "should not call check_goal_badges if earned up to the badge's max level" do
      u = User.create
      g = UserGoal.process_new({
        summary: "Good Goal",
        badges: [
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 1},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 5},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 10},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 15},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 20}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save
      expect(g.badged?).to eq(true)
      expect(g.settings['max_badge_level']).to eq(5)
      b = UserBadge.create(:user => u, :user_goal => g, level: 5, earned: true)
            
      expect(UserBadge).to_not receive(:check_goal_badges)
      UserBadge.check_for(u.global_id)
    end
    
    it "should call check_goal_badges if there's an assessment badge but no other badges" do
      u = User.create
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 10, 'button_instances' => 10},
        badges: [],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save
      expect(g.badged?).to eq(true)
      expect(g.settings['max_badge_level']).to eq(0)
            
      expect(UserBadge).to receive(:check_goal_badges).with(u, g, 0, nil, false, false)
      UserBadge.check_for(u.global_id)
    end
    
    it "should call check_goal_badges if there's an assessment badge and the other badges have all been earned" do
      u = User.create
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 10, 'button_instances' => 10},
        badges: [
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 1},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 5},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 10},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 15},
          {'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 20}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save
      expect(g.badged?).to eq(true)
      expect(g.settings['max_badge_level']).to eq(5)
      b = UserBadge.create(:user => u, :user_goal => g, level: 5, earned: true)
            
      expect(UserBadge).to receive(:check_goal_badges).with(u, g, 5, nil, false, false)
      UserBadge.check_for(u.global_id)
    end
    
    it "should generate an automated log session for the badge assessment" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 2},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 3}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 2, 'button_instances' => 2},
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      expect(LogSession.where(:log_type => 'assessment').count).to eq(0)

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)

      assessments = LogSession.where(:log_type => 'assessment').sort_by(&:id)
      expect(assessments.all?{|a| a.data['assessment']['automatic'] }).to eq(true)
      expect(assessments.map{|a| a.started_at.to_date.to_s }).to eq(["2016-06-05", "2016-06-06", "2016-06-07", "2016-06-08", "2016-06-09"])
      expect(assessments.map{|a| a.data['assessment']['totals'] }).to eq([
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 1, 'incorrect' => 0},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1}
      ])
      expect(assessments.map{|a| a.data['assessment']['explanation'] }).to eq([false, false, "3 buttons", false, false])
    end
    
    it "should update the existing log session for the badge assessment if it already exists" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1},
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 2, 'button_instances' => 2},
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      expect(LogSession.where(:log_type => 'assessment').count).to eq(0)

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)

      assessments = LogSession.where(:log_type => 'assessment').sort_by(&:id)
      expect(assessments.all?{|a| a.data['assessment']['automatic'] }).to eq(true)
      expect(assessments.map{|a| a.started_at.to_date.to_s }).to eq(["2016-06-05", "2016-06-06", "2016-06-07", "2016-06-08", "2016-06-09"])
      expect(assessments.map{|a| a.data['assessment']['totals'] }).to eq([
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1}
      ])

      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 2},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 3},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 4}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)

      UserBadge.check_for(u.global_id)     
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)

      assessments = LogSession.where(:log_type => 'assessment').sort_by(&:id)
      expect(assessments.all?{|a| a.data['assessment']['automatic'] }).to eq(true)
      expect(assessments.map{|a| a.started_at.to_date.to_s }).to eq(["2016-06-05", "2016-06-06", "2016-06-07", "2016-06-08", "2016-06-09"])
      expect(assessments.map{|a| a.data['assessment']['totals'] }).to eq([
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 1, 'incorrect' => 0},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1}
      ])
    end
    
    it "should update the goal stats related to the automated log session whenever it changes" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1},
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 2, 'button_instances' => 2},
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      expect(LogSession.where(:log_type => 'assessment').count).to eq(0)

      UserBadge.check_for(u.global_id)     
      Worker.process_queues
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)

      assessments = LogSession.where(:log_type => 'assessment').sort_by(&:id)
      expect(assessments.all?{|a| a.data['assessment']['automatic'] }).to eq(true)
      expect(assessments.map{|a| a.started_at.to_date.to_s }).to eq(["2016-06-05", "2016-06-06", "2016-06-07", "2016-06-08", "2016-06-09"])
      expect(assessments.map{|a| a.data['assessment']['totals'] }).to eq([
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1}
      ])
      expect(g.reload.settings['stats']['monthly']).to eq({
        '2016-06' => {
          'sessions' => 5,
          'positives' => 0,
          'negatives' => 5,
          'statuses' => []
        },
        'totals' => {
          'sessions' => 5,
          'positives' => 0,
          'negatives' => 5,
          'statuses' => []
        }
      })

      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 2},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 3},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 4}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      WeeklyStatsSummary.update_for(s1.global_id)

      UserBadge.check_for(u.global_id)     
      Worker.process_queues
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(0)

      assessments = LogSession.where(:log_type => 'assessment').sort_by(&:id)
      expect(assessments.all?{|a| a.data['assessment']['automatic'] }).to eq(true)
      expect(assessments.map{|a| a.started_at.to_date.to_s }).to eq(["2016-06-05", "2016-06-06", "2016-06-07", "2016-06-08", "2016-06-09"])
      expect(assessments.map{|a| a.data['assessment']['totals'] }).to eq([
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 1, 'incorrect' => 0},
        {'correct' => 0, 'incorrect' => 1},
        {'correct' => 0, 'incorrect' => 1}
      ])
      expect(g.reload.settings['stats']['monthly']).to eq({
        '2016-06' => {
          'sessions' => 5,
          'positives' => 1,
          'negatives' => 4,
          'statuses' => []
        },
        'totals' => {
          'sessions' => 5,
          'positives' => 1,
          'negatives' => 4,
          'statuses' => []
        }
      })
    end
  end
  
  describe "generate_defaults" do
    it "should generate defaults" do
      b = UserBadge.new
      b.generate_defaults
      expect(b.data).to eq({'name' => 'Unnamed Badge'})
      expect(b.level).to eq(1)
    end
    
    it "should remember award timestamp" do
      b = UserBadge.new
      b.earned = true
      b.generate_defaults
      expect(b.data['earn_recorded']).to eq(Time.now.utc.iso8601)
      expect(b.instance_variable_get('@just_earned')).to eq(true)
    end
  end

  describe "update_user" do
    it "should update the associated user" do
      u = User.create
      b = UserBadge.new(:user => u)
      b.update_user
      expect(u.reload.badges_updated_at.to_i).to be_within(1).of(Time.now.to_i)
    end
  end

  describe "notify_on_earned" do
    it "should schedule a notification event" do
       u = User.create
       u.enable_feature('goals')
       u.save
       b = UserBadge.create(:user => u)
       b.award!({
        :started => 2.days.ago,
        :ended => 1.day.ago,
        :tally => 4
       })
       expect(Worker.scheduled?(UserBadge, 'perform_action', {'id' => b.id, 'method' => 'notify_on_earned', 'arguments' => [true]})).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled?(Webhook, 'notify_all_with_code', b.record_code, 'badge_awarded', nil)).to eq(true)
    end
    
    it "should send notifications to supervisors" do
       u = User.create
       u.enable_feature('goals')
       u.save
       u2 = User.create
       u2.enable_feature('goals')
       u2.save
       User.link_supervisor_to_user(u2, u)
       
       b = UserBadge.create(:user => u)
       b.award!({
        :started => 2.days.ago,
        :ended => 1.day.ago,
        :tally => 4
       })
       expect(Worker.scheduled?(UserBadge, 'perform_action', {'id' => b.id, 'method' => 'notify_on_earned', 'arguments' => [true]})).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled?(Webhook, 'notify_all_with_code', b.record_code, 'badge_awarded', nil)).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled_for?('priority', UserMailer, 'deliver_message', 'badge_awarded', u.global_id, b.global_id)).to eq(true)
       expect(Worker.scheduled_for?('priority', UserMailer, 'deliver_message', 'badge_awarded', u2.global_id, b.global_id)).to eq(true)
       expect(u.reload.settings['user_notifications']).to_not eq(nil)
       expect(u.settings['user_notifications'][-1]['type']).to eq('badge_awarded')
       expect(u.settings['user_notifications'][-1]['badge_name']).to eq('Unnamed Badge')
       expect(u.settings['user_notifications'][-1]['badge_level']).to eq(1)
       expect(u2.reload.settings['user_notifications']).to_not eq(nil)
       expect(u2.settings['user_notifications'][-1]['type']).to eq('badge_awarded')
       expect(u2.settings['user_notifications'][-1]['badge_name']).to eq('Unnamed Badge')
       expect(u2.settings['user_notifications'][-1]['badge_level']).to eq(1)
    end
    
    it "should send a notification to the user" do
       u = User.create
       u.enable_feature('goals')
       u.save
       b = UserBadge.create(:user => u)
       b.award!({
        :started => 2.days.ago,
        :ended => 1.day.ago,
        :tally => 4
       })
       expect(Worker.scheduled?(UserBadge, 'perform_action', {'id' => b.id, 'method' => 'notify_on_earned', 'arguments' => [true]})).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled?(Webhook, 'notify_all_with_code', b.record_code, 'badge_awarded', nil)).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled_for?('priority', UserMailer, 'deliver_message', 'badge_awarded', u.global_id, b.global_id)).to eq(true)
       expect(u.reload.settings['user_notifications']).to_not eq(nil)
       expect(u.settings['user_notifications'][-1]['type']).to eq('badge_awarded')
       expect(u.settings['user_notifications'][-1]['badge_name']).to eq('Unnamed Badge')
       expect(u.settings['user_notifications'][-1]['badge_level']).to eq(1)
    end
    
    it "should not send an email notification if emails are disabled" do
       u = User.create
       u.enable_feature('goals')
       u.settings['preferences']['goal_notifications'] = 'disabled'
       u.save
       b = UserBadge.create(:user => u)
       b.award!({
        :started => 2.days.ago,
        :ended => 1.day.ago,
        :tally => 4
       })
       expect(Worker.scheduled?(UserBadge, 'perform_action', {'id' => b.id, 'method' => 'notify_on_earned', 'arguments' => [true]})).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled?(Webhook, 'notify_all_with_code', b.record_code, 'badge_awarded', nil)).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled_for?('priority', UserMailer, 'deliver_message', 'badge_awarded', u.global_id, b.global_id)).to eq(false)
       expect(u.reload.settings['user_notifications']).to_not eq(nil)
       expect(u.settings['user_notifications'][-1]['type']).to eq('badge_awarded')
       expect(u.settings['user_notifications'][-1]['badge_name']).to eq('Unnamed Badge')
       expect(u.settings['user_notifications'][-1]['badge_level']).to eq(1)
    end
    
    it "should send an email if not disabled" do
       u = User.create
       u.enable_feature('goals')
       u.save
       b = UserBadge.create(:user => u)
       b.award!({
        :started => 2.days.ago,
        :ended => 1.day.ago,
        :tally => 4
       })
       expect(Worker.scheduled?(UserBadge, 'perform_action', {'id' => b.id, 'method' => 'notify_on_earned', 'arguments' => [true]})).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled?(Webhook, 'notify_all_with_code', b.record_code, 'badge_awarded', nil)).to eq(true)
       Worker.process_queues
       expect(Worker.scheduled_for?('priority', UserMailer, 'deliver_message', 'badge_awarded', u.global_id, b.global_id)).to eq(true)
       expect(u.reload.settings['user_notifications']).to_not eq(nil)
       expect(u.settings['user_notifications'][-1]['type']).to eq('badge_awarded')
       expect(u.settings['user_notifications'][-1]['badge_name']).to eq('Unnamed Badge')
       expect(u.settings['user_notifications'][-1]['badge_level']).to eq(1)
    end
  end

  describe "award!" do
    it "should update the badge based on the parameters" do
      u = User.create
      b = UserBadge.new(:user => u)
      started = 2.days.ago
      ended = 1.day.ago
      b.award!({
        :started => started,
        :ended => ended,
        :tally => 4,
        :streak => 3,
        :samples => [],
        :explanation => 'good stuff happened',
        :units => [{}]
      })
      expect(b.id).to_not eq(nil)
      expect(b.earned).to eq(true)
      expect(b.data).to eq({
        'started' => started.utc.iso8601,
        'ended' => ended.utc.iso8601,
        'earn_recorded' => Time.now.utc.iso8601,
        'units' => [{}],
        'explanation' => 'good stuff happened',
        'samples' => [],
        'tally' => 4,
        'name' => 'Unnamed Badge',
        'badge_level' => nil,
        'streak' => 3,
        'percent' => 1.0
      })
    end
    
    it "should use the goal's name for the badge level if defined" do
      u = User.create
      g = UserGoal.create(:user => u, :settings => {'summary' => 'cool goal'})
      b = UserBadge.new(:user => u, :user_goal => g)
      started = 2.days.ago
      ended = 1.day.ago
      b.award!({
        :started => started,
        :ended => ended,
        :tally => 4,
        :streak => 3,
        :units => [{}]
      })
      expect(b.id).to_not eq(nil)
      expect(b.earned).to eq(true)
      expect(b.data.except('earn_recorded')).to eq({
        'started' => started.utc.iso8601,
        'ended' => ended.utc.iso8601,
        'global_goal' => nil,
        'global_goal_priority' => nil,
        'badge_level' => nil,
        'units' => [{}],
        'tally' => 4,
        'name' => 'cool goal',
        'streak' => 3,
        'percent' => 1.0
      })   
      expect(b.data['earn_recorded']).to be > 5.seconds.ago.utc.iso8601  
    end
    
    it "should not update the badge if already earned" do
      b = UserBadge.new
      b.earned = true
      b.award!({
        :started => 'abc',
        :ended => 'def',
        :tally => 4,
        :streak => 3,
        :units => [{}]
      })
      expect(b.id).to eq(nil)
      expect(b.data).to eq(nil)
    end
    
    it "should mark lower-level badges as superseded" do
      u = User.create
      g = UserGoal.create
      b1 = UserBadge.create(:user => u, :user_goal => g, :level => 1)
      b2 = UserBadge.create(:user => u, :user_goal => g, :level => 2)
      b3 = UserBadge.create(:user => u, :user_goal => g, :level => 3)
      b1.award!({'tally' => 5})
      expect(b1.reload.earned).to eq(true)
      expect(b1.reload.superseded).to eq(false)
      expect(b2.reload.earned).to eq(false)
      expect(b2.reload.superseded).to eq(false)
      expect(b3.reload.earned).to eq(false)
      expect(b3.reload.superseded).to eq(false)

      b2.award!({'tally' => 6})
      expect(b1.reload.earned).to eq(true)
      expect(b1.reload.superseded).to eq(true)
      expect(b2.reload.earned).to eq(true)
      expect(b2.reload.superseded).to eq(false)
      expect(b3.reload.earned).to eq(false)
      expect(b3.reload.superseded).to eq(false)

      b3.award!({'tally' => 7})
      expect(b1.reload.earned).to eq(true)
      expect(b1.reload.superseded).to eq(true)
      expect(b2.reload.earned).to eq(true)
      expect(b2.reload.superseded).to eq(true)
      expect(b3.reload.earned).to eq(true)
      expect(b3.reload.superseded).to eq(false)
    end
  end
  
  describe "mark_progress!" do
    it "should mark progress" do
      u = User.create
      b = UserBadge.new(:user => u)
      b.mark_progress!(0.5)
      expect(b.id).to_not eq(nil)
      expect(b.data['percent']).to eq(0.5)
      expect(b.data['progress_expires']).to eq(nil)
    end
    
    it "should do nothing if already earned" do
      b = UserBadge.new(:earned => true)
      b.mark_progress!(0.7)
      expect(b.id).to eq(nil)
      expect(b.data).to eq(nil)
    end
    
    it "should track progress invalidation date" do
      u = User.create
      b = UserBadge.new(:user => u)
      exp = 2.weeks.from_now
      b.mark_progress!(0.5, exp)
      expect(b.id).to_not eq(nil)
      expect(b.data['percent']).to eq(0.5)
      expect(b.data['progress_expires']).to eq(exp.utc.iso8601)
    end
  end
  
  describe "current_progress" do
    it "should return the value" do
      b = UserBadge.new(:data => {})
      expect(b.current_progress).to eq(0.0)
      b.earned = true
      expect(b.current_progress).to eq(1.0)
      b.earned = false
      b.data['percent'] = '0.75'
      expect(b.current_progress).to eq(0.75)
      b.data['percent'] = nil
      expect(b.current_progress).to eq(0.0)
    end
    
    it "should not return the value if expired" do
      b = UserBadge.new
      b.data = {'progress_expires' => 2.weeks.ago.utc.iso8601, 'percent' => 0.5}
      expect(b.current_progress).to eq(0.0)
      b.data['progress_expires'] = nil
      expect(b.current_progress).to eq(0.5)
    end
  end

  describe "check_for" do
    it "should check for existing earned badges" do
      u = User.create
      g = UserGoal.create(:user => u, :active => true)
      g.settings['badges'] = [{}, {}]
      g.save
      b = UserBadge.create(:user => u, :user_goal => g, :level => 1, :earned => true)
      expect(UserBadge).to receive(:check_goal_badges).with(u, g, 1, nil, false, false)
      UserBadge.check_for(u.global_id)
    end

    it "should work if no badges found" do
      u = User.create
      g = UserGoal.create(:user => u, :active => true)
      g.settings['badges'] = [{}, {}]
      g.save
      expect(UserBadge).to receive(:check_goal_badges).with(u, g, 0, nil, false, false)
      UserBadge.check_for(u.global_id)
    end
    
    it "should not check if already at the max level" do
      u = User.create
      g = UserGoal.create(:user => u, :active => true)
      g.settings['badges'] = [{}, {}]
      g.save
      b = UserBadge.create(:user => u, :user_goal => g, :level => 2, :earned => true)
      expect(UserBadge).to_not receive(:check_goal_badges)
      UserBadge.check_for(u.global_id)
    end
  end

  describe "process_goal_badges" do
    it "should process basic parameters" do
      res = UserBadge.process_goal_badges([])
      expect(res).to eq([])
      
      res = UserBadge.process_goal_badges([
        {}, {}
      ])
      expect(res).to eq([{
        'level' => 1,
        'simple_type' => 'custom',
        'interval' => 'date'
      }, {
        'level' => 2,
        'simple_type' => 'custom',
        'interval' => 'date'
      }])
    end
    
    it "should process watchlist badges" do
      res = UserBadge.process_goal_badges([{
        'interval' => 'weekyear',
        'watchlist' => true,
        'words_list' => 'hat,cat,frog',
        'watch_type_minimum' => 2,
        'watch_total' => '5',
        'watch_type_count' => '2',
        'watch_type_interval' => 'monthyear',
        'consecutive_units' => '3',
        'image_url' => 'http://www.example.com/level1.gif'
      }, {
        'watchlist' => true,
        'parts_of_speech_list' => ['noun', 'verb'],
        'watch_type_interval' => 'biweekyear',
        'watch_type_interval_count' => '4',
        'matching_units' => 2,
        'image_url' => 'http://www.example.com/level2.gif'
      }])
      
      expect(res).to eq([
        {
          'level' => 1,
          'simple_type' => 'custom',
          'interval' => 'weekyear',
          'watchlist' => true,
          'words_list' => ['hat', 'cat', 'frog'],
          'watch_type_minimum' => 2.0,
          'watch_total' => 5.0,
          'watch_type_count' => 2.0,
          'consecutive_units' => 3.0,
          'image_url' => 'http://www.example.com/level1.gif'
        },
        {
          'level' => 2,
          'simple_type' => 'custom',
          'interval' => 'date',
          'watchlist' => true,
          'parts_of_speech_list' => ['noun', 'verb'],
          'watch_type_interval' => 'biweekyear',
          'watch_type_interval_count' => 4.0,
          'matching_units' => 2.0,
          'image_url' => 'http://www.example.com/level2.gif'
        }
      ])
    end
    
    it "should process instance count badges" do
      res = UserBadge.process_goal_badges([{
        'interval' => 'monthyear',
        'instance_count' => '14',
        'watch_type_interval' => 'biweekyear',
        'watch_type_interval_count' => 4.0,
        'matching_instances' => '3.2'
      }, {
        'instance_count' => 3.43,
        'word_instances' => '11'
      }])
      
      expect(res).to eq([{
        'level' => 1,
        'interval' => 'monthyear',
        'instance_count' => 14.0,
        'simple_type' => 'custom',
        'matching_instances' => 3.2
      }, {
        'level' => 2,
        'interval' => 'date',
        'instance_count' => 3.43,
        'simple_type' => 'custom',
        'word_instances' => 11.0
      }])
    end
    
    it "should process a list of multiple badges" do
      res = UserBadge.process_goal_badges([{
        'interval' => 'weekyear',
        'watchlist' => true,
        'words_list' => 'hat,cat,frog',
        'watch_type_minimum' => 2,
        'watch_total' => '5',
        'watch_type_count' => '2',
        'watch_type_interval' => 'monthyear',
        'consecutive_units' => '3'
      }, {
        'watchlist' => true,
        'parts_of_speech_list' => ['noun', 'verb'],
        'watch_type_interval' => 'biweekyear',
        'watch_type_interval_count' => '4',
        'matching_units' => 2
      }, {
        'interval' => 'monthyear',
        'instance_count' => '14',
        'watch_type_interval' => 'biweekyear',
        'watch_type_interval_count' => 4.0,
        'matching_instances' => '3.2'
      }, {
        'instance_count' => 3.43,
        'word_instances' => '11'
      }])
      
      expect(res).to eq([{
        'level' => 1,
        'simple_type' => 'custom',
        'interval' => 'weekyear',
        'watchlist' => true,
        'words_list' => ['hat', 'cat', 'frog'],
        'watch_type_minimum' => 2.0,
        'watch_total' => 5.0,
        'watch_type_count' => 2.0,
        'consecutive_units' => 3.0
      }, {
        'level' => 2,
        'simple_type' => 'custom',
        'interval' => 'date',
        'watchlist' => true,
        'parts_of_speech_list' => ['noun', 'verb'],
        'watch_type_interval' => 'biweekyear',
        'watch_type_interval_count' => 4.0,
        'matching_units' => 2.0
      }, {
        'level' => 3,
        'simple_type' => 'custom',
        'interval' => 'monthyear',
        'instance_count' => 14.0,
        'matching_instances' => 3.2
      }, {
        'level' => 4,
        'simple_type' => 'custom',
        'interval' => 'date',
        'instance_count' => 3.43,
        'word_instances' => 11.0
      }])
    end
    
    it "should process goal badges for the user_goal" do
      u = User.create
      g = UserGoal.process_new({
        'badges' => [{
          'interval' => 'monthyear',
          'instance_count' => '14',
          'watch_type_interval' => 'biweekyear',
          'watch_type_interval_count' => 4.0,
          'matching_instances' => '3.2'
        }, {
          'instance_count' => 3.43,
          'word_instances' => '11'
        }],
        'badge_name' => 'awesomeness'
      }, {user: u, author: u})
      expect(g.settings['badges']).to eq([{
        'level' => 1,
        'interval' => 'monthyear',
        'instance_count' => 14.0,
        'simple_type' => 'custom',
        'matching_instances' => 3.2
      }, {
        'level' => 2,
        'interval' => 'date',
        'simple_type' => 'custom',
        'instance_count' => 3.43,
        'word_instances' => 11.0
      }])
      expect(g.settings['badge_name']).to eq('awesomeness')
    end
    
    it "should process simple_type badge settings" do
      u = User.create
      g = UserGoal.process_new({
        'badges' => [
          {
            'simple_type' => 'words_per_week',
            'words_list' => 'cat,rat,fat'
          },
          {
            'simple_type' => 'buttons_per_day',
            'instance_count' => '5'
          },
          {
            'simple_type' => 'modeling_per_week',
            'modeled_words_list' => 'cat,fat,hat',
            'instance_count' => '4'
          },
          {
            'simple_type' => 'modeling_per_day',
            'instance_count' => '3'
          }
        ]
      }, {user: u, author: u})
      expect(g.settings['badges']).to eq(
       [{"simple_type"=>"words_per_week",
         "level"=>1,
         "interval"=>"weekyear",
         "watchlist"=>true,
         "words_list"=>["cat", "rat", "fat"]},
        {"simple_type"=>"buttons_per_day",
         "level"=>2,
         "interval"=>"date",
         "instance_count"=>5.0,
         "button_instances"=>5.0},
        {"simple_type"=>"modeling_per_week",
         "level"=>3,
         "interval"=>"weekyear",
         "watchlist"=>true,
         "modeled_words_list"=>["cat", "fat", "hat"],
         "watch_total"=>4.0},
        {"simple_type"=>"modeling_per_day",
         "level"=>4,
         "interval"=>"date",
         "instance_count"=>3.0,
         "modeled_button_instances"=>3.0}
      ])
    end
  end


  describe "check_goal_badges" do
    it "should return if goal doesn't have badges" do
      g = UserGoal.new
      expect(UserBadge.check_goal_badges(nil, g, 0)).to eq(nil)
    end
    
    it "should halt if no badges defined for the specified level" do
      g = UserGoal.new
      g.settings = {'badges' => [{}, {}]}
      expect(UserBadge.check_goal_badges(nil, g, 3)).to eq(nil)
    end
    
    it "should evaluate day-based measurements" do
      u = User.create
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 4, 'word_instances' => 4},
          {'instance_count' => 6, 'word_instances' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      o = WeeklyStatsSummary.where(:user_id => u.id)
      expect(WeeklyStatsSummary).to receive(:where).with(:user_id => u.id).and_return(o)
      expect(o).to receive(:find_in_batches).and_return([])
      expect(o).to_not receive(:where)
      expect(UserBadge).to receive(:cluster_days).with(:date, []).and_return([])
      UserBadge.check_goal_badges(u, g, 0)
    end
    
    it "should evaluate week-based measurements" do
      u = User.create
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 4, 'word_instances' => 4, 'interval' => 'weekyear'},
          {'instance_count' => 6, 'word_instances' => 6, 'interval' => 'weekyear'}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      o = WeeklyStatsSummary.where(:user_id => u.id)
      expect(WeeklyStatsSummary).to receive(:where).with(:user_id => u.id).and_return(o)
      expect(o).to receive(:find_in_batches).and_return([])
      expect(o).to_not receive(:where)
      expect(UserBadge).to receive(:cluster_days).with(:weekyear, []).and_return([])
      UserBadge.check_goal_badges(u, g, 0)
    end
    
    it "should evaluate bi-week-based measurements" do
      u = User.create
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 4, 'word_instances' => 4, 'interval' => 'biweekyear'},
          {'instance_count' => 6, 'word_instances' => 6, 'interval' => 'biweekyear'}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      o = WeeklyStatsSummary.where(:user_id => u.id)
      expect(WeeklyStatsSummary).to receive(:where).with(:user_id => u.id).and_return(o)
      expect(o).to receive(:find_in_batches).and_return([])
      expect(o).to_not receive(:where)
      expect(UserBadge).to receive(:cluster_days).with(:biweekyear, []).and_return([])
      UserBadge.check_goal_badges(u, g, 0)
    end
    
    it "should evaluate month-based measurements" do
      u = User.create
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 4, 'word_instances' => 4, 'interval' => 'monthyear'},
          {'instance_count' => 6, 'word_instances' => 6, 'interval' => 'monthyear'}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      o = WeeklyStatsSummary.where(:user_id => u.id)
      expect(WeeklyStatsSummary).to receive(:where).with(:user_id => u.id).and_return(o)
      expect(o).to receive(:find_in_batches).and_return([])
      expect(o).to_not receive(:where)
      expect(UserBadge).to receive(:cluster_days).with(:monthyear, []).and_return([])
      UserBadge.check_goal_badges(u, g, 0)
    end
    
    it "should generate unit-level blocks" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'timestamp' => 1465279200}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 4, 'word_instances' => 4, 'interval' => 'monthyear', 'consecutive_units' => 1},
          {'instance_count' => 6, 'word_instances' => 6, 'interval' => 'monthyear', 'consecutive_units' => 1}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      expect(UserBadge).to receive(:cluster_days).with(:monthyear, [{
        total: 3,
        date: Date.parse('Jun 7 2016'),
        weekyear: 201622,
        biweekyear: 201623,
        monthyear: 201606,
        next: {
          date: Date.parse('June 8 2016'),
          weekyear: 201623,
          biweekyear: 201625,
          monthyear: 201607
        }
      }]).and_return([])
      UserBadge.check_goal_badges(u, g, 0)
    end
    
    it "should filter to only valid units" do
      u = User.create
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 4, 'word_instances' => 4, 'interval' => 'monthyear'},
          {'instance_count' => 6, 'word_instances' => 6, 'interval' => 'monthyear'}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      o = WeeklyStatsSummary.where(:user_id => u.id)
      expect(WeeklyStatsSummary).to receive(:where).with(:user_id => u.id).and_return(o)
      expect(o).to receive(:find_in_batches).and_return([])
      expect(o).to_not receive(:where)
      a = {}
      b = {}
      expect(UserBadge).to receive(:valid_unit).with(a, g.settings['badges'][0])
      expect(UserBadge).to receive(:valid_unit).with(b, g.settings['badges'][0])
      expect(UserBadge).to receive(:cluster_days).with(:monthyear, []).and_return([a, b])
      UserBadge.check_goal_badges(u, g, 0)
    end
    
    it "should enforce watchlist minimums for secondary unit size" do
      u = User.create
      g = UserGoal.process_new({
        badges: [
          {'watchlist' => true, 'words_list' => ['hat', 'frat'], 'watch_total' => 2, 'interval' => 'monthyear', 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 1},
          {'watchlist' => true, 'words_list' => ['hat', 'frat'], 'watch_total' => 3, 'interval' => 'monthyear', 'watch_type_interval' => 'weekyear', 'watch_type_interval_count' => 1}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      o = WeeklyStatsSummary.where(:user_id => u.id)
      expect(WeeklyStatsSummary).to receive(:where).with(:user_id => u.id).and_return(o)
      expect(o).to receive(:find_in_batches).and_return([])
      expect(o).to_not receive(:where)
      a = {
        weekyear: 1234,
        matches: [{
          count: 5,
          value: 'hat'
        }, {
          count: 3,
          value: 'cat'
        }]
      }
      b = {
        weekyear: 1235,
        matches: [{
          count: 2,
          value: 'hat'
        }]
      }
      expect(UserBadge).to receive(:valid_unit).with(a, g.settings['badges'][0]).and_return(true)
      expect(UserBadge).to receive(:valid_unit).with(b, g.settings['badges'][0]).and_return(true)
      expect(UserBadge).to receive(:cluster_days).with(:monthyear, []).and_return([a, b])
      expect(UserBadge).to receive(:clean_date_blocks).with({
        1234 => {
          matches: {'hat' => 5, 'cat' => 3}, 
          valid: true
        },
        1235 => {
          matches: {'hat' => 2},
          valid: true
        }
      }).and_return({})
      UserBadge.check_goal_badges(u, g, 0)
    end

    it "should filter based on consecutive units" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465538400 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'consecutive_units' => 3},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'consecutive_units' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(1)
    end
    
    it "should not award if consecutive units not matched" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465538400 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'consecutive_units' => 3},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'consecutive_units' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(0)
    end
    
    it "should filter based on matching units" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465538400 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_units' => 3},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'matching_units' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(1)
    end

    it "should not award if matching units not matched" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_units' => 3},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'matching_units' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(0)
    end
    
    it "should filter based on matching instances" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 6},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'matching_instances' => 8}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(1)
    end

    it "should not award if not enough matching instances" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 6, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'matching_instances' => 8},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'matching_instances' => 9}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(0)
    end
    
    it "should update progress if partially-completed" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465538400 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'consecutive_units' => 5},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'consecutive_units' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(0)
      b = UserBadge.last
      expect(b).to_not eq(nil)
      expect(b.earned).to eq(false)
      expect(b.current_progress).to eq(0.8)
    end
    
    it "should award if fully completed" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465538400 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'consecutive_units' => 3},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'consecutive_units' => 6}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(1)
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(2)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Lots O' Words")
      expect(badges[1].earned).to eq(false)
      expect(badges[1].level).to eq(2)
      expect(badges[1].current_progress).to eq(4.0 / 6.0)
      expect(badges[1].data['name']).to eq("Lots O' Words")
    end
    
    it "should award multiple levels at the same time if all earned" do
      u = User.create
      d = Device.create(:user => u)
      expect(Date).to receive(:today).and_return(Date.parse("June 9, 2016")).at_least(1).times
      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465279200 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465365600 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465452000 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s4 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'spoken' => true, 'board' => {'id' => '1_1'}}, 'timestamp' => 1465538400 - 1}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      WeeklyStatsSummary.update_for(s1.global_id)
      
      g = UserGoal.process_new({
        badges: [
          {'instance_count' => 2, 'word_instances' => 2, 'interval' => 'date', 'consecutive_units' => 3},
          {'instance_count' => 3, 'word_instances' => 3, 'interval' => 'date', 'consecutive_units' => 4}
        ],
        badge_name: "Lots O' Words"
      }, {user: u, author: u})
      
      res = UserBadge.check_goal_badges(u, g, 0)
      expect(res).to eq(2)
      badges = UserBadge.where(:user => u, :user_goal => g).order(:level)
      expect(badges.count).to eq(2)
      expect(badges[0].earned).to eq(true)
      expect(badges[0].level).to eq(1)
      expect(badges[0].data['name']).to eq("Lots O' Words")
      expect(badges[1].earned).to eq(true)
      expect(badges[1].level).to eq(2)
      expect(badges[1].data['name']).to eq("Lots O' Words")
    end
  end

  describe "check_day_stats" do
    it "should identify word list matches" do
      res = UserBadge.check_day_stats({
        'watchlist' => true,
        'words_list' => ['hat', 'cat', 'from']
      }, { 'total' => {
        'all_word_counts' => {
          'hat' => 5,
          'scat' => 2
        }
      }})
      expect(res).to eq({
        matches: [
          {value: 'hat', count: 5}
        ],
        total: 5
      })

      res = UserBadge.check_day_stats({
        'watchlist' => true,
        'words_list' => ['hat', 'cat', 'from']
      }, { 'total' => {
        'all_word_counts' => {
          'frat' => 5,
          'scat' => 2
        }
      }})
      expect(res).to eq(nil)
    end
    
    it "should identify parts of speech list matches" do
      res = UserBadge.check_day_stats({
        'watchlist' => true,
        'parts_of_speech_list' => ['noun', 'adjective', 'verb']
      }, { 'total' => {
        'parts_of_speech' => {
          'verb' => 5,
          'gerund' => 3,
          'noun' => 2
        }
      }})
      expect(res).to eq({
        matches: [
          {value: 'verb', count: 5},
          {value: 'noun', count: 2}
        ],
        total: 7
      })

      res = UserBadge.check_day_stats({
        'watchlist' => true,
        'parts_of_speech_list' => ['noun', 'adjective', 'verb']
      }, { 'total' => {
        'parts_of_speech' => {
          'past_participle' => 4,
          'negation' => 3
        }
      }})
      expect(res).to eq(nil)
    end
    
    it "should identify modeled words matches" do
      res = UserBadge.check_day_stats({
        'watchlist' => true,
        'modeled_words_list' => ['cat', 'fat', 'hat']
      }, { 'total' => {
        'modeled_word_counts' => {
          'cat' => 5,
          'bug' => 3,
          'hat' => 2
        }
      }})
      expect(res).to eq({
        matches: [
          {value: 'cat', count: 5},
          {value: 'hat', count: 2}
        ],
        total: 7
      })

      res = UserBadge.check_day_stats({
        'watchlist' => true,
        'parts_of_speech_list' => ['dog', 'fog', 'log']
      }, { 'total' => {
        'modeled_word_counts' => {
          'rat' => 4,
          'hat' => 3
        }
      }})
      expect(res).to eq(nil)
    end
    
    it "should count word instances" do
      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'word_instances' => true
      }, { 'total' => {
        'all_word_counts' => {
          'hat' => 5,
          'scat' => 2
        }
      }})
      expect(res).to eq({
        total: 7
      })

      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'word_instances' => true
      }, { 'total' => {
        'all_word_counts' => {}
      }})
      expect(res).to eq(nil)
    end
    
    it "should count button instances" do
      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'button_instances' => true
      }, { 'total' => {
        'all_button_counts' => {
          'hat' => {'count' => 5},
          'scat' => {'count' => 2}
        }
      }})
      expect(res).to eq({
        total: 7
      })

      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'button_instances' => true
      }, { 'total' => {
        'all_button_counts' => {}
      }})
      expect(res).to eq(nil)
    end
    
    it "should count session instances" do
      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'session_instances' => true
      }, { 'total' => {
        'total_sessions' => 3
      }})
      expect(res).to eq({
        total: 3
      })

      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'session_instances' => true
      }, { 'total' => {
        'total_sessions' => 0
      }})
      expect(res).to eq(nil)
    end
    
    it "should count modeled button instances" do
      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'modeled_button_instances' => true
      }, { 'total' => {
        'modeled_button_counts' => {
          'hat' => {'count' => 5},
          'scat' => {'count' => 2}
        }
      }})
      expect(res).to eq({
        total: 7
      })

      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'modeled_button_instances' => true
      }, { 'total' => {
        'modeled_button_counts' => {}
      }})
      expect(res).to eq(nil)
    end
    
    it "should count modeled word instances" do
      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'modeled_word_instances' => true
      }, { 'total' => {
        'modeled_word_counts' => {
          'hat' => 5,
          'scat' => 2
        }
      }})
      expect(res).to eq({
        total: 7
      })

      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'modeled_word_instances' => true
      }, { 'total' => {
        'modeled_word_counts' => {}
      }})
      expect(res).to eq(nil)
    end
    
    it "should not return a result when no instances found" do
      res = UserBadge.check_day_stats({
        'instance_count' => 3,
        'modeled_word_instances' => true
      }, { 'total' => {
        'modeled_word_counts' => {}
      }})
      expect(res).to eq(nil)
    end
  end

  describe "valid_unit" do
    it "should check count for instance_count badges" do
      res = UserBadge.valid_unit({
        total: 5
      }, {
        'instance_count' => 4
      })
      expect(!!res).to eq(true)

      res = UserBadge.valid_unit({
        total: 5
      }, {
        'instance_count' => 6
      })
      expect(!!res).to eq(false)
    end
    
    it "should check matches for watchlist badges" do
      res = UserBadge.valid_unit({
        matches: []
      }, {
        'watchlist' => true
      })
      expect(!!res).to eq(false)

      res = UserBadge.valid_unit({
        matches: [{}]
      }, {
        'watchlist' => true
      })
      expect(!!res).to eq(true)
    end
    
    it "should limit matches to those above the minimum" do
      res = UserBadge.valid_unit({
        matches: [{count: 1}, {count: 2}]
      }, {
        'watchlist' => true,
        'watch_type_minimum' => 3
      })
      expect(!!res).to eq(false)

      res = UserBadge.valid_unit({
        matches: [{count: 1}, {count: 2}]
      }, {
        'watchlist' => true,
        'watch_type_minimum' => 2
      })
      expect(!!res).to eq(true)
    end
    
    it "should limit matches when the total hasn't been reached" do
      res = UserBadge.valid_unit({
        matches: [{count: 1}, {count: 2}]
      }, {
        'watchlist' => true,
        'watch_total' => 4
      })
      expect(!!res).to eq(false)

      res = UserBadge.valid_unit({
        matches: [{count: 1}, {count: 2}]
      }, {
        'watchlist' => true,
        'watch_total' => 3
      })
      expect(!!res).to eq(true)
    end
    
    it "should limit matches when the number of types hasn't been reached" do
      res = UserBadge.valid_unit({
        matches: [{count: 1}, {count: 2}]
      }, {
        'watchlist' => true,
        'watch_type_count' => 3
      })
      expect(res).to eq(false)

      res = UserBadge.valid_unit({
        matches: [{count: 1, :samples => ['a b']}, {count: 2, :samples => ['ok cool', 'that is me']}]
      }, {
        'watchlist' => true,
        'watch_type_count' => 2
      })
      expect(res).to eq({
        :explanation => "a b, ok cool, that is me",
        :samples => ["a b", "ok cool", "that is me"],
        :valid => true
      })
    end
  end

  describe "cluster_days" do
    it "should return the original list, sorted for date measures" do
      res = UserBadge.cluster_days(:date, [
        {id: 1, date: 1, next: {date: 2}},
        {id: 2, date: 3, next: {}},
        {id: 3, date: 2, next: {date: 3}}
      ])
      expect(res.map{|r| r[:date] }).to eq([1, 2, 3])
    end
    
    it "should return the sorted list clustered by the measure field" do
      res = UserBadge.cluster_days(:bacon, [
        {bacon: 1, total: 5, next: {bacon: 2}},
        {bacon: 3, total: 1, next: {bacon: 4}},
        {bacon: 2, total: 3, matches: [{value: 'a', count: 2, :samples => ['a', 'b']}, {value: 'b', count: 1, :samples => ['b', 'b']}], next: {bacon: 3}, :explanation => 'cool beans'},
        {bacon: 2, total: 1, matches: [{value: 'b', count: 5, :samples => ['c']}, {value: 'c', count: 3, :samples => ['c']}], next: {bacon: 3}, :explanation => 'something'},
      ])
      expect(res.map{|r| r[:bacon] }).to eq([1, 2, 3])
      expect(res[0][:total]).to eq(5)
      expect(res[0][:matches]).to eq(nil)
      expect(res[0][:explanation]).to eq("")
      expect(res[1][:total]).to eq(4)
      expect(res[1][:matches]).to eq([{value: 'a', count: 2, samples: ['a', 'b']}, {value: 'b', count: 6, samples: ['b', 'b', 'c']}, {value: 'c', count: 3, samples: ['c']}])
      expect(res[1][:explanation]).to eq("cool beans, something")
      expect(res[2][:total]).to eq(1)
      expect(res[2][:matches]).to eq(nil)
      expect(res[2][:explanation]).to eq("")
    end
  end

  describe "add_date_blocks" do
    it "should add attributes to the hash" do
      hash = {}
      UserBadge.add_date_blocks(hash, '01-01-2016')
      expect(hash[:date]).to eq(Date.parse('01-01-2016'))
      expect(hash[:next][:date]).to eq(Date.parse('02-01-2016'))
      expect(hash[:weekyear]).to eq(201552)
      expect(hash[:next][:weekyear]).to eq(201553)
      expect(hash[:biweekyear]).to eq(201601)
      expect(hash[:next][:biweekyear]).to eq(201603)
      expect(hash[:monthyear]).to eq(201601)
      expect(hash[:next][:monthyear]).to eq(201602)
      
      UserBadge.add_date_blocks(hash, 'Dec 30 2016')
      expect(hash[:date]).to eq(Date.parse('30-12-2016'))
      expect(hash[:next][:date]).to eq(Date.parse('31-12-2016'))
      expect(hash[:weekyear]).to eq(201651)
      expect(hash[:next][:weekyear]).to eq(201652)
      expect(hash[:biweekyear]).to eq(201651)
      expect(hash[:next][:biweekyear]).to eq(201701)
      expect(hash[:monthyear]).to eq(201612)
      expect(hash[:next][:monthyear]).to eq(201701)

      UserBadge.add_date_blocks(hash, 'Dec 30 2017')
      expect(hash[:date]).to eq(Date.parse('30-12-2017'))
      expect(hash[:next][:date]).to eq(Date.parse('31-12-2017'))
      expect(hash[:weekyear]).to eq(201751)
      expect(hash[:next][:weekyear]).to eq(201752)
      expect(hash[:biweekyear]).to eq(201751)
      expect(hash[:next][:biweekyear]).to eq(201801)
      expect(hash[:monthyear]).to eq(201712)
      expect(hash[:next][:monthyear]).to eq(201801)

      UserBadge.add_date_blocks(hash, 'Jan 06 2016')
      expect(hash[:date]).to eq(Date.parse('06-01-2016'))
      expect(hash[:next][:date]).to eq(Date.parse('07-01-2016'))
      expect(hash[:weekyear]).to eq(201553)
      expect(hash[:next][:weekyear]).to eq(201601)
      expect(hash[:biweekyear]).to eq(201601)
      expect(hash[:next][:biweekyear]).to eq(201603)
      expect(hash[:monthyear]).to eq(201601)
      expect(hash[:next][:monthyear]).to eq(201602)

      UserBadge.add_date_blocks(hash, 'Dec 31 2009')
      expect(hash[:date]).to eq(Date.parse('31-12-2009'))
      expect(hash[:next][:date]).to eq(Date.parse('01-01-2010'))
      expect(hash[:weekyear]).to eq(200952)
      expect(hash[:next][:weekyear]).to eq(200953)
      expect(hash[:biweekyear]).to eq(201001)
      expect(hash[:next][:biweekyear]).to eq(201003)
      expect(hash[:monthyear]).to eq(200912)
      expect(hash[:next][:monthyear]).to eq(201001)
    end
  end
  
  describe 'update_highlighted_goals' do
    it 'should only allow 4 highlighted goals at a time' do
      u = User.create
      b = UserBadge.create(:user => u)
      b.process(:highlighted => true)
      5.times do |i|
        bb = UserBadge.create(:user => u)
        bb.process(:highlighted => true)
        expect(UserBadge.where(:user => u, :highlighted => true).count).to be < 5
      end
      expect(b.reload.highlighted).to eq(false)
      b.highlighted = true
      b.instance_variable_set('@highlight_changed', true)
      b.save
      expect(UserBadge.where(:user => u, :highlighted => true).count).to eq(4)
    end
    
  end

  describe 'process_params' do
    it 'should allow updating disabled and highlighted attributes' do
      u = User.create
      b = UserBadge.create(:user => u)
      b.process({'highlighted' => true})
      expect(b.highlighted).to eq(true)
      expect(b.disabled).to eq(false)
      b.process({'highlighted' => false, 'disabled' => true})
      expect(b.highlighted).to eq(false)
      expect(b.disabled).to eq(true)
    end
  end
  
  describe "earned_during" do
    it "should return the correct value" do
      g = UserBadge.new
      expect(g).to receive(:awarded_at).and_return(nil)
      expect(g.earned_during(nil, nil)).to eq(false)
      expect(g).to receive(:awarded_at).and_return(3.hours.ago).at_least(1).times
      expect(g.earned_during(4.hours.ago, 1.hour.ago)).to eq(true)
      expect(g.earned_during(5.hours.ago, 4.hour.ago)).to eq(false)
      expect(g.earned_during(2.hours.ago, 1.hour.ago)).to eq(false)
    end
  end
  
  describe "template_goal" do
    it "should return the correct value" do
      g = UserBadge.new
      res = OpenStruct.new(template: false, settings: {})
      expect(g).to receive(:user_goal).and_return(res)
      expect(g.template_goal).to eq(nil)
      
      res = OpenStruct.new(template: true)
      expect(g).to receive(:user_goal).and_return(res)
      expect(g.template_goal).to eq(res)
      
      u = User.create
      ug = UserGoal.create
      expect(g).to receive(:user_goal).and_return(OpenStruct.new(settings: {'template_id' => ug.global_id}))
      expect(g.template_goal).to eq(ug)
    end
  end
  
  describe "dismiss" do
    it 'should allow dismissing goals' do
      g = UserBadge.create
      g.dismiss('1234')
      expect(g.data['dismissed_by']).to eq({'1234' => true})
      expect(g.dismissed_by?('1234')).to eq(true)
      expect(g.dismissed_by?('2345')).to eq(false)
    end
    
    it 'should dismiss for everyone if dismissed by the user' do
      g = UserBadge.create(user_id: 12)
      gid = g.related_global_id(g.user_id)
      g.dismiss(gid)
      expect(g.data['dismissed_by'][gid]).to eq(true)
      expect(g.dismissed_by?('1234')).to eq(true)
      expect(g.dismissed_by?('2345')).to eq(true)
    end
  end
end

#     # possible goals:
#     # - speaking streak, consecutive days spoken in a row
#     # - praactical goals, multiple levels
#     # - sent a message to someone
#     # - shared a message through a different app
#     # - robust vocabulary, # of unique words/buttons
#     # - word pairs, using the same word with multiple pairs
#     # - using describing words, verbs, etc.
#     # - multiple words in a small window of time
# 
#     # automated tracking:
#     # - days in a row
#     # - # of days in a given period (including forever)
#     # - # of times in a given period (including forever)
#     
#     # - list of watchwords
#     #   - using any of them counts as a check
#     #   - using N of them on the same day counts as a check
#     #   - using at least N of them, for a total of M times, with each match getting used at least L times, in a single day counts as a check
#     #   - AND you need to use W of them at least once a week/month?
#     # - list of parts of speech
#     # - at least N different parts of speech, with each part being used at least M times during the day
#     # - number of buttons/words
#     # - number of sessions
#     # - number of modeled buttons
#     # - number of buttons in short sequence
#     # - number of unqiue words
#     # - number of times using the same word
#     # - number of unique combinations using a watchword
#     # - number of unique combinations using the same word (any word)
#     
#     # - N out of M events/words/phrases
#     # - all of M events/words/phrases
#     
#     # - some way to say, used each of M words at least N times each in a given period
# end


