require 'spec_helper'

describe UserGoal, type: :model do
  it "should honor permissions" do
    g = UserGoal.create
    expect(g.permissions_for(nil)).to eq({'user_id' => nil})
    u = User.create
    expect(g.permissions_for(u)).to eq({'user_id' => u.global_id})
    g.user = u
    g.save
    expect(g.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'comment' => true, 'edit' => true})
    u2 = User.create
    User.link_supervisor_to_user(u2, u, nil, false)
    expect(g.reload.permissions_for(u2)).to eq({'user_id' => u2.global_id, 'view' => true, 'comment' => true})
    User.link_supervisor_to_user(u2, u, nil, true)
    expect(g.reload.permissions_for(u2.reload)).to eq({'user_id' => u2.global_id, 'view' => true, 'comment' => true, 'edit' => true})
  end

  it "should allow supervisors to see the root goal for a unit" do
    o = Organization.create
    ou = OrganizationUnit.create(organization: o)
    u1 = User.create
    u2 = User.create
    o.add_supervisor(u2.user_name, false)
    ou.reload.add_supervisor(u2.user_name, true)
    g = UserGoal.create(user: u1)
    g.settings['organization_unit_id'] = ou.global_id
    g.save
    expect(ou.reload.supervisor?(u2)).to eq(true)
    expect(g.reload.permissions_for(u2.reload)).to eq({'user_id' => u2.global_id, 'view' => true, 'edit' => true, 'comment' => true})
  end
  
  describe "generate_defaults" do
    it "should generate defaults" do
      g = UserGoal.new
      g.generate_defaults
      expect(g.settings['summary']).to eq('user goal')
      expect(g.settings['started_at']).to eq(nil)
      expect(g.settings['ended_at']).to eq(nil)
      g.active = true
      g.generate_defaults
      expect(g.settings['started_at']).to_not eq(nil)
      expect(g.settings['ended_at']).to eq(nil)
      g.active = false
      g.generate_defaults
      expect(g.settings['ended_at']).to_not eq(nil)
    end
    
    it "should mark primary, template and template_header status correctly" do
      g = UserGoal.new
      g.active = false
      g.generate_defaults
      expect(g.primary).to eq(false)
      g.template_header = true
      g.generate_defaults
      expect(g.template).to eq(true)
      g.template = false
      g.template_header = nil
      g.generate_defaults
      expect(g.template_header).to eq(false)
      g.settings['template_header_id'] = 'asdf'
      g.generate_defaults
      expect(g.settings['old_template_header_id']).to eq('asdf')
    end
    
    it "should store the lower badge image url for reference" do
      u = User.create
      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 10, 'button_instances' => 10},
        badges: [
          {'image_url' => 'http://www.example.com/pic1.png', 'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 1},
          {'image_url' => 'http://www.example.com/pic2.png', 'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 5},
          {'image_url' => 'http://www.example.com/pic3.png', 'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 10},
          {'image_url' => 'http://www.example.com/pic4.png', 'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 15},
          {'image_url' => 'http://www.example.com/pic5.png', 'instance_count' => 10, 'button_instances' => 10, 'interval' => 'date', 'consecutive_units' => 20}
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save
      expect(g.settings['badge_image_url']).to eq('http://www.example.com/pic1.png')
    end
  end
 
  describe "generate_stats" do
    it "should generate default stats" do
      g = UserGoal.new
      g.generate_stats
      expect(g.settings['stats']).to eq({
        'average_status' => 0,
        'daily' => {
          'totals' => {
            'sessions' => 0,
            'positives' => 0,
            'negatives' => 0,
            'statuses' => []
          }
        },
        'weekly' => {
          'totals' => {
            'sessions' => 0,
            'positives' => 0,
            'negatives' => 0,
            'statuses' => []
          }
        },
        'monthly' => {
          'totals' => {
            'sessions' => 0,
            'positives' => 0,
            'negatives' => 0,
            'statuses' => []
          }
        },
        'percent_positive' => 0,
        'sessions' => 0,
        'badges' => 0,
        'suggested_level' => 'daily',
        "total_statuses" => 0,
        'weighted_average_status' => 0,
        'weighted_percent_positive' => 0
      })
    end
    
    it "should generate tallied stats" do
      u = User.create
      d = Device.create(:user => u)
      g = UserGoal.create(:user => u)

      time1 = 16.days.ago
      s = LogSession.process_new({
        'goal_id' => g.global_id,         
        'assessment' => {
          'description' => 'Simple eval',
          'totals' => {
            'correct' => 5,
            'incorrect' => 6
          },
          'tallies' => [
            {'correct' => true, 'timestamp' => time1.to_i}
          ]
        }
      }, {:user => u, :author => u, :device => d})

      time2 = 3.months.ago
      s = LogSession.process_new({
        'goal_id' => g.global_id,         
        'goal_status' => 4,
        'note' => {
          'text' => 'hey friends',
          'timestamp' => time2.to_i
        }
      }, {:user => u, :author => u, :device => d})

      g.reload.generate_stats
      expect(g.settings['stats']).to_not eq(nil)
      expect(g.settings['stats']['sessions']).to eq(2)
      expect(g.settings['stats']['percent_positive']).to eq(50)
      expect(g.settings['stats']['daily']).to eq({
        'totals' => {
          'sessions' => 0,
          'positives' => 0,
          'negatives' => 0,
          'statuses' => []
        }
      })
      expect(g.settings['stats']['monthly'][time1.utc.iso8601[0, 7]]).to eq({
        'sessions' => 1,
        'positives' => 5,
        'negatives' => 6,
        'statuses' => []
      })
      expect(g.settings['stats']['monthly'][time2.utc.iso8601[0, 7]]).to eq({
        'sessions' => 1,
        'positives' => 1,
        'negatives' => 0,
        'statuses' => [4]
      })
      weekyear = WeeklyStatsSummary.date_to_weekyear(time1.utc).to_s
      expect(g.settings['stats']['weekly']["#{weekyear[0, 4]}-#{weekyear[4, 2]}"]).to eq({
        'sessions' => 1,
        'positives' => 5,
        'negatives' => 6,
        'statuses' => []
      })
      weekyear = WeeklyStatsSummary.date_to_weekyear(time2.utc).to_s
      expect(g.settings['stats']['weekly']["#{weekyear[0, 4]}-#{weekyear[4, 2]}"]).to eq(nil)
      expect(g.settings['stats']['weighted_average_status']).to eq(4)
      expect(g.settings['stats']['weighted_percent_positive']).to eq(46.902654867256636)
    end
    
    it "should generate template stats" do
      u = User.create
      g = UserGoal.create(:user => u, :template_header => true)
      expect(g.settings['template_stats']).to eq({'goals' => 1, 'loop' => nil, 'badges' => 0})
      g2 = UserGoal.create(:user => u, :template => true, :settings => {'goal_duration' => 2.weeks.to_i})
      g3 = UserGoal.create(:user => u, :template => true, :settings => {'goal_duration' => 3.weeks.to_i})
      g.settings['linked_template_ids'] = [g.global_id, g2.global_id, g3.global_id]
      g.generate_stats
      expect(g.settings['template_stats']).to eq({'goals' => 3, 'total_duration' => 5.weeks.to_i, 'loop' => false, 'badges' => 0})
      g3.settings['next_template_id'] = g.global_id
      g3.save
      g.reload
      g.settings['linked_template_ids'] = [g.global_id, g2.global_id, g3.global_id]
      g.generate_stats
      expect(g.settings['template_stats']).to eq({'goals' => 3, 'total_duration' => 5.weeks.to_i, 'loop' => true, 'badges' => 0})
    end
  end
  
  describe "remove_if_primary" do
    it "should remove as primary goal if set" do
      u = User.create
      g = UserGoal.create(:user => u)
      u.settings['primary_goal'] = {'id' => g.global_id}
      u.save
      g.reload
      g.destroy
      u.reload
      expect(u.settings['primary_goal']).to eq(nil)
    end
  end
  
  describe "set_as_primary" do
    it "should set as primary if specified" do
      u = User.create
      gg = UserGoal.create(:user => u, :primary => true)
      g = UserGoal.process_new({
        primary: true
      }, {user: u, author: u})
      expect(g.reload.primary).to eq(true)
      expect(u.settings['primary_goal']).to eq({'id' => g.global_id, 'summary' => 'user goal'})
      expect(g.reload.primary).to eq(true)
      expect(gg.reload.primary).to eq(false)
    end
  end
  
  describe "process_params" do
    it "should raise an error without a user" do
      expect{ UserGoal.process_new({}, {}) }.to raise_error("user required as goal target")
    end
    
    it "should raise an error without an author" do
      g = UserGoal.new(:user_id => 7)
      expect{ g.process({}, {}) }.to raise_error("user required as update author")
    end
    
    it "should set standard properties" do
      u = User.create
      g = UserGoal.process_new({
        active: true,
        summary: "something good",
        description: "a something that is good"
      }, {user: u, author: u})
      expect(g.active).to eq(true)
      expect(g.summary).to eq("something good")
      expect(g.settings['description']).to eq("a something that is good")
    end
    
    it "should check and set video" do
      u = User.create
      v = UserVideo.create(:user => u)
      g = UserGoal.process_new({
        video_id: v.global_id
      }, {user: u, author: u})
      expect(g.settings['video']['id']).to eq(v.global_id)
      expect(g.summary).to eq('user goal')
      
      g = UserGoal.process_new({
        video_id: '1234'
      }, {user: u, author: u})
      expect(g.settings['video']).to eq(nil)
      expect(g.summary).to eq('user goal')
    end
    
    it "should build from template if specified" do
      u = User.create
      template = UserGoal.create(:template => true)
      g = UserGoal.new
      expect(g).to receive(:build_from_template).with(template, u)
      g.process({
        template_id: template.global_id
      }, {user: u, author: u})
    end
    
    it "should add a comment if specified" do
      u = User.create
      g = UserGoal.process_new({
        comment: {
          text: "hello everyone"
        }
      }, {user: u, author: u})
      expect(g.settings['comments'].length).to eq(1)
      expect(g.settings['comments'][0]['text']).to eq('hello everyone')
      expect(g.settings['comments'][0]['user_name']).to eq(u.user_name)
    end
    
    it "should add a video comment if valid" do
      u = User.create
      u2 = User.create
      v = UserVideo.create(:user => u)
      g = UserGoal.process_new({
        comment: {
          text: "this is a video",
          video_id: v.global_id
        }
      }, {user: u, author: u2})
      expect(g.settings['comments'].length).to eq(1)
      expect(g.settings['comments'][0]['text']).to eq('this is a video')
      expect(g.settings['comments'][0]['user_name']).to eq(u2.user_name)
      expect(g.settings['comments'][0]['video']['id']).to eq(v.global_id)
    end
    
    it "should not add a video to a comment if not valid" do
      u = User.create
      g = UserGoal.process_new({
        comment: {
          text: "this is a video",
          video_id: '12345'
        }
      }, {user: u, author: u})
      expect(g.settings['comments'].length).to eq(1)
      expect(g.settings['comments'][0]['text']).to eq('this is a video')
      expect(g.settings['comments'][0]['user_name']).to eq(u.user_name)
      expect(g.settings['comments'][0]['video']).to eq(nil)
    end
    
    it "should mark to set as primary if specified" do
      u = User.create
      g = UserGoal.process_new({
        primary: true
      }, {user: u, author: u})
      expect(g.instance_variable_get('@set_as_primary')).to eq(true)
    end
    
    it "should sanitize fields" do
      u = User.create
      g = UserGoal.process_new({
        active: true,
        summary: "something <string>good</strong>",
        description: "a something that is good<style></style><br/>so there",
        template: true,
        sequence_summary: "<script>alert('asdf');</script>something else<br/>",
        sequence_description: "something I <a href='http://www.google.com'>like</a><em>!</em>"
      }, {user: u, author: u, allow_global: true})
      expect(g.active).to eq(true)
      expect(g.summary).to eq("something good")
      expect(g.settings['description']).to eq("a something that is good<br>so there")
      expect(g.settings['sequence_summary']).to eq("something else")
      expect(g.settings['sequence_description']).to eq("something I <a href=\"http://www.google.com\">like</a><em>!</em>")
    end
    
    it "should generate a template correctly" do
      u = User.create
      g = UserGoal.process_new({
        template: true,
        template_header: true,
        next_template_id: '1234'
      }, {user: u, author: u, allow_global: true})
      expect(g.template).to eq(true)
      expect(g.template_header).to eq(true)
      expect(g.settings['next_template_id']).to eq(nil)
      expect(g.settings['template_header_id']).to eq('self')
      g2 = UserGoal.process_new({
        template: true,
        template_header_id: g.global_id,
        next_template_id: g.global_id
      }, {user: u, author: u, allow_global: true})
      expect(g2.template).to eq(true)
      expect(g2.template_header).to eq(nil)
      expect(g2.settings['next_template_id']).to eq(g.global_id)
      expect(g2.settings['template_header_id']).to eq(g.global_id)
    end
    
    it "should set template_header_id if defined" do
      u = User.create
      g = UserGoal.process_new({
        template: true,
        template_header: true,
        next_template_id: '1234'
      }, {user: u, author: u, allow_global: true})
      expect(g.template).to eq(true)
      expect(g.template_header).to eq(true)
      expect(g.settings['next_template_id']).to eq(nil)
      expect(g.settings['template_header_id']).to eq('self')
      g2 = UserGoal.process_new({
        template: true,
        template_header_id: g.global_id,
        next_template_id: g.global_id
      }, {user: u, author: u, allow_global: true})
      expect(g2.template).to eq(true)
      expect(g2.template_header).to eq(nil)
      expect(g2.settings['next_template_id']).to eq(g.global_id)
      expect(g2.settings['template_header_id']).to eq(g.global_id)
    end
    
    it "should set next_template_id if valid" do
      u = User.create
      g = UserGoal.process_new({
        template: true,
        template_header: true,
        next_template_id: '1234'
      }, {user: u, author: u, allow_global: true})
      expect(g.template).to eq(true)
      expect(g.template_header).to eq(true)
      expect(g.settings['next_template_id']).to eq(nil)
      expect(g.settings['template_header_id']).to eq('self')
      g2 = UserGoal.process_new({
        template: true,
        template_header_id: g.global_id,
        next_template_id: g.global_id
      }, {user: u, author: u, allow_global: true})
      expect(g2.template).to eq(true)
      expect(g2.template_header).to eq(nil)
      expect(g2.settings['next_template_id']).to eq(g.global_id)
      expect(g2.settings['template_header_id']).to eq(g.global_id)
    end
    
    it "should clear next_template_id if not valid" do
      u = User.create
      g = UserGoal.process_new({
        template: true,
        template_header: true,
        next_template_id: '1234'
      }, {user: u, author: u, allow_global: true})
      expect(g.template).to eq(true)
      expect(g.template_header).to eq(true)
      expect(g.settings['next_template_id']).to eq(nil)
      expect(g.settings['template_header_id']).to eq('self')
      g2 = UserGoal.process_new({
        template: true,
        template_header_id: g.global_id,
        next_template_id: g.global_id
      }, {user: u, author: u, allow_global: true})
      expect(g2.template).to eq(true)
      expect(g2.template_header).to eq(nil)
      expect(g2.settings['next_template_id']).to eq(g.global_id)
      expect(g2.settings['template_header_id']).to eq(g.global_id)
    end
    
    it "should set advancement settings for a template" do
      u = User.create
      g = UserGoal.process_new({
        template: true,
        advancement: "date: July 1"
      }, {user: u, author: u, allow_global: true})
      expect(g.settings['goal_duration']).to eq(nil)
      expect(g.settings['goal_advances_at']).to eq('July 1')

      g.process({
        advancement: "duration:12:week"
      }, {author: u})
      expect(g.settings['goal_duration']).to eq(12.weeks.to_i)
      expect(g.settings['goal_advances_at']).to eq(nil)

      g.process({
        advancement: "duration:12:day"
      }, {author: u})
      expect(g.settings['goal_duration']).to eq(12.days.to_i)
      expect(g.settings['goal_advances_at']).to eq(nil)

      g.process({
        advancement: "duration:4:month"
      }, {author: u})
      expect(g.settings['goal_duration']).to eq(4.months.to_i)
      expect(g.settings['goal_advances_at']).to eq(nil)

      g.process({
        advancement: "none"
      }, {author: u})
      expect(g.settings['goal_duration']).to eq(nil)
      expect(g.settings['goal_advances_at']).to eq(nil)
    end
    
    it 'should honor if_available option for set_as_primary' do
      u = User.create
      g = UserGoal.process_new({
        primary: 'if_available',
        active: true
      }, {user: u, author: u})
      expect(g.reload.primary).to eq(true)

      g2 = UserGoal.process_new({
        primary: 'if_available',
        active: true
      }, {user: u, author: u})
      expect(g.reload.primary).to eq(true)
      expect(g2.reload.primary).to eq(false)
    end

    it "should only allow template and global goals if authorized" do
      u = User.create
      g = UserGoal.process_new({
        active: true,
        global: true,
        template: true
      }, {user: u, author: u})
      expect(g.reload.global).to eq(nil)
      expect(g.reload.template).to eq(nil)

      g = UserGoal.process_new({
        active: true,
        global: true,
        template: true
      }, {user: u, author: u, allow_global: true})
      expect(g.reload.global).to eq(true)
      expect(g.reload.template).to eq(true)
    end

    it "should allow attaching a goal to an org unit" do
      u = User.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(u.user_name)
      ou.reload.add_supervisor(u.user_name, false)
      
      g = UserGoal.process_new({
        unit_id: ou.global_id,
      }, {user: u, author: u, allow_global: true})
      expect(g.template).to eq(true)
      expect(g.settings['organization_unit_id']).to eq(nil)

      ou.reload.add_supervisor(u.user_name, true)
      g = UserGoal.process_new({
        unit_id: ou.global_id,
      }, {user: u.reload, author: u, allow_global: true})
      expect(g.template).to eq(true)
      expect(g.settings['organization_unit_id']).to eq(ou.global_id)
    end
  end
  
  describe "current_date_from_template" do
    it "should calculate correctly" do
      expect(Time).to receive(:now).and_return(Time.parse("May 1 2016")).at_least(1).times
      expect(UserGoal.current_date_from_template('Jan 5')).to eq(Time.parse("Jan 5 2017"))
      expect(UserGoal.current_date_from_template('Mar 5')).to eq(Time.parse("Mar 5 2017"))
      expect(UserGoal.current_date_from_template('August 11')).to eq(Time.parse("August 11 2016"))
      expect(UserGoal.current_date_from_template('Dec 12')).to eq(Time.parse("Dec 12 2016"))
      expect(UserGoal.current_date_from_template('Dec 12 2017')).to eq(Time.parse("Dec 12 2017"))
    end
    
    it "should compute a correct goal_start for a goal" do
      expect(Time).to receive(:now).and_return(Time.parse("May 1 2016")).at_least(1).times
      g = UserGoal.new
      g.settings = {'goal_starts_at' => 'Jan 5'}
      expect(g.goal_start).to eq(Time.parse("Jan 5 2017"))
      g.settings = {'goal_starts_at' => 'Mar 5'}
      expect(g.goal_start).to eq(Time.parse("Mar 5 2017"))
      g.settings = {'goal_starts_at' => 'August 11'}
      expect(g.goal_start).to eq(Time.parse("August 11 2016"))
      g.settings = {'goal_starts_at' => 'Dec 12'}
      expect(g.goal_start).to eq(Time.parse("December 12 2016"))
      g.settings = {'goal_starts_at' => 'Dec 12 2018'}
      expect(g.goal_start).to eq(Time.parse("Dec 12 2018"))
    end
    
    it "should compute a correct goal_advance for a goal" do
      expect(Time).to receive(:now).and_return(Time.parse("May 1 2016")).at_least(1).times
      g = UserGoal.new
      g.settings = {'goal_advances_at' => 'Jan 5'}
      expect(g.goal_advance).to eq(Time.parse("Jan 5 2017"))
      g.settings = {'goal_advances_at' => 'Mar 5'}
      expect(g.goal_advance).to eq(Time.parse("Mar 5 2017"))
      g.settings = {'goal_advances_at' => 'August 11'}
      expect(g.goal_advance).to eq(Time.parse("August 11 2016"))
      g.settings = {'goal_advances_at' => 'Dec 12'}
      expect(g.goal_advance).to eq(Time.parse("December 12 2016"))
      g.settings = {'goal_advances_at' => 'Dec 12 2018'}
      expect(g.goal_advance).to eq(Time.parse("Dec 12 2018"))
    end
    
    it "should find the current template in a time-based sequence" do
      expect(Time).to receive(:now).and_return(Time.parse("May 1 2016")).at_least(1).times
      u = User.create
      g1 = UserGoal.create(:user => u, :template => true, :template_header => true)
      g2 = UserGoal.create(:user => u, :template => true)
      g3 = UserGoal.create(:user => u, :template => true)
      g1.settings['template_header_id'] = g1.global_id
      g1.settings['goal_advances_at'] = 'Feb 1'
      g1.settings['next_template_id'] = g2.global_id
      g1.save
      g2.settings['template_header_id'] = g1.global_id
      g2.settings['goal_advances_at'] = 'March 1'
      g2.settings['next_template_id'] = g3.global_id
      g2.save
      g3.settings['template_header_id'] = g1.global_id
      g3.settings['goal_advances_at'] = 'June 1'
      g3.settings['next_template_id'] = g1.global_id
      g3.save
      Worker.process_queues
      expect(g1.reload.settings['linked_template_ids'].sort).to eq([g1.global_id, g2.global_id, g3.global_id].sort)
      expect(g1.settings['goal_starts_at']).to eq('June 1')
      expect(g2.reload.settings['goal_starts_at']).to eq('Feb 1')
      expect(g3.reload.settings['goal_starts_at']).to eq('March 1')
      expect(g1.settings['template_stats']['loop']).to eq(true)
      expect(g1.settings['template_stats']['goals']).to eq(3)
      expect(g1.reload.current_template).to eq(g3)
    end
  end
  
  describe "calculate_advancement" do
    it "should return nil unless there is a next template" do
      g = UserGoal.new(:settings => {
      })
      expect(g.calculate_advancement).to eq(nil)
      g.settings['next_template_id'] = '1234'
      expect(g.calculate_advancement).to eq(nil)
    end
    
    it "should return time-from-now if goal_duration is set" do
      g = UserGoal.new(:settings => {
        'next_template_id' => '123',
        'goal_duration' => 3.weeks
      })
      expect(g.calculate_advancement.to_i).to eq((Time.now + 3.weeks).to_i)
    end
    
    it "should return concrete time if goal_advances_at is set" do
      expected_time = Time.parse('Jan 1, 2015')
      g = UserGoal.new(:settings => {
        'next_template_id' => '123',
        'goal_advances_at' => expected_time.iso8601
      })
      expect(g.calculate_advancement.to_i).to eq(expected_time.to_i)
    end
  end
  
  describe "build_from_template" do
    it "should copy template settings as needed" do
      template = UserGoal.create(:settings => {
        'video' => {
          'id' => '1_123'
        },
        'author_id' => '9876',
        'summary' => 'hey ya',
        'description' => 'this is a really important thing',
        'next_template_id' => '1234',
        'goal_duration' => 3.weeks.to_i
      }, :template => true)
      u = User.create
      g = UserGoal.process_new({
        template_id: template.global_id
      }, {user: u, author: u})
      expect(g.settings['template_id']).to eq(template.global_id)
      expect(g.settings['description']).to eq('this is a really important thing')
      expect(g.summary).to eq('hey ya')
      expect(g.advance_at.to_i).to eq((Time.now + 3.weeks.to_i).to_i)
      expect(g.settings['author_id']).to eq(u.global_id)
      expect(g.settings['video']).to eq({'id' => '1_123'})
      expect(g.active).to eq(true)
      expect(g.user).to eq(u)
    end
    
    it "should use the prior goal's author_id if there is one" do
      template = UserGoal.create(:settings => {
        'video' => {
          'id' => '1_123'
        },
        'author_id' => '9876',
        'summary' => 'hey ya',
        'badges' => {'a' => 1},
        'assessment_badge' => {'b' => 1},
        'ref_data' => {'c' => 1},
        'badge_name' => 'badgey',
        'description' => 'this is a really important thing',
        'next_template_id' => '1234',
        'goal_duration' => 3.weeks.to_i
      }, :template => true)
      u = User.create
      prior = UserGoal.create(:settings => {'author_id' => '12345'})
      g = UserGoal.new(:settings => {'prior_goal_id' => prior.global_id})
      g.process({
        template_id: template.global_id
      }, {user: u, author: u})
      expect(g.settings['template_id']).to eq(template.global_id)
      expect(g.settings['description']).to eq('this is a really important thing')
      expect(g.summary).to eq('hey ya')
      expect(g.advance_at.to_i).to eq((Time.now + 3.weeks.to_i).to_i)
      expect(g.settings['author_id']).to eq('12345')
      expect(g.settings['video']).to eq({'id' => '1_123'})
      expect(g.settings['badges']).to eq({'a' => 1})
      expect(g.settings['assessment_badge']).to eq({'b' => 1})
      expect(g.settings['ref_data']).to eq(nil)
      expect(g.settings['badge_name']).to eq('badgey')
      expect(g.active).to eq(true)
      expect(g.user).to eq(u)
    end

    it "should include additional settings if complete_goal=true" do
      template = UserGoal.create(:settings => {
        'video' => {
          'id' => '1_123'
        },
        'author_id' => '9876',
        'summary' => 'hey ya',
        'description' => 'this is a really important thing',
        'next_template_id' => '1234',
        'badges' => {'a' => 1},
        'assessment_badge' => {'b' => 1},
        'badge_name' => 'badgey',
        'ref_data' => {'c' => 1},
        'goal_duration' => 3.weeks.to_i
      }, :template => true)
      u = User.create
      g = UserGoal.new(:settings => {})

      g.build_from_template(template, u, false, true)

      expect(g.settings['template_id']).to eq(template.global_id)
      expect(g.settings['description']).to eq('this is a really important thing')
      expect(g.summary).to eq('hey ya')
      expect(g.advance_at.to_i).to eq((Time.now + 3.weeks.to_i).to_i)
      expect(g.settings['badges']).to eq({'a' => 1})
      expect(g.settings['assessment_badge']).to eq({'b' => 1})
      expect(g.settings['ref_data']).to eq({'c' => 1})
      expect(g.settings['badge_name']).to eq('badgey')
      expect(g.settings['author_id']).to eq('9876')
      expect(g.settings['video']).to eq({'id' => '1_123'})
      expect(g.active).to eq(true)
      expect(g.user).to eq(u)
    end
  end

  describe "children_goals" do
    it "should not error on none set" do
      g = UserGoal.new
      expect(g.children_goals).to eq([])
    end

    it "should return a list of copied goals" do
      u = User.create
      g1 = UserGoal.create(user: u)
      g2 = UserGoal.create(user: u)
      g3 = UserGoal.create(user: u)
      g1.settings['children_ids'] = [g2.global_id, g3.global_id + '4']
      expect(g1.children_goals).to eq([g2])
    end
  end
  
  describe "add_log_session" do
    it "should call generate_stats on the goal" do
      u = User.create
      d = Device.create(user: u)
      g = UserGoal.create(:user => u)
      ls = LogSession.create!(:user => u, author: u, device: d, :goal => g)
      expect(ls.goal).to eq(g)
      expect(ls.reload.goal).to eq(g)
      UserGoal.add_log_session(ls.global_id)
      expect(RemoteAction.where(action: 'queued_goals', path: u.global_id).count).to eq(1)
    end
  end

  describe "update_stats_eventually" do
    it "should schedule an update" do
      u = User.create
      g = UserGoal.create(:user => u)
      expect(RemoteAction.where(action: 'queued_goals', path: u.global_id).count).to eq(0)
      g.update_stats_eventually
      expect(RemoteAction.where(action: 'queued_goals', path: u.global_id).count).to eq(1)
      expect(u.user_extra.settings['queued_goals']).to be_include(g.global_id)
    end
  end
  
  describe "next_template" do
    it "should return nil if no template set" do
      g = UserGoal.new
      expect(g.next_template).to eq(nil)
    end
    
    it "should return nil if next id not a template" do
      g = UserGoal.create
      g2 = UserGoal.create(:settings => {'next_template_id' => g.global_id})
      expect(g2.next_template).to eq(nil)
    end
    
    it "should return the next goal if valid" do
      g = UserGoal.create(:template => true)
      g2 = UserGoal.create(:settings => {'next_template_id' => g.global_id})
      expect(g2.next_template).to eq(g)
    end
  end

  describe "advance_goals" do 
    it "should ignore unadvancing goals" do
      g = UserGoal.create
      Worker.process_queues
      UserGoal.advance_goals
      expect(Worker.scheduled_actions).to eq([])
    end
    
    it "should schedule only advancing goals" do
      u = User.create
      expect(u.any_premium_or_grace_period?).to eq(true)
      
      g = UserGoal.create(:advance_at => 2.weeks.ago, :user => u)
      g2 = UserGoal.create(:advance_at => 1.hour.from_now)
      g3 = UserGoal.create(:advance_at => 2.weeks.ago)
      Worker.process_queues
      UserGoal.advance_goals
      expect(Worker.scheduled_actions.map{|a| a.except('domain_id')}).to eq([{
        'class' => 'Worker',
        'args' => ['UserGoal', 'perform_action', {'id' => g.id, 'method' => 'advance!', 'scheduled' => Time.now.to_i, 'arguments' => []}]
      }])
    end
    
    it "should advance to the next goal in a sequence" do
      two_weeks = 2.weeks.to_i
      t2 = UserGoal.create(:template => true, :settings => {
        'author_id' => '8765',
        'summary' => 'step 2',
        'description' => 'do stuff',
        'video' => {
          'id' => '1212'
        },
        'goal_duration' => 3.weeks.to_i
      })
      t1 = UserGoal.create(:template => true, :settings => {
        'next_template_id' => t2.global_id,
        'author_id' => '9876',
        'summary' => 'step 1',
        'goal_duration' => 2.weeks.to_i
      })
      u = User.create
      g1 = UserGoal.process_new({
        template_id: t1.global_id
      }, {user: u, author: u})
      expect(g1.settings['author_id']).to eq(u.global_id)
      expect(g1.settings['template_id']).to eq(t1.global_id)
      expect(g1.advance_at.to_i).to eq((Time.now + two_weeks).to_i)
      expect(g1.active).to eq(true)
      g1.advance_at = 2.hours.ago
      
      res = g1.advance!
      expect(res).to eq(true)
      expect(g1.active).to eq(false)
      expect(g1.settings['next_goal_id']).to_not eq(nil)
      g2 = UserGoal.find_by_global_id(g1.settings['next_goal_id'])
      expect(g2).to_not eq(nil)
      expect(g2.settings['template_id']).to eq(t2.global_id)
      expect(g2.settings['summary']).to eq('step 2')
      expect(g2.settings['description']).to eq('do stuff')
      expect(g2.settings['video']).to eq({'id' => '1212'})
      expect(g2.settings['prior_goal_id']).to eq(g1.global_id)
    end
    
    it "should retire the goal even if there is no next goal in the sequence" do
      t2 = UserGoal.create(:template => true, :settings => {
        'author_id' => '8765',
        'summary' => 'step 2',
        'description' => 'do stuff',
        'video' => {
          'id' => '1212'
        },
        'goal_duration' => 3.weeks.to_i
      })
      t1 = UserGoal.create(:template => true, :settings => {
        'next_template_id' => t2.global_id,
        'author_id' => '9876',
        'summary' => 'step 1',
        'goal_duration' => 2.weeks.to_i
      })
      u = User.create
      g1 = UserGoal.process_new({
        template_id: t1.global_id
      }, {user: u, author: u})
      expect(g1.settings['author_id']).to eq(u.global_id)
      expect(g1.settings['template_id']).to eq(t1.global_id)
      expect(g1.advance_at.to_i).to be > ((Time.now + 2.weeks.to_i).to_i - 10)
      expect(g1.advance_at.to_i).to be < ((Time.now + 2.weeks.to_i).to_i + 10)
      expect(g1.active).to eq(true)
      g1.advance_at = 2.hours.ago
      
      res = g1.advance!
      expect(res).to eq(true)
      expect(g1.active).to eq(false)
      expect(g1.settings['next_goal_id']).to_not eq(nil)
      g2 = UserGoal.find_by_global_id(g1.settings['next_goal_id'])
      expect(g2).to_not eq(nil)
      expect(g2.settings['template_id']).to eq(t2.global_id)
      expect(g2.settings['summary']).to eq('step 2')
      expect(g2.settings['description']).to eq('do stuff')
      expect(g2.settings['video']).to eq({'id' => '1212'})
      expect(g2.settings['prior_goal_id']).to eq(g1.global_id)
      expect(g2.advance_at.to_i).to eq((Time.now + 3.weeks.to_i).to_i)
      g2.advance_at = 2.hours.ago
      
      res = g2.advance!
      expect(res).to eq(true)
      expect(g2.active).to eq(false)
      expect(g2.settings['next_goal_id']).to eq(nil)
    end
    
    it "should notify of goal advancement"
    
    it "should notify if no goal to advance to"
  end
  
  describe "update_usage" do
    it "should only update if primary" do
      u = User.create
      g = UserGoal.create(:user => u)
      u.settings['primary_goal'] = {'id' => g.global_id}
      u.save
      now = Time.now.iso8601
      g.update_usage(now)
      expect(u.reload.settings['primary_goal']['last_tracked']).to eq(nil)
      
      g.primary = true
      g.save
      g.update_usage(now)
      expect(u.reload.settings['primary_goal']['last_tracked']).to eq(now)
    end
    
    it "should not update last_tracked if not more recent than the current setting" do
      u = User.create
      g = UserGoal.create(:user => u, :primary => true)
      now = Time.now.iso8601
      u.settings['primary_goal'] = {'id' => g.global_id, 'last_tracked' => now}
      u.save
      two_weeks_ago = 2.weeks.ago.iso8601
      g.update_usage(two_weeks_ago)
      expect(u.reload.settings['primary_goal']['last_tracked']).to eq(now)
    end
  end
  
  describe "update_template_header" do
    it "should add new templates" do
      u = User.create
      g = UserGoal.new
      expect(UserGoal).to receive(:find_by_path).with('bacon').and_return(g)
      expect(g).to receive(:add_template).with(g).and_return true
      g.settings = {'template_header_id' => 'bacon'}
      g.update_template_header
    end
    
    it "should remove old templates" do
      u = User.create
      g = UserGoal.new
      expect(UserGoal).to receive(:find_by_path).with('bacon').and_return(g)
      expect(g).to receive(:remove_template).with(g).and_return true
      g.settings = {'old_template_header_id' => 'bacon'}
      g.update_template_header
    end
    
    it "should persist records correctly" do
      u = User.create
      g1 = UserGoal.create(:user => u)
      g2 = UserGoal.create(:user => u)
      g2.settings['template_header_id'] = g1.global_id
      g2.save
      g1.reload
      expect(g1.settings['linked_template_ids']).to eq([g2.global_id])
    end
    
    it "should do nothing id @skip_template_header is set" do
      u = User.create
      g1 = UserGoal.new(:user => u)
      g1.settings = {'template_header_id' => 'self'}
      g1.instance_variable_set('@skip_update_template_header', true)
      g1.save
      expect(Worker.scheduled?(UserGoal, 'perform_action', {'id' => g1.id, 'method' => 'compute_start_ats', 'arguments' => []})).to eq(false)
    end
    
    it "should update start_ats for all templates in the sequence" do
      u = User.create
      g1 = UserGoal.create(:user => u)
      g2 = UserGoal.create(:user => u)
      g3 = UserGoal.create(:user => u)
      g1.settings['template_header_id'] = g1.global_id
      g1.settings['goal_advances_at'] = 'Jan 1'
      g1.settings['next_template_id'] = g2.global_id
      g1.save
      g2.settings['template_header_id'] = g1.global_id
      g2.settings['goal_advances_at'] = 'Apr 1'
      g2.settings['next_template_id'] = g3.global_id
      g2.save
      g3.settings['template_header_id'] = g1.global_id
      g3.settings['goal_advances_at'] = 'Aug 1'
      g3.settings['next_template_id'] = g1.global_id
      g3.save
      Worker.process_queues
      expect(g1.reload.settings['linked_template_ids'].sort).to eq([g1.global_id, g2.global_id, g3.global_id].sort)
      expect(g1.reload.settings['goal_starts_at']).to eq('Aug 1')
      expect(g2.reload.settings['goal_starts_at']).to eq('Jan 1')
      expect(g3.reload.settings['goal_starts_at']).to eq('Apr 1')
    end
  end
  
  describe "compute_start_ats" do
    it "should update start_ats for all templates in the sequence" do
      u = User.create
      g1 = UserGoal.create(:user => u)
      g2 = UserGoal.create(:user => u)
      g3 = UserGoal.create(:user => u)
      g1.settings['template_header_id'] = g1.global_id
      g1.settings['goal_advances_at'] = 'Jan 1'
      g1.settings['next_template_id'] = g2.global_id
      g1.settings['linked_template_ids'] = [g1.global_id, g2.global_id, g3.global_id]
      g1.save
      g2.settings['template_header_id'] = g1.global_id
      g2.settings['goal_advances_at'] = 'Apr 1'
      g2.settings['next_template_id'] = g3.global_id
      g2.save
      g3.settings['template_header_id'] = g1.global_id
      g3.settings['goal_advances_at'] = 'Aug 1'
      g3.settings['next_template_id'] = g1.global_id
      g3.save
      g1.compute_start_ats
      expect(g1.reload.settings['goal_starts_at']).to eq('Aug 1')
      expect(g2.reload.settings['goal_starts_at']).to eq('Jan 1')
      expect(g3.reload.settings['goal_starts_at']).to eq('Apr 1')
    end
    
    it "should not run an infinite loop of saves" do
      u = User.create
      g1 = UserGoal.create(:user => u)
      g2 = UserGoal.create(:user => u)
      g3 = UserGoal.create(:user => u)
      g1.settings['template_header_id'] = g1.global_id
      g1.settings['goal_advances_at'] = 'Jan 1'
      g1.settings['next_template_id'] = g2.global_id
      g1.save
      g2.settings['template_header_id'] = g1.global_id
      g2.settings['goal_advances_at'] = 'Apr 1'
      g2.settings['next_template_id'] = g3.global_id
      g2.save
      g3.settings['template_header_id'] = g1.global_id
      g3.settings['goal_advances_at'] = 'Aug 1'
      g3.settings['next_template_id'] = g1.global_id
      g3.save
      Worker.process_queues
      Worker.process_queues
      expect(g1.reload.settings['linked_template_ids'].sort).to eq([g1.global_id, g2.global_id, g3.global_id].sort)
      expect(g1.reload.settings['goal_starts_at']).to eq('Aug 1')
      expect(g2.reload.settings['goal_starts_at']).to eq('Jan 1')
      expect(g3.reload.settings['goal_starts_at']).to eq('Apr 1')
      expect(Worker.scheduled_actions).to eq([])
    end
  end
  
  describe "add_template" do
    it "should add the goal" do
      u = User.create
      g = UserGoal.new(:user => u, :settings => {})
      g2 = UserGoal.new(:user => u, :settings => {})
      g.add_template(g2)
      expect(g.settings['linked_template_ids']).to eq([g2.global_id])
      g.add_template(g2)
      expect(g.settings['linked_template_ids']).to eq([g2.global_id])
      g.add_template(g2)
      expect(g.settings['linked_template_ids']).to eq([g2.global_id])
    end
  end
  
  describe "remove_template" do
    it "should remove the goal" do
      u = User.create
      g = UserGoal.new(:user => u, :settings => {})
      g2 = UserGoal.new(:user => u, :settings => {})
      g.remove_template(g2)
      expect(g.settings['linked_template_ids']).to eq([])
      g.settings['linked_template_ids'] = [g2.global_id]
      g.remove_template(g2)
      expect(g.settings['linked_template_ids']).to eq([])
    end
  end
  
  describe "remove_linked_templates" do
    it "should delete linked goals" do
      u = User.create
      g1 = UserGoal.create(:user => u)
      g2 = UserGoal.create(:user => u)
      g3 = UserGoal.create(:user => u)
      g1.add_template(g2)
      g1.add_template(g3)
      expect(UserGoal.count).to eq(3)
      g1.destroy
      expect(UserGoal.count).to eq(0)
    end
  end
  
  it "should clear primary goal for the user correctly" do
    u = User.create
    g = UserGoal.process_new({:primary => true}, {:user => u, :author => u})
    expect(g.reload.primary).to eq(true)
    Worker.process_queues
    u.reload
    expect(u.settings['primary_goal']['id']).to eq(g.global_id)
    g.process({:primary => false}, {:author => u})
    Worker.process_queues
    u.reload
    expect(u.settings['primary_goal']).to eq(nil)
  end
  
  describe "active_during" do
    it "should return the correct value" do
      u = User.create
      g = UserGoal.create(user: u)
      g.active = true
      g.settings['started_at'] = 5.hours.ago.iso8601
      expect(g.active_during(24.hours.ago, 12.hours.ago)).to eq(false)
      expect(g.active_during(12.hours.ago, 2.hours.ago)).to eq(true)
      expect(g.active_during(3.hours.ago, 2.hours.ago)).to eq(true)
      
      g.active = false
      expect(g.active_during(24.hours.ago, 12.hours.ago)).to eq(false)
      expect(g.active_during(12.hours.ago, 2.hours.ago)).to eq(false)
      expect(g.active_during(3.hours.ago, 2.hours.ago)).to eq(false)
      
      g.settings['ended_at'] = 4.hours.ago.iso8601
      expect(g.active_during(24.hours.ago, 12.hours.ago)).to eq(false)
      expect(g.active_during(12.hours.ago, 2.hours.ago)).to eq(true)
      expect(g.active_during(3.hours.ago, 2.hours.ago)).to eq(false)
    end
  end
  
  describe "expire_external_dups" do
    it "should expire existing goals with the same external_id" do
      u = User.create
      g = UserGoal.process_new({
        primary: 'if_available',
        external_id: 'baconator',
        active: true
      }, {user: u, author: u})
      Worker.process_queues
      expect(g.reload.primary).to eq(true)
      expect(g.reload.active).to eq(true)

      g2 = UserGoal.process_new({
        primary: 'if_available',
        external_id: 'baconator',
        active: true
      }, {user: u, author: u})
      Worker.process_queues
      expect(g.reload.primary).to eq(false)
      expect(g.reload.active).to eq(false)
      expect(g2.reload.active).to eq(true)
      expect(g2.reload.primary).to eq(true)
    end
  end
end
