require 'spec_helper'

describe SecureSerialize, :type => :model do
  before(:each) do
    FakeRecord.paper_trail_options = nil
    FakeRecord.more_before_saves = nil
  end
  
  class FakeRecord
    include SecureSerialize
    attr_accessor :id
    attr_accessor :name
    attr_accessor :settings
    attr_accessor :success_save_called
    attr_accessor :error_save_called
    cattr_accessor :paper_trail_options
    cattr_accessor :serialize_column
    cattr_accessor :serializer
    cattr_accessor :after
    cattr_accessor :before
    cattr_accessor :before_s
    def self.serialize(column, serializer)
      self.serialize_column = column
      self.serializer = serializer
    end
    def self.after_initialize(method)
      self.after = method
    end
    
    def self.before_validation(method)
      self.before = method
    end
    
    def self.before_save(method)
      self.before_s = method
    end
    
    def reload
    end
    
    def []=(*args)
    end
    
    def read_attribute(column)
      @settings
    end
    
    def write_attribute(column, val)
      @settings = val
    end
    
    def settings_will_change!
      @settings_changed = true
    end
    
    def settings_changed?
      !!@settings_changed
    end
    
    def success_save
      @success_save_called = true
      true
    end
    
    def error_save
      @error_save_called = true
      false
    end
    
    secure_serialize :settings
  end

  describe "secure serialization" do
    it "should have a secure_column class attribute" do
      expect(FakeRecord.respond_to?(:secure_column)).to eq(true)
      expect(FakeRecord.secure_column).to eq(:settings)
    end
    
    it "should not call :serialize" do
      expect(FakeRecord.serialize_column).to eq(nil)
      expect(FakeRecord.serializer).to eq(nil)
    end
    
    it "should register callbacks correctly" do
      expect(FakeRecord.after).to eq(nil) #:load_secure_object)
      expect(FakeRecord.before).to eq(nil)
      expect(FakeRecord.before_s).to eq(:persist_secure_object)
    end
  end
  
  
  describe "paper_trail_for_secure_column?" do
    it "should not consider paper_trail if not configured" do
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(false)
    end
    
    it "should consider paper_trail if configured" do
      FakeRecord.paper_trail_options = {}
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(true)

      FakeRecord.paper_trail_options = {:only => ['hat', 'settings']}
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(true)

      FakeRecord.paper_trail_options = {:only => ['hat']}
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(false)
    end
  end
  
  describe "loading and persisting the object" do
    it "should load the stored object if loading from an existing record" do
      r = FakeRecord.new
      r.id = 1
      r.instance_variable_set('@settings', GoSecure::SecureJson.dump({a: 1}))
#      r.send(r.after)
      expect(r.settings).to eq({"a" => 1})
    end
    
    it "should use the provided valued if instantiating" do
      r = FakeRecord.new
      r.settings = {'b' => 1}
#      r.send(r.after)
      expect(r.settings).to eq({'b' => 1})
    end
    
    it "should mark as changed if instantiating with an initial value" do
      r = FakeRecord.new
      r.settings = {'b' => 1}
      expect(r.settings_changed?).to eq(false)
#      r.send(r.after)
      expect(r.settings_changed?).to eq(false)
      r.mark_changed_secure_object_hash
      expect(r.settings_changed?).to eq(true)
    end
    
    it "should reload the object when .reload is called" do
      r = FakeRecord.new
      r.id = 1
      r.instance_variable_set('@settings', GoSecure::SecureJson.dump({a: 1}))
