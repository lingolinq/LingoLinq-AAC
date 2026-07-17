require 'spec_helper'

describe Processable, :type => :model do
  class FakeRecord
    include Processable
  end
  describe "process" do
    it "should call process_params" do
      r = FakeRecord.new
      expect(r).to receive(:process_params).with({}, {})
      expect(r).to receive(:save)
      r.process({})
    end
    
    it "should indifferent_access the arguments" do
      r = FakeRecord.new
      expect(r).to receive(:process_params) do |params, non_user_params|
        expect(params['a']).to eq(1)
        expect(params['b']).to eq(nil)
        expect(non_user_params['b']).to eq(2)
      end
      expect(r).to receive(:save)
      r.process({:a => 1}, {:b => 2})
    end
    
    it "should not call save if process_params returns false" do
      r = FakeRecord.new
      expect(r).to receive(:process_params).with({}, {}).and_return(false)
      expect(r).not_to receive(:save)
      r.process({})
    end
  end
  
  describe "process_string" do
    it "should strip all html" do 
      r = FakeRecord.new
      expect(r.process_string('bacon <i>is')).to eq('bacon is')
      expect(r.process_string('<p>something</p>')).to eq('something')
    end
  end
  
  describe "process_html" do
    it "should strip protected values only" do
      r = FakeRecord.new
      expect(r.process_html('bacon <i>is')).to eq('bacon <i>is</i>')
      expect(r.process_html('bacon <b>is</b>')).to eq('bacon <b>is</b>')
      expect(r.process_html("<a href='http://www.google.com'>Google</a> <a href='javascript:alert(true);'>alert</a> <img src='file://something.png'/>")).to eq("<a href=\"http://www.google.com\">Google</a> <a>alert</a> <img>")
    end
  end
  
  describe "clean_path" do
    it "should not allow starting with a number" do
      r = FakeRecord.new
      expect(r.clean_path("12345")).to eq("_12345")
      expect(r.clean_path("1awgweg")).to eq("_1awgweg")
    end
    
    it "should remove apostophes" do
      r = FakeRecord.new
      expect(r.clean_path("bob's stuff")).to eq("bobs-stuff")
      expect(r.clean_path("'a'b'c'_'e")).to eq("abc_e")
    end
    
    it "should enforce minimum length of 4" do
      r = FakeRecord.new
      expect(r.clean_path("a")).to eq("aaa")
      expect(r.clean_path("ac")).to eq("acac")
      expect(r.clean_path("d")).to eq("ddd")
      expect(r.clean_path("bob")).to eq("bob")
      expect(r.clean_path("fred")).to eq("fred")
    end
    
    it "should substitute chains of extra characters with a hyphen" do
      r = FakeRecord.new
      expect(r.clean_path("a boy")).to eq("a-boy")
      expect(r.clean_path("a a a")).to eq("a-a-a")
      expect(r.clean_path("a     ")).to eq("aaa")
      expect(r.clean_path("a**#&@%#@*")).to eq("aaa")
      expect(r.clean_path("a**#b&@%#@*")).to eq("a-b")
      expect(r.clean_path("bob! I really like descriptions! Don't you?!?")).to eq("bob-I-really-like-descriptions-Dont-you")
      expect(r.clean_path("-----abc__def")).to eq("-abc__def")
    end
    
  end

  describe "generate_unique_key" do
    class FakeRecord
      include Processable
    end
    
    it "should raise an error if called for an unknown class" do
      r = FakeRecord.new
      expect { r.generate_unique_key("bob") }.to raise_error("unknown class: FakeRecord")
    end
  end

  describe "generate_user_name" do
    it "should generate a user name" do
      u = User.new
      expect(u.generate_user_name).to eq('person')
    end
    
    it "should fall back to the user's full name if nothing else provided" do
      u = User.new(:settings => {'name' => 'Bob Jones'})
      expect(u.generate_user_name).to eq('bob-jones')
    end

    it "should ignore blank name suggestions and fall back to email" do
      u = User.new(:settings => {'name' => '', 'email' => 'blank_name@example.com'})
      expect(u.generate_user_name('')).to eq('blank_name')
    end
    
    it "should not generate an existing user name" do
      User.create(:user_name => "franklin")
      u = User.new
      expect(u.generate_user_name("franklin")).to eq("franklin_1")
    end
    
    it "should smartly change numbers until it find a unique user name" do
      User.create(:user_name => "franklin")
      User.create(:user_name => "franklin_1")
      User.create(:user_name => "franklin_2")
      User.create(:user_name => "franklin_3")
      u = User.new
      expect(u.generate_user_name("franklin")).to eq("franklin_4")
      expect(u.generate_user_name("franklin_1")).to eq("franklin_4")
    end
    
    it "should not allow usernames for reserved routes" do
      u = User.new
      expect(u.generate_user_name("admin")).to eq("admin_1")
      expect(u.generate_user_name("oauth")).to eq("oauth_1")
      expect(u.generate_user_name("about")).to eq("about_1")
      expect(u.generate_user_name("pages")).to eq("pages_1")
      
    end

    it "allows the official lingolinq system username" do
      u = User.new
      expect(u.generate_user_name("lingolinq")).to eq("lingolinq")
    end
  end  

  describe "generate_board_key" do
    it "should raise an error if no user is provided" do
      b = Board.new
      expect { b.generate_board_key }.to raise_error("user required")
    end
    
    it "should generate a board key based on the user and board information" do
      u = User.new(:user_name => "melinda")
      b = Board.new(:user => u)
      expect(b.generate_board_key).to eq("melinda/board")
    end
    
    it "should fall back to the board's name if no key provided" do
      u = User.new(:user_name => "melinda")
      b = Board.new(:user => u, :settings => {'name' => 'my awesome board!'})
      expect(b.generate_board_key).to eq("melinda/my-awesome-board")
    end
    
    it "should not generate an existing board key" do
      u = User.new(:user_name => "melinda")
      Board.create(:user => u, :settings => {'name' => 'bacon'})
      b = Board.new(:user => u)
      expect(b.generate_board_key('bacon')).to eq("melinda/bacon_1")
    end
    
    it "should smartly change numbers until it finds a unique board key" do
      u = User.new(:user_name => "melinda")
      Board.create(:user => u, :settings => {'name' => 'bacon'})
      Board.create(:user => u, :settings => {'name' => 'bacon'})
      Board.create(:user => u, :settings => {'name' => 'bacon'})
      Board.create(:user => u, :settings => {'name' => 'bacon'})
      b = Board.new(:user => u)
      expect(b.generate_board_key('bacon')).to eq("melinda/bacon_4")
      expect(b.generate_board_key('bacon_2')).to eq("melinda/bacon_4")
    end
  end  

  describe "process_new" do
    it "should instantiate and call process" do
      expect_any_instance_of(FakeRecord).to receive(:process).with({'a' => 1}, {'b' => 2})
      FakeRecord.process_new({'a' => 1}, {'b' => 2})
    end
  end

  describe "generate_possible_clone" do
    it "should not create a copy for a non-shallow clone" do
      u1 = User.create
      b = Board.create(user: u1)
      expect(b).to_not receive(:copy_for)
      expect(b.generate_possible_clone).to eq(b)
    end

    it "should call copy_for if a shallow clone" do
      u1 = User.create
      b = Board.create(user: u1)
      bb = Board.find_by_path("#{b.global_id}-#{u1.global_id}")
      expect(bb).to receive(:copy_for){|u, opts|
        expect(u).to eq(u1)
        expect(opts[:copy_id]).to eq(b.global_id)
        expect(opts[:skip_save]).to eq(true)
      }.and_return('blah') #.with(u1, copy_id: b.global_id, skip_save: true).and_return('blah')
      expect(bb.generate_possible_clone).to eq('blah')
    end

    it "should use the board's copy_id when copying a shallow clone" do
      u1 = User.create
      b = Board.create(user: u1, settings: {'copy_id' => 'bacon'})
      bb = Board.find_by_path("#{b.global_id}-#{u1.global_id}")
      expect(bb).to receive(:copy_for){|u, opts|
        expect(u).to eq(u1)
        expect(opts[:copy_id]).to eq('bacon')
        expect(opts[:skip_save]).to eq(true)
      }.and_return('blah') #.with(u1, copy_id: 'bacon', skip_save: true).and_return('blah')
      expect(bb.generate_possible_clone).to eq('blah')
    end

    it "should not allow cloning a board with protected content that the non-clone owner isn't allowed to copy" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1)
      b1.settings['protected'] = {"vocabulary"=>true, "vocabulary_owner_id"=>"aaa", "sub_owner"=>true}
      b1.save
      b1.share_with(u2, true)
      Worker.process_queues
      b1.reload
      expect(b1.allows?(u2, 'view')).to eq(false)
      expect(b1.copyable_if_authorized?(u1)).to eq(false)
      expect(b1.copyable_if_authorized?(u2)).to eq(false)
      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      expect(bb1.allows?(u2, 'view')).to eq(true)
      expect{ bb1.generate_possible_clone }.to raise_error("not authorized to copy #{bb1.global_id} by #{u2.global_id}")
    end

    it "should allow cloning a board with protected content that the non-clone owner is allowed to copy" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1)
      b1.settings['protected'] = {"vocabulary"=>true, "vocabulary_owner_id"=>u1.global_id, "sub_owner"=>false}
      b1.save
      b1.share_with(u2, true)
      Worker.process_queues
      b1.reload
      expect(b1.allows?(u2, 'view')).to eq(false)
      expect(b1.copyable_if_authorized?(u1)).to eq(true)
      expect(b1.copyable_if_authorized?(u2)).to eq(false)
      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      expect(bb1.allows?(u2, 'view')).to eq(true)
      nbb1 = bb1.generate_possible_clone
      expect(nbb1).to_not eq(nil)
      expect(nbb1.id).to_not eq(bb1.id)
    end
  end
end
