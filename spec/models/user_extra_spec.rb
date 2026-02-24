require 'spec_helper'

describe UserExtra, type: :model do
  it "should generate defaults" do
    u = User.create
    e = UserExtra.create(user: u)
    expect(e.settings).to_not eq(nil)
  end

  describe "tag_board" do
    it "should return nil without valid settings" do
      e = UserExtra.new
      expect(e.tag_board(nil, nil, nil, nil)).to eq(nil)
      b = Board.new
      expect(e.tag_board(b, nil, nil, nil)).to eq(nil)
      u = User.create
      b = Board.create(user: u)
      expect(e.tag_board(b, nil, nil, nil)).to eq(nil)
      expect(e.tag_board(b, "", nil, nil)).to eq(nil)
    end

    it "should remove a tag if specified" do
      u = User.create
      e = UserExtra.create(user: u)
      b = Board.create(user: u)
      expect(u.user_extra).to eq(e)
      e.settings['board_tags'] = {
        'bacon' => ['a', 'b', 'c', b.global_id, 'd'],
        'cheddar' => ['aa', b.global_id]
      }
      expect(e.tag_board(b, 'bacon', true, false)).to eq(['bacon', 'cheddar'])
      expect(e.settings['board_tags']['bacon']).to eq(['a', 'b', 'c', 'd'])
      expect(e.settings['board_tags']['cheddar']).to eq(['aa', b.global_id])
      expect(e.tag_board(b, 'cheddar', true, false)).to eq(['bacon', 'cheddar'])
      expect(e.settings['board_tags']['bacon']).to eq(['a', 'b', 'c', 'd'])
      expect(e.settings['board_tags']['cheddar']).to eq(['aa'])
    end

    it "should not error when removing non-existent tag" do
      u = User.create
      e = UserExtra.create(user: u)
      b = Board.create(user: u)
      expect(u.user_extra).to eq(e)
      e.settings['board_tags'] = {
        'bacon' => ['a', 'b', 'c', b.global_id, 'd'],
        'cheddar' => ['aa', b.global_id]
      }
      expect(e.tag_board(b, 'broccoli', true, false)).to eq(['bacon', 'cheddar'])
      expect(e.settings['board_tags']['bacon']).to eq(['a', 'b', 'c', b.global_id, 'd'])
      expect(e.settings['board_tags']['cheddar']).to eq(['aa', b.global_id])
    end

    it "should add a tag" do
      u = User.create
      e = UserExtra.create(user: u)
      b = Board.create(user: u)
      expect(u.user_extra).to eq(e)
      expect(e.tag_board(b, 'bacon', false, false)).to eq(['bacon'])
      expect(e.settings['board_tags']['bacon']).to eq([b.global_id])
      expect(e.settings['board_tags']['cheddar']).to eq(nil)
      e.settings['board_tags'] = {
        'bacon' => ['a', 'b', 'c', b.global_id, 'd'],
        'cheddar' => ['aa', b.global_id]
      }
      expect(e.tag_board(b, 'cheddar', false, false)).to eq(['bacon', 'cheddar'])
      expect(e.settings['board_tags']['bacon']).to eq(['a', 'b', 'c', b.global_id, 'd'])
      expect(e.settings['board_tags']['cheddar']).to eq(['aa', b.global_id])
      expect(e.tag_board(b, 'broccoli', false, false)).to eq(['bacon', 'broccoli', 'cheddar'])
      expect(e.settings['board_tags']['bacon']).to eq(['a', 'b', 'c', b.global_id, 'd'])
      expect(e.settings['board_tags']['cheddar']).to eq(['aa', b.global_id])
      expect(e.settings['board_tags']['broccoli']).to eq([b.global_id])
    end

    it "should include downstream boards if specified" do
      u = User.create
      e = UserExtra.create(user: u)
      b = Board.create(user: u)
      b.settings['downstream_board_ids'] = 'a', 'b', 'c'
      expect(u.user_extra).to eq(e)
      expect(e.tag_board(b, 'bacon', false, true)).to eq(['bacon'])
      expect(e.settings['board_tags']['bacon']).to eq([b.global_id, 'a', 'b', 'c'])
    end

    it "should return the latest list of tag names" do
      u = User.create
      e = UserExtra.create(user: u)
      b = Board.create(user: u)
      expect(u.user_extra).to eq(e)
      expect(e.tag_board(b, 'bacon', false, false)).to eq(['bacon'])
      expect(e.settings['board_tags']['cheddar']).to eq(nil)
      e.settings['board_tags'] = {
        'bacon' => ['a', 'b', 'c', b.global_id, 'd'],
        'cheddar' => ['aa', b.global_id]
      }
      expect(e.tag_board(b, 'cheddar', false, false)).to eq(['bacon', 'cheddar'])
      expect(e.tag_board(b, 'broccoli', false, false)).to eq(['bacon', 'broccoli', 'cheddar'])
    end

    it "should remove any empty tag names" do
      u = User.create
      e = UserExtra.create(user: u)
      b = Board.create(user: u)
      expect(u.user_extra).to eq(e)
      expect(e.tag_board(b, 'bacon', false, false)).to eq(['bacon'])
      expect(e.settings['board_tags']['bacon']).to eq([b.global_id])
      expect(e.settings['board_tags']['cheddar']).to eq(nil)
      e.settings['board_tags'] = {
        'bacon' => ['a', 'b', 'c', b.global_id, 'd'],
        'cheddar' => ['aa', b.global_id]
      }
      expect(e.tag_board(b, 'cheddar', false, false)).to eq(['bacon', 'cheddar'])
      expect(e.settings['board_tags']['bacon']).to eq(['a', 'b', 'c', b.global_id, 'd'])
      expect(e.settings['board_tags']['cheddar']).to eq(['aa', b.global_id])
      expect(e.tag_board(b, 'broccoli', false, false)).to eq(['bacon', 'broccoli', 'cheddar'])
      expect(e.tag_board(b, 'broccoli', true, false)).to eq(['bacon', 'cheddar'])
      expect(e.settings['board_tags']['broccoli']).to eq(nil)
    end
  end

  describe "process_focus_words" do
    it "should set new values" do
      ue = UserExtra.new
      ue.generate_defaults
      ue.process_focus_words({'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']}})
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']}
      })
      ue.process_focus_words({'chips' => {'updated' => 2, 'words' => ['d', 'e', 'f']}})
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => 2, 'words' => ['d', 'e', 'f']}
      })
    end


    it "should delete expired values" do
      ue = UserExtra.new
      ue.generate_defaults
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'deleted' => 2, 'words' => ['d', 'e', 'f']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']}
      })
    end

    it "should flag values for deletion" do
      ue = UserExtra.new
      ue.generate_defaults
      now = Time.now.to_i
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'deleted' => now, 'words' => ['d', 'e', 'f']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'deleted' => now, 'words' => ['d', 'e', 'f']}
      })
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
    end

    it "should only flag for deletion if not recently updated" do
      ue = UserExtra.new
      ue.generate_defaults
      now = Time.now.to_i
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'deleted' => now - 100, 'words' => ['d', 'e', 'f']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })      
    end

    it "should update existing values" do
      ue = UserExtra.new
      ue.generate_defaults
      now = Time.now.to_i
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now - 100, 'words' => ['d', 'e', 'f', 'g']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f']}
      })
      ue.process_focus_words({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f', 'h']}
      })
      expect(ue.settings['focus_words']).to eq({
        'chocolate' => {'updated' => 1, 'words' => ['a', 'b', 'c']},
        'chips' => {'updated' => now, 'words' => ['d', 'e', 'f', 'h']}
      })
    end
  end

  describe "process_profile" do
    it "should not error when no recents available" do
      u = User.create
      ue = UserExtra.find_or_create_by(user: u)
      ue.process_profile('bacon')

      o = Organization.create
      o.add_supervisor(u.user_name, false)
      o.reload
      pt = ProfileTemplate.create(public_profile_id: 'bacon')
      o.settings['supervisor_profile'] = {'profile_id' => 'bacon'}
      o.save
      expect(o.matches_profile_id('supervisor', 'bacon', nil)).to eq(true)
      ue.process_profile('bacon')
      
      link = UserLink.last
      expect(link.user).to eq(u)
      expect(link.data['state']['profile_id']).to eq('bacon')
      expect(link.data['state']['profile_template_id']).to eq(nil)
      expect(link.data['state']['profile_history']).to eq([])
    end

    it "should set recents on the user for the profile_id -- even for different template_ids" do
      u = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts2,
          'expected' => ts2 + 12.months.to_i,
          'log_id' => s2.global_id,
          'summary' => 5,
          'summary_color' => [255, 255, 0],
          'template_id' => nil
        },
        {
          'added' => ts1,
          'log_id' => s1.global_id,
          'summary' => 12,
          'summary_color' => [255, 0, 0],
          'template_id' => nil
        },
        {
          'added' => ts3,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      link = UserLink.last
      expect(link.user).to eq(u)
      expect(link.data['state']['profile_id']).to eq(nil)
      expect(link.data['state']['profile_history']).to eq(nil)
    end

    it "should not draw from another user's profiles" do
      u = User.create
      u2 = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      ue2 = UserExtra.find_or_create_by(user: u2)
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts2,
          'expected' => ts2 + 12.months.to_i,
          'log_id' => s2.global_id,
          'summary' => 5,
          'summary_color' => [255, 255, 0],
          'template_id' => nil
        },
        {
          'added' => ts1,
          'log_id' => s1.global_id,
          'summary' => 12,
          'summary_color' => [255, 0, 0],
          'template_id' => nil
        },
        {
          'added' => ts3,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      ue2.process_profile('bacon')
      expect(ue2.settings['recent_profiles']).to eq({'bacon' => []})
    end

    it "should always start with a recent matching the profile_template_id if defined" do
      u = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon', '1_111')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 12.months.to_i,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      link = UserLink.last
      expect(link.user).to eq(u)
      expect(link.data['state']['profile_id']).to eq(nil)
      expect(link.data['state']['profile_history']).to eq(nil)
    end

    it "should set recents on org_user and org_supervisor UserLink records" do
      u = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      o.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 500}
      o.save
      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon', '1_111')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      link = UserLink.last
      expect(link.user).to eq(u)
      expect(link.data['state']['profile_id']).to eq('bacon')
      expect(link.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
    end

    it "should clear profile data just for the triggering org if profile_id==nil" do
      u = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      o = Organization.create
      o2 = Organization.create
      o.add_supervisor(u.user_name, false)
      l1 = UserLink.last
      o.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 500}
      o.save

      o2.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 500}
      o2.save
      o2.add_supervisor(u.user_name, false)
      l2 = UserLink.last

      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon', '1_111')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      l1.reload
      l2.reload
      expect(l1.user).to eq(u)
      expect(l1.data['state']['profile_id']).to eq('bacon')
      expect(l1.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      expect(l2.user).to eq(u)
      expect(l2.data['state']['profile_id']).to eq('bacon')
      expect(l2.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])

      o.settings['supervisor_profile'] = nil
      o.save
      ue.process_profile(nil, nil, o)
      l1.reload
      l2.reload
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      expect(l1.user).to eq(u)
      expect(l1.data['state']['profile_id']).to eq(nil)
      expect(l1.data['state']['profile_history'].blank?).to eq(true)
      expect(l2.user).to eq(u)
      expect(l2.data['state']['profile_id']).to eq('bacon')
      expect(l2.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
    end

    it "should set expected on UserLink records if org has frequency set" do
      u = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      o = Organization.create
      o2 = Organization.create
      o.add_supervisor(u.user_name, false)
      l1 = UserLink.last
      o.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 500}
      o.save

      o2.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 200}
      o2.save
      o2.add_supervisor(u.user_name, false)
      l2 = UserLink.last

      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon', '1_111')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 200,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      l1.reload
      l2.reload
      expect(l1.user).to eq(u)
      expect(l1.data['state']['profile_id']).to eq('bacon')
      expect(l1.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      expect(l2.user).to eq(u)
      expect(l2.data['state']['profile_id']).to eq('bacon')
      expect(l2.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 200,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
    end

    it "should set the shorter expected on the user record" do
      u = User.create
      d = Device.create(user: u)
      ue = UserExtra.find_or_create_by(user: u)
      o = Organization.create
      o2 = Organization.create
      o.add_supervisor(u.user_name, false)
      l1 = UserLink.last
      o.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 500}
      o.save

      o2.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'frequency' => 200}
      o2.save
      o2.add_supervisor(u.user_name, false)
      l2 = UserLink.last

      ts1 = 6.weeks.ago.to_i
      s1 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts1,
        'summary' => 12,
        'summary_color' => [255, 0, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(s1.started_at).to eq(Time.at(ts1))
      ts2 = 4.weeks.ago.to_i
      s2 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts2,
        'summary' => 5,
        'summary_color' => [255, 255, 0]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ts3 = 8.weeks.ago.to_i
      s3 = LogSession.process_new({'profile' => {
        'id' => 'bacon',
        'started' => ts3,
        'summary' => 16,
        'template_id' => '1_111',
        'summary_color' => [255, 0, 255]
      }}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      ue.process_profile('bacon', '1_111')
      expect(ue.settings['recent_profiles']['bacon']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 200,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      l1.reload
      l2.reload
      expect(l1.user).to eq(u)
      expect(l1.data['state']['profile_id']).to eq('bacon')
      expect(l1.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 500,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
      expect(l2.user).to eq(u)
      expect(l2.data['state']['profile_id']).to eq('bacon')
      expect(l2.data['state']['profile_history']).to eq([
        {
          'added' => ts3,
          'expected' => ts3 + 200,
          'log_id' => s3.global_id,
          'summary' => 16,
          'summary_color' => [255, 0, 255],
          'template_id' => '1_111'
        }
      ])
    end
  end
end
