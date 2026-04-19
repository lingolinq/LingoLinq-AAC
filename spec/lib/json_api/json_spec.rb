require 'spec_helper'

describe JsonApi::Json do
  describe "as_json" do
    it "should call build_json" do
      obj = {}
      args = {}
      expect(JsonApi::Board).to receive(:build_json).with(obj, args).and_return({'a' => 1})
      expect(JsonApi::Board.as_json(obj, args)).to eq({'a' => 1})
    end

    it "should wrap in a wrapper if specified" do
      obj = {}
      args = {:wrapper => true}
      expect(JsonApi::User).to receive(:build_json).with(obj, args).and_return({'a' => 1})
      hash = {}
      hash[JsonApi::User::TYPE_KEY] = {'a' => 1}
      expect(JsonApi::User.as_json(obj, args)).to eq(hash)
    end

    it "should call extra_includes if available and wrapper is specified" do
      obj = {}
      args = {:wrapper => true}
      json = {'b' => 2}
      expect(JsonApi::Board).to receive(:build_json).with(obj, args).and_return(json)
      expect(JsonApi::Board).to receive(:extra_includes).with(obj, {'board' => json}, {}).and_return({'board' => json})
      expect(JsonApi::Board.as_json(obj, args)).to eq({'board' => json})
    end
    it "should call meta if available and wrapper is specified" do
      obj = {}
      args = {:wrapper => true}
      json = {'b' => 2}
      expect(JsonApi::Image).to receive(:build_json).with(obj, args).and_return(json)
      expect(JsonApi::Image).to receive(:meta).with(obj).and_return({'ok' => false})
      expect(JsonApi::Image.as_json(obj, args)).to eq({'image' => {'b' => 2}, 'meta' => {'ok' => false}})
    end
  end
  
  describe "paginate" do
    before(:each) do
      u = User.create
      d = Device.create(:user => u)
      30.times do |i|
        LogSession.create(:user => u, :author => u, :device => d)
      end
    end
    it "should return a subset of the total results" do
      res = JsonApi::Log.paginate({'per_page' => 4}, LogSession.all)
      expect(res['log']).not_to eq(nil)
      expect(res['log'].length).to eq(4)
    end
    
    it "should return a next_url if there are more results" do
      res = JsonApi::Log.paginate({'per_page' => 6, 'offset' => 2}, LogSession.all)
      expect(res[:meta]).not_to be_nil
      expect(res[:meta][:next_url]).to eq("#{JsonApi::Json.current_host}/api/v1/logs?offset=8&per_page=6")

      res = JsonApi::Log.paginate({'offset' => 2}, LogSession.all)
      expect(res[:meta]).not_to be_nil
      expect(res[:meta][:next_url]).to eq("#{JsonApi::Json.current_host}/api/v1/logs?offset=#{JsonApi::Log::DEFAULT_PAGE + 2}&per_page=#{JsonApi::Log::DEFAULT_PAGE}")
    end
    
    it "should call as_json for each of the results" do
      expect(JsonApi::Log).to receive(:as_json).and_return({})
      res = JsonApi::Log.paginate({}, LogSession.where(:id => LogSession.last.id))
    end
    
    it "should work without any parameters" do
      res = JsonApi::Log.paginate({}, LogSession.all)
      expect(res['log']).not_to eq(nil)
      expect(res['log'].length).to eq(10)
    end
    
    it "should cap per_page at MAX_PAGE setting" do
      res = JsonApi::Log.paginate({'per_page' => 100}, LogSession.all)
      expect(res[:meta]).not_to be_nil
      expect(res[:meta][:next_url]).to eq("#{JsonApi::Json.current_host}/api/v1/logs?offset=#{JsonApi::Log::MAX_PAGE}&per_page=#{JsonApi::Log::MAX_PAGE}")
    end
    
    it "should call page_data if defined" do
      expect(JsonApi::Unit).to receive(:page_data) do |list, args|
        expect(args[:b]).to eq(1)
        expect(args[:page_results]).to_not eq(nil)
      end.and_return({:a => 1})
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      expect(JsonApi::Unit).to receive(:build_json){|unit, args|
        expect(unit).to eq(ou)
        expect(args[:page_data]).to eq({:a => 1})
      }.and_return({})
      res = JsonApi::Unit.paginate({}, OrganizationUnit.all, {b: 1})
    end
  end
  
  describe "next_url prefix" do
    before(:each) do
      u = User.create
      d = Device.create(:user => u)
      30.times do |i|
        LogSession.create(:user => u, :author => u, :device => d)
      end
    end

    it "should use the specified prefix if defined" do
      res = JsonApi::Log.paginate({}, LogSession.all, :prefix => 'https://www.google.com/api/v1/bacon')
      expect(res[:meta]).not_to be_nil
      expect(res[:meta][:next_url]).to eq("https://www.google.com/api/v1/bacon?offset=#{JsonApi::Log::DEFAULT_PAGE}&per_page=#{JsonApi::Log::DEFAULT_PAGE}")
    end
    
    it "should prepent the host to the specified prefix if defined" do
      res = JsonApi::Log.paginate({}, LogSession.all, :prefix => '/bacon')
      expect(res[:meta]).not_to be_nil
      expect(res[:meta][:next_url]).to eq("#{JsonApi::Json.current_host}/api/v1/bacon?offset=#{JsonApi::Log::DEFAULT_PAGE}&per_page=#{JsonApi::Log::DEFAULT_PAGE}")
    end
  end

  describe "set_host" do
    it "should set a unique host for each pid" do
      JsonApi::Json.class_variable_set(:@@running_hosts, {})
      expect(Worker).to receive(:thread_id).and_return('12345_123')
      JsonApi::Json.set_host('bob')
      expect(Worker).to receive(:thread_id).and_return('123456_456')
      JsonApi::Json.set_host('fred')
      hosts = JsonApi::Json.class_variable_get(:@@running_hosts)
      expect(hosts.keys.sort).to eq(['123456_456', '12345_123'])
      expect(hosts['12345_123']['host']).to eq('bob')
      expect(hosts['12345_123']['timestamp']).to be > 10.seconds.ago.to_i
      expect(hosts['123456_456']['host']).to eq('fred')
      expect(hosts['123456_456']['timestamp']).to be > 10.seconds.ago.to_i
    end

    it "should clear old hosts on set" do
      JsonApi::Json.class_variable_set(:@@running_hosts, {
        '12345_123' => {'host' => 'bob', 'timestamp' => 5.minutes.ago.to_i}, 
        '12345_1234' => {'host' => 'sam', 'timestamp' => 90.minutes.ago.to_i}, 
        '123456_234' => {'host' => 'fred'},
      })
      expect(Worker).to receive(:thread_id).and_return('98765')
      JsonApi::Json.set_host('sam')
      hosts = JsonApi::Json.class_variable_get(:@@running_hosts)
      expect(hosts.keys.sort).to eq(["12345_123", "98765"])
    end
  end
  
  describe "current_host" do
    it "should return found hosts, or the default if none found" do
      JsonApi::Json.class_variable_set(:@@running_hosts, {
        '12345_123' => {'host' => 'bob'}, 
        '123456_234' => {'host' => 'fred'},
      })
      expect(Worker).to receive(:thread_id).and_return('12345_123')
      expect(JsonApi::Json.current_host).to eq('bob')
      expect(Worker).to receive(:thread_id).and_return('123456_234')
      expect(JsonApi::Json.current_host).to eq('fred')
      expect(Worker).to receive(:thread_id).and_return('12345')
      expect(JsonApi::Json.current_host).to eq(ENV['DEFAULT_HOST'])
    end
  end

  describe "load_domain" do
    it 'should load the domain from the org' do
      expect(Organization).to receive(:load_domains).and_return({'bacon.com' => {'app_name' => 'bacon'}})
      host = JsonApi::Json.load_domain('bacon.com')
      expect(host).to_not eq(nil)
      expect(host['host']).to eq('bacon.com')
      expect(host['settings']['app_name']).to eq('bacon')
    end

    it 'should enforce needed values' do
      expect(Organization).to receive(:load_domains).and_return({'bacon.com' => {'app_name' => 'bacon'}})
      host = JsonApi::Json.load_domain('bacon.com')
      expect(host).to_not eq(nil)
      expect(host['host']).to eq('bacon.com')
      expect(host['settings']['company_name']).to eq('Someone')
    end

    it 'fills coppa_parental_consent from ENV when org host_settings omit it' do
      orig = ENV['COPPA_PARENTAL_CONSENT']
      ENV['COPPA_PARENTAL_CONSENT'] = '1'
      begin
        expect(Organization).to receive(:load_domains).and_return({'bacon.com' => {'app_name' => 'bacon'}})
        host = JsonApi::Json.load_domain('bacon.com')
        expect(host['settings']['coppa_parental_consent']).to eq(true)
      ensure
        ENV['COPPA_PARENTAL_CONSENT'] = orig
      end
    end

    it 'should fall back to the default domain settings' do
      expect(Organization).to receive(:load_domains).and_return({'bacon.com' => {'app_name' => 'bacon'}})
      host = JsonApi::Json.load_domain('bacon.net')
      expect(host).to_not eq(nil)
      expect(host['host']).to eq('bacon.net')
      expect(host['settings']['app_name']).to eq('LingoLinq')
    end

    it 'should clear old domains' do
      JsonApi::Json.class_variable_set(:@@running_domains, {
        '12345_123' => {'override' => {'a' => 1}, 'timestamp' => 5.minutes.ago.to_i}, 
        '12345_124' => {'override' => {'b' => 1}, 'timestamp' => 90.minutes.ago.to_i}, 
        '12345_125' => {'override' => {'c' => 1}},
      })
      expect(Organization).to receive(:load_domains).and_return({'bacon.com' => {'app_name' => 'bacon'}})
      expect(Worker).to receive(:thread_id).and_return('98765')
      host = JsonApi::Json.load_domain('bacon.com')
      expect(host).to_not eq(nil)
      expect(host['host']).to eq('bacon.com')
      expect(host['settings']['app_name']).to eq('bacon')
      hosts = JsonApi::Json.class_variable_get(:@@running_domains)
      expect(hosts.keys.sort).to eq(["12345_123", "98765"])
    end
  end

  describe "current_domian" do
    it 'should return the default if nothing found' do
      JsonApi::Json.class_variable_set(:@@running_domains, nil)
      expect(JsonApi::Json.current_domain).to eq(JsonApi::Json.default_domain)
    end

    it 'should find the set value if there is one' do
      JsonApi::Json.class_variable_set(:@@running_domains, {
        '12345_123' => {'override' => {'a' => 1}}
      })
      expect(Worker).to receive(:thread_id).and_return('12345_123')
      expect(JsonApi::Json.current_domain).to eq({'a' => 1})
    end
  end

  describe "default_domain" do
    it 'should return default values' do
      default = JsonApi::Json.default_domain
      expect(default['css']).to eq(nil)
      expect(default['settings']['app_name']).to eq('LingoLinq')
      expect(default['settings']['company_name']).to eq('Someone')
      expect(default['settings']['full_domain']).to eq(true)
    end
  end
  
end
