require 'spec_helper'

describe JsonApi::Goal do
  it "should have defined pagination defaults" do
    expect(JsonApi::Goal::TYPE_KEY).to eq('goal')
    expect(JsonApi::Goal::DEFAULT_PAGE).to eq(30)
    expect(JsonApi::Goal::MAX_PAGE).to eq(50)
  end

  describe "build_json" do
    it "should not included unlisted settings" do
      s = UserGoal.new(settings: {'hat' => 'black'})
      expect(JsonApi::Goal.build_json(s).keys).not_to be_include('hat')
    end
    
    it "should include appropriate values" do
      s = UserGoal.new(settings: {})
      ['id', 'has_video', 'active', 'summary', 'description', 'started'].each do |key|
        expect(JsonApi::Goal.build_json(s).keys).to be_include(key)
      end
    end

    it "should include duration and advance information" do
      g = UserGoal.new(:settings => {'goal_duration' => 1.hour.to_i, 'goal_advances_at' => 'Jan 1 2015'})
      json = JsonApi::Goal.build_json(g)
      expect(json['duration']).to eq(1.hour.to_i)
      expect(json['advance']).to eq(Time.parse('Jan 1 2015').iso8601)
    end
    
    it "should include template stats" do
      g = UserGoal.new(:settings => {'template_stats' => {'staty' => true}})
      g.template = true
      json = JsonApi::Goal.build_json(g)
      expect(json['template_stats']).to eq({'staty' => true})
      g = UserGoal.new(:settings => {})
      json = JsonApi::Goal.build_json(g)
      expect(json.keys).to_not be_include('template_stats')
    end
    
    it "should include permissions" do
      u = User.create
      i = UserGoal.new(:user => u, settings: {})
      json = JsonApi::Goal.build_json(i, :permissions => u)
      expect(json['permissions']['view']).to eq(true)
    end
    
    it "should include video information" do
      u = User.create
      v = UserVideo.create(:user => u, :url => "http://www.example.com/video.mp4")
      g = UserGoal.new(:user => u, :settings => {
        'video_id' => v.global_id
      })
      json = JsonApi::Goal.build_json(g, :permissions => u)
      expect(json['video']).to eq(v.summary_hash)
    end

    it "should include unit-specific settings" do
      u = User.new
      o = Organization.create(settings: {'name' => 'Org 1'})
      ou = OrganizationUnit.create(organization_id: o.id, settings: {'name' => 'Unit 1'})
      g = UserGoal.new(:user => u, :settings => {'organization_unit_id' => ou.global_id})
      json = JsonApi::Goal.build_json(g, :permissions => u)
      expect(json['unit_id']).to eq(ou.global_id)
      expect(json['unit_name']).to eq('Unit 1')
      expect(json['unit_org_id']).to eq(o.global_id)
    end
    
    it "should include user comments" do
      u = User.create
      u2 = User.create
      v = UserVideo.create(:url => "http://www.example.com/video.mp4")
      g = UserGoal.new(:user => u, :settings => {
        'comments' => [
          {'user_id' => u.global_id, 'text' => 'something cool'},
          {'user_id' => u2.global_id, 'text' => 'no way'}
        ]
      })
      json = JsonApi::Goal.build_json(g, :permissions => u)
      expect(json['comments']).to_not eq(nil)
      expect(json['comments'].length).to eq(2)
      expect(json['comments'][0]['text']).to eq('something cool')
      expect(json['comments'][0]['user']['id']).to eq(u.global_id)
      expect(json['comments'][0]['user']['user_name']).to eq(u.user_name)
      expect(json['comments'][1]['text']).to eq('no way')
      expect(json['comments'][1]['user']['id']).to eq(u2.global_id)
      expect(json['comments'][1]['user']['user_name']).to eq(u2.user_name)
    end
    
    it "should include video information on user comments" do
      u = User.create
      u2 = User.create
      v = UserVideo.create(:user => u, :url => "http://www.example.com/video.mp4")
      v2 = UserVideo.create(:user => u2, :url => "http://www.example.com/video2.mp4")
      g = UserGoal.new(:user => u, :settings => {
        'video_id' => v.global_id,
        'comments' => [
          {'user_id' => u.global_id, 'text' => 'something cool', 'video_id' => v.global_id},
          {'user_id' => u.global_id, 'text' => 'never mind'},
          {'user_id' => u2.global_id, 'text' => 'no way', 'video_id' => v2.global_id}
        ]
      })
      json = JsonApi::Goal.build_json(g, :permissions => u)
      expect(json['comments']).to_not eq(nil)
      expect(json['comments'].length).to eq(3)
      expect(json['comments'][0]['text']).to eq('something cool')
      expect(json['comments'][0]['user']['id']).to eq(u.global_id)
      expect(json['comments'][0]['user']['user_name']).to eq(u.user_name)
      expect(json['comments'][0]['video']).to eq(v.summary_hash)
      expect(json['comments'][1]['text']).to eq('never mind')
      expect(json['comments'][1]['user']['id']).to eq(u.global_id)
      expect(json['comments'][1]['user']['user_name']).to eq(u.user_name)
      expect(json['comments'][1]['video']).to eq(nil)
      expect(json['comments'][2]['text']).to eq('no way')
      expect(json['comments'][2]['user']['id']).to eq(u2.global_id)
      expect(json['comments'][2]['user']['user_name']).to eq(u2.user_name)
      expect(json['comments'][2]['video']).to eq(v2.summary_hash)
    end
    
    it "should round the values for stats" do
      g = UserGoal.new(settings: {
        'stats' => {
          'a' => 1,
          'b' => 1.2345678,
          'c' => 9.87654321,
          'd' => 'bacon'
        }
      })
      json = JsonApi::Goal.build_json(g)
      expect(json['stats']['a']).to eq(1.0)
      expect(json['stats']['b']).to eq(1.23)
      expect(json['stats']['c']).to eq(9.88)
      expect(json['stats']['d']).to eq('bacon')
    end
    
    it "should include template attributes only for template goals" do
      g = UserGoal.new(settings: {
        'sequence_summary' => 'summary',
        'sequence_description' => 'description',
        'next_template_id' => '123',
        'template_header_id' => '234',
        'goal_advances_at' => 'June 1',
        
      }, active: true)
      json = JsonApi::Goal.build_json(g)
      expect(json['sequence_summary']).to eq(nil)
      expect(json['sequence_description']).to eq(nil)
      expect(json['active']).to eq(true)
      expect(json['template']).to eq(nil)
      expect(json['template_header']).to eq(nil)
      expect(json['date_based']).to eq(nil)
      expect(json['sequence']).to eq(nil)
      expect(json['next_template_id']).to eq(nil)
      expect(json['template_header_id']).to eq(nil)

      g.template = true
      json = JsonApi::Goal.build_json(g)
      expect(json['sequence_summary']).to eq(nil)
      expect(json['sequence_description']).to eq(nil)
      expect(json['active']).to eq(true)
      expect(json['template']).to eq(true)
      expect(json['template_header']).to eq(nil)
      expect(json['date_based']).to eq(true)
      expect(json['sequence']).to eq(nil)
      expect(json['next_template_id']).to eq('123')
      expect(json['template_header_id']).to eq('234')
      
      g.template_header = true
      json = JsonApi::Goal.build_json(g)
      expect(json['sequence_summary']).to eq('summary')
      expect(json['sequence_description']).to eq('description')
      expect(json['active']).to eq(true)
      expect(json['template']).to eq(true)
      expect(json['template_header']).to eq(true)
      expect(json['date_based']).to eq(true)
      expect(json['sequence']).to eq(false)
      expect(json['next_template_id']).to eq('123')
      expect(json['template_header_id']).to eq('234')
    end
    
    it "should include current_template attributes for template header in search" do
      expect(Time).to receive(:now).and_return(Time.parse("Jun 1 2016")).at_least(1).times
      u = User.create
      g1 = UserGoal.create(:user => u, :template_header => true, :template => true)
      g2 = UserGoal.create(:user => u, :template => true)
      g1.settings['template_header_id'] = g1.global_id
      g1.settings['next_template_id'] = g2.global_id
      g1.settings['goal_advances_at'] = 'May 1'
      g1.settings['summary'] = 'First Goal'
      g1.settings['sequence_summary'] = 'Numbered Goals'
      g1.save
      g2.settings['template_header_id'] = g1.global_id
      g2.settings['next_template_id'] = g1.global_id
      g2.settings['goal_advances_at'] = 'October 1'
      g2.settings['summary'] = 'Second Goal'
      g2.save
      Worker.process_queues
      expect(g1.reload.settings['goal_starts_at']).to eq('October 1')
      expect(g2.reload.settings['goal_starts_at']).to eq('May 1')
      expect(g1.reload.current_template).to eq(g2)
      json = JsonApi::Goal.build_json(g1)
      expect(json['id']).to eq(g1.global_id)
      expect(json['sequence_summary']).to eq('Numbered Goals')
      expect(json['summary']).to eq('First Goal')
      expect(json['currently_running_template']).to_not eq(nil)
      expect(json['currently_running_template']['summary']).to eq('Second Goal')
      expect(Time.parse(json['advance'])).to eq(Time.parse("May 1 2017"))
      expect(Time.parse(json['currently_running_template']['advance'])).to eq(Time.parse("October 1 2016"))
    end
    
    it "should include related goals in single lookup for a template goal" do
      expect(Time).to receive(:now).and_return(Time.parse("Jun 1 2016")).at_least(1).times
      u = User.create
      g1 = UserGoal.create(:user => u, :template_header => true, :template => true)
      g2 = UserGoal.create(:user => u, :template => true)
      g1.settings['template_header_id'] = g1.global_id
      g1.settings['next_template_id'] = g2.global_id
      g1.settings['goal_advances_at'] = 'May 1'
      g1.settings['summary'] = 'First Goal'
      g1.settings['sequence_summary'] = 'Numbered Goals'
      g1.save
      g2.settings['template_header_id'] = g1.global_id
      g2.settings['next_template_id'] = g1.global_id
      g2.settings['goal_advances_at'] = 'October 1'
      g2.settings['summary'] = 'Second Goal'
      g2.save
      Worker.process_queues
      expect(g1.reload.settings['goal_starts_at']).to eq('October 1')
      expect(g2.reload.settings['goal_starts_at']).to eq('May 1')
      expect(g1.reload.current_template).to eq(g2)
      json = JsonApi::Goal.build_json(g1, :permissions => u)
      expect(json['id']).to eq(g1.global_id)
      expect(json['sequence_summary']).to eq('Numbered Goals')
      expect(json['summary']).to eq('First Goal')
      expect(Time.parse(json['advance'])).to eq(Time.parse("May 1 2017"))
    end
    
  end
end
