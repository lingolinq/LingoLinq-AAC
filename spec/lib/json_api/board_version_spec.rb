require 'spec_helper'

describe JsonApi::BoardVersion do
  it "should have defined pagination defaults" do
    expect(JsonApi::BoardVersion::TYPE_KEY).to eq('boardversion')
    expect(JsonApi::BoardVersion::DEFAULT_PAGE).to eq(25)
    expect(JsonApi::BoardVersion::MAX_PAGE).to eq(50)
  end

  describe "build_json" do
    it "should return appropriate attributes" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.process_new({'name' => 'fred'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']['notes']).to eq(['renamed the board'])
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b.process({'buttons' => [{'id' => 1, 'label' => 'something'}]})
      expect(b.settings['edit_description']['notes']).to eq(['modified buttons'])
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(5)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(5)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(5)
      expect(versions_json['boardversion'][0]['action']).to eq('deleted')
      expect(versions_json['boardversion'][0]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][1]['action']).to eq('updated')
      expect(versions_json['boardversion'][1]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][2]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][2]['modifier']['description']).to eq('LingoLinq Admin')
      expect(versions_json['boardversion'][3]['action']).to eq('renamed the board')
      expect(versions_json['boardversion'][3]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][4]['action']).to eq('created')
      expect(versions_json['boardversion'][4]['modifier']['user_name']).to eq(u.user_name)
    end
    
    it "should return appropriate version descriptions" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.process_new({'name' => 'fred'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']['notes']).to eq(['renamed the board'])
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b.process({'buttons' => [{'id' => 1, 'label' => 'something'}]})
      expect(b.settings['edit_description']['notes']).to eq(['modified buttons'])
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(5)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(5)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(5)
      expect(versions_json['boardversion'][0]['action']).to eq('deleted')
      expect(versions_json['boardversion'][1]['action']).to eq('updated')
      expect(versions_json['boardversion'][2]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][3]['action']).to eq('renamed the board')
      expect(versions_json['boardversion'][4]['action']).to eq('created')
    end
    
    it "should return modifier if available" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.process_new({'name' => 'fred'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']['notes']).to eq(['renamed the board'])
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b.process({'buttons' => [{'id' => 1, 'label' => 'something'}]})
      expect(b.settings['edit_description']['notes']).to eq(['modified buttons'])
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(5)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(5)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(5)
      expect(versions_json['boardversion'][0]['action']).to eq('deleted')
      expect(versions_json['boardversion'][0]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][1]['action']).to eq('updated')
      expect(versions_json['boardversion'][1]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][2]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][2]['modifier']['description']).to eq('LingoLinq Admin')
      expect(versions_json['boardversion'][3]['action']).to eq('renamed the board')
      expect(versions_json['boardversion'][3]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][4]['action']).to eq('created')
      expect(versions_json['boardversion'][4]['modifier']['user_name']).to eq(u.user_name)
    end
    
    it "should return a fallback modifier if none specified" do
      u = User.create
      PaperTrail.request.whodunnit = "user:asdf"
      b = Board.process_new({'name' => 'fred'}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      b.process({'name' => 'jed'}, {'user' => u})
      expect(b.settings['edit_description']['notes']).to eq(['renamed the board'])
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b.process({'name' => 'ned', 'buttons' => [{'id' => 1, 'label' => 'something'}]})
      expect(b.settings['edit_description']['notes']).to eq(['renamed the board', 'modified buttons'])
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({}, {'user' => u})
      expect(b.settings['edit_description']).to eq(nil)
      expect(b.settings['name']).to eq('ned')
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(5)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(5)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(5)
      expect(versions_json['boardversion'][0]['action']).to eq('deleted')
      expect(versions_json['boardversion'][0]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][0]['name']).to eq('ned')
      expect(versions_json['boardversion'][1]['action']).to eq('updated')
      expect(versions_json['boardversion'][1]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][1]['name']).to eq('ned')
      expect(versions_json['boardversion'][2]['action']).to eq('renamed the board, modified buttons')
      expect(versions_json['boardversion'][2]['modifier']['description']).to eq('LingoLinq Admin')
      expect(versions_json['boardversion'][2]['name']).to eq('ned')
      expect(versions_json['boardversion'][3]['action']).to eq('renamed the board')
      expect(versions_json['boardversion'][3]['modifier']['description']).to eq('Unknown User')
      expect(versions_json['boardversion'][3]['name']).to eq('jed')
      expect(versions_json['boardversion'][4]['action']).to eq('created')
      expect(versions_json['boardversion'][4]['modifier']['description']).to eq('Unknown User')
      expect(versions_json['boardversion'][4]['name']).to eq(nil)
    end
    
    it "should include immediately upstream board ids if admin specified" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'load_board' => {'id' => b.global_id, 'key' => b.key}}
      ]}, {'user' => u})
      PaperTrail.request.whodunnit = nil
      Worker.process_queues
      expect(b.reload.settings['immediately_upstream_board_ids']).to eq([b2.global_id])
      
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({'name' => 'jed'}, {'user' => u})
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(3)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(3)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions, {:admin => true})
      expect(versions_json['boardversion'].length).to eq(3)
      expect(versions_json['boardversion'][0]['immediately_upstream_boards']).to eq([{:id => b2.global_id, :key => b2.key}])
      expect(versions_json['boardversion'][1]['immediately_upstream_boards']).to eq([{:id => b2.global_id, :key => b2.key}])
      expect(versions_json['boardversion'][2]['immediately_upstream_boards']).to eq([])

      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(3)
      expect(versions_json['boardversion'][0]['immediately_upstream_boards']).to eq(nil)
      expect(versions_json['boardversion'][1]['immediately_upstream_boards']).to eq(nil)
      expect(versions_json['boardversion'][2]['immediately_upstream_boards']).to eq(nil)
    end
    
    it "should include grid" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.process_new({'name' => 'fred', 'buttons' => [{'id' => 1, 'label' => 'bacon'}], 'grid' => {'rows' => 1, 'columns' => 1, 'order' => [[1]]}}, {'user' => u})
      b.process({'name' => 'jed', 'buttons' => [{'id' => 2, 'label' => 'choice'}], 'grid' => {'rows' => 2, 'columns' => 2, 'order' => [[nil, 2], [nil, nil]]}}, {'user' => u})
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b.process({'buttons' => [{'id' => 1, 'label' => 'something'}], 'grid' => {'rows' => 1, 'columns' => 2, 'order' => [[nil, 1]]}})
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({'name' => 'jed', 'buttons' => [{'id' => 2, 'label' => 'face'}], 'grid' => {'rows' => 1, 'columns' => 3, 'order' => [[nil, 3, nil]]}}, {'user' => u})
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(5)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(5)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(5)
      expect(versions_json['boardversion'][0]['action']).to eq('deleted')
      expect(versions_json['boardversion'][0]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][0]['grid']).to eq({"columns"=>3, "order"=>[[nil, 3, nil]], "rows"=>1})
      expect(versions_json['boardversion'][1]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][1]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][1]['grid']).to eq({'rows' => 1, 'columns' => 3, 'order' => [[nil, 3, nil]]})
      expect(versions_json['boardversion'][2]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][2]['modifier']['description']).to eq('LingoLinq Admin')
      expect(versions_json['boardversion'][2]['grid']).to eq({'rows' => 1, 'columns' => 2, 'order' => [[nil, 1]]})
      expect(versions_json['boardversion'][3]['action']).to eq('renamed the board, modified buttons')
      expect(versions_json['boardversion'][3]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][3]['grid']).to eq({'rows' => 2, 'columns' => 2, 'order' => [[nil, 2], [nil, nil]]})
      expect(versions_json['boardversion'][4]['action']).to eq('created')
      expect(versions_json['boardversion'][4]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][4]['grid']).to eq(nil)
    end
    
    it "should include button labels" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.process_new({'name' => 'fred', 'buttons' => [{'id' => 1, 'label' => 'bacon'}], 'grid' => {'rows' => 1, 'columns' => 1, 'order' => [[1]]}}, {'user' => u})
      b.process({'name' => 'jed', 'buttons' => [{'id' => 2, 'label' => 'choice'}], 'grid' => {'rows' => 2, 'columns' => 2, 'order' => [[nil, 2], [nil, nil]]}}, {'user' => u})
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b.process({'buttons' => [{'id' => 1, 'label' => 'something'}], 'grid' => {'rows' => 1, 'columns' => 2, 'order' => [[nil, 1]]}})
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b.process({'name' => 'jed', 'buttons' => [{'id' => 2, 'label' => 'face'}], 'grid' => {'rows' => 1, 'columns' => 3, 'order' => [[nil, 3, nil]]}}, {'user' => u})
      b.destroy
      
      vs = PaperTrail::Version.where(:item_type => 'Board', :item_id => b.id)
      expect(vs.length).to eq(5)
      
      versions = Board.user_versions(b.global_id)
      expect(versions.length).to eq(5)
      
      versions_json = JsonApi::BoardVersion.paginate({}, versions)
      expect(versions_json['boardversion'].length).to eq(5)
      expect(versions_json['boardversion'][0]['action']).to eq('deleted')
      expect(versions_json['boardversion'][0]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][0]['button_labels']).to eq(['face'])
      expect(versions_json['boardversion'][1]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][1]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][1]['button_labels']).to eq(['face'])
      expect(versions_json['boardversion'][2]['action']).to eq('modified buttons')
      expect(versions_json['boardversion'][2]['modifier']['description']).to eq('LingoLinq Admin')
      expect(versions_json['boardversion'][2]['button_labels']).to eq(['something'])
      expect(versions_json['boardversion'][3]['action']).to eq('renamed the board, modified buttons')
      expect(versions_json['boardversion'][3]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][3]['button_labels']).to eq(['choice'])
      expect(versions_json['boardversion'][4]['action']).to eq('created')
      expect(versions_json['boardversion'][4]['modifier']['user_name']).to eq(u.user_name)
      expect(versions_json['boardversion'][4]['button_labels']).to eq(nil)
    end
  end
end
