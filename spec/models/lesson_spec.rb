require 'spec_helper'

describe Lesson, :type => :model do
  describe "permission" do
    it "should let the author view and edit" do
      l = Lesson.create
      expect(l.permissions_for(nil)).to eq({'user_id' => nil})

      u = User.create
      expect(l.permissions_for(u)).to eq({'user_id' => u.global_id})

      u2 = User.create
      l.user_id = u2.id
      expect(l.permissions_for(u2)).to eq({'user_id' => u2.global_id, 'view' => true, 'edit' => true, 'view_ratings' => true})
    end

    it "should let the first usage edit" do
      l = Lesson.create
      u = User.create
      o = Organization.create
      o.add_manager(u.user_name, true)
      l.organization_id = o.id
      expect(l.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true, 'view_ratings' => true})
    end

    it "should let organization managers view and edit lessons assigned to their org" do
      l = Lesson.create
      u = User.create
      o = Organization.create
      o.add_manager(u.user_name, true)
      l.settings['usages'] = [{'obj' => Webhook.get_record_code(o)}]
      expect(l.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'view_ratings' => true, 'edit' => true})
    end
  end

  describe "generate_default" do
    it "should generate correct defaults" do
      l = Lesson.create
      expect(l.settings['title']).to eq('Unnamed Lesson')
      expect(l.settings['averate_rating']).to eq(nil)
      expect(l.settings['completed_user_ids']).to eq([])
      expect(l.public).to eq(false)
      expect(l.popularity).to eq(0)
    end

    it "should tally ratings and user counts" do
      l = Lesson.create
      l.settings['completions'] = [
        {'user_id' => 'a', 'rating' => 3},
        {'user_id' => 'a', 'rating' => 4},
        {'user_id' => 'a', 'rating' => 5},
        {'user_id' => 'b'},
        {'user_id' => 'c', 'rating' => 1},
      ]
      l.generate_defaults
      expect(l.settings['average_rating']).to eq(3.3)
      expect(l.settings['completed_user_ids']).to eq(['a', 'b', 'c'])
    end
  end

  describe "nonce" do
    it "should generate a missing nonce" do
      l = Lesson.new
      n = l.nonce
      expect(n).to_not eq(nil)
      expect(l.nonce).to eq(n)
      l.reload
      expect(l.nonce).to eq(n)
    end

    it "should return an existing nonce" do
      l = Lesson.new(settings: {'nonce' => 'asdf'})
      expect(l.nonce).to eq('asdf'  )
    end
  end
  
  describe "load_users_and_extras" do
    it "should use cached value if specified" do
      l = Lesson.new
      obj = OpenStruct.new
      obj.instance_variable_set('@users_and_extras', 'asdf')
      expect(l.load_users_and_extras(obj)).to eq('asdf')
    end

    it "should return correct lookup for each type" do
      u = User.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      l = Lesson.create
      uae = l.load_users_and_extras(u)
      expect(uae[0]).to eq([u])
      expect(uae[1].length).to eq(0)

      expect(o).to receive(:attached_users).with('all').and_return([u])
      uae = l.load_users_and_extras(o)
      expect(uae[0]).to eq([u])
      expect(uae[1].length).to eq(0)

      u2 = User.create
      ue2 = UserExtra.create(user: u2)
      expect(ou).to receive(:all_user_ids).and_return([u.global_id, u2.global_id])
      uae = l.load_users_and_extras(ou)
      expect(uae[0].sort_by(&:id)).to eq([u, u2])
      expect(uae[1].length).to eq(1)
    end
  end
  
  describe "user_counts" do
    it "should return correct counts" do
      l = Lesson.create
      u1 = User.create
      u2 = User.create
      u3 = User.create
      expect(l).to receive(:load_users_and_extras).with(u1).and_return([[u1, u2, u3], []])
      l.settings['completions'] = [
        {'user_id' => u1.global_id},
        {'user_id' => u1.global_id},
        {'user_id' => u3.global_id},
        {'user_id' => 'a'},
        {'user_id' => 'b'},
        {'user_id' => 'c'},
        {'user_id' => 'd'},
      ]
      expect(l.user_counts(u1)).to eq({total: 3, complete: 2})
    end
  end

  describe "normalize_lesson_embed_url" do
    it "prepends https for hostnames without a scheme" do
      expect(Lesson.normalize_lesson_embed_url('google.com')).to eq('https://google.com')
      expect(Lesson.normalize_lesson_embed_url('  www.example.org/path  ')).to eq('https://www.example.org/path')
    end

    it "leaves absolute URLs and paths unchanged" do
      expect(Lesson.normalize_lesson_embed_url('http://example.com/x')).to eq('http://example.com/x')
      expect(Lesson.normalize_lesson_embed_url('https://example.com/x')).to eq('https://example.com/x')
      expect(Lesson.normalize_lesson_embed_url('//example.com/x')).to eq('//example.com/x')
      expect(Lesson.normalize_lesson_embed_url('/internal/lesson')).to eq('/internal/lesson')
    end

    it "rejects non-http(s) schemes used for iframe src" do
      expect(Lesson.normalize_lesson_embed_url('mailto:a@b.co')).to eq(nil)
      expect(Lesson.normalize_lesson_embed_url('javascript:alert(1)')).to eq(nil)
      expect(Lesson.normalize_lesson_embed_url('data:text/html,<script>1</script>')).to eq(nil)
    end
  end

  describe "check_url" do
    it "should skip if already checked" do
      l = Lesson.create
      expect(l.check_url).to eq(nil)
      l.settings['url'] = 'http://example.com/lesson'
      l.settings['checked_url'] = {'url' => 'http://example.com/lesson'}
      expect(l.check_url).to eq(nil)
    end

    it "should schedule a check if not checked and not frd" do
      l = Lesson.create
      l.settings['url'] = 'http://example.com/lesson'
      expect(l).to receive(:schedule).with(:check_url, true)
      expect(l.check_url).to eq(nil)
    end

    it "should make a remote call if frd" do
      l = Lesson.create
      l.settings['url'] = 'http://example.com/lesson'
      o = OpenStruct.new(code: 200, headers: {})
      expect(Typhoeus).to receive(:head).with('http://example.com/lesson', followlocation: true).and_return(o)
      expect(l.check_url(true)).to eq(true)
      l.reload
      expect(l.settings['checked_url'].except('ts')).to eq({'url' => 'http://example.com/lesson'})
    end

    it "should mark deny or sameorigin responses as problematic" do
      l = Lesson.create
      l.settings['url'] = 'http://example.com/lesson'
      o = OpenStruct.new(code: 200, headers: {'X-Frame-Options' => 'deny'})
      expect(Typhoeus).to receive(:head).with('http://example.com/lesson', followlocation: true).and_return(o)
      expect(l.check_url(true)).to eq(true)
      l.reload
      expect(l.settings['checked_url'].except('ts')).to eq({'url' => 'http://example.com/lesson', 'noframe' => true})
    end

    it "should mark csp issues as problematic" do
      l = Lesson.create
      l.settings['url'] = 'http://example.com/lesson'
      o = OpenStruct.new(code: 200, headers: {'Content-Security-Policy' => 'a;b;  frame-ancestors: asdf'})
      expect(Typhoeus).to receive(:head).with('http://example.com/lesson', followlocation: true).and_return(o)
      expect(l.check_url(true)).to eq(true)
      l.reload
      expect(l.settings['checked_url'].except('ts')).to eq({'url' => 'http://example.com/lesson', 'noframe' => true})
    end

    it "should remember checked_url" do
      l = Lesson.create
      l.settings['url'] = 'http://example.com/lesson'
      o = OpenStruct.new(code: 200, headers: {})
      expect(Typhoeus).to receive(:head).with('http://example.com/lesson', followlocation: true).and_return(o)
      expect(l.check_url(true)).to eq(true)
      l.reload
      expect(l.settings['checked_url'].except('ts')).to eq({'url' => 'http://example.com/lesson'})
    end
  end

  describe "complete" do
    it "should return without lesson and user" do
      expect(Lesson.complete(nil, nil, nil)).to eq(false)
      u = User.create
      expect(Lesson.complete(nil, u, nil)).to eq(false)
      l = Lesson.create
      expect(Lesson.complete(l, nil, nil)).to eq(false)
    end

    it "should mark completion on the user and the lesson" do
      u = User.create
      l = Lesson.create
      Lesson.complete(l, u, nil)
      expect(l.settings['completions'].detect{|c| c['user_id'] == u.global_id }).to_not eq(nil)
      ue = UserExtra.find_by(user: u)
      expect(ue).to_not eq(nil)
      expect(ue.settings['completed_lessons'].detect{|c| c['id'] == l.global_id }).to_not eq(nil)

      Lesson.complete(l, u, 3)
      expect(l.settings['completions'].detect{|c| c['user_id'] == u.global_id }['rating']).to eq(3)
      ue = UserExtra.find_by(user: u)
      expect(ue).to_not eq(nil)
      expect(ue.settings['completed_lessons'].detect{|c| c['id'] == l.global_id }['rating']).to eq(3)
    end

    it "should not repeat lesson completions for the same user" do
      u = User.create
      l = Lesson.create
      Lesson.complete(l, u, nil)
      Lesson.complete(l, u, 2)
      Lesson.complete(l, u, 1)
      expect(l.settings['completions'].select{|c| c['user_id'] == u.global_id }.length).to eq(1)
      ue = UserExtra.find_by(user: u)
      expect(ue).to_not eq(nil)
      expect(ue.settings['completed_lessons'].select{|c| c['id'] == l.global_id }.length).to eq(1)
    end
  end

  describe "unassign" do
    it "should return without lesson and known type" do
      l = Lesson.create
      expect(Lesson.unassign(nil, nil)).to eq(false)
      expect(Lesson.unassign(l, nil)).to eq(false)
      expect(Lesson.unassign(nil, l)).to eq(false)
      expect(Lesson.unassign(l, l)).to eq(false)
    end

    it "should unassign from valid types" do
      l = Lesson.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create
      l.settings['usages'] = [
        {'obj' => 'a'},
        {'obj' => Webhook.get_record_code(o)},
        {'obj' => Webhook.get_record_code(ou)},
        {'obj' => Webhook.get_record_code(u)},
        {'obj' => 'b'},
      ]

      o.settings['lessons'] = [{'id' => 'asdf'}, {'id' => l.global_id}]
      expect(Lesson.unassign(l, o)).to eq(true)
      expect(o.settings['lessons']).to eq([{'id' => 'asdf'}])
      expect(l.settings['usages'].length).to eq(4)
      expect(l.settings['usages'].detect{|x| x['obj'] == Webhook.get_record_code(o)}).to eq(nil)

      ou.settings['lesson'] = {'id' => l.global_id}
      expect(Lesson.unassign(l, ou)).to eq(true)
      expect(ou.settings['lesson']).to eq(nil)
      expect(l.settings['usages'].length).to eq(3)
      expect(l.settings['usages'].detect{|x| x['obj'] == Webhook.get_record_code(ou)}).to eq(nil)

      ou.settings['lesson'] = {'id' => 'asdf'}
      expect(Lesson.unassign(l, ou)).to eq(true)
      expect(ou.settings['lesson']).to eq({'id' => 'asdf'})

      u.settings['lessons'] = [{'id' => 'asdf'}, {'id' => l.global_id}]
      expect(Lesson.unassign(l, u)).to eq(true)
      expect(o.settings['lessons']).to eq([{'id' => 'asdf'}])
      expect(l.settings['usages'].length).to eq(2)
      expect(l.settings['usages'].detect{|x| x['obj'] == Webhook.get_record_code(u)}).to eq(nil)
    end
  end

  describe "assign" do
    it "should return false without correct objects" do
      expect(Lesson.assign(nil, nil)).to eq(false)
      l = Lesson.create
      expect(Lesson.assign(l, nil)).to eq(false)
      expect(Lesson.assign(nil, l)).to eq(false)
      expect(Lesson.assign(l, l)).to eq(false)
    end
    
    it "should add the lesson to both objects" do
      l = Lesson.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create

      expect(l.settings['usages']).to eq(nil)
      expect(UserExtra.find_by(user: u)).to eq(nil)
      expect(Lesson.assign(l, u)).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(u) }).to_not eq(nil)
      ue = UserExtra.find_by(user: u)
      expect(ue.settings['lessons'].detect{|s| s['id'] == l.global_id}).to_not eq(nil)

      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(o) }).to eq(nil)
      expect(o.settings['lessons']).to eq(nil)
      expect(Lesson.assign(l, o)).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(o) }).to_not eq(nil)
      expect(o.settings['lessons'].detect{|s| s['id'] == l.global_id}).to_not eq(nil)

      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(ou) }).to eq(nil)
      expect(ou.settings['lesson']).to eq(nil)
      expect(Lesson.assign(l, ou)).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(ou) }).to_not eq(nil)
      expect(ou.settings['lesson']['id']).to eq(l.global_id)
    end

    it "should record types if specified" do
      l = Lesson.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create

      expect(l.settings['usages']).to eq(nil)
      expect(UserExtra.find_by(user: u)).to eq(nil)
      expect(Lesson.assign(l, u, ['supervisor'])).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(u) }).to_not eq(nil)
      ue = UserExtra.find_by(user: u)
      expect(ue.settings['lessons'].detect{|s| s['id'] == l.global_id}['types']).to eq(nil)

      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(o) }).to eq(nil)
      expect(o.settings['lessons']).to eq(nil)
      expect(Lesson.assign(l, o, ['manager', 'supervisor'])).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(o) }).to_not eq(nil)
      expect(o.settings['lessons'].detect{|s| s['id'] == l.global_id}['types']).to eq(['manager', 'supervisor'])

      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(ou) }).to eq(nil)
      expect(ou.settings['lesson']).to eq(nil)
      expect(Lesson.assign(l, ou, ['communicator'])).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(ou) }).to_not eq(nil)
      expect(ou.settings['lesson']['id']).to eq(l.global_id)
      expect(ou.settings['lesson']['types']).to eq(['communicator'])
    end

    it "should record lesson to assignee if specified" do
      l = Lesson.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create

      expect(l.settings['usages']).to eq(nil)
      expect(UserExtra.find_by(user: u)).to eq(nil)
      expect(Lesson.assign(l, u, ['supervisor'], u)).to eq(true)
      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(u) }).to_not eq(nil)
      ue = UserExtra.find_by(user: u)
      expect(ue.settings['assignee_lessons']).to_not eq(nil)
      expect(ue.settings['assignee_lessons'].length).to eq(1)
      expect(ue.settings['assignee_lessons'].map{|a| a['id'] }.uniq).to eq([l.global_id])

      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(o) }).to eq(nil)
      expect(o.settings['lessons']).to eq(nil)
      expect(Lesson.assign(l, o, ['manager', 'supervisor'], u)).to eq(true)
      ue.reload
      expect(ue.settings['assignee_lessons']).to_not eq(nil)
      expect(ue.settings['assignee_lessons'].length).to eq(2)
      expect(ue.settings['assignee_lessons'].map{|a| a['id'] }.uniq).to eq([l.global_id])

      expect(l.settings['usages'].detect{|s| s['obj'] == Webhook.get_record_code(ou) }).to eq(nil)
      expect(ou.settings['lesson']).to eq(nil)
      expect(Lesson.assign(l, ou, ['communicator'], u)).to eq(true)
      ue.reload
      expect(ue.settings['assignee_lessons']).to_not eq(nil)
      expect(ue.settings['assignee_lessons'].length).to eq(3)
      expect(ue.settings['assignee_lessons'].map{|a| a['id'] }.uniq).to eq([l.global_id])
    end
    
    it "should email users about the assigned required lesson" do
      l = Lesson.create
      l.settings['required'] = true
      l.save

      o = Organization.create
      ou = OrganizationUnit.create
      u = User.create

      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      u5 = User.create
      o.add_supervisor(u1.user_name, false)
      o.add_supervisor(u2.user_name, false)
      o.add_supervisor(u3.user_name, true)
      o.add_manager(u4.user_name)

      expect(UserMailer).to receive(:schedule_delivery) do |a, b, c|
        expect(a).to eq(:lesson_assigned)
        expect(b).to eq(l.global_id)
        expect(c.sort).to eq([u1.global_id, u2.global_id, u3.global_id])
      end
      expect(Lesson.assign(l, o, ['supervisor'], u)).to eq(true)

      expect(UserMailer).to receive(:schedule_delivery).with(:lesson_assigned, l.global_id, [u4.global_id])
      expect(Lesson.assign(l, o, ['manager'], u)).to eq(true)

      expect(UserMailer).to receive(:schedule_delivery).with(:lesson_assigned, l.global_id, [u5.global_id])
      expect(Lesson.assign(l, u5, ['manager'], u)).to eq(true)
    end
  end

  describe "history_check" do
    it "should mark completion from historical url-matching completion" do
      l = Lesson.create
      l.settings['past_cutoff'] = 12.months.to_i
      l.settings['url'] = 'whatever'
      l.save
      u = User.create
      ue = UserExtra.create(user: u)
      ue.settings['completed_lessons'] = [
        {'id' => 'asdf', 'url' => 'whatever', 'ts' => 6.months.ago.to_i}
      ]
      ue.save
      l.history_check(u)
      l.reload
      expect(l.settings['completions']).to_not eq(nil)
      expect(l.settings['completions'][0]['user_id']).to eq(u.global_id)
    end

    it "should not mark completion from historical url-matching completion that are too old" do
      l = Lesson.create
      l.settings['past_cutoff'] = 3.months.to_i
      l.settings['url'] = 'whatever'
      l.save
      u = User.create
      ue = UserExtra.create(user: u)
      ue.settings['completed_lessons'] = [
        {'id' => 'asdf', 'url' => 'whatever', 'ts' => 6.months.ago.to_i}
      ]
      ue.save
      l.history_check(u)
      expect(l.settings['completions']).to_not eq(nil)
      expect(l.settings['completions'].length).to eq(0)
    end    
  end

  describe "decorate_completion" do
    it "should not error on no user" do
      expect(Lesson.decorate_completion(nil, {a: 1})).to eq({a: 1})
    end
    it "should update lesson list with user completions" do
      u = User.create
      ue = UserExtra.create(user: u)
      ue.settings['completed_lessons'] = [
        {'id' => 'a', 'ts' => 6.years.ago.to_i, 'rating' => 3},
        {'id' => 'b', 'ts' => 6.minutes.ago.to_i},
        {'id' => 'f', 'ts' => 3.months.ago.to_i, 'url' => 'asdf'},
        {'id' => 'g', 'ts' => 6.months.ago.to_i, 'url' => 'qwer', 'rating' => 1}

      ]
      ue.save
      json = [
        {'id' => 'a'},
        {'id' => 'c'},
        {'id' => 'd'},
        {'id' => 'm', 'url' => 'asdf', 'past_cutoff' => 4.months.to_i},
        {'id' => 'n', 'url' => 'qwer', 'past_cutoff' => 4.months.to_i},
      ]
      expect(Lesson.decorate_completion(u, json)).to eq([
        {'id' => 'a', 'completed' => true, 'completed_ts' => 6.years.ago.to_i, 'rating' => 3},
        {'id' => 'c'},
        {'id' => 'd'},
        {'id' => 'm', 'completed' => true, 'completed_ts' => 3.months.ago.to_i, 'url' => 'asdf', 'past_cutoff' => 4.months.to_i},
        {'id' => 'n', 'completed_ts' => 6.months.ago.to_i, 'url' => 'qwer', 'past_cutoff' => 4.months.to_i},
      ])
    end
  end


  describe "process" do
    it "should parse parameters" do
      l = Lesson.create
      u = User.create
      Time.use_zone('America/Denver') do
        l.process({
          'title' => 'cheddar',
          'description' => 'bacon',
          'url' => 'http://www.example.com/link',
          'required' => 'false',
          'due_at' => "June 20, 2020",
          'time_estimate' => 'bacon',
          'past_cutoff' => '154'
        }, {'author' => u})
      end
      expect(l.settings['author_id']).to eq(u.global_id)
      expect(l.settings['title']).to eq('cheddar')
      expect(l.settings['description']).to eq('bacon')
      expect(l.settings['url']).to eq('http://www.example.com/link')
      expect(l.settings['required']).to eq(false)
      expect(l.settings['due_at']).to match(/\A2020-06-20T00:00:00[+-]\d{2}:\d{2}\z/)
      expect(l.settings['time_estimate']).to eq(nil)
      expect(l.settings['past_cutoff']).to eq(154)
    end

    it "should not raise when due_at is blank and should clear when explicitly blank" do
      l = Lesson.create
      u = User.create
      l.process({
        'title' => 'cheddar',
        'due_at' => 'June 20, 2020'
      }, {'author' => u})
      expect(l.settings['due_at']).to be_present

      expect {
        l.process({'due_at' => ''}, {'author' => u})
      }.not_to raise_error
      expect(l.settings['due_at']).to eq(nil)
    end

    it "should assign the correct target" do
      l = Lesson.create
      u = User.create
      o = Organization.create
      l.process({}, {'author' => u, 'target' => o})
      expect(l.organization_id).to eq(o.id)
      expect(l.organization_unit_id).to eq(nil)
      expect(l.user_id).to eq(nil)

      ou = OrganizationUnit.create(organization: o)
      l.process({}, {'author' => u, 'target' => ou})
      expect(l.organization_id).to eq(nil)
      expect(l.organization_unit_id).to eq(ou.id)
      expect(l.user_id).to eq(nil)

      l.process({}, {'author' => u, 'target' => u})
      expect(l.organization_id).to eq(nil)
      expect(l.organization_unit_id).to eq(nil)
      expect(l.user_id).to eq(u.id)
    end
  end
end
