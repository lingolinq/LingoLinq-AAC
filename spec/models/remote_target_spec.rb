require 'spec_helper'

describe RemoteTarget, :type => :model do
  describe "generate_defaults" do
    it "should not save without target data" do
      t = RemoteTarget.create
      expect(t.id).to eq(nil)
    end

    it "should set target_id based on current target" do
      t = RemoteTarget.new(target_type: 'sms', user: User.create)
      t.target = "(555) 867-5309"
      t.generate_defaults
      expect(t.target_id).to eq(5309)
    end

    it "should set the salt only once" do
      t = RemoteTarget.new(target_type: 'sms', user: User.create)
      t.target = "(555) 867-5309"
      t.generate_defaults
      salt = t.salt
      t.generate_defaults
      expect(t.salt).to eq(salt)
    end

    it "should set target_index based on any existing targets" do
      t = RemoteTarget.new(target_type: 'sms', user: User.create)
      t.target = "(555) 867-5309"
      t.save
      expect(t.id).to_not eq(nil)
      expect(t.target_index).to eq(0)
      t = RemoteTarget.new(target_type: 'sms', user: User.create)
      t.target = "(555) 867-5309"
      t.generate_defaults
      expect(t.target_index).to eq(1)
      t.target_index = 43
      t.save
      t = RemoteTarget.new(target_type: 'sms', user: User.create)
      t.target = "(555) 867-5309"
      t.generate_defaults
      expect(t.target_index).to eq(44)
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should assert the source_hash if possible" do
        t = RemoteTarget.new(target_type: 'sms', user: User.create)
        t.target = "(555) 867-5309"
        t.generate_defaults
        sources = RemoteTarget.sources_for('sms', '5558675309')
        expect(t.source_hash).to eq(sources[t.target_id  % 2][:hash])

        t = RemoteTarget.new(target_type: 'sms', user: User.create)
        t.target = "+4444444"
        t.generate_defaults
        sources = RemoteTarget.sources_for('sms', '4444444')
        expect(t.source_hash).to eq(nil)
      end
    end
  end
  
  describe "target=" do
    it "persist the canonicalized target_hash" do
      t = RemoteTarget.new(target_type: 'sms', user: User.create)
      t.target = "5558675309"
      expect(t.target_hash).to eq(RemoteTarget.salted_hash("+15558675309", t.salt, t.user.global_id))
      expect(t.target).to eq("5558675309")
    end

    it "should error on no user" do
      t = RemoteTarget.new(target_type: 'sms')
      expect{ t.target = "5558675309" }.to raise_error("missing user")
    end
  end
  
  describe "current_source" do
    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should return a source that matches the stored hash" do
        sources = RemoteTarget.sources_for('sms', '8019231982')
        hash1 = sources[0][:hash]
        hash2 = sources[1][:hash]
        t = RemoteTarget.new(target_type: 'sms', user: User.create)
        t.target_id = 0
        t.target_index = 1
        t.target = '(800) 987-4635'
        t.source_hash = hash1
        expect(t.current_source).to eq({ id: '+15558675309', hash: hash1 })
        t.source_hash = nil
        expect(t.current_source).to eq({ id: '+15551234567', hash: hash2 })
        expect(t.source_hash).to eq(hash2)
      end

      it "should set source_hash if none found" do
        sources = RemoteTarget.sources_for('sms', '8019231982')
        hash2 = sources[1][:hash]
        t = RemoteTarget.new(target_type: 'sms', user: User.create)
        t.target_id = 0
        t.target_index = 1
        t.target = '(800) 987-4635'
        expect(t.current_source).to eq({ id: '+15551234567', hash: hash2 })
        expect(t.source_hash).to eq(hash2)
      end
      
      it "should re-set the source_hash if not mathcing any current source hashes" do
        sources = RemoteTarget.sources_for('sms', '8019231982')
        hash1 = sources[0][:hash]
        hash2 = sources[1][:hash]
        t = RemoteTarget.new(target_type: 'sms', user: User.create)
        t.target_id = 0
        t.target_index = 1
        t.target = '(800) 987-4635'
        t.source_hash = hash1
        expect(t.current_source).to eq({ id: '+15558675309', hash: hash1 })
        t.source_hash = 'abcdefg'
        expect(t.current_source).to eq({ id: '+15551234567', hash: hash2 })
        expect(t.source_hash).to eq(hash2)
      end

      it "should return nil if no target and no source_hash" do
        sources = RemoteTarget.sources_for('sms', '8019231982')
        hash1 = sources[0][:hash]
        t = RemoteTarget.new(target_type: 'sms', user: User.create)
        t.target_id = 0
        t.target_index = 1
        t.source_hash = hash1
        expect(t.current_source).to eq({ id: '+15558675309', hash: hash1 })
        t.source_hash = nil
        expect(t.current_source).to eq(nil)
        expect(t.source_hash).to eq(nil)
      end
    end
  end
  
  describe "salted_hash" do
    env_wrap({
      'SMS_ENCRYPTION_KEY' => "a34y4gat42t"
    }) do
      it "should hash consistently" do
        expect(RemoteTarget.salted_hash('asdf')).to eq(RemoteTarget.salted_hash('asdf'))
        expect(RemoteTarget.salted_hash('asdf', '2ttt2')).to eq(RemoteTarget.salted_hash('asdf', '2ttt2'))
        expect(RemoteTarget.salted_hash('asdf', '2ttt2', '2894ta4t')).to eq(RemoteTarget.salted_hash('asdf', '2ttt2', '2894ta4t'))
        u = User.create
        t = RemoteTarget.new(user: u)
        t.salt = "Aw4ttt2"
        expect(t.salted_hash('awgg')).to eq(RemoteTarget.salted_hash('awgg', "Aw4ttt2", u.global_id))
        expect(t.salted_hash('a43tt3y4y')).to eq(RemoteTarget.salted_hash('a43tt3y4y', "Aw4ttt2", u.global_id))
      end

      it "should use fallbacks correctly" do
        expect(RemoteTarget.salted_hash('asdf')).to eq(RemoteTarget.salted_hash('asdf', 'a34y4gat42t', 'global'))
        expect(RemoteTarget.salted_hash('asdf', '2ttt2')).to eq(RemoteTarget.salted_hash('asdf', '2ttt2', 'global'))
      end
    end
  end
  
  describe "canonical_target" do
    it "should return correct sms target" do
      expect(RemoteTarget.canonical_target('sms', '34ta38t934tyRW')).to eq('+3438934')
      expect(RemoteTarget.canonical_target('sms', '   (800) 355-1827')).to eq('+18003551827')
      expect(RemoteTarget.canonical_target('sms', '7262723    ')).to eq('+7262723')
      expect(RemoteTarget.canonical_target('sms', ' + 36 2 2 72737 ')).to eq('+362272737')
    end

    it "should return input if not sms" do
      expect(RemoteTarget.canonical_target('bacon', '34ta38t934tyRW')).to eq('34ta38t934tyRW')
      expect(RemoteTarget.canonical_target('email', '5558675309')).to eq('5558675309')
    end
  end
  
  describe "sources_for" do
    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should return sources matching the sms prefix" do
        expected = RemoteTarget.sources_for('sms', '8019231982')
        expect(expected.length).to eq(2)
        expect(expected.map { |s| s[:id] }).to eq(['+15558675309', '+15551234567'])
        expect(RemoteTarget.sources_for('sms', '8019231982')).to eq(expected)
        expect(RemoteTarget.sources_for('sms', '+11341')).to eq(expected)
        expect(RemoteTarget.sources_for('sms', '2345')).to eq([])
        expect(RemoteTarget.sources_for('sms', '+2345')).to eq([])
        expect(RemoteTarget.sources_for('sms', '7345')).to eq(RemoteTarget.sources_for('sms', '+7345'))
        expect(RemoteTarget.sources_for('sms', '7345').map { |s| s[:id] }).to eq(['+79876543'])
        expect(RemoteTarget.sources_for('sms', '+3711325').map { |s| s[:id] }).to eq(['+3719875278'])
        expect(RemoteTarget.sources_for('sms', '+3721325')).to eq([])
        expect(RemoteTarget.sources_for('sms', '+9400021325').map { |s| s[:id] }).to eq(['+9416751'])
        expect(RemoteTarget.sources_for('sms', '+9500021325')).to eq([])
      end
  
      it "should not return non-matching sources" do
        expect(RemoteTarget.sources_for('sms', '2345')).to eq([])
        expect(RemoteTarget.sources_for('sms', '+2345')).to eq([])
      end
  
      it "should canonicalize before matching" do
        expected = RemoteTarget.sources_for('sms', '8019231982')
        expect(RemoteTarget.sources_for('sms', '8019231982')).to eq(expected)
        expect(RemoteTarget.sources_for('sms', '7345').map { |s| s[:id] }).to eq(['+79876543'])
      end
  
      it "should return all sources if target=nil" do
        expect(RemoteTarget.sources_for('sms', nil).map{|s| s[:id]}).to eq([
          "+15558675309", "+79876543", "+15551234567", "+3719875278", "+9416751"
        ])
      end
    end
  end

  
  describe "find_or_assert" do
    it "should find an existing record" do
      u = User.create
      t = RemoteTarget.new(target_type: 'sms', user: u)
      t.target = "5558675309"
      t.save!
      t2 = RemoteTarget.new(target_type: 'sms', user: u)
      t2.target = "5558675308"
      t2.save!
      u2 = User.create
      t3 = RemoteTarget.new(target_type: 'sms', user: u2)
      t3.target = "5558675309"
      t3.save!
      t4 = RemoteTarget.new(target_type: 'sms', user: u2)
      t4.target = "5558675308"
      t4.save!
      expect(RemoteTarget.find_or_assert('sms', '(555)  867-5309', u)).to eq(t)
      expect(RemoteTarget.find_or_assert('sms', '+15558675308', u)).to eq(t2)
      expect(RemoteTarget.find_or_assert('sms', '(555)  867-5309', u2)).to eq(t3)
      expect(RemoteTarget.find_or_assert('sms', '+15558675308', u2)).to eq(t4)
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
    it "should create a new record if none found" do
      u = User.create
      t = RemoteTarget.new(target_type: 'sms', user: u)
      t.target = "5558675309"
      t.save!
      t2 = RemoteTarget.new(target_type: 'sms', user: u)
      t2.target = "5558675308"
      t2.save!
      expect(RemoteTarget.find_or_assert('sms', '(555)  867-5309', u)).to eq(t)
      expect(RemoteTarget.find_or_assert('sms', '+15558675308', u)).to eq(t2)
      t3 = RemoteTarget.find_or_assert('sms', '5558675307', u)
      expect(t3).to_not eq(t)
      expect(t3).to_not eq(t2)
      expect(t3.target_hash).to eq(t3.salted_hash('+15558675307'))
      expect(t3.target_type).to eq('sms')
      expect(t3.target_id).to eq(5307)
      expect(t3.source_hash).to_not eq(nil)
    end
    end
  end
  
  describe "id_for" do
    it "should return last 4 digits for sms" do
      expect(RemoteTarget.id_for('sms', '4441039')).to eq(1039)
      expect(RemoteTarget.id_for('sms', '5558670001')).to eq(1)
      expect(RemoteTarget.id_for('bacon', '5558670001')).to eq(nil)
      expect(RemoteTarget.id_for('sms', '+123')).to eq(123)
      expect(RemoteTarget.id_for('sms', '1 2 2 34634 4 abc')).to eq(6344)
    end
  end
  
  describe "all_for" do
    it "should return all matching records for the target" do
      u = User.create
      t = RemoteTarget.new(target_type: 'sms', user: u)
      t.target = "5558675309"
      t.save
      t = RemoteTarget.new(target_type: 'sms', user: u)
      t.target = "+15558675309"
      t.save
      t = RemoteTarget.new(target_type: 'sms', user: u)
      t.target = "1 (555)  867-5309#"
      t.save
      t = RemoteTarget.new(target_type: 'sms', user: u)
      t.target = "5558675308"
      t.save
      list = RemoteTarget.all_for('sms', '555 867 5309')
      expect(list.length).to eq(3)
      expect(list.map(&:target_id)).to eq([5309, 5309, 5309])
    end
  end
  
  describe "latest_for" do
    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do

      it "should find matching records and return the most recent" do
        u = User.create
        t1 = RemoteTarget.new(target_type: 'sms', user: u)
        t1.target = "5558675309"
        t1.target_index = 1
        t1.save!
        t2 = RemoteTarget.new(target_type: 'sms', user: u)
        t2.target_index = 2
        t2.target = "+15558675309"
        t2.last_outbound_at = 3.hours.from_now
        t2.save!
        t3 = RemoteTarget.new(target_type: 'sms', user: u)
        t3.target_index = 1
        t3.target = "1 (555)  867-5309#"
        t3.last_outbound_at = 1.hours.from_now
        t3.save!
        t4 = RemoteTarget.new(target_type: 'sms', user: u)
        t4.target_index = 2
        t4.target = "5558675308"
        t4.last_outbound_at = 2.hours.from_now
        t4.save!
        expect(t1.source_hash).to eq(RemoteTarget.salted_hash('+15558675309'))
        expect(t1.source_hash).to eq(t3.source_hash)
        expect(t1.source_hash).to_not eq(t2.source_hash)
        expect(t1.source_hash).to eq(t4.source_hash)
        expect(t1.target_id).to eq(5309)
        expect(t2.target_id).to eq(5309)
        expect(t3.target_id).to eq(5309)
        expect(t4.target_id).to eq(5308)
        expect(RemoteTarget.latest_for('sms', '5558675309', '+15558675309')).to eq(t3)
        t1.last_outbound_at = 2.hours.from_now
        t1.save
        expect(RemoteTarget.latest_for('sms', '5558675309', '+15558675309')).to eq(t1)
      end
    end
  end
  
  describe "process_inbound" do
    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should return false if no target found" do
        expect(RemoteTarget.process_inbound({})).to eq(false)
        expect(RemoteTarget.process_inbound({
          'originationNumber' => '+15558675309',
          'destinationNumber' => '+15551234567',
          'messageBody' => 'howdy'
        })).to eq(false)
      end

      it "should return true if target found" do
        u = User.create
        t = RemoteTarget.new(target_type: 'sms', user: u)
        t.target = "5558675309"
        t.save!
        expect(RemoteTarget.process_inbound({
          'originationNumber' => '+15558675309',
          'destinationNumber' => '+15551234567',
          'messageBody' => 'howdy'
        })).to eq(true)
      end

      it "should send a message to the user" do
        u = User.create
        t = RemoteTarget.new(target_type: 'sms', user: u)
        t.target = "5558675309"
        t.save!
        expect(LogSession).to receive(:message).with({
          recipient: u,
          sender: u,
          sender_id: nil,
          notify: 'user_only',
          device: nil,
          message: 'howdy',
          reply_id: nil
        })
        expect(RemoteTarget.process_inbound({
          'originationNumber' => '+15558675309',
          'destinationNumber' => '+15551234567',
          'messageBody' => 'howdy'
        })).to eq(true)
      end

      it "should find the latest utterance for referencing reply_id" do
        u = User.create
        u2 = User.create
        d = u2.devices.create
        u2.process({'offline_actions' => [
          {'action' => 'add_contact', 'value' => {'contact' => '(555)867-5309', 'name' => 'Grandparents'}}
        ]})
        expect(u2.settings['contacts'][0]['name']).to eq('Grandparents')
        hash = u2.settings['contacts'][0]['hash']
        expect(hash).to_not eq(nil)
        
        ut = Utterance.create(user: u2)
        ut.share_with({
          'user_id' => "#{u2.global_id}x#{hash}",
          'message' => "test"
        }, u2, u2.global_id)
        expect(ut.data['share_user_ids']).to eq(["#{u2.global_id}x#{hash}"])
        
        t = RemoteTarget.new(target_type: 'sms', user: u)
        t.target = "5558675309"
        t.contact_id = "#{u2.global_id}x#{hash}"
        t.save!
        expect(LogSession).to receive(:message).with({
          recipient: u,
          sender: u2,
          sender_id: "#{u2.global_id}x#{hash}",
          notify: 'user_only',
          device: d,
          message: 'howdy',
          reply_id: ut.global_id
        })
        expect(RemoteTarget.process_inbound({
          'originationNumber' => '+15558675309',
          'destinationNumber' => '+15551234567',
          'messageBody' => 'howdy'
        })).to eq(true)
      end

      it "should reference the corect sender_id if coming from a user" do
        u = User.create
        u2 = User.create
        t = RemoteTarget.new(target_type: 'sms', user: u)
        t.target = "5558675309"
        t.contact_id = "#{u2.global_id}x2389fe"
        t.save!
        expect(LogSession).to receive(:message).with({
          recipient: u,
          sender: u2,
          sender_id: "#{u2.global_id}x2389fe",
          notify: 'user_only',
          device: nil,
          message: 'howdy',
          reply_id: nil
        })
        expect(RemoteTarget.process_inbound({
          'originationNumber' => '+15558675309',
          'destinationNumber' => '+15551234567',
          'messageBody' => 'howdy'
        })).to eq(true)
      end

      it "should reference the corect sender_id if coming from a contact" do
        u = User.create
        u2 = User.create
        t = RemoteTarget.new(target_type: 'sms', user: u)
        t.target = "5558675309"
        t.contact_id = u2.global_id
        t.save!
        expect(LogSession).to receive(:message).with({
          recipient: u,
          sender: u2,
          sender_id: u2.global_id,
          notify: 'user_only',
          device: nil,
          message: 'howdy',
          reply_id: nil
        })
        expect(RemoteTarget.process_inbound({
          'originationNumber' => '+15558675309',
          'destinationNumber' => '+15551234567',
          'messageBody' => 'howdy'
        })).to eq(true)
      end
    end
  end
end
