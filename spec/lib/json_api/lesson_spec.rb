require 'spec_helper'

describe JsonApi::Lesson do
  it "should have defined pagination defaults" do
    expect(JsonApi::Lesson::TYPE_KEY).to eq('lesson')
    expect(JsonApi::Lesson::DEFAULT_PAGE).to eq(10)
    expect(JsonApi::Lesson::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should return default values" do
      l = Lesson.create
      json = JsonApi::Lesson.build_json(l)
      expect(json['id']).to eq(l.global_id)
      expect(json['title']).to eq("Unnamed Lesson")
      expect(json['required']).to eq(false)
      expect(json['lesson_code']).to eq(l.nonce)
    end

    it "should normalize schemaless lesson URLs for iframe embedding" do
      l = Lesson.create(settings: {'url' => 'google.com', 'title' => 'Test'})
      json = JsonApi::Lesson.build_json(l)
      expect(json['original_url']).to eq('google.com')
      expect(json['url']).to eq('https://google.com')
    end

    it "marks lessons editable for org admins when the training is assigned to the org" do
      o = Organization.create
      author = User.create
      l = Lesson.create(user_id: author.id)
      l.settings['usages'] = [{'obj' => Webhook.get_record_code(o)}]
      l.save!
      json = JsonApi::Lesson.build_json(l, {obj: o})
      expect(json['editable']).to eq(true)
    end

    it "should include target preferences if specified" do
      o = Organization.create
      o2 = Organization.create
      o3 = Organization.create
      ou = OrganizationUnit.create(organization: o)
      ou2 = OrganizationUnit.create(organization: o)
      ou3 = OrganizationUnit.create(organization: o)
      u = User.create
      l = Lesson.create
      l.settings['usages'] = [
        {'obj' => Webhook.get_record_code(u)},
        {'obj' => Webhook.get_record_code(o)},
        {'obj' => Webhook.get_record_code(o2)},
        {'obj' => Webhook.get_record_code(ou)},
        {'obj' => Webhook.get_record_code(ou2)},
      ]
      o.settings['lessons'] = [
        {'id' => l.global_id, 'types' => ['manager']}
      ]
      ou.settings['lesson'] = {'id' => l.global_id, 'types' => ['supervisor', 'communicator']}

      json = JsonApi::Lesson.build_json(l, {obj: o})
      expect(json['target_types']).to eq(['manager'])

      json = JsonApi::Lesson.build_json(l, {obj: ou})
      expect(json['target_types']).to eq(['supervisor', 'communicator'])

      json = JsonApi::Lesson.build_json(l, {obj: o2})
      expect(json['target_types']).to eq(['supervisor'])

      json = JsonApi::Lesson.build_json(l, {obj: ou2})
      expect(json['target_types']).to eq(['supervisor'])

      json = JsonApi::Lesson.build_json(l, {obj: o3})
      expect(json['target_types']).to eq(nil)

      json = JsonApi::Lesson.build_json(l, {obj: ou3})
      expect(json['target_types']).to eq(nil)

      json = JsonApi::Lesson.build_json(l, {obj: u})
      expect(json['target_types']).to eq(nil)
    end

    it "should include user completion details if specified" do
      l = Lesson.create
      u = User.create
      json = JsonApi::Lesson.build_json(l, {extra_user: u})
      expect(json['user']).to_not eq(nil)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['completion']).to eq(nil)

      l.settings['completions'] = [{'user_id' => 'asdf'}, {'user_id' => u.global_id, 'bacon' => true}]
      json = JsonApi::Lesson.build_json(l, {extra_user: u})
      expect(json['user']).to_not eq(nil)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['completion']).to eq({'user_id' => u.global_id, 'bacon' => true})
    end

    it "should include completion ratings only for users in the related org" do
      l = Lesson.create
      u = User.create
      json = JsonApi::Lesson.build_json(l, {extra_user: u})
      expect(json['user']).to_not eq(nil)
      expect(json['user']['id']).to eq(u.global_id)
      expect(json['user']['completion']).to eq(nil)

      l.settings['completions'] = [{'user_id' => 'asdf', 'rating' => 2}, {'user_id' => u.global_id, 'bacon' => true, 'rating' => 3}]
      json = JsonApi::Lesson.build_json(l, {obj: u})
      expect(json['completed_users']).to_not eq(nil)
      expect(json['completed_users'][u.global_id]).to eq({'rating' => 3})
      expect(json['completed_users']['asdf']).to eq(nil)
    end

    it "should return a specialized link for known iframe-sensitive URLs" do
      l = Lesson.create
      u = User.create
      l.settings['url'] = 'https://www.youtube.com/watch?v=aFYsJYPye94'
      l.save
      json = JsonApi::Lesson.build_json(l, {extra_user: u})
      expect(json['url']).to_not eq(nil)
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/videos/youtube/aFYsJYPye94?controls=true")
    end

    it "should return a parameterized link for known external lesson sites" do
      # TODO: implement this
    end
  end
end
