require 'spec_helper'

describe Relinking, :type => :model do
  describe "links_to?" do
    it "should check whether any of the buttons link to the specified board" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.new(:settings => {})
      b2.settings['buttons'] = [
        {}, {}, {'load_board' => {}}
      ]
      b3 = Board.create(:user => u)
      
      expect(b2.links_to?(b)).to eq(false)
      expect(b2.links_to?(b3)).to eq(false)
      
      b2.settings['buttons'] << {'load_board' => {'id' => b.global_id}}
      expect(b2.links_to?(b)).to eq(true)
      expect(b2.links_to?(b3)).to eq(false)
    end
  end
  
  describe "just_for_user?" do
    it "should return true only for private boards with the author as the user" do
      u1 = User.create
      u2 = User.create
      b = Board.new(:user => u1)
      expect(b.just_for_user?(u1)).to eq(true)
      expect(b.just_for_user?(u2)).to eq(false)
      b.public = true
      expect(b.just_for_user?(u1.reload)).to eq(false)
      expect(b.just_for_user?(u2.reload)).to eq(false)
      b.public = false
      b.save
      b.share_with(u2)
      expect(b.just_for_user?(u1.reload)).to eq(false)
      expect(b.just_for_user?(u2.reload)).to eq(false)
    end
  end
  
  describe "copy_for" do
    it "should error no user provided" do
      u = User.create
      b = Board.create(:user => u)
      expect {b.copy_for(nil)}.to raise_error('missing user')
    end

    it "should create a new copy of the specified board for the user" do
      u = User.create
      b = Board.create(:user => u, :settings => {'hat' => true, 'image_url' => 'bob'})
      res = b.copy_for(u)
      expect(res.settings['name']).to eq(b.settings['name'])
      expect(res.settings['description']).to eq(b.settings['description'])
      expect(res.settings['image_url']).to eq(b.settings['image_url'])
      expect(res.settings['image_url']).to eq('bob')
      expect(res.settings['buttons']).to eq(b.settings['buttons'])
      expect(res.settings['license']).to eq(b.settings['license'])
      expect(res.settings['grid']).to eq(b.settings['grid'])
      expect(res.settings['hat']).to eq(nil)
      expect(res.key).to eq(b.key + "_1")
    end
    
    it "should trigger a call to map_images" do
      u = User.create
      b = Board.create(:user => u, :settings => {'hat' => true, 'image_url' => 'bob', 'buttons' => []})
      res = b.copy_for(u)
      expect(res.instance_variable_get('@map_later')).to eq(true)
      expect(res.settings['images_not_mapped']).to eq(true)
      Worker.process_queues
    end
    
    it "should make public if specified" do
      u = User.create
      b = Board.create(:user => u, :settings => {'hat' => true, 'image_url' => 'bob', 'buttons' => []})
      res = b.copy_for(u, make_public: true)
      expect(res.public).to eq(true)
    end
    
    it "should update self-referential links" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'buttons' => [{'id' => '1', 'load_board' => {'id' => b.global_id, 'key' => b.key}}]}, {'user' => u})
      expect(b.buttons[0]['load_board']['id']).to eq(b.global_id)
      res = b.copy_for(u, make_public: true)
      expect(res.buttons[0]['load_board']['id']).to eq(res.global_id)
    end
    
    it "should not keep updating parent links if re-added" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'buttons' => [{'id' => '1', 'load_board' => {'id' => b.global_id, 'key' => b.key}}]}, {'user' => u})
      expect(b.buttons[0]['load_board']['id']).to eq(b.global_id)
      res = b.copy_for(u, make_public: true)
      expect(res.buttons[0]['load_board']['id']).to eq(res.global_id)
      b.process({'buttons' => [{'id' => '1', 'load_board' => {'id' => b.global_id, 'key' => b.key}}]}, {'user' => u})
      expect(b.buttons[0]['load_board']['id']).to eq(b.global_id)
    end

    it "should create a new copy of the specified board for the user and clone content" do
      u = User.create
      b = Board.create(:user => u, :settings => {'hat' => true, 'image_url' => 'bob'})
      b.process({'buttons' => [{'id' => '1', 'label' => 'a'}, {'id' => '2', 'label' => 'b'}, {'id' => '4', 'label' => 'c'}], 'grid' => {'rows' => 2, 'columns' => 2, 'order' => [['1', '2'],[nil, '4']]}}, {'user' => u})
      BoardContent.generate_from(b)
      res = b.copy_for(u)
      expect(res.settings['name']).to eq(b.settings['name'])
      expect(res.settings['description']).to eq(b.settings['description'])
      expect(res.settings['image_url']).to eq(b.settings['image_url'])
      expect(res.settings['image_url']).to eq('bob')
      expect(res.settings['buttons']).to eq([])
      expect(res.buttons).to eq(b.buttons)
      expect(res.buttons.length).to eq(3)
      expect(res.settings['license']).to eq(b.settings['license'])
      expect(res.settings['grid']).to eq(nil)
      expect(BoardContent.load_content(res, 'grid')).to eq(BoardContent.load_content(b, 'grid'))
      expect(BoardContent.load_content(res, 'grid')).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [['1', '2'], [nil, '4']]
      })
      expect(res.settings['hat']).to eq(nil)
      expect(res.key).to eq(b.key + "_1")
    end

    it "should prepend a new prefix" do
      u = User.create
      b = Board.create(user: u)
      b.settings['name'] = "Bacon"
      b.save
      res = b.copy_for(u, make_public: false, copy_id: nil, prefix: "Cooked")
      expect(res.settings['name']).to eq("Cooked Bacon")
      expect(res.settings['prefix']).to eq("Cooked")
    end

    it "should remove the old prefix before adding the new prefix" do
      u = User.create
      b = Board.create(user: u)
      b.settings['name'] = "Bacon"
      b.save
      res = b.copy_for(u, make_public: false, copy_id: nil, prefix: "Cooked")
      expect(b.settings['name']).to eq("Bacon")
      expect(b.settings['prefix']).to eq(nil)
      expect(res.settings['name']).to eq("Cooked Bacon")
      expect(res.settings['prefix']).to eq("Cooked")

      res2 = res.copy_for(u, make_public: false, copy_id: nil, prefix: "Frozen")
      expect(b.settings['name']).to eq("Bacon")
      expect(b.settings['prefix']).to eq(nil)
      expect(res.settings['name']).to eq("Cooked Bacon")
      expect(res.settings['prefix']).to eq("Cooked")
      expect(res2.settings['name']).to eq("Frozen Bacon")
      expect(res2.settings['prefix']).to eq("Frozen")
    end

    it "should just append the new prefix if the old prefix isn't at the beginning" do
      u = User.create
      b = Board.create(user: u)
      b.settings['name'] = "Bacon"
      b.save
      res = b.copy_for(u, make_public: false, copy_id: nil, prefix: "Cooked")
      expect(b.settings['name']).to eq("Bacon")
      expect(b.settings['prefix']).to eq(nil)
      expect(res.settings['name']).to eq("Cooked Bacon")
      expect(res.settings['prefix']).to eq("Cooked")

      res.settings['name'] = "Bacon"
      res.save

      res2 = res.copy_for(u, make_public: false, copy_id: nil, prefix: "Frozen")
      expect(b.settings['name']).to eq("Bacon")
      expect(b.settings['prefix']).to eq(nil)
      expect(res.settings['name']).to eq("Bacon")
      expect(res.settings['prefix']).to eq("Cooked")
      expect(res2.settings['name']).to eq("Frozen Bacon")
      expect(res2.settings['prefix']).to eq("Frozen")
    end

    it "should ignore an empty string prefix" do
      u = User.create
      b = Board.create(user: u)
      b.settings['name'] = "Bacon"
      b.save
      res = b.copy_for(u, make_public: false, copy_id: nil, prefix: "")
      expect(res.settings['name']).to eq("Bacon")
      expect(res.settings['prefix']).to eq(nil)
    end

    it "should allow setting new_owner if authorized" do
      u1 = User.create
      b = Board.create(user: u1)
      u2 = User.create
      b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      b.save
      b2 = b.copy_for(u2, copier: u1, new_owner: true)
      expect(b2.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u2.global_id, 'sub_owner' => true})
    end

    it "should not allow setting new_owner if not authorized" do
      u1 = User.create
      b = Board.create(user: u1)
      u2 = User.create
      b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      b.save
      b2 = b.copy_for(u2, copier: u2, new_owner: true)
      expect(b2.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id, 'sub_owner' => true})
    end

    it "should allow disconnecting if authorized" do
      u1 = User.create
      b = Board.create(user: u1, parent_board_id: 1)
      u2 = User.create
      b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      b.save
      b2 = b.copy_for(u2, copier: u1, disconnect: true)
      expect(b2.settings['copy_parent_board_id']).to eq(b.global_id)
      expect(b2.parent_board_id).to eq(nil)
    end

    it "should not allow disconnecting if not authorized" do
      u1 = User.create
      b = Board.create(user: u1, parent_board_id: 1)
      u2 = User.create
      b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      b.save
      b2 = b.copy_for(u2, copier: u2, disconnect: true)
      expect(b2.settings['copy_parent_board_id']).to eq(nil)
      expect(b2.parent_board_id).to eq(b.id)
    end

    it "should set sub_owner to false if disconnect AND new_owner" do
      u1 = User.create
      b = Board.create(user: u1, parent_board_id: 1)
      u2 = User.create
      b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      b.save
      b2 = b.copy_for(u2, copier: u1, new_owner: true, disconnect: true)
      expect(b2.settings['copy_parent_board_id']).to eq(b.global_id)
      expect(b2.parent_board_id).to eq(nil)
      expect(b2.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u2.global_id, 'sub_owner' => false})
    end

    it "should properly copy a shallow clone" do
      u1 = User.create
      b = Board.create(user: u1)
      u2 = User.create
      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      b2 = bb.copy_for(u2, copier: u2)
      expect(b2.id).to_not eq(b.id)
      expect(b2.settings['shallow_source']).to eq({'id' => "#{b.global_id}-#{u2.global_id}", 'key' => "#{u2.user_name}/my:#{b.key.sub(/\//, ':')}"})
    end

    it "should not allow unauthorized copying of a shallow clone" do
      u1 = User.create
      b = Board.create(user: u1)
      u2 = User.create
      u3 = User.create
      b.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u3.global_id}
      b.save
      b = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect{ b.copy_for(u2, copier: u2, new_owner: true) }.to raise_error("not authorized to copy #{b.global_id} by #{u2.global_id}")
    end
  end

  describe "update_default_locale!" do
    it "should do nothing if new locale not specified" do
      u = User.create
      b = Board.create(user: u)
      expect(BoardContent).to_not receive(:load_content)
      b.update_default_locale!(nil, nil)
    end

    it "should do nothing if not matching old locale" do
      u = User.create
      b = Board.create(user: u)
      expect(BoardContent).to_not receive(:load_content)
      b.update_default_locale!('fr', 'es')
    end

    it "should do nothiing if old and new locales match" do
      u = User.create
      b = Board.create(user: u)
      expect(BoardContent).to_not receive(:load_content)
      b.update_default_locale!('en', 'en')
    end

    it "should set translations for old locale if not specified" do
      u = User.create
      b = Board.create(user: u)
      b.settings['locale']
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'bacon'},
        {'id' => 2, 'label' => 'happy', 'vocalization' => "I am happy"},
        {'id' => 'asdf', 'label' => 'whatever', 'inflections' => {'a' => 'a'}},
      ]
      b.update_default_locale!('en', 'fr')
      expect(b.settings['locale']).to eq('en')
      expect(b.settings['translations']).to_not eq(nil)
      expect(b.settings['translations']['1']).to eq({'en' => {'label' => 'bacon'}})
      expect(b.settings['translations']['2']).to eq({'en' => {'label' => 'happy', 'vocalization' => "I am happy"}})
      expect(b.settings['translations']['asdf']).to eq({'en' => {'label' => 'whatever', 'inflections' => {'a' => 'a'}}})
    end

    it "should update button strings for a matching locale change" do
      u = User.create
      b = Board.create(user: u)
      b.settings['locale']
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'bacon'},
        {'id' => 2, 'label' => 'happy', 'vocalization' => "I am happy"},
        {'id' => 'asdf', 'label' => 'whatever', 'inflections' => {'a' => 'a'}},
      ]
      b.settings['translations'] = {
        '1' => {
          'fr' => {'label' => 'baconne', 'vocalization' => 'je suis'}
        },
        '2' => {
          'fr' => {'label' => 'joyeux'}
        },
        'asdf' => {
          'fr' => {'label' => 'whatevs'}
        }
      }
      b.update_default_locale!('en', 'fr')
      expect(b.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'baconne', 'vocalization' => 'je suis'},
        {'id' => 2, 'label' => 'joyeux'},
        {'id' => 'asdf', 'label' => 'whatevs'},
      ])
      expect(b.settings['translations']['1']).to eq({'en' => {'label' => 'bacon'}, 'fr' => {'label' => 'baconne', 'vocalization' => 'je suis'}})
      expect(b.settings['translations']['2']).to eq({'en' => {'label' => 'happy', 'vocalization' => "I am happy"}, 'fr' => {'label' => 'joyeux'}})
      expect(b.settings['translations']['asdf']).to eq({'en' => {'label' => 'whatever', 'inflections' => {'a' => 'a'}}, 'fr' => {'label' => 'whatevs'}})
      expect(b.settings['locale']).to eq('fr')
    end

    it "should not update button strings if no translation available" do
      u = User.create
      b = Board.create(user: u)
      b.settings['locale']
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'bacon'},
        {'id' => 2, 'label' => 'happy', 'vocalization' => "I am happy"},
        {'id' => 'asdf', 'label' => 'whatever', 'inflections' => {'a' => 'a'}},
      ]
      b.update_default_locale!('en', 'fr')
      expect(b.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'bacon'},
        {'id' => 2, 'label' => 'happy', 'vocalization' => "I am happy"},
        {'id' => 'asdf', 'label' => 'whatever', 'inflections' => {'a' => 'a'}},
      ])
      expect(b.settings['translations']['1']).to eq({'en' => {'label' => 'bacon'}})
      expect(b.settings['translations']['2']).to eq({'en' => {'label' => 'happy', 'vocalization' => "I am happy"}})
      expect(b.settings['translations']['asdf']).to eq({'en' => {'label' => 'whatever', 'inflections' => {'a' => 'a'}}})
      expect(b.settings['locale']).to eq('en')
    end
  end
  
  describe "replace_links!" do
    it "should replace links in buttons section" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b3.settings['buttons'] = [
        {},
        {'id' => 2},
        {'load_board' => {'id' => b1.global_id}},
        {'load_board' => {'id' => b3.global_id}}
      ]
      b3.replace_links!(b1.global_id, {id: b2.global_id, key: b2.key})
      expect(b3.settings['buttons']).to eq([
        {},
        {'id' => 2},
        {'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'load_board' => {'id' => b3.global_id}}
      ])
    end

    it "should work correctly with board_content" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b3.settings['buttons'] = [
        {},
        {'id' => 2},
        {'load_board' => {'id' => b1.global_id}},
        {'load_board' => {'id' => b3.global_id}}
      ]
      b3.save
      expect(b3.buttons).to eq([
        {},
        {'id' => 2},
        {'load_board' => {'id' => b1.global_id}},
        {'load_board' => {'id' => b3.global_id}}
      ])
      BoardContent.generate_from(b3)
      b3.replace_links!(b1.global_id, {id: b2.global_id, key: b2.key})
      expect(b3.buttons).to eq([
        {},
        {'id' => 2},
        {'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'load_board' => {'id' => b3.global_id}}
      ])
    end
  end
  
  describe "copy_board_links_for" do
    it "should copy downstream boards" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      b2 = b1.copy_for(u2)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(user).to eq(u2)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq([b1.global_id, b1a.global_id])
        expect(pending_replacements.length).to eq(2)
        expect(pending_replacements[0]).to eq([b1.global_id, {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq(b1a.global_id)
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u2, {:starting_old_board => b1, :starting_new_board => b2})
    end
    
    it "should not create duplicate copies" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1b = Board.create(:user => u1, :public => true)
      b1.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}},
        {'id' => 2, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id}}
      ]
      b1.instance_variable_set('@buttons_changed', true);
      b1.save!
      b1a.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id}},
        {'id' => 2, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id}}
      ]
      b1a.instance_variable_set('@buttons_changed', true);
      b1a.save!
      
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b1a.global_id, b1b.global_id])
      expect(b1a.reload.settings['downstream_board_ids']).to eq([b1b.global_id])
      
      expect(Board.count).to eq(3)
      
      b2 = b1.copy_for(u2)
      Board.copy_board_links_for(u2, {:starting_old_board => b1, :starting_new_board => b2})
      ids = Board.all.map(&:global_id).sort

      Worker.process_queues

      expect(b2.reload.settings['downstream_board_ids']).to eq([ids[-2], ids[-1]])
      expect(Board.count).to eq(6)
    end
    
    it "should not copy downstream boards that it doesn't have permission to access" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      b2 = b1.copy_for(u2)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(user).to eq(u2)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq([b1.global_id, b1a.global_id])
        expect(pending_replacements.length).to eq(1)
        expect(pending_replacements[0]).to eq([b1.global_id, {id: b2.global_id, key: b2.key}])
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u2, {:starting_old_board => b1, :starting_new_board => b2})
    end
    
    it "should update links in the root board and all downstream boards" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1b = Board.create(:user => u1, :public => true)
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id, 'link_disabled' => true}}]
      b1a.save!
      b1a.track_downstream_boards!
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id, b1b.global_id])
      b2 = b1.copy_for(u2)
      Board.copy_board_links_for(u2, {:starting_old_board => b1, :starting_new_board => b2})

      b2.reload
      expect(b2.buttons[0]['load_board']['key']).not_to eq(b1a.key)
      b2a = Board.find_by_path(b2.buttons[0]['load_board']['key'])
      expect(b2a.buttons[0]['load_board']['key']).not_to eq(b1b.key)
      expect(b2a.public).to eq(false)
      b2b = Board.find_by_path(b2a.buttons[0]['load_board']['key'])
      expect(b2.buttons[0]['load_board']).to eq({'key' => b2a.key, 'id' => b2a.global_id})
      expect(b2a.buttons[0]['load_board']).to eq({'key' => b2b.key, 'id' => b2b.global_id, 'link_disabled' => true})
      expect(b2b.public).to eq(false)
    end
    
    it "should only copy explicitly-listed boards if there's a list" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1b = Board.create(:user => u1, :public => true)
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id, 'link_disabled' => true}}]
      b1a.save!
      b1a.track_downstream_boards!
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id, b1b.global_id])
      b2 = b1.copy_for(u2)
      Board.copy_board_links_for(u2, {:valid_ids => [b1.global_id, b1a.global_id], :starting_old_board => b1, :starting_new_board => b2})

      b2.reload
      expect(b2.buttons[0]['load_board']['key']).not_to eq(b1a.key)
      b2a = Board.find_by_path(b2.buttons[0]['load_board']['key'])
      expect(b2a.buttons[0]['load_board']['key']).to eq(b1b.key)
    end
    
    it "should not copy explicitly-listed boards unless there's a valid route to the board that makes it happen" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1b = Board.create(:user => u1, :public => true)
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id, 'link_disabled' => true}}]
      b1a.save!
      b1a.track_downstream_boards!
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id, b1b.global_id])
      b2 = b1.copy_for(u2)
      Board.copy_board_links_for(u2, {:valid_ids => [b1.global_id, b1b.global_id], :starting_old_board => b1, :starting_new_board => b2})

      b2.reload
      expect(b2.buttons[0]['load_board']['key']).to eq(b1a.key)
      b2a = Board.find_by_path(b2.buttons[0]['load_board']['key'])
      expect(b2a.buttons[0]['load_board']['key']).to eq(b1b.key)
      b2b = Board.find_by_path(b2a.buttons[0]['load_board']['key'])
    end    

    it "should copy downstream boards when supervisor is copying with permission" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b1 = Board.create(:user => u1)
      b1a = Board.create(:user => u1)
      User.link_supervisor_to_user(u2, u1, nil, true)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      b2 = b1.copy_for(u3)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(opts[:authorized_user]).to eq(u2)
        expect(user).to eq(u3)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq([b1.global_id, b1a.global_id])
        expect(pending_replacements.length).to eq(2)
        expect(pending_replacements[0]).to eq([b1.global_id, {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq(b1a.global_id)
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u3, {:starting_old_board => b1, :starting_new_board => b2, :authorized_user => u2})
    end
    
    it "should make public if specified" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      b2 = b1.copy_for(u2)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(user).to eq(u2)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq([b1.global_id, b1a.global_id])
        expect(pending_replacements.length).to eq(2)
        expect(pending_replacements[0]).to eq([b1.global_id, {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq(b1a.global_id)
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u2, {:starting_old_board => b1, :starting_new_board => b2, :make_public => true})
      Worker.process_queues
      expect(b2.reload.settings['downstream_board_ids'].length).to eq(1)
      boards = Board.find_all_by_global_id(b2.settings['downstream_board_ids'])
      expect(boards.map(&:public)).to eq([true])
    end
    
    it "should mark everything with the correct copy_id" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1b = Board.create(:user => u1, :public => true)
      b1a.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id, 'link_disabled' => true}}]
      b1a.save!
      b1a.track_downstream_boards!
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id, b1b.global_id])
      b2 = b1.copy_for(u2)
      Board.copy_board_links_for(u2, {:valid_ids => [b1.global_id, b1a.global_id], :starting_old_board => b1, :starting_new_board => b2})

      b2.reload
      expect(b2.buttons[0]['load_board']['key']).not_to eq(b1a.key)
      expect(b2.settings['copy_id']).to eq(b2.global_id)
      b2a = Board.find_by_path(b2.buttons[0]['load_board']['key'])
      expect(b2a.buttons[0]['load_board']['key']).to eq(b1b.key)
      expect(b2a.settings['copy_id']).to eq(b2.global_id)
    end

    it "should update locale and button strings only for sub-boards that match the old locale" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1a.save
      b1b = Board.create(:user => u1, :public => true)
      b1b.settings['buttons'] = [{'id' => 1, 'label' => 'hola'}]
      b1b.settings['translations'] = {'1' => {'fr' => {'label' => 'bonjour'}}}
      b1b.settings['locale'] = 'es'
      b1b.save
      b1a.settings['buttons'] = [{'id' => 1, 'label' => 'house', 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id, 'link_disabled' => true}}]
      b1a.settings['translations'] = {'1' => {'fr' => {'label' => 'maison'}}}
      b1a.save!
      b1a.track_downstream_boards!
      b1.settings['buttons'] = [{'id' => 1, 'label' => 'car', 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'voiture'}}}
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id, b1b.global_id])
      b2 = b1.copy_for(u2)
      Board.copy_board_links_for(u2, {:valid_ids => [b1.global_id, b1a.global_id, b1b.global_id], :starting_old_board => b1, :starting_new_board => b2, :old_default_locale => 'en', :new_default_locale => 'fr'})

      b2.reload
      expect(b2.buttons[0]['load_board']['key']).not_to eq(b1a.key)
      expect(b2.buttons[0]['label']).to eq('voiture')
      expect(b2.settings['locale']).to eq('fr')
      expect(b2.settings['copy_id']).to eq(b2.global_id)
      b2a = Board.find_by_path(b2.buttons[0]['load_board']['key'])
      expect(b2a.buttons[0]['load_board']['key']).to_not eq(b1b.key)
      expect(b2a.buttons[0]['label']).to eq('maison')
      expect(b2a.settings['locale']).to eq('fr')
      expect(b2a.settings['copy_id']).to eq(b2.global_id)
      b2b = Board.find_by_path(b2a.buttons[0]['load_board']['key'])
      expect(b2b.buttons[0]['label']).to eq('hola')
      expect(b2b.settings['locale']).to eq('es')
      expect(b2a.settings['copy_id']).to eq(b2.global_id)
    end

    it "should not allow sneaking new_owner onto someone else's board by linking to it from one of their own" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u1, nil, false)
      b1 = Board.create(user: u1, public: true)
      b1.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      b1.save
      b2 = Board.create(user: u2)
      b2a = Board.create(user: u2)
      b2a.settings['protected'] = {'vocabulary' => true, 'vocabulary_owner_id' => u2.global_id}
      b2a.save
      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'a', 'load_board' => {'key' => b2a.key, 'id' => b2a.global_id}}
      ]}, {'author' => u2})
      expect(b2.buttons[0]).to_not eq(nil)
      expect(b2.buttons[0]['load_board']['key']).to eq(b2a.key)
      Worker.process_queues
      b2a.process({'buttons' => [
        {'id' => '1', 'label' => 'b', 'load_board' => {'key' => b1.key, 'id' => b1.global_id}}
      ]}, {'author' => u1})
      expect(b2a.buttons[0]).to_not eq(nil)
      expect(b2a.buttons[0]['load_board']['key']).to eq(b1.key)
      b2.reload.track_downstream_boards!
      Worker.process_queues
      Worker.process_queues
      b2.reload.track_downstream_boards!
      expect(b2.reload.settings['downstream_board_ids'].sort).to eq([b1.global_id, b2a.global_id].sort)
      u3 = User.create
      b3 = b2.copy_for(u3, copier: u2, new_owner: true)
      res = Board.copy_board_links_for(u3, {:starting_old_board => b2, starting_new_board: b3, :valid_ids => [b1.global_id, b2.global_id, b2a.global_id], :copier => u2, :authorized_user => u2, :new_owner => true})
      b3.reload
      expect(b3.buttons[0]['load_board']['key']).to_not eq(b2a.key)
      b3a = Board.find_by_path(b3.buttons[0]['load_board']['key'])
      expect(b3a.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u3.global_id, 'sub_owner' => true})
      expect(b3a.buttons[0]['load_board']['key']).to_not eq(b1.key)
      b3b = Board.find_by_path(b3a.buttons[0]['load_board']['key'])
      expect(b3b.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id, 'sub_owner' => true})
    end

    it "should copy shallow clones" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      bb1 = Board.find_by_path("#{b1.global_id}-#{u2.global_id}")
      b2 = bb1.copy_for(u2, unshallow: true)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(user).to eq(u2)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq(["#{b1.global_id}-#{u2.global_id}", "#{b1a.global_id}-#{u2.global_id}"])
        expect(pending_replacements.length).to eq(2)
        expect(pending_replacements[0]).to eq(["#{b1.global_id}-#{u2.global_id}", {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq("#{b1a.global_id}-#{u2.global_id}")
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u2, {:starting_old_board => bb1, :starting_new_board => b2})
    end

    it "should include copies of already-edited shallow clones in the copy batch" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(:user => u1, :public => true)
      b1a = Board.create(:user => u1, :public => true)
      b1a.settings['name'] = 'cheddar'
      b1a.save
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      bb1 = Board.find_by_path("#{b1.global_id}-#{u2.global_id}")
      bb1a = Board.find_by_path("#{b1a.global_id}-#{u2.global_id}").copy_for(u2)
      bb1a.settings['name'] = "bacon"
      bb1a.save
      expect(bb1a.settings['shallow_source']).to_not eq(nil)
      b2 = bb1.copy_for(u2, unshallow: true)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(user).to eq(u2)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq(["#{b1.global_id}-#{u2.global_id}", "#{b1a.global_id}-#{u2.global_id}"])
        expect(pending_replacements.length).to eq(3)
        expect(pending_replacements[0]).to eq(["#{b1.global_id}-#{u2.global_id}", {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq(bb1a.global_id)
        expect(pending_replacements[2][0]).to eq("#{b1a.global_id}-#{u2.global_id}")
        bbb = Board.find_by_path(pending_replacements[1][1][:key])
        expect(bbb.settings['name']).to eq('bacon')
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u2, {:starting_old_board => bb1, :starting_new_board => b2})
    end

    it "should create new copies of multiple levels of shallow clones, including some edited ones" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, public: true)
      b1a = Board.create(user: u1, public: true)
      b1b = Board.create(user: u1, public: true)
      b1c = Board.create(user: u1, public: true)
      b1.settings['name'] = 'oldtop'
      b1.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}},
        {'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id}}
      ]
      b1.save!
      b1.track_downstream_boards!

      b1a.settings['name'] = 'olda'
      b1a.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'key' => b1c.key, 'id' => b1c.global_id}},
        {'id' => 1, 'load_board' => {'key' => b1b.key, 'id' => b1b.global_id}}
      ]
      b1a.save!
      b1a.track_downstream_boards!
      b1.track_downstream_boards!

      b1b.settings['name'] = 'oldb'
      b1b.save!

      b1c.settings['name'] = 'oldc'
      b1c.save!

      bb1b = Board.find_by_global_id("#{b1b.global_id}-#{u2.global_id}")
      b2b = bb1b.copy_for(u2)
      expect(b2b.shallow_key).to eq(bb1b.key)
      expect(b2b.key).to_not eq(bb1b.key)
      b2b.settings['name'] = 'newb'
      b2b.save!

      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      b2 = bb1.copy_for(u2, unshallow: true)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(user).to eq(u2)
        expect(board_ids.length).to eq(4)
        expect(board_ids).to eq(["#{b1.global_id}-#{u2.global_id}", "#{b1a.global_id}-#{u2.global_id}", "#{b1b.global_id}-#{u2.global_id}", "#{b1c.global_id}-#{u2.global_id}"])
        expect(pending_replacements.length).to eq(5)
        expect(pending_replacements[0]).to eq(["#{b1.global_id}-#{u2.global_id}", {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq("#{b1a.global_id}-#{u2.global_id}")
        expect(pending_replacements[1][1]).to_not match("#{u2.global_id}")
        expect(pending_replacements[2][0]).to eq("#{b1c.global_id}-#{u2.global_id}")
        expect(pending_replacements[2][1]).to_not match("#{u2.global_id}")
        expect(pending_replacements[3][0]).to eq("#{b2b.global_id}")
        expect(pending_replacements[3][1]).to_not match("#{u2.global_id}")
        expect(pending_replacements[4][0]).to eq("#{b1b.global_id}-#{u2.global_id}")
        expect(pending_replacements[4][1]).to_not match("#{u2.global_id}")
        bbb = Board.find_by_path(pending_replacements[3][1][:key])
        expect(bbb.settings['name']).to eq('newb')
        expect(action).to eq('update_inline')
      end
      Board.copy_board_links_for(u2, {:starting_old_board => bb1, :starting_new_board => b2})
    end
  end
 
  describe "replace_board_for" do
    it "should copy only boards that are changed and that need copying as opposed to updating" do
      u = User.create
      old = Board.create(:user => u, :public => true, :settings => {'name' => 'old'})
      ref = Board.create(:user => u, :public => true, :settings => {'name' => 'ref'})
      leave_alone = Board.create(:user => u, :public => true, :settings => {'name' => 'leave alone'})
      change_inline = Board.create(:user => u, :settings => {'name' => 'change inline'})
      old.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => ref.global_id}},
        {'id' => 2, 'load_board' => {'id' => leave_alone.global_id}},
        {'id' => 3, 'load_board' => {'id' => change_inline.global_id}}
      ]
      old.settings['grid'] = {
        'rows' => 1,
        'columns' => 3,
        'order' => [[1, 2, 3]]
      }
      old.save
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      ref.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      ref.save
      change_inline.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      change_inline.save
      u.settings['preferences']['home_board'] = {'id' => ref.global_id}
      u.save
      Worker.process_queues
      expect(ref.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(ref.reload.settings['downstream_board_ids']).to eq([old.global_id, leave_alone.global_id, change_inline.global_id])
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(ref.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('ref')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(old.global_id)
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('new')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(3)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(ref.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(leave_alone.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(change_inline.global_id)
      
      b = change_inline.reload
      expect(b.settings['name']).to eq('change inline')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to eq([new.global_id])
      
      expect(ref.reload.child_boards.count).to eq(1)
      expect(change_inline.reload.child_boards.count).to eq(0)
      expect(leave_alone.reload.child_boards.count).to eq(0)
      expect(old.reload.child_boards.count).to eq(1)
    end

    it "should traverse all the way upstream" do
      u = User.create
      level0 = Board.create(:user => u, :public => true, :settings => {'name' => 'level0'})
      level1 = Board.create(:user => u, :public => true, :settings => {'name' => 'level1'})
      level2 = Board.create(:user => u, :public => true, :settings => {'name' => 'level2'})
      level3 = Board.create(:user => u, :public => true, :settings => {'name' => 'level3'})
      
      level0.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level1.global_id}}
      ]
      level0.save
      level1.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level2.global_id}}
      ]
      level1.save
      level2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level3.global_id}}
      ]
      level2.save
      
      new_level3 = level3.copy_for(u)
      new_level3.settings['name'] = 'new_level3'
      new_level3.save
      u.settings['preferences']['home_board'] = {'id' => level0.global_id}
      u.save
      Worker.process_queues
      
      Board.replace_board_for(u.reload, {:starting_old_board => level3.reload, :starting_new_board => new_level3.reload})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(level0.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('level0')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level1.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('level1')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level2.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('level2')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level3.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(new_level3.global_id)
      
      expect(level0.reload.child_boards.count).to eq(1)
      expect(level1.reload.child_boards.count).to eq(1)
      expect(level2.reload.child_boards.count).to eq(1)
      expect(level3.reload.child_boards.count).to eq(1)
    end
    
    it "should replace the user's home board preference if changed" do
      u = User.create
      old = Board.create(:user => u, :public => true, :settings => {'name' => 'old'})
      ref = Board.create(:user => u, :public => true, :settings => {'name' => 'ref'})
      leave_alone = Board.create(:user => u, :public => true, :settings => {'name' => 'leave alone'})
      change_inline = Board.create(:user => u, :settings => {'name' => 'change inline'})
      old.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => ref.global_id}},
        {'id' => 2, 'load_board' => {'id' => leave_alone.global_id}},
        {'id' => 3, 'load_board' => {'id' => change_inline.global_id}}
      ]
      old.save
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      ref.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      ref.save
      change_inline.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      change_inline.save
      u.settings['preferences']['home_board'] = {'id' => ref.global_id}
      u.save
      Worker.process_queues
      expect(ref.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(ref.reload.settings['downstream_board_ids']).to eq([old.global_id, leave_alone.global_id, change_inline.global_id])
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(ref.global_id)
    end
    
    it "should not make copies for boards that the user isn't allowed to access" do
      secret = User.create
      u = User.create
      level0 = Board.create(:user => secret, :settings => {'name' => 'level0'})
      level1 = Board.create(:user => u, :public => true, :settings => {'name' => 'level1'})
      
      level0.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level1.global_id}}
      ]
      level0.save
      
      new_level1 = level1.copy_for(u)
      new_level1.settings['name'] = 'new_level3'
      new_level1.save
      u.settings['preferences']['home_board'] = {'id' => level0.global_id}
      u.save
      Worker.process_queues
      
      Board.replace_board_for(u.reload, {:starting_old_board => level1.reload, :starting_new_board => new_level1.reload})
      expect(u.settings['preferences']['home_board']['id']).to eq(level0.global_id)
    end
    
    it "should make copies of boards the user can edit if specified" do
      u = User.create
      u2 = User.create
      old = Board.create(:user => u, :public => true, :settings => {'name' => 'old'})
      make_copy = Board.create(:user => u, :public => true, :settings => {'name' => 'make copy'})
      make_copy2 = Board.create(:user => u2, :public => true, :settings => {'name' => 'make copy too'})
      make_copy.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      make_copy.save
      make_copy2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => make_copy.global_id}}
      ]
      make_copy2.save
      Worker.process_queues
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      u.settings['preferences']['home_board'] = {'id' => make_copy2.global_id}
      u.save
      Worker.process_queues
      expect(make_copy.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(make_copy.reload.settings['downstream_board_ids']).to eq([old.global_id])
      expect(make_copy2.reload.settings['immediately_downstream_board_ids']).to eq([make_copy.global_id])
      expect(make_copy2.reload.settings['downstream_board_ids'].sort).to eq([make_copy.global_id, old.global_id].sort)
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload, :update_inline => false})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(make_copy2.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('make copy too')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(make_copy.global_id)
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('make copy')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to eql([new.global_id])
      
      b = make_copy2.reload
      expect(b.settings['name']).to eq('make copy too')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to eq([make_copy.global_id])

      b = make_copy.reload
      expect(b.settings['name']).to eq('make copy')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to eq([old.global_id])
    end
    
    it "should not make copies of boards the user can edit if specified" do
      u = User.create
      u2 = User.create
      old = Board.create(:user => u, :public => true, :settings => {'name' => 'old'})
      make_copy = Board.create(:user => u, :public => true, :settings => {'name' => 'make copy'})
      make_copy2 = Board.create(:user => u2, :public => true, :settings => {'name' => 'make copy too'})
      make_copy.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      make_copy.save
      make_copy2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => make_copy.global_id}}
      ]
      make_copy2.save
      Worker.process_queues
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      u.settings['preferences']['home_board'] = {'id' => make_copy2.global_id}
      u.save
      Worker.process_queues
      expect(make_copy.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(make_copy.reload.settings['downstream_board_ids']).to eq([old.global_id])
      expect(make_copy2.reload.settings['immediately_downstream_board_ids']).to eq([make_copy.global_id])
      expect(make_copy2.reload.settings['downstream_board_ids'].sort).to eq([make_copy.global_id, old.global_id].sort)
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload, :update_inline => true})
      expect(u.settings['preferences']['home_board']['id']).to eq(make_copy2.global_id)

      b = make_copy2.reload
      expect(b.settings['name']).to eq('make copy too')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to eq([make_copy.global_id])

      b = make_copy.reload
      expect(b.settings['name']).to eq('make copy')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to eq([new.global_id])
    end
    
    it "should only copy boards explicitly listed if there's a list" do
      u = User.create
      level0 = Board.create(:user => u, :public => true, :settings => {'name' => 'level0'})
      level1 = Board.create(:user => u, :public => true, :settings => {'name' => 'level1'})
      level2 = Board.create(:user => u, :public => true, :settings => {'name' => 'level2'})
      level2b = Board.create(:user => u, :public => true, :settings => {'name' => 'level2b'})
      level3 = Board.create(:user => u, :public => true, :settings => {'name' => 'level3'})
      
      level0.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level1.global_id}}
      ]
      level0.save
      level1.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level2.global_id}},
        {'id' => 2, 'load_board' => {'id' => level2b.global_id}}
      ]
      level1.save
      level2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level3.global_id}}
      ]
      level2.save
      
      new_level3 = level3.copy_for(u)
      new_level3.settings['name'] = 'new_level3'
      new_level3.save
      u.settings['preferences']['home_board'] = {'id' => level0.global_id}
      u.save
      Worker.process_queues
      
      Board.replace_board_for(u.reload, {:valid_ids => [level0.global_id, level1.global_id, level2.global_id, level3.global_id], :starting_old_board => level3.reload, :starting_new_board => new_level3.reload})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(level0.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('level0')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level1.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('level1')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(2)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level2.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(level2b.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'].detect{|id| id != level2b.global_id})
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('level2')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level3.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(new_level3.global_id)
      
      expect(level0.reload.child_boards.count).to eq(1)
      expect(level1.reload.child_boards.count).to eq(1)
      expect(level2.reload.child_boards.count).to eq(1)
      expect(level3.reload.child_boards.count).to eq(1)
    end
    
    it "should not copy explicitly-listed boards if there's not a valid copyable route to the board" do
      u = User.create
      level0 = Board.create(:user => u, :public => true, :settings => {'name' => 'level0'})
      level1 = Board.create(:user => u, :public => true, :settings => {'name' => 'level1'})
      level2 = Board.create(:user => u, :public => true, :settings => {'name' => 'level2'})
      level3 = Board.create(:user => u, :public => true, :settings => {'name' => 'level3'})
      
      level0.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level1.global_id}}
      ]
      level0.save
      level1.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level2.global_id}}
      ]
      level1.save
      level2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => level3.global_id}}
      ]
      level2.save
      
      new_level3 = level3.copy_for(u)
      new_level3.settings['name'] = 'new_level3'
      new_level3.save
      u.settings['preferences']['home_board'] = {'id' => level0.global_id}
      u.save
      Worker.process_queues
      
      Board.replace_board_for(u.reload, {:valid_ids => [level3.global_id, level2.global_id], :starting_old_board => level3.reload, :starting_new_board => new_level3.reload})
      expect(u.settings['preferences']['home_board']['id']).to eq(level0.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).to eq(level0)
      expect(b.settings['name']).to eq('level0')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(level1.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).to eq(level1)
      expect(b.settings['name']).to eq('level1')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(level2.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).to eq(level2)
      expect(b.settings['name']).to eq('level2')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(level3.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to_not be_include(new_level3.global_id)
      
      expect(level0.reload.child_boards.count).to eq(0)
      expect(level1.reload.child_boards.count).to eq(0)
      expect(level2.reload.child_boards.count).to eq(1)
      expect(level3.reload.child_boards.count).to eq(1)
    end

    it "should make public if specified" do
      u = User.create
      u2 = User.create
      old = Board.create(:user => u, :public => true, :settings => {'name' => 'old'})
      make_copy = Board.create(:user => u, :public => true, :settings => {'name' => 'make copy'})
      make_copy2 = Board.create(:user => u2, :public => true, :settings => {'name' => 'make copy too'})
      make_copy.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      make_copy.save
      make_copy2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => make_copy.global_id}}
      ]
      make_copy2.save
      Worker.process_queues
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      u.settings['preferences']['home_board'] = {'id' => make_copy2.global_id}
      u.save
      Worker.process_queues
      expect(make_copy.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(make_copy.reload.settings['downstream_board_ids']).to eq([old.global_id])
      expect(make_copy2.reload.settings['immediately_downstream_board_ids']).to eq([make_copy.global_id])
      expect(make_copy2.reload.settings['downstream_board_ids'].sort).to eq([make_copy.global_id, old.global_id].sort)
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload, :update_inline => false, :make_public => true})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(make_copy2.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).not_to eq(nil)
      expect(b.public).to eq(true)
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.public).to eq(true)
      
      b = make_copy2.reload
      expect(b.public).to eq(true)

      b = make_copy.reload
      expect(b.public).to eq(true)
    end
    
    it "should replace a sidebar board that has changed" do
      u = User.create
      old = Board.create(:user => u, :public => true, :settings => {'name' => 'old'})
      ref = Board.create(:user => u, :public => true, :settings => {'name' => 'ref'})
      leave_alone = Board.create(:user => u, :public => true, :settings => {'name' => 'leave alone'})
      change_inline = Board.create(:user => u, :settings => {'name' => 'change inline'})
      old.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => ref.global_id}},
        {'id' => 2, 'load_board' => {'id' => leave_alone.global_id}},
        {'id' => 3, 'load_board' => {'id' => change_inline.global_id}}
      ]
      old.save
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      ref.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      ref.save
      change_inline.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      change_inline.save
      expect(u.sidebar_boards.length).to be > 1
      u.settings['preferences']['sidebar_boards'] = [{'name' => 'Board', 'key' => old.key, 'image' => 'http://www.example.com/pic.png'}]
      u.save
      Worker.process_queues
      Worker.process_queues
      ref.reload.track_downstream_boards!
      expect(ref.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(ref.reload.settings['downstream_board_ids'].sort).to eq([old.global_id, leave_alone.global_id, change_inline.global_id].sort)
      expect(u.reload.sidebar_boards.length).to eq(1)
      expect(u.sidebar_boards[0]['key']).to eq(old.key)
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload})
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(new.key)
    end

    it "should replace a default sidebar board and set the user's sidebar at the same time" do
      u = User.create
      u2 = User.create(user_name: 'example')
      old = Board.create(:user => u2, :key => 'example/yesno', :public => true, :settings => {'name' => 'old'})
      ref = Board.create(:user => u, :public => true, :settings => {'name' => 'ref'})
      leave_alone = Board.create(:user => u, :public => true, :settings => {'name' => 'leave alone'})
      change_inline = Board.create(:user => u, :settings => {'name' => 'change inline'})
      old.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => ref.global_id}},
        {'id' => 2, 'load_board' => {'id' => leave_alone.global_id}},
        {'id' => 3, 'load_board' => {'id' => change_inline.global_id}}
      ]
      old.save
      new = old.copy_for(u)
      new.settings['name'] = 'new'
      new.save
      ref.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      ref.save
      change_inline.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      change_inline.save
      expect(u.sidebar_boards.length).to be > 1
      Worker.process_queues
      expect(ref.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(ref.reload.settings['downstream_board_ids']).to eq([old.global_id, leave_alone.global_id, change_inline.global_id])
      expect(u.reload.sidebar_boards.length).to be > 1
      count = u.sidebar_boards.length
      expect(u.sidebar_boards[0]['key']).to eq('example/yesno')
      
      Board.replace_board_for(u.reload, {:starting_old_board => old.reload, :starting_new_board => new.reload})
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(new.key)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(count)
    end

    it "should replace a sidebar board when a sub-board of the sidebar board has changed" do
      u = User.create
      u2 = User.create(user_name: 'example')
      old = Board.create(:user => u2, :key => 'example/yesno', :public => true, :settings => {'name' => 'old'})
      ref = Board.create(:user => u2, :public => true, :settings => {'name' => 'ref'})
      leave_alone = Board.create(:user => u2, :public => true, :settings => {'name' => 'leave alone'})
      change_inline = Board.create(:user => u2, :public => true, :settings => {'name' => 'change inline'})
      old.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => ref.global_id}},
        {'id' => 2, 'load_board' => {'id' => leave_alone.global_id}},
        {'id' => 3, 'load_board' => {'id' => change_inline.global_id}}
      ]
      old.save
      new = change_inline.copy_for(u)
      new.settings['name'] = 'new inline'
      new.save
      ref.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      ref.save
      change_inline.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      change_inline.save
      expect(u.sidebar_boards.length).to be > 1
      Worker.process_queues
      expect(ref.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(ref.reload.settings['downstream_board_ids']).to eq([old.global_id, leave_alone.global_id, change_inline.global_id])
      expect(u.reload.sidebar_boards.length).to be > 1
      count = u.sidebar_boards.length
      expect(u.sidebar_boards[0]['key']).to eq('example/yesno')
      
      Board.replace_board_for(u.reload, {:starting_old_board => change_inline.reload, :starting_new_board => new.reload})
      u.reload
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to_not eq(old.key)
      root = Board.find_by_path(u.settings['preferences']['sidebar_boards'][0]['key'])
      expect(root.settings['downstream_board_ids']).to be_include(new.global_id)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(count)
    end

    it "should replace a home board and a sidebar board with the same update if both were related" do
      u = User.create
      u2 = User.create(user_name: 'example')
      old = Board.create(:user => u2, :key => 'example/yesno', :public => true, :settings => {'name' => 'old'})
      ref = Board.create(:user => u2, :public => true, :settings => {'name' => 'ref'})
      leave_alone = Board.create(:user => u2, :public => true, :settings => {'name' => 'leave alone'})
      change_inline = Board.create(:user => u2, :public => true, :settings => {'name' => 'change inline'})
      old.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => ref.global_id}},
        {'id' => 2, 'load_board' => {'id' => leave_alone.global_id}},
        {'id' => 3, 'load_board' => {'id' => change_inline.global_id}}
      ]
      old.save
      new = change_inline.copy_for(u)
      new.settings['name'] = 'new inline'
      new.save
      ref.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      ref.save
      change_inline.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => old.global_id}}
      ]
      change_inline.save
      expect(u.sidebar_boards.length).to be > 1
      u.settings['preferences']['home_board'] = {'id' => change_inline.global_id, 'key' => change_inline.key}
      u.save
      Worker.process_queues
      expect(ref.reload.settings['immediately_downstream_board_ids']).to eq([old.global_id])
      expect(ref.reload.settings['downstream_board_ids']).to eq([old.global_id, leave_alone.global_id, change_inline.global_id])
      expect(u.reload.sidebar_boards.length).to be > 1
      count = u.sidebar_boards.length
      expect(u.sidebar_boards[0]['key']).to eq('example/yesno')
      
      Board.replace_board_for(u.reload, {:starting_old_board => change_inline.reload, :starting_new_board => new.reload})
      u.reload
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to_not eq(old.key)
      root = Board.find_by_path(u.settings['preferences']['sidebar_boards'][0]['key'])
      expect(root.settings['downstream_board_ids']).to be_include(new.global_id)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(count)
      expect(u.settings['preferences']['home_board']['id']).to eq(new.global_id)
    end

    it "should update locale and button strings only for boards that match the old locale and are updated" do
      u = User.create
      level0 = Board.create(:user => u, :public => true, :settings => {'name' => 'car'})
      level1 = Board.create(:user => u, :public => true, :settings => {'name' => 'house'})
      level2 = Board.create(:user => u, :public => true, :settings => {'name' => 'chair'})
      level3 = Board.create(:user => u, :public => true, :settings => {'name' => 'window'})
      
      level0.settings['buttons'] = [
        {'id' => 1, 'label' => 'yes', 'load_board' => {'id' => level1.global_id}}
      ]
      level0.settings['translations'] = {
        'board_name' => {'fr' => 'voiture'},
        '1' => {'fr' => {'label' => 'oui', 'vocalization' => 'oui bien'}}
      }
      level0.save
      level1.settings['buttons'] = [
        {'id' => 1, 'label' => 'hola', 'load_board' => {'id' => level2.global_id}}
      ]
      level1.settings['translations'] = {
        'board_name' => {'fr' => 'maison'},
        '1' => {'fr' => {'label' => 'bonjour'}}
      }
      level1.settings['locale'] = 'es'
      level1.save
      level2.settings['buttons'] = [
        {'id' => 1, 'label' => 'why', 'vocalization' => 'but whyyy', 'load_board' => {'id' => level3.global_id}}
      ]
      level2.settings['translations'] = {
        'board_name' => {'fr' => 'chaise'},
        '1' => {'fr' => {'label' => 'pourquoi'}}
      }
      level2.save
      
      new_level3 = level3.copy_for(u)
      new_level3.settings['name'] = 'new_level3'
      new_level3.save
      u.settings['preferences']['home_board'] = {'id' => level0.global_id}
      u.save
      Worker.process_queues
      
      Board.replace_board_for(u.reload, {:starting_old_board => level3.reload, :starting_new_board => new_level3.reload, :old_default_locale => 'en', :new_default_locale => 'fr'})
      expect(u.settings['preferences']['home_board']['id']).not_to eq(level0.global_id)
      b = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('voiture')
      expect(b.buttons[0].except('load_board')).to eq(
        {'id' => 1, 'label' => 'oui', 'vocalization' => 'oui bien'}
      )
      expect(b.settings['locale']).to eq('fr')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level1.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b).not_to eq(level1)
      expect(b.settings['name']).to eq('house')
      expect(b.buttons[0].except('load_board')).to eq(
        {'id' => 1, 'label' => 'hola'}
      )
      expect(b.settings['locale']).to eq('es')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level2.global_id)
      
      b = Board.find_by_path(b.settings['immediately_downstream_board_ids'][0])
      expect(b).not_to eq(nil)
      expect(b.settings['name']).to eq('chaise')
      expect(b.buttons[0].except('load_board')).to eq(
        {'id' => 1, 'label' => 'pourquoi'}
      )
      expect(b.settings['locale']).to eq('fr')
      expect(b.settings['immediately_downstream_board_ids'].length).to eq(1)
      expect(b.settings['immediately_downstream_board_ids']).not_to be_include(level3.global_id)
      expect(b.settings['immediately_downstream_board_ids']).to be_include(new_level3.global_id)
      
      expect(level0.reload.child_boards.count).to eq(1)
      expect(level1.reload.child_boards.count).to eq(1)
      expect(level2.reload.child_boards.count).to eq(1)
      expect(level3.reload.child_boards.count).to eq(1)
    end
  end
  
  it "should copy upstream boards for the specified user" do
    author = User.create
    parent = User.create

    level0 = Board.create(:user => author, :public => true, :settings => {'name' => 'level0'})
    level1 = Board.create(:user => author, :public => true, :settings => {'name' => 'level1'})
    
    level0.settings['buttons'] = [
      {'id' => 1, 'load_board' => {'id' => level1.global_id}}
    ]
    level0.save
    
    new_level1 = level1.copy_for(parent)
    new_level1.settings['name'] = 'new_level3'
    new_level1.save
    parent.settings['preferences']['home_board'] = {'id' => level0.global_id}
    parent.save
    Worker.process_queues
    
    parent.reload.replace_board({old_board_id: level1.global_id, new_board_id: new_level1.global_id})
    Worker.process_queues
    
    expect(parent.settings['preferences']['home_board']['id']).not_to eq(level0.global_id)
  end
  
  describe "assert_copy_id" do
    it 'should return true if already a copy' do
      u = User.create
      a = Board.create(user: u)
      expect(a.assert_copy_id).to eq(false)
      a.settings['copy_id'] = 4
      expect(a.assert_copy_id).to eq(true)
    end

    it 'should return false if no parent set' do
      u = User.create
      a = Board.create(user: u)
      expect(a.assert_copy_id).to eq(false)
    end

    it 'should return false if no upstream board set' do
      u = User.create
      a = Board.create(user: u)
      a.parent_board_id = 1
      expect(a.assert_copy_id).to eq(false)
    end

    describe 'when all upstream parent boards match, and all upstream parents are for the same user' do
      it 'should set itself as the parent if a top-page board' do
        u = User.create
        p = Board.create(user: u)
        a = Board.create(user: u, key: "#{u.user_name}/top-page")
        bs = []
        15.times do |i|
          bs << Board.create(user: u, parent_board_id: p.id)
        end
        a.settings['immediately_upstream_board_ids'] = bs.map(&:global_id)
        a.parent_board_id = p.id
        a.save!
        expect(a.settings['copy_id']).to eq(nil)
        expect(a.assert_copy_id).to eq(true)
        expect(a.settings['copy_id']).to eq(a.global_id)
        expect(a.settings['asserted_copy_id']).to eq(true)
      end

      it 'should set to the first copy_id found in the upstreams if any' do
        u = User.create
        p = Board.create(user: u)
        a = Board.create(user: u)
        bs = []
        3.times do |i|
          bs << Board.create(user: u, parent_board_id: p.id, settings: {'copy_id' => '123', 'asserted_copy_id' => true})
        end
        a.settings['immediately_upstream_board_ids'] = bs.map(&:global_id)
        a.parent_board_id = p.id
        a.save!
        expect(a.settings['copy_id']).to eq(nil)
        expect(a.assert_copy_id).to eq(true)
        expect(a.settings['copy_id']).to eq('123')
        expect(a.settings['asserted_copy_id']).to eq(true)
      end

      it 'should wrap them all together if created within 30 seconds of each other' do
        u = User.create
        p = Board.create(user: u)
        a = Board.create(user: u)
        bs = []
        3.times do |i|
          bs << Board.create(user: u, parent_board_id: p.id)
        end
        a.settings['immediately_upstream_board_ids'] = bs.map(&:global_id)
        a.parent_board_id = p.id
        a.save!
        expect(a.settings['copy_id']).to eq(nil)
        expect(a.assert_copy_id).to eq(true)
        expect(a.settings['copy_id']).to eq(bs[0].global_id)
        expect(a.settings['asserted_copy_id']).to eq(true)
      end

      it 'should set to the single upstream if only one' do
        u = User.create
        p = Board.create(user: u)
        a = Board.create(user: u)
        bs = []
        bs << Board.create(user: u, parent_board_id: p.id)
        Board.where(id: a.id).update_all(created_at: 3.hours.ago)

        a.settings['immediately_upstream_board_ids'] = bs.map(&:global_id)
        a.parent_board_id = p.id
        a.save!
        expect(a.settings['copy_id']).to eq(nil)
        expect(a.assert_copy_id).to eq(true)
        expect(a.settings['copy_id']).to eq(bs[0].global_id)
        expect(a.settings['asserted_copy_id']).to eq(true)
      end
    end
  end

  describe "slice_locales" do
    it "should return without list of ids" do
      u = User.create
      b = Board.create(user: u)
      expect(b.slice_locales([], [], nil)).to eq({sliced: false, reason: 'id not included'})
    end

    it "should return without any valid locales" do
      u = User.create
      b = Board.create(user: u)
      expect(b.slice_locales([], [b.global_id], nil)).to eq({sliced: false, reason: 'no locales would be kept'})
      expect(b.slice_locales(['fr'], [b.global_id], nil)).to eq({sliced: false, reason: 'no locales would be kept'})
      expect(b.slice_locales(['zh', 'fr'], [b.global_id], nil)).to eq({sliced: false, reason: 'no locales would be kept'})
    end

    it "should return if already matches slice list and no sub-boards to check" do
      u = User.create
      b = Board.create(user: u)
      expect(b.slice_locales(['en'], [b.global_id], nil)).to eq({sliced: true, ids: [b.global_id], reason: 'already includes only specified locales'})

      b.process({'buttons' => [
        {'id' => '1', 'label' => 'watch'},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b.settings['translations'] = {'1' => {'fr' => 'heur', 'es' => 'dias'}, '2' => {'fr' => 'liquide'}}
      b.save
      expect(b.slice_locales(['en', 'fr', 'es'], [b.global_id], u)).to eq({sliced: true, ids: [b.global_id], reason: 'already includes only specified locales'})
    end

    it "should include only the specified locales" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => '1', 'label' => 'watch'},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b.save
      expect(b.slice_locales(['en', 'fr'], [b.global_id], u)).to eq({sliced: true, ids: [b.global_id]})
      expect(b.settings['translations']).to eq({'1' => {'fr' => {'label' => 'heur'}}, '2' => {'fr' => {'label' => 'liquide'}}})
    end
    
    it "should set a new default locale if the prior one was removed" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => '1', 'label' => 'watch'},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b.save
      expect(b.slice_locales(['fr'], [b.global_id], u)).to eq({sliced: true, ids: [b.global_id]})
      expect(b.settings['locale']).to eq('fr')
      expect(b.settings['translations']['default']).to eq('fr')
      expect(b.buttons[0]['label']).to eq('heur')
      expect(b.buttons[1]['label']).to eq('liquide')
    end

    it "should also update sub-boards if specified" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1', 'label' => 'watch', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b1.save
      expect(b1.buttons[0]['load_board']['id']).to eq(b2.global_id)
      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'now'},
        {'id' => '2', 'label' => 'never'}
      ]}, {'user' => u})
      b2.settings['translations'] = {'1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'jamais'}}}
      b2.save
      Worker.process_queues

      expect(b1.reload.slice_locales(['fr', 'de'], [b1.global_id, b2.global_id], u)).to eq({sliced: true, ids: [b1.global_id, b2.global_id]})
      expect(b1.settings['locale']).to eq('fr')
      expect(b1.settings['translations']['default']).to eq('fr')
      expect(b1.buttons[0]['label']).to eq('heur')
      expect(b1.buttons[1]['label']).to eq('liquide')
      expect(b1.settings['translations']).to eq({
        '1' => {'fr' => {'label' => 'heur'}},
        '2' => {'fr' => {'label' => 'liquide'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      expect(b2.reload.settings['locale']).to eq('fr')
      expect(b2.settings['translations']['default']).to eq('fr')
      expect(b2.buttons[0]['label']).to eq('maintenant')
      expect(b2.buttons[1]['label']).to eq('jamais')
      expect(b2.settings['translations']).to eq({
        '1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}},
        '2' => {'fr' => {'label' => 'jamais'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })
    end

    it "should not update sub-boards that aren't specified" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1', 'label' => 'watch', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '2', 'label' => 'scotch', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {'user' => u})
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b1.save
      expect(b1.buttons[0]['load_board']['id']).to eq(b2.global_id)

      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'now'},
        {'id' => '2', 'label' => 'never'}
      ]}, {'user' => u})
      b2.settings['translations'] = {'1' => {'de' => {'label' => 'maintenant'}, 'zh' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'de' => {'label' => 'jamais'}}}
      b2.save

      b3.process({'buttons' => [
        {'id' => '1', 'label' => 'eat'},
        {'id' => '2', 'label' => 'go'}
      ]}, {'user' => u})
      b3.settings['translations'] = {'1' => {'fr' => {'label' => 'mange'}, 'zh' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'allez'}}}
      b3.save
      Worker.process_queues

      expect(b1.reload.slice_locales(['fr', 'de'], [b1.global_id, b2.global_id], u)).to eq({sliced: true, ids: [b1.global_id, b2.global_id]})
      expect(b1.settings['locale']).to eq('fr')
      expect(b1.settings['translations']['default']).to eq('fr')
      expect(b1.buttons[0]['label']).to eq('heur')
      expect(b1.buttons[1]['label']).to eq('liquide')
      expect(b1.settings['translations']).to eq({
        '1' => {'fr' => {'label' => 'heur'}},
        '2' => {'fr' => {'label' => 'liquide'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      expect(b2.reload.settings['locale']).to eq('de')
      expect(b2.settings['translations']['default']).to eq('de')
      expect(b2.buttons[0]['label']).to eq('maintenant')
      expect(b2.buttons[1]['label']).to eq('jamais')
      expect(b2.settings['translations']).to eq({
        '1' => {'de' => {'label' => 'maintenant'}},
        '2' => {'de' => {'label' => 'jamais'}},
        'board_name' => {},
        'current_label' => 'de',
        'current_vocalization' => 'de',
        'default' => 'de'
      })

      expect(b3.reload.settings['locale']).to eq('en')
      expect(b3.buttons[0]['label']).to eq('eat')
      expect(b3.buttons[1]['label']).to eq('go')
    end

    it "should keep checking if already matches slice list but has sub-boards to check" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1', 'label' => 'watch', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b1.save
      expect(b1.buttons[0]['load_board']['id']).to eq(b2.global_id)

      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'now'},
        {'id' => '2', 'label' => 'never'}
      ]}, {'user' => u})
      b2.settings['translations'] = {'1' => {'de' => {'label' => 'maintenant'}, 'zh' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'de' => {'label' => 'jamais'}}}
      b2.save
      Worker.process_queues

      expect(b1.reload.slice_locales(['fr', 'en', 'es'], [b1.global_id, b2.global_id], u)).to eq({sliced: true, ids: [b1.global_id, b2.global_id]})
      expect(b1.settings['locale']).to eq('en')
      expect(b1.settings['translations']['default']).to eq(nil)
      expect(b1.buttons[0]['label']).to eq('watch')
      expect(b1.buttons[1]['label']).to eq('scotch')
      expect(b1.settings['translations']).to eq({
        '1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}},
        '2' => {'fr' => {'label' => 'liquide'}},
      })

      expect(b2.reload.settings['locale']).to eq('en')
      expect(b2.settings['translations']['default']).to eq(nil)
      expect(b2.buttons[0]['label']).to eq('now')
      expect(b2.buttons[1]['label']).to eq('never')
      expect(b2.settings['translations']).to eq({
        '1' => {'es' => {'label' => 'dias'}},
        '2' => {},
      })
    end

    it "should not update sub-boards without proper authorization" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1', 'label' => 'watch', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b1.save
      expect(b1.buttons[0]['load_board']['id']).to eq(b2.global_id)
      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'now'},
        {'id' => '2', 'label' => 'never'}
      ]}, {'user' => u})
      b2.settings['translations'] = {'1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'jamais'}}}
      b2.save
      Worker.process_queues
      u2 = User.create
      b2.user = u2
      b2.save

      expect(b1.reload.slice_locales(['fr', 'de'], [b1.global_id, b2.global_id], u)).to eq({sliced: true, ids: [b1.global_id]})
      expect(b1.settings['locale']).to eq('fr')
      expect(b1.settings['translations']['default']).to eq('fr')
      expect(b1.buttons[0]['label']).to eq('heur')
      expect(b1.buttons[1]['label']).to eq('liquide')
      expect(b1.settings['translations']).to eq({
        '1' => {'fr' => {'label' => 'heur'}},
        '2' => {'fr' => {'label' => 'liquide'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      expect(b2.reload.settings['locale']).to eq('en')
      expect(b2.buttons[0]['label']).to eq('now')
      expect(b2.buttons[1]['label']).to eq('never')
      expect(b2.settings['translations']).to eq({'1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'jamais'}}})     
    end
    
    it "should create copies for shallow clones" do
      u = User.create
      u2 = User.create
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b3 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1', 'label' => 'watch', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b1.save
      expect(b1.buttons[0]['load_board']['id']).to eq(b2.global_id)
      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'now', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => '2', 'label' => 'never'}
      ]}, {'user' => u})
      b2.settings['translations'] = {'1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'jamais'}}}
      b2.save
      expect(b2.buttons[0]['load_board']['id']).to eq(b3.global_id)
      b3.process({'buttons' => [
        {'id' => '1', 'label' => 'water'},
        {'id' => '2', 'label' => 'fowl'}
      ]}, {'user' => u})
      b3.settings['translations'] = {'1' => {'fr' => {'label' => 'eau'}, 'de' => {'label' => 'splash'}, 'es' => {'label' => 'splish'}}, '2' => {'fr' => {'label' => 'fowler'}}}
      b3.save

      Worker.process_queues

      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      res = bb1.reload.slice_locales(['fr', 'de'], ["#{b1.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}", "#{b3.global_id}-#{u2.global_id}"], u2)
      expect(res).to eq({sliced: true, ids: ["#{b1.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}"]})
      expect(b1.reload.settings['locale']).to eq('en')
      expect(BoardContent.load_content(b1, 'translations')['default']).to eq(nil)
      expect(b1.buttons[0]['label']).to eq('watch')
      expect(b1.buttons[1]['label']).to eq('scotch')

      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      expect(bb1.id).to_not eq(b1.id)
      expect(bb1.reload.settings['locale']).to eq('fr')
      expect(BoardContent.load_content(bb1, 'translations')['default']).to eq('fr')
      expect(bb1.buttons[0]['label']).to eq('heur')
      expect(bb1.buttons[1]['label']).to eq('liquide')
      expect(BoardContent.load_content(bb1, 'translations')).to eq({
        '1' => {'fr' => {'label' => 'heur'}},
        '2' => {'fr' => {'label' => 'liquide'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to_not eq(b2.id)
      expect(b2.reload.settings['locale']).to eq('en')
      expect(BoardContent.load_content(b2, 'translations')['default']).to eq(nil)
      expect(b2.buttons[0]['label']).to eq('now')
      expect(b2.buttons[1]['label']).to eq('never')

      expect(bb2.reload.settings['locale']).to eq('fr')
      expect(BoardContent.load_content(bb2, 'translations')['default']).to eq('fr')
      expect(bb2.buttons[0]['label']).to eq('maintenant')
      expect(bb2.buttons[1]['label']).to eq('jamais')
      expect(BoardContent.load_content(bb2, 'translations')).to eq({
        '1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}},
        '2' => {'fr' => {'label' => 'jamais'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      bb3 = Board.find_by_global_id("#{b3.global_id}-#{u2.global_id}")
      expect(bb3.id).to eq(b3.id)
      expect(b3.reload.settings['locale']).to eq('en')
      expect(BoardContent.load_content(b3, 'translations')['default']).to eq(nil)
      expect(b3.buttons[0]['label']).to eq('water')
      expect(b3.buttons[1]['label']).to eq('fowl')
    end

    it "should not update shallow clones that aren't authorized" do
      u = User.create
      u2 = User.create
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b3 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1', 'label' => 'watch', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '2', 'label' => 'scotch'}
      ]}, {'user' => u})
      b1.settings['translations'] = {'1' => {'fr' => {'label' => 'heur'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'liquide'}}}
      b1.save
      expect(b1.buttons[0]['load_board']['id']).to eq(b2.global_id)
      b2.process({'buttons' => [
        {'id' => '1', 'label' => 'now', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => '2', 'label' => 'never'}
      ]}, {'user' => u})
      b2.settings['translations'] = {'1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}, 'es' => {'label' => 'dias'}}, '2' => {'fr' => {'label' => 'jamais'}}}
      b2.save
      expect(b2.buttons[0]['load_board']['id']).to eq(b3.global_id)
      b3.process({'buttons' => [
        {'id' => '1', 'label' => 'water'},
        {'id' => '2', 'label' => 'fowl'}
      ]}, {'user' => u})
      b3.settings['translations'] = {'1' => {'fr' => {'label' => 'eau'}, 'de' => {'label' => 'splash'}, 'es' => {'label' => 'splish'}}, '2' => {'fr' => {'label' => 'fowler'}}}
      b3.save

      Worker.process_queues

      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u2.global_id}")
      prebb2 = bb2.copy_for(u2)
      prebb2.settings['name'] = "ahem"
      prebb2.save

      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      res = bb1.reload.slice_locales(['fr', 'de'], ["#{b1.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}", "#{b3.global_id}-#{u2.global_id}"], u2)
      expect(res).to eq({sliced: true, ids: ["#{b1.global_id}-#{u2.global_id}", prebb2.global_id]})
      expect(b1.reload.settings['locale']).to eq('en')
      expect(BoardContent.load_content(b1, 'translations')['default']).to eq(nil)
      expect(b1.buttons[0]['label']).to eq('watch')
      expect(b1.buttons[1]['label']).to eq('scotch')

      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      expect(bb1.id).to_not eq(b1.id)
      expect(bb1.reload.settings['locale']).to eq('fr')
      expect(BoardContent.load_content(bb1, 'translations')['default']).to eq('fr')
      expect(bb1.buttons[0]['label']).to eq('heur')
      expect(bb1.buttons[1]['label']).to eq('liquide')
      expect(BoardContent.load_content(bb1, 'translations')).to eq({
        '1' => {'fr' => {'label' => 'heur'}},
        '2' => {'fr' => {'label' => 'liquide'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to_not eq(b2.id)
      expect(bb2.id).to eq(prebb2.id)
      expect(b2.reload.settings['locale']).to eq('en')
      expect(BoardContent.load_content(b2, 'translations')['default']).to eq(nil)
      expect(b2.buttons[0]['label']).to eq('now')
      expect(b2.buttons[1]['label']).to eq('never')

      expect(bb2.reload.settings['locale']).to eq('fr')
      expect(BoardContent.load_content(bb2, 'translations')['default']).to eq('fr')
      expect(bb2.buttons[0]['label']).to eq('maintenant')
      expect(bb2.buttons[1]['label']).to eq('jamais')
      expect(BoardContent.load_content(bb2, 'translations')).to eq({
        '1' => {'fr' => {'label' => 'maintenant'}, 'de' => {'label' => 'da'}},
        '2' => {'fr' => {'label' => 'jamais'}},
        'board_name' => {},
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        'default' => 'fr'
      })

      bb3 = Board.find_by_global_id("#{b3.global_id}-#{u2.global_id}")
      expect(bb3.id).to eq(b3.id)
      expect(b3.reload.settings['locale']).to eq('en')
      expect(BoardContent.load_content(b3, 'translations')['default']).to eq(nil)
      expect(b3.buttons[0]['label']).to eq('water')
      expect(b3.buttons[1]['label']).to eq('fowl')
    end
  end
end