#      r.send(r.after)
      expect(r.settings).to eq({"a" => 1})
      r.settings['b'] = 2
      r.reload
      expect(r.settings).to eq({'a' => 1})
    end
    
    it "should call mark_changed_secure_object_hash before persisting" do
      r = FakeRecord.new
      expect(r).to receive(:mark_changed_secure_object_hash)
      r.persist_secure_object
    end
    
    it "should persist the generated object" do
      r = FakeRecord.new
      r.settings = {"a" => 1, "b" => 2}
      r.settings["c"] = 3
      r.mark_changed_secure_object_hash
      expect(GoSecure::SecureJson).to receive(:dump).with({'a' => 1, 'b' => 2, 'c' => 3})
      r.persist_secure_object
    end
  end
  
  describe "additional before_saves" do
    it "should error on complex before_saves" do
      expect{ FakeRecord.before_save({}) }.to raise_error("only simple before_save calls after secure_serialize: [{}]")
    end
    
    it "should accept simple before_saves" do
      expect{ FakeRecord.before_save(:hat) }.not_to raise_error
    end
    
    it "should call simple before_saves correctly" do
      FakeRecord.before_save(:success_save)
      expect(FakeRecord.more_before_saves).to eq([:success_save])
      r = FakeRecord.new
      expect(r.success_save_called).to eq(nil)
      expect(r.persist_secure_object).to eq(true)
      expect(r.success_save_called).to eq(true)
    end
    
    it "should halt on failing simple before_saves" do
      FakeRecord.before_save(:error_save)
      expect(FakeRecord.more_before_saves).to eq([:error_save])
      r = FakeRecord.new
      expect(r.error_save_called).to eq(nil)
      expect(r.persist_secure_object).to eq(false)
      expect(r.error_save_called).to eq(true)
    end
  end

  describe "paper_trail updating" do
    it "should initiatlize secure_object_json correctly" do
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(false)
      r.load_secure_object
      expect(r.instance_variable_get('@secure_object_json')).to eq('null')
      
      FakeRecord.paper_trail_options = {:only => ['hat', 'settings']}
      r = FakeRecord.new
      r.id = 1
      r.instance_variable_set('@settings', GoSecure::SecureJson.dump({:a => 1}))
      expect(r.paper_trail_for_secure_column?).to eq(true)
      r.load_secure_object
      expect(r.instance_variable_get('@secure_object')).to eq({'a' => 1})
      expect(r.instance_variable_get('@secure_object_json')).to eq({:a => 1}.to_json)

      r = FakeRecord.new
      r.settings = {:a => 1}
      expect(r.paper_trail_for_secure_column?).to eq(true)
      r.load_secure_object
      expect(r.instance_variable_get('@secure_object')).to eq({:a => 1})
      expect(r.instance_variable_get('@secure_object_json')).to eq(nil.to_json)
    end
    
    it "should only mark records as changed that have actually changed" do
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(false)
      r.load_secure_object
      r.mark_changed_secure_object_hash
      expect(r.instance_variable_get('@settings_changed')).to eq(nil)
      
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(false)
      r.load_secure_object
      r.settings = {:a => 1}
      r.mark_changed_secure_object_hash
      expect(r.instance_variable_get('@settings_changed')).to eq(true)

      FakeRecord.paper_trail_options = {:only => ['hat', 'settings']}
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(true)
      r.load_secure_object
      r.settings = {:a => 1}
      r.mark_changed_secure_object_hash
      expect(r.instance_variable_get('@settings_changed')).to eq(true)
      
      r = FakeRecord.new
      expect(r.paper_trail_for_secure_column?).to eq(true)
      r.load_secure_object
      r.settings_will_change!
      expect(r).not_to receive(:settings_will_change!)
      r.settings = {:a => 1}
      r.mark_changed_secure_object_hash
      expect(r.instance_variable_get('@settings_changed')).to eq(true)
    end
  end
  
  describe "paper_trail_for_secure_column?" do
    it 'should return the correct value' do
      expect(User.new.paper_trail_for_secure_column?).to eq(true)
      expect(JobStash.new.paper_trail_for_secure_column?).to eq(false)
      expect(Board.new.paper_trail_for_secure_column?).to eq(true)
    end
  end

  
  describe "load_secure_object" do
    it 'should load the secure object' do
      u = User.new
      u.id = 5
      expect(u.instance_variable_get('@loaded_secure_object')).to_not eq(true)
      
      dump = GoSecure::SecureJson.dump({a: 1})
      expect(u).to receive(:read_attribute).with(:settings).and_return(dump)
      u.load_secure_object
      expect(u.instance_variable_get('@secure_object')).to eq({'a' => 1})
      expect(u.instance_variable_get('@loaded_secure_object')).to eq(true)
    end

    it 'should load an insecure object' do
      u = User.new
      u.id = 5
      expect(u.instance_variable_get('@loaded_secure_object')).to_not eq(true)
      
      expect(u).to receive(:read_attribute).with(:settings).and_return({a: 1}.to_json)
      u.load_secure_object
      expect(u.instance_variable_get('@secure_object')).to eq({'a' => 1})
      expect(u.instance_variable_get('@loaded_secure_object')).to eq(true)
    end
  end
  
  describe "rollback_to" do
    before(:each) { PaperTrail::Version.delete_all }
    it 'should search for a previous version and roll back if found' do
      PaperTrail.request.whodunnit = 'bob'
      u = User.create
      u.settings['bacon'] = true
      u.managing_organization_id = 12345
      u.save!
      expect(PaperTrail::Version.count).to eq(2)
      PaperTrail::Version.all.update_all(created_at: 6.weeks.ago)

      v = PaperTrail::Version.last
      loaded = User.load_version(v)
      expect(loaded.settings['bacon']).to eq(true)
      expect(loaded.settings['cheddar']).to eq(nil)
      expect(loaded.settings['broccoli']).to eq(nil)

      u.settings['cheddar'] = 4
      u.save!

      v = PaperTrail::Version.last
      loaded = User.load_version(v)
      expect(loaded.settings['bacon']).to eq(true)
      expect(loaded.settings['cheddar']).to eq(4)
      expect(loaded.settings['broccoli']).to eq(nil)

      u.settings['broccoli'] = 'cooked'
      u.save!

      v = PaperTrail::Version.last
      loaded = User.load_version(v)
      expect(loaded.settings['bacon']).to eq(true)
      expect(loaded.settings['broccoli']).to eq('cooked')
      expect(loaded.settings['cheddar']).to eq(4)

      u.reload
      expect(PaperTrail::Version.count).to eq(4)
      expect(PaperTrail::Version.all.map{|v| v.object_deserialized['settings']['bacon'] rescue nil }).to eq([nil, true, true, true])
      expect(PaperTrail::Version.all.map{|v| v.object_deserialized['settings']['cheddar'] rescue nil }).to eq([nil, nil, 4, 4])
      expect(PaperTrail::Version.all.map{|v| v.object_deserialized['settings']['broccoli'] rescue nil }).to eq([nil, nil, nil, 'cooked'])
      u.rollback_to(3.weeks.ago)

      u.reload
      expect(u.settings['bacon']).to eq(true)
      expect(u.settings['broccoli']).to eq(nil)
      expect(u.settings['cheddar']).to eq(nil)
    end
  end

  describe "persist_secure_object" do
    it 'should persist the object correctly' do
      u = User.create
      u.instance_variable_set('@secure_object', {a: 1})
      expect(u).to receive('settings_changed?').and_return(true).at_least(1).times
      expect(u).to receive(:write_attribute) do |attr, data|
        expect(attr).to eq(:settings)
      end
      u.persist_secure_object
    end
  end

  describe "user_versions" do
    before(:each) { PaperTrail::Version.delete_all }
    it 'should return only non-job version' do
      PaperTrail.request.whodunnit = 'job:asdf'
      u = User.create
      u.settings['a'] = 1
      u.save!
      expect(PaperTrail::Version.count).to eq(0)
      PaperTrail.request.whodunnit = 'bob'
      u.settings['b'] = 2
      u.save!
      u.settings['c'] = 3
      u.save!
      expect(PaperTrail::Version.count).to eq(2)
      versions = User.user_versions(u.global_id)
      expect(versions.length).to eq(2)
    end
  end

  describe "load_version" do
    before(:each) { PaperTrail::Version.delete_all }
    it 'should load the version' do
      PaperTrail.request.whodunnit = 'bob'
      u = User.create
      u.settings['a'] = 1
      u.save!
      u.settings['a'] = 2
      u.save!
      u.settings['b'] = 'asdf'
      u.save!
      versions = PaperTrail::Version.all
      expect(versions.count).to eq(4)
      obj = User.load_version(versions[0])
      expect(obj).to eq(nil)
      obj = User.load_version(versions[1])
      expect(obj.settings['a']).to eq(1)
      expect(obj.settings['b']).to eq(nil)
      obj = User.load_version(versions[2])
      expect(obj.settings['a']).to eq(2)
      expect(obj.settings['b']).to eq(nil)
      obj = User.load_version(versions[3])
      expect(obj.settings['a']).to eq(2)
      expect(obj.settings['b']).to eq('asdf')
    end
  end
end
