require 'spec_helper'

describe GlobalId, :type => :model do
  describe "global_id" do
    it "should only generate an id of the record is saved" do
      u = User.new
      expect(u.global_id).to eq(nil)
      u.save
      expect(u.global_id).to match(/\d+_\d+/)
    end
  end
  
  describe "finding" do
    it "should find_by_global_id" do
      u = User.create
      expect(User.find_by_global_id(nil)).to eq(nil)
      expect(User.find_by_global_id("")).to eq(nil)
      expect(User.find_by_global_id(u.id.to_s + "_0")).to eq(nil)
      expect(User.find_by_global_id(u.global_id)).to eq(u)
    end
    
    it "should require a nonce for protected classes" do
      i = ButtonImage.create
      expect(ButtonImage.find_by_global_id(nil)).to eq(nil)
      expect(ButtonImage.find_by_global_id("")).to eq(nil)
      expect(ButtonImage.find_by_global_id("1_" + i.id.to_s)).to eq(nil)
      expect(ButtonImage.find_by_global_id("1_" + i.id.to_s + "_" + i.nonce)).to eq(i)
    end
    
    it "should allow a bad or missing nonce for legacy reords" do
      i = ButtonImage.create(:nonce => "legacy")
      expect(i.nonce).to eq('legacy')
      expect(ButtonImage.find_by_global_id(nil)).to eq(nil)
      expect(ButtonImage.find_by_global_id("")).to eq(nil)
      expect(ButtonImage.find_by_global_id("1_" + i.id.to_s)).to eq(i)
      expect(ButtonImage.find_by_global_id("1_" + i.id.to_s + "_" + i.nonce)).to eq(i)
      expect(ButtonImage.find_by_global_id("1_" + i.id.to_s + "_" + "abcdefg")).to eq(i)
    end

    it "should look up global id with a sub_id" do
      u = User.create
      u2 = User.create
      b = Board.create(user: u)
      bb = Board.find_by_global_id(b.global_id)
      expect(bb).to_not eq(nil)
      expect(bb.instance_variable_get('@sub_id')).to eq(nil)

      bb = Board.find_by_global_id("#{b.global_id}-#{u2.global_id}")
      expect(bb).to_not eq(nil)
      expect(bb.instance_variable_get('@sub_id')).to eq(u2.global_id)

      bb = Board.find_by_global_id("#{b.global_id}-#{u.global_id}")
      expect(bb).to_not eq(nil)
      expect(bb.instance_variable_get('@sub_id')).to eq(u.global_id)
    end

    it "should return nil for a missing sub_id on a global id" do
      u = User.create
      u2 = User.create
      b = Board.create(user: u)
      bb = Board.find_by_global_id("#{b.global_id}-1_000")
      expect(bb).to eq(nil)
    end

    it "should find a replacement for a global id when set for a sub_id" do
      u = User.create
      u2 = User.create
      b = Board.create(user: u)
      b2 = Board.create(user: u2)

      bb = Board.find_by_global_id("#{b.global_id}-#{u2.global_id}")
      expect(bb).to_not eq(nil)
      expect(bb).to eq(b)
      expect(bb.instance_variable_get('@sub_id')).to eq(u2.global_id)

      ue = UserExtra.create(user: u2)
      ue.settings['replaced_boards'] = {}
      ue.settings['replaced_boards'][b.global_id] = b2.global_id
      ue.save
      bb = Board.find_by_global_id("#{b.global_id}-#{u2.global_id}")
      expect(bb).to_not eq(nil)
      expect(bb).to eq(b2)
      expect(bb.instance_variable_get('@sub_id')).to eq(nil)
    end
    
    it "should find_by_path" do
      u = User.create(:user_name => "bob")
      expect(User.find_by_path(u.user_name)).to eq(u)
      expect(User.find_by_path("bacon")).to eq(nil)
      expect(User.find_by_path(u.global_id)).to eq(u)
      expect(User.find_by_path("0_0")).to eq(nil)
    end
    
    it "should find_all_by_global_id" do
      u1 = User.create
      u2 = User.create
      expect(User.find_all_by_global_id([])).to eq([])
      expect(User.find_all_by_global_id(["0", "1", u1.global_id])).to eq([u1])
      expect(User.find_all_by_global_id([u1.global_id, u2.global_id, u1.id.to_s]).sort).to eq([u1, u2].sort)
    end

    it "should return a correct single result with sub_id" do
      u = User.create
      b = Board.create(user: u)
      bb = Board.find_all_by_global_id(["#{b.global_id}-#{u.global_id}"])
      expect(bb.length).to eq(1)
      expect(bb[0].id).to eq(b.id)
      expect(bb[0].instance_variable_get('@sub_id')).to eq(u.global_id)
    end

    it "should return multiple copies of the same record, one for each sub_id" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(user: u1)
      bs = Board.find_all_by_global_id([b.global_id, "#{b.global_id}-#{u1.global_id}", "#{b.global_id}-1_0000", "#{b.global_id}-#{u2.global_id}"])
      expect(bs.length).to eq(3)
      expect(bs[0]).to eq(b)
      expect(bs[0].instance_variable_get('@sub_id')).to eq(nil)

      expect(bs[1]).to eq(b)
      expect(bs[1].instance_variable_get('@sub_id')).to eq(u1.global_id)

      expect(bs[2]).to eq(b)
      expect(bs[2].instance_variable_get('@sub_id')).to eq(u2.global_id)
    end

    it "should include substitutions by global_id when defined" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b1 = Board.create(user: u1, key: "#{u1.user_name}/gid-subst-b1")
      b2 = Board.create(user: u3, key: "#{u3.user_name}/gid-subst-b2")
      ue3 = UserExtra.create(user: u3)
      ue3.settings['replaced_boards'] = {}
      ue3.settings['replaced_boards'][b1.global_id] = b2.global_id
      ue3.save
      bs = Board.find_all_by_global_id([b1.global_id, "#{b1.global_id}-#{u3.global_id}", b2.global_id, "#{b1.global_id}-#{u1.global_id}"])
      expect(bs.length).to eq(3)
      expect(bs).to include(b1)
      expect(bs).to include(b2)
      expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
      expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id') == u1.global_id }).to eq(1)
      expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
    end

    it "should not include sub-ids that are not valid" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(user: u1)
      bs = Board.find_all_by_global_id([b.global_id, "#{b.global_id}-#{u1.global_id}", "#{b.global_id}-1_0000", "#{b.global_id}-#{u2.global_id}"])
      expect(bs.length).to eq(3)
      expect(bs[0]).to eq(b)
      expect(bs[0].instance_variable_get('@sub_id')).to eq(nil)

      expect(bs[1]).to eq(b)
      expect(bs[1].instance_variable_get('@sub_id')).to eq(u1.global_id)

      expect(bs[2]).to eq(b)
      expect(bs[2].instance_variable_get('@sub_id')).to eq(u2.global_id)
    end
    
    it "should require nonces when finding all by global id" do
      i1 = ButtonImage.create
      i2 = ButtonImage.create
      i3 = ButtonImage.create
      expect(ButtonImage.find_all_by_global_id([])).to eq([])
      expect(ButtonImage.find_all_by_global_id([i1.id.to_s, i2.id.to_s, i1.global_id])).to eq([i1])
      expect(ButtonImage.find_all_by_global_id(["1_#{i1.global_id}", "1_#{i2.global_id}", i3.global_id])).to eq([i3])
    end
    
    it "should not required nonces for legacy records when finding all" do
      i1 = ButtonImage.create(:nonce => "legacy")
      i2 = ButtonImage.create(:nonce => "legacy")
      i3 = ButtonImage.create
      expect(ButtonImage.find_all_by_global_id([])).to eq([])
      expect(ButtonImage.find_all_by_global_id([i1.id.to_s, i2.id.to_s, i3.global_id])).to eq([i3])
      expect(ButtonImage.find_all_by_global_id(["1_#{i1.id}", "1_#{i2.id}_q43gag43", "1_#{i3.id}"]).sort.map(&:id)).to eq([i1, i2].sort.map(&:id))
    end
    
    it "should find_all_by_path" do
      u1 = User.create
      u2 = User.create
      expect(User.find_all_by_path([u1.user_name])).to eq([u1])
      expect(User.find_all_by_path([u1.global_id])).to eq([u1])
      expect(User.find_all_by_path([u1.global_id, u2.global_id]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.user_name, u2.global_id]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.global_id, u2.user_name]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.user_name, u2.user_name]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.user_name, u2.user_name, u1.global_id, "32", u2.global_id]).sort_by(&:id)).to eq([u1, u2])
    end

    describe "find_all_by_path" do
      it "should work for a combo of global ids and board keys" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        b1 = Board.create(user: u1, key: "#{u1.user_name}/gid-b1")
        b2 = Board.create(user: u1, key: "#{u1.user_name}/gid-b2")
        b3 = Board.create(user: u1, key: "#{u1.user_name}/gid-b3")
        paths = [
          b1.global_id,
          b2.global_id,
          "#{b1.global_id}-#{u3.global_id}",
          "#{u1.global_id}-#{u1.global_id}",
          "#{b2.global_id}-#{b2.global_id}",
          b3.key,
          "#{u3.user_name}/my:#{b3.key.sub(/\//, ':')}",
          "#{u1.user_name}/my:#{b2.key.sub(/\//, ':')}",
          "#{u2.user_name}/mine:#{b2.key.sub(/\//, ':')}",
          "#{u2.user_name}/my:#{u2.user_name}",
        ]
        bs = Board.find_all_by_path(paths)
        expect(bs.length).to eq(6)
        expect(bs).to include(b1)
        expect(bs).to include(b2)
        expect(bs).to include(b3)
        expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id') == u3.global_id }).to eq(1)
        expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b3.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id') == u1.global_id }).to eq(1)
        expect(bs.count { |b| b.id == b3.id && b.instance_variable_get('@sub_id') == u3.global_id }).to eq(1)
      end

      it "should return a correct single result with sub_id" do
        u = User.create
        b = Board.create(user: u)
        bb = Board.find_all_by_path(["#{b.global_id}-#{u.global_id}"])
        expect(bb.length).to eq(1)
        expect(bb[0].id).to eq(b.id)
        expect(bb[0].instance_variable_get('@sub_id')).to eq(u.global_id)

        bb = Board.find_all_by_path(["#{u.user_name}/my:#{b.key.sub(/\//, ':')}"])
        expect(bb.length).to eq(1)
        expect(bb[0].id).to eq(b.id)
        expect(bb[0].instance_variable_get('@sub_id')).to eq(u.global_id)
      end

      it "should work for a combo of global ids and board keys with and without sub_ids" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        b1 = Board.create(user: u1, key: "#{u1.user_name}/gid-b1")
        b2 = Board.create(user: u1, key: "#{u1.user_name}/gid-b2")
        b3 = Board.create(user: u1, key: "#{u1.user_name}/gid-b3")
        paths = [
          b1.global_id,
          b2.global_id,
          "#{b1.global_id}-#{u3.global_id}",
          "#{u1.global_id}-#{u1.global_id}",
          "#{b2.global_id}-#{b2.global_id}",
          b3.key,
          "#{u3.user_name}/my:#{b3.key.sub(/\//, ':')}",
          "#{u1.user_name}/my:#{b2.key.sub(/\//, ':')}",
          "#{u2.user_name}/mine:#{b2.key.sub(/\//, ':')}",
          "#{u2.user_name}/my:#{u2.user_name}",
        ]
        bs = Board.find_all_by_path(paths)
        expect(bs.length).to eq(6)
        expect(bs).to include(b1)
        expect(bs).to include(b2)
        expect(bs).to include(b3)
        expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id') == u3.global_id }).to eq(1)
        expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b3.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id') == u1.global_id }).to eq(1)
        expect(bs.count { |b| b.id == b3.id && b.instance_variable_get('@sub_id') == u3.global_id }).to eq(1)
      end

      it "should return multiple compies of the same record if looked up for different sub_ids" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        b1 = Board.create(user: u1, key: "#{u1.user_name}/gid-b1")
        b2 = Board.create(user: u1, key: "#{u1.user_name}/gid-b2")
        b3 = Board.create(user: u1, key: "#{u1.user_name}/gid-b3")
        paths = [
          b1.global_id,
          b2.global_id,
          "#{b1.global_id}-#{u3.global_id}",
          "#{u1.global_id}-#{u1.global_id}",
          "#{b2.global_id}-#{b2.global_id}",
          b3.key,
          "#{u3.user_name}/my:#{b3.key.sub(/\//, ':')}",
          "#{u1.user_name}/my:#{b2.key.sub(/\//, ':')}",
          "#{u2.user_name}/mine:#{b2.key.sub(/\//, ':')}",
          "#{u2.user_name}/my:#{u2.user_name}",
        ]
        bs = Board.find_all_by_path(paths)
        expect(bs.length).to eq(6)
        expect(bs.detect { |b| b.id == b1.id && b.instance_variable_get('@sub_id').nil? }).to eq(b1)
        expect(bs.detect { |b| b.id == b1.id && b.instance_variable_get('@sub_id') == u3.global_id }).to eq(b1)
        expect(bs.detect { |b| b.id == b2.id && b.instance_variable_get('@sub_id').nil? }).to eq(b2)
        expect(bs.detect { |b| b.id == b3.id && b.instance_variable_get('@sub_id').nil? }).to eq(b3)
        expect(bs.detect { |b| b.id == b2.id && b.instance_variable_get('@sub_id') == u1.global_id }).to eq(b2)
        expect(bs.detect { |b| b.id == b3.id && b.instance_variable_get('@sub_id') == u3.global_id }).to eq(b3)
      end

      it "should return replacements if available" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        b1 = Board.create(user: u1, key: "#{u1.user_name}/gid-b1")
        b2 = Board.create(user: u1, key: "#{u1.user_name}/gid-b2")
        b3 = Board.create(user: u1, key: "#{u1.user_name}/gid-b3")
        b4 = Board.create(user: u3, key: "#{u3.user_name}/gid-b4")
        b5 = Board.create(user: u3, key: "#{u3.user_name}/gid-b5")
        ue3 = UserExtra.create(user: u3)
        ue3.settings['replaced_boards'] = {}
        ue3.settings['replaced_boards'][b1.global_id] = b4.global_id
        ue3.settings['replaced_boards'][b4.key] = b5.global_id
        ue3.save

        bs = Board.find_all_by_global_id([b1.global_id, b2.global_id, "#{b1.global_id}-#{u3.global_id}"])
        expect(bs.length).to eq(3)

        paths = [
          b1.global_id, # b1
          b2.global_id, # b2
          "#{b1.global_id}-#{u3.global_id}", # b4
          "#{u1.global_id}-#{u1.global_id}", # garbage
          "#{b2.global_id}-#{b2.global_id}", # garbage
          b3.key, # b3
          "#{u3.user_name}/my:#{b4.key.sub(/\//, ':')}", # b5
          "#{u1.user_name}/my:#{b2.key.sub(/\//, ':')}", # b2-u1
          "#{u2.user_name}/mine:#{b2.key.sub(/\//, ':')}", # garbage
          "#{u2.user_name}/my:#{u2.user_name}", # garbage
        ]
        bs = Board.find_all_by_path(paths)
        expect(bs.length).to eq(6)
        expect(bs).to include(b1)
        expect(bs).to include(b2)
        expect(bs).to include(b3)
        expect(bs).to include(b4)
        expect(bs).to include(b5)
        expect(bs.count { |b| b.id == b1.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b4.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b5.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b3.id && b.instance_variable_get('@sub_id').nil? }).to eq(1)
        expect(bs.count { |b| b.id == b2.id && b.instance_variable_get('@sub_id') == u1.global_id }).to eq(1)
      end
    end
    it 

    describe "find_batches_by_global_id" do
      it "should return a correct single result with sub_id" do
        u = User.create
        b = Board.create(user: u)
        bb = []
        Board.find_batches_by_global_id(["#{b.global_id}-#{u.global_id}"]) do |board|
          bb << board
        end
        expect(bb.length).to eq(1)
        expect(bb[0].id).to eq(b.id)
        expect(bb[0].instance_variable_get('@sub_id')).to eq(u.global_id)
      end

      it "should return an empty list with a null or empty argument" do
        expect(Board.find_batches_by_global_id(nil){|a| }).to eq([])
        expect(Board.find_batches_by_global_id([]){|a| }).to eq([])
      end

      it "should retrieve all specified records" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        u4 = User.create
        u5 = User.create
        results = []
        User.find_batches_by_global_id([u1.global_id, u2.global_id, u3.global_id, u4.global_id, u5.global_id], batch_size: 2) do |board|
          results << board
        end
        expect(results.sort_by(&:global_id)).to eq([u1, u2, u3, u4, u5])

        results = []
        User.find_batches_by_global_id([u1.global_id, u1.global_id, "asdf", u2.global_id, u3.global_id, u4.global_id, u5.global_id, nil], batch_size: 2) do |board|
          results << board
        end
        expect(results.sort_by(&:global_id)).to eq([u1, u2, u3, u4, u5])
      end

      it "should honor batches" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        u4 = User.create
        u5 = User.create
        results = []
        h = OpenStruct.new
        expect(User).to receive(:where).with(id: []).and_return(h)
        expect(h).to receive(:preload).with(:user_extra).and_return([])
        h = OpenStruct.new
        expect(User).to receive(:where).with(id: [u1.id.to_s, u2.id.to_s, u3.id.to_s, u4.id.to_s, u5.id.to_s]).and_return(h)
        expect(h).to receive(:find_in_batches).with(batch_size: 2).and_return(nil)
        User.find_batches_by_global_id([u1.global_id, u2.global_id, u3.global_id, u4.global_id, u5.global_id], batch_size: 2) do |board|
          results << board
        end
        expect(results).to eq([])
      end

      it "should include multiple shallow clones correctly" do
        u1 = User.create
        u2 = User.create
        u3 = User.create
        b1 = Board.create(user: u1)
        b2 = Board.create(user: u1)
        b3 = Board.create(user: u1)
        results = []
        Board.find_batches_by_global_id([b1.global_id, b2.global_id, "#{b1.global_id}-#{u1.global_id}", "#{b1.global_id}-#{u1.global_id}", "#{b1.global_id}-#{u2.global_id}", "#{b3.global_id}-#{u3.global_id}", "#{b3.global_id}-#{u3.global_id}9"]) do |board|
          results << board
        end
        expect(results.length).to eq(5)
        expect(results.map(&:global_id)).to eq([b1.global_id, "#{b1.global_id}-#{u1.global_id}", "#{b1.global_id}-#{u2.global_id}", b2.global_id, "#{b3.global_id}-#{u3.global_id}"])
      end
    end
  end

  describe "Board exceptions" do
    it "should find_by_path" do
      u = User.create(user_name: 'hat')
      b = Board.create(:user => u, :key => "hat/man")
      expect(b.key).to eq("hat/man")
      expect(Board.find_by_path(b.key)).to eq(b)
      expect(Board.find_by_path("bacon")).to eq(nil)
      expect(Board.find_by_path(b.global_id)).to eq(b)
      expect(Board.find_by_path("0_0")).to eq(nil)
    end

    it "should find_all_by_path" do
      u1 = User.create(user_name: 'hat')
      u2 = User.create(user_name: 'friend')
      b1 = Board.create(:user => u1, :key => "hat/man")
      b2 = Board.create(:user => u2, :key => "friend/chicken")
      expect(Board.find_all_by_path([b1.key])).to eq([b1])
      expect(Board.find_all_by_path([b1.global_id])).to eq([b1])
      expect(Board.find_all_by_path([b1.global_id, b2.global_id]).sort_by(&:id)).to eq([b1, b2])
      expect(Board.find_all_by_path([b1.key, b2.global_id]).sort_by(&:id)).to eq([b1, b2])
      expect(Board.find_all_by_path([b1.global_id, b2.key]).sort_by(&:id)).to eq([b1, b2])
      expect(Board.find_all_by_path([b1.key, b2.key]).sort_by(&:id)).to eq([b1, b2])
      expect(Board.find_all_by_path([b1.key, b2.key, b1.global_id, "32", b2.global_id]).sort_by(&:id)).to eq([b1, b2])
    end
  end
  
  describe "User exceptions" do
    it "should find_by_path" do
      u = User.create(:user_name => "bob")
      expect(User.find_by_path(u.user_name)).to eq(u)
      expect(User.find_by_path("bacon")).to eq(nil)
      expect(User.find_by_path(u.global_id)).to eq(u)
      expect(User.find_by_path("0_0")).to eq(nil)
    end

    it "should find_all_by_path" do
      u1 = User.create
      u2 = User.create
      expect(User.find_all_by_path([u1.user_name])).to eq([u1])
      expect(User.find_all_by_path([u1.global_id])).to eq([u1])
      expect(User.find_all_by_path([u1.global_id, u2.global_id]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.user_name, u2.global_id]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.global_id, u2.user_name]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.user_name, u2.user_name]).sort_by(&:id)).to eq([u1, u2])
      expect(User.find_all_by_path([u1.user_name, u2.user_name, u1.global_id, "32", u2.global_id]).sort_by(&:id)).to eq([u1, u2])
    end
  end
  
  describe "local_ids" do
    it "should return the correct values" do
      expect(User.local_ids(['1_123112', '2_151412124'])).to eq(['123112', '151412124'])
    end
    
    it "should raise for protected_global_id record types" do
      expect{ButtonSound.local_ids([])}.to raise_error("not allowed for protected record types")
      expect(User.local_ids([])).to eq([])
    end
    
    it "should not map ids that start with non-numbers" do
      expect(User.local_ids(['a1_1', '1_1'])).to eq(['1'])
    end
  end
end
