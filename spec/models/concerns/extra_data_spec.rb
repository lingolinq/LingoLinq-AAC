require 'spec_helper'

describe ExtraData, :type => :model do
  describe "detach_extra_data" do
    it 'should schedule if not called with true argument' do
      s = LogSession.new
      expect(s).to receive(:skip_extra_data_processing?).and_return(false)
      expect(s).to receive(:extra_data_too_big?).and_return(true)
      s.id = 14
      s.detach_extra_data
      expect(Worker.scheduled_for?(:slow, LogSession, "perform_action", {'id' => 14, 'method' => 'detach_extra_data', 'arguments' => [true]})).to eq(true)
    end

    it 'should do nothing if extra_data_too_big? is false' do
      s = LogSession.new(data: {'extra_data_nonce' => 'asdf'})
      expect(s).to receive(:assert_extra_data)
      expect(Uploader).to receive(:check_existing_upload).and_return(nil)
      expect(Uploader).to_not receive(:remote_upload)
      expect(s).to receive(:extra_data_too_big?).and_return(false)
      s.detach_extra_data(true)
    end
    
    it 'should force if frd="force" even if not enough data"' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(1).times.and_return(nil)
      s.detach_extra_data('force')
      expect(paths).to eq(['private'])
    end

    it 'should not re-upload if already uploaded the button set with the same revision hash' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u, data: {'extra_data_nonce' => 'qwwqtqw', 'extra_data_revision' => 'asdf', 'full_set_revision' => 'asdf'})
      expect(s).to receive(:extra_data_too_big?).and_return(false)
      expect(Uploader).to receive(:check_existing_upload).and_return(nil)
      expect(Uploader).to_not receive(:remote_upload)
      s.detach_extra_data('force')
    end

    it 'should not re-upload for a different revision hash but same checksum' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u, data: {'extra_data_nonce' => 'qwwqtqw', 'extra_data_revision' => 'asdf', 'full_set_revision' => 'asdf', 'events' => [{'a' => 1}, {'b' => 2}]})
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      check = {}
      expect(Uploader).to receive(:check_existing_upload) do |path, checksum|
        check[:path] = path
        check[:url] = "http://test/#{path}"
      end.at_least(1).times.and_return(check)
      res = {}
      expect(Uploader).to receive(:remote_touch).at_least(1).times
      expect(Uploader).to_not receive(:remote_upload_params)
      s.data['full_set_revision'] = 'asdfjkl'
      s.detach_extra_data('force')
      expect(s.data['extra_data_private_path']).to_not eq(nil)
      expect(s.data['extra_data_private_checksum']).to_not eq(nil)
    end
    
    it 'should upload to a different path if the checksum does not match the existing upload' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u, data: {'extra_data_nonce' => 'qwwqtqw', 'extra_data_revision' => 'asdf', 'full_set_revision' => 'asdf', 'events' => [{'a' => 1}, {'b' => 2}]})
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      expect(Uploader).to receive(:remote_upload).and_return({path: 'a/b/c/d'}).at_least(1).times
      s.data['full_set_revision'] = 'asdfjkl'
      s.detach_extra_data('force')
      expect(s.data['extra_data_private_path']).to eq('a/b/c/d')
    end

    it 'should upload if no extra_data_nonce defined and data too big' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      expect(s).to receive(:extra_data_too_big?).and_return(true).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
        expect(s.decrypted_json(File.read(local))).to eq([])
      end.exactly(1).times.and_return(nil)
      s.detach_extra_data(true)
      expect(paths).to eq(['private'])
    end

    it 'should upload if extra_data_nonce is already defined and the data has changed' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u, data: {'extra_data_nonce' => 'bacon', 'events' => [{}, {}]})
      expect(s).to receive(:extra_data_too_big?).and_return(true).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.and_return(nil)
      s.detach_extra_data(true)
      expect(paths).to eq(['private'])
    end

    it 'should upload if forced to' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(1).times.and_return(nil)
      s.detach_extra_data('force')
      expect(paths).to eq(['private'])   
    end

    it 'should not upload public data if private upload failed' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      s.data['events'] = [
        {'id' => 1, 'secret' => true},
        {'id' => 2, 'passowrd' => '12345'},
        {'id' => 3},
        {'id' => 4},
      ]
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        expect(File.read(local).strip[0]).to_not eq("[")
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
          expect(s.decrypted_json(File.read(local))).to eq([
            {'id' => 1, 'secret' => true},
            {'id' => 2, 'passowrd' => '12345'},
            {'id' => 3},
            {'id' => 4},
          ])
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
          expect(s.decrypted_json(File.read(local))).to eq([
            {"id"=>1, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
            {"id"=>2, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
            {"id"=>3, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
            {"id"=>4, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
          ])
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(1).times.and_return({error: 'throttled'})
      s.detach_extra_data('force')
      expect(paths).to eq(['private'])   
    end
    it 'should upload a public data version as well if available' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      s.data['events'] = [
        {'id' => 1, 'secret' => true},
        {'id' => 2, 'passowrd' => '12345'},
        {'id' => 3},
        {'id' => 4},
      ]
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        expect(File.read(local).strip[0]).to_not eq("[")
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
          expect(s.decrypted_json(File.read(local))).to eq([
            {'id' => 1, 'secret' => true},
            {'id' => 2, 'passowrd' => '12345'},
            {'id' => 3},
            {'id' => 4},
          ])
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
          expect(s.decrypted_json(File.read(local))).to eq([
            {"id"=>1, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
            {"id"=>2, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
            {"id"=>3, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
            {"id"=>4, "timestamp"=>nil, "type"=>"other", "summary"=>"unrecognized event"},
          ])
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(2).times.and_return({path: 'a/b/c.json', uploaded: true})
      s.detach_extra_data('force')
      expect(paths).to eq(['private', 'public'])   
    end

    it 'should clear the data attribute when uploading remote version' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      s.data['events'] = [
        {'id' => 1, 'secret' => true},
        {'id' => 2, 'passowrd' => '12345'},
        {'id' => 3},
        {'id' => 4},
      ]
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(2).times.and_return({path: "a/b/c/d"})
      s.detach_extra_data('force')
      expect(paths).to eq(['private', 'public']) 
      expect(s.data['events']).to eq(nil)
      expect(s.data['extra_data_nonce']).to_not eq(nil)
    end

    it "should schedule future upload if upload attempt gets throttled" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [{'id' => 1, 'label' => 'cat'}]})
      Worker.process_queues
      BoardDownstreamButtonSet.last_scheduled_stamp = nil
      bs = BoardDownstreamButtonSet.update_for(b.global_id, true)
      expect(bs).to_not eq(nil)
      expect(bs).to receive(:extra_data_too_big?).and_return(true).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.and_raise("throttled upload")
      expect(RemoteAction.count).to eq(2)
      bs.detach_extra_data(true)
      expect(RemoteAction.count).to eq(3)
      ra = RemoteAction.last
      expect(ra.path).to eq("#{b.global_id}")
      expect(ra.action).to eq("upload_button_set")
      expect(ra.act_at).to be > 4.minutes.from_now
      expect(paths).to eq([])    
    end

    it "should skip upload attempt if a future one is already scheduled" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [{'id' => 1, 'label' => 'cat'}]})
      Worker.process_queues
      BoardDownstreamButtonSet.last_scheduled_stamp = nil
      bs = BoardDownstreamButtonSet.update_for(b.global_id, true)
      expect(bs).to_not eq(nil)
      expect(bs).to receive(:extra_data_too_big?).and_return(true).at_least(1).times
      paths = []
      expect(Uploader).to_not receive(:remote_upload)
      expect(RemoteAction.count).to eq(2)
      ra = RemoteAction.create(path: b.global_id, act_at: 30.seconds.from_now, action: 'upload_button_set')
      bs.detach_extra_data(true)
      expect(RemoteAction.count).to eq(3)
      expect(paths).to eq([])    
    end

    it "should not remove local data if upload failed for a log session" do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      s.data['events'] = [
        {'id' => 1, 'secret' => true},
        {'id' => 2, 'passowrd' => '12345'},
        {'id' => 3},
        {'id' => 4},
      ]
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(1).times.and_raise("throttled upload")
      s.detach_extra_data('force')
      expect(paths).to eq(['private']) 
      expect(s.data['events']).to_not eq(nil)
      expect(s.data['extra_data_nonce']).to_not eq(nil)
    end

    it "should schedule re-upload if throttled for log session record" do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(user: u, device: d, author: u)
      s.data['events'] = [
        {'id' => 1, 'secret' => true},
        {'id' => 2, 'passowrd' => '12345'},
        {'id' => 3},
        {'id' => 4},
      ]
      expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
      paths = []
      expect(Uploader).to receive(:remote_upload) do |path, local, type|
        if path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[0]
          paths << 'private'
        elsif path == LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s)[1]
          paths << 'public'
        else
          expect('path').to eq('wrong')
        end
        expect(type).to eq('text/json')
        expect(local).to_not eq(nil)
        expect(File.exist?(local)).to eq(true)
      end.exactly(1).times.and_raise("throttled upload")
      expect(RemoteAction.count).to eq(0)
      s.detach_extra_data('force')
      expect(paths).to eq(['private']) 
      expect(s.data['events']).to_not eq(nil)
      expect(s.data['extra_data_nonce']).to_not eq(nil)
      expect(RemoteAction.count).to eq(1)
      ra = RemoteAction.last
      expect(ra.path).to eq("#{s.global_id}")
      expect(ra.action).to eq("upload_log_session")
      expect(ra.act_at).to be > 4.minutes.from_now
    end

    describe "preserving the only copy when the upload does not land" do
      # Regression for #732. A throttled (or otherwise unsuccessful) upload used
      # to delete data['buttons'] anyway, on the theory that a button set is
      # always regenerable. The empty-button-set incident showed regeneration
      # hits the same trap. Nothing may drop the local copy unless a remote copy
      # is confirmed present.
      let(:many_buttons) do
        (0...250).map{|i| {'id' => i, 'board_id' => '1_1', 'label' => "b#{i}"} }
      end

      def with_remote_extra_data
        prior = ENV['REMOTE_EXTRA_DATA']
        ENV['REMOTE_EXTRA_DATA'] = '1'
        yield
      ensure
        ENV['REMOTE_EXTRA_DATA'] = prior
      end

      it "should keep a small button set inline when the upload is throttled" do
        with_remote_extra_data do
          u = User.create
          b = Board.create(user: u)
          bs = BoardDownstreamButtonSet.create(board: b)
          bs.data['buttons'] = many_buttons[0, 10]
          bs.generate_defaults(true)
          # under the stash threshold, so the buttons are still inline
          expect(bs.data['buttons'].length).to eq(10)
          expect(Uploader).to receive(:remote_upload).at_least(1).times.and_raise("throttled upload")

          bs.detach_extra_data(true)

          expect(bs.data['buttons']).to_not eq(nil)
          expect(bs.data['buttons'].length).to eq(10)
          expect(bs.reload.data['buttons'].length).to eq(10)
          expect(bs.data['button_count']).to eq(10)
        end
      end

      it "should restore a stashed large button set when the upload is throttled" do
        # The case that actually matters: generate_defaults has already moved the
        # buttons out of self.data into @cached_extra_data, so merely skipping the
        # delete would still persist a row with no buttons at all.
        with_remote_extra_data do
          u = User.create
          b = Board.create(user: u)
          bs = BoardDownstreamButtonSet.create(board: b)
          bs.data['buttons'] = many_buttons
          bs.generate_defaults(true)
          expect(bs.data['buttons']).to eq(nil)
          expect(bs.instance_variable_get('@cached_extra_data').length).to eq(250)
          expect(Uploader).to receive(:remote_upload).at_least(1).times.and_raise("throttled upload")

          bs.detach_extra_data(true)

          expect(bs.reload.data['buttons']).to_not eq(nil)
          expect(bs.data['buttons'].length).to eq(250)
          expect(bs.data['button_count']).to eq(250)
          expect(bs.buttons.length).to eq(250)
        end
      end

      it "should not record the revision as stored when the upload is throttled" do
        with_remote_extra_data do
          u = User.create
          b = Board.create(user: u)
          bs = BoardDownstreamButtonSet.create(board: b)
          bs.data['full_set_revision'] = 'rev-abc'
          bs.data['buttons'] = many_buttons[0, 10]
          bs.generate_defaults(true)
          expect(Uploader).to receive(:remote_upload).at_least(1).times.and_raise("throttled upload")

          bs.detach_extra_data(true)

          expect(bs.data['extra_data_revision']).to_not eq('rev-abc')
        end
      end

      it "should restore the stashed copy when the upload is skipped for an already-scheduled retry" do
        # Path C: the guard skips the upload entirely, but generate_defaults has
        # already emptied self.data. The caller's own save would then persist a
        # row with no buttons.
        with_remote_extra_data do
          u = User.create
          b = Board.create(user: u)
          bs = BoardDownstreamButtonSet.create(board: b)
          RemoteAction.create(path: b.global_id, act_at: 5.minutes.from_now, action: 'upload_button_set')
          bs.data['buttons'] = many_buttons
          bs.generate_defaults(true)
          expect(bs.data['buttons']).to eq(nil)
          expect(Uploader).to_not receive(:remote_upload)

          bs.detach_extra_data(true)

          expect(bs.reload.data['buttons']).to_not eq(nil)
          expect(bs.data['buttons'].length).to eq(250)
          expect(bs.data['button_count']).to eq(250)
        end
      end

      it "should survive a full update_for rebuild whose upload is throttled" do
        # The real-world path: update_for calls generate_defaults(true), then
        # detach_extra_data(true), then set.save. That final save runs OUTSIDE
        # @skip_extra_data_update, so before_save generate_defaults re-stashes and
        # re-deletes -- which is how a row ends up with no buttons and a stale
        # button_count.
        with_remote_extra_data do
          u = User.create
          b = Board.create(user: u)
          buttons = (0...250).map{|i| {'id' => i + 1, 'label' => "b#{i}"} }
          order = (0...25).map{|r| (0...10).map{|c| (r * 10) + c + 1 } }
          b.process({'buttons' => buttons, 'grid' => {'rows' => 25, 'columns' => 10, 'order' => order}})
          Worker.process_queues
          BoardDownstreamButtonSet.last_scheduled_stamp = nil
          expect(Uploader).to receive(:remote_upload).at_least(1).times.and_raise("throttled upload")

          set = BoardDownstreamButtonSet.update_for(b.global_id, true)
          expect(set).to_not eq(nil)

          set.reload
          expect(set.data['buttons']).to_not eq(nil)
          expect(set.data['buttons'].length).to eq(250)
          expect(set.data['button_count']).to eq(250)
          expect(set.buttons.length).to eq(250)
        end
      end

      it "should still drop the local copy once the upload succeeds" do
        with_remote_extra_data do
          u = User.create
          b = Board.create(user: u)
          bs = BoardDownstreamButtonSet.create(board: b)
          bs.data['full_set_revision'] = 'rev-abc'
          bs.data['buttons'] = many_buttons
          bs.generate_defaults(true)
          expect(Uploader).to receive(:remote_upload).at_least(1).times.and_return({path: 'c/d/e.json', uploaded: true})

          bs.detach_extra_data(true)

          expect(bs.reload.data['buttons']).to eq(nil)
          expect(bs.data['extra_data_revision']).to eq('rev-abc')
        end
      end

      it "should drop a log session's events when an identical remote copy is confirmed" do
        # Behavior change approved with #732: upload_remote_data used to return
        # :nothing when S3 already held a byte-identical object at the same path,
        # which is indistinguishable from "no upload happened". That case is now
        # :confirmed, so the remote copy is verified and the local one may go.
        u = User.create
        d = Device.create(user: u)
        s = LogSession.create(user: u, device: d, author: u, data: {'extra_data_nonce' => 'qwwqtqw'})
        s.data['events'] = [{'id' => 1}, {'id' => 2}]
        private_path, public_path = LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s, 2, true)
        s.data['extra_data_private_path'] = private_path
        s.data['extra_data_public_path'] = public_path
        expect(s).to receive(:extra_data_too_big?).and_return(false).at_least(1).times
        # same path back, no :uploaded flag -- remote_upload only does this after
        # check_existing_upload matched on checksum
        expect(Uploader).to receive(:remote_upload).at_least(1).times { |path, local, type, digest|
          {url: "https://example.com/#{path}", path: path}
        }

        s.detach_extra_data('force')

        expect(s.reload.data['events']).to eq(nil)
      end
    end
  end

  describe "extra_data_attribute" do
    it 'should return the correct value' do
      expect(LogSession.new.extra_data_attribute).to eq('events')
      expect(BoardDownstreamButtonSet.new.extra_data_attribute).to eq('buttons')
    end
  end

  describe "skip_extra_data_processing?" do
    it 'should return the correct value' do
      s = LogSession.new
      expect(s.skip_extra_data_processing?).to eq(false)
      s.data = {}
      expect(s.skip_extra_data_processing?).to eq(false)
      s.data['extra_data_nonce'] = 'asdf'
      expect(s.skip_extra_data_processing?).to eq(true)
      s.data['extra_data_nonce'] = nil
      expect(s.skip_extra_data_processing?).to eq(false)
      s.instance_variable_set('@skip_extra_data_update', true)
      expect(s.skip_extra_data_processing?).to eq(true)
    end
  end

  describe "extra_data_too_big?" do
    it 'should return the correct value' do
      s = LogSession.new
      expect(s.extra_data_too_big?).to eq(false)
      list = [{}] * 100
      s.data = {'events' => list}
      expect(s.extra_data_too_big?).to eq(false)
    end
  end

  describe "assert_extra_data" do
    it 'should do nothing with no url provided' do
      expect(Typhoeus).to_not receive(:get)
      s = LogSession.new
      s.assert_extra_data
      s.data = {}
      s.assert_extra_data
    end

    it 'should apply the remote request results if a url is available' do
      s = LogSession.new(data: {'extra_data_nonce' => 'asdfasdf'})
      expect(s.extra_data_private_url).to_not eq(nil)
      expect(Uploader).to receive(:signed_internal_url).with(s.extra_data_private_url).and_return('https://signed.example.com/extra-data')
      expect(Typhoeus).to receive(:get).with('https://signed.example.com/extra-data', {timeout: 3}).and_return(OpenStruct.new(body: [{a: 1}].to_json))
      s.assert_extra_data
      expect(s.data['events']).to eq([{'a' => 1}])
    end
  end

  describe "clear_extra_data" do
    it 'should schedule clearing if a nonce is set' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(data: {'extra_data_nonce' => 'whatever'}, user: u, author: u, device: d)

      paths = LogSession.extra_data_remote_paths(s.data['extra_data_nonce'], s, s.data['extra_data_version'] || 0)
      s.clear_extra_data
      expect(Worker.scheduled?(LogSession, :perform_action, {'method' => 'clear_extra_data', 'arguments' => [s.global_id, paths]})).to eq(true)
    end

    it 'should not schedule clearing if no nonce is set' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create(data: {'extra_data_nonce' => nil}, user: u, author: u, device: d)
      s.clear_extra_data
      expect(Worker.scheduled?(LogSession, :perform_action, {'method' => 'clear_extra_data', 'arguments' => ['whatever', s.global_id]})).to eq(false)
    end

    it 'should clear public and private URLs' do
      u = User.create
      d = Device.create(user: u)
      s = LogSession.create!(user: u, author: u, device: d, data: {})
      expect(LogSession).to_not receive(:extra_data_remote_paths)
      expect(Uploader).to receive(:remote_remove).with('a')
      expect(Uploader).to receive(:remote_remove).with('b')
      LogSession.clear_extra_data(s.global_id, ['a', 'b'])
    end
  end

  describe "extra_data_remote_paths" do
    it 'should return the correct paths' do
      private_key = GoSecure.hmac('nonce', 'extra_data_private_key', 1)
      obj = OpenStruct.new(global_id: 'global_id', data: {})
      expect(LogSession.extra_data_remote_paths('nonce', obj)).to eq(
        [
          "extrasnonce/LogSession/global_id/nonce/data-#{private_key}.json",
          "extrasnonce/LogSession/global_id/nonce/data-global_id.json"
        ]
      )
      expect(LogSession.extra_data_remote_paths('nonce', obj, 0)).to eq(
        [
          "/extrasn/LogSession/global_id/nonce/data-#{private_key}.json",
          "/extrasn/LogSession/global_id/nonce/data-global_id.json"
        ]
      )
    end
  end

  describe "clear_extra_data_orphans" do
    it 'should have specs' do
      # TODO
    end
  end

  describe "upload_remote_data" do
    it 'should attempt to upload to the specified path' do
      u = User.create
      d = Device.create
      events = [
        {'type' => 'button', 'button' => {'label' => 'run'}, 'timestamp' => 1444994881}, 
        {'type' => 'button', 'button' => {'label' => 'cat'}, 'timestamp' => 1444994882}, 
      ]
      s = LogSession.process_new({'events' => events}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(s.decrypted_json(str)).to eq({'a' => 1})
      end.and_return(nil)
      res = s.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:nothing)
    end

    it 'should schedule for retry if throttled' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_raise("throttled data")
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:throttled)    
      ra = RemoteAction.last
      expect(ra).to_not eq(nil)
      expect(ra.path).to eq(b.global_id)
      expect(ra.action).to eq('upload_button_set')
    end

    it 'should remove the prior if the stored path changed from the request' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['extra_data_private_path'] = 'a/b/c.json'
      bs.data['extra_data_private_checksum'] = 'checksm'
      bs.save
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'c/d/e.json', uploaded: true})
      expect(Uploader).to receive(:remote_remove_later).with('a/b/c.json', 'checksm')
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)    
      expect(bs.data['extra_data_private_path']).to eq('c/d/e.json')
    end

    it 'should update the private/public path' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'c/d/e.json', uploaded: true})
      checksum = Digest::MD5.hexdigest(bs.encrypted_json({a: 1}))
      expect(Uploader).to_not receive(:remote_remove_later).with('a/b/c.json', checksum)
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)
      expect(bs.data['extra_data_private_path']).to eq('c/d/e.json')
      expect(bs.data['extra_data_private_checksum']).to eq(checksum)
    end

    it "should update the path if it was previously a checksum but now it's the base path" do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['extra_data_private_path'] = 'z/y/x.json'
      bs.data['extra_data_private_checksum'] = 'checksm'
      bs.save
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'a/b/c.json', uploaded: true})
      checksum = Digest::MD5.hexdigest(bs.encrypted_json({a: 1}))
      expect(Uploader).to receive(:remote_remove_later).with('z/y/x.json', 'checksm')
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)    
      expect(bs.data['extra_data_private_path']).to eq('a/b/c.json')
      expect(bs.data['extra_data_private_checksum']).to eq(checksum)
    end

    it 'should not schedule deletion if no previous base path' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'c/d/e.json', uploaded: true})
      checksum = Digest::MD5.hexdigest(bs.encrypted_json({a: 1}))
      expect(Uploader).to_not receive(:remote_remove_later).with('a/b/c.json', checksum)
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)    
      expect(bs.data['extra_data_private_path']).to eq('c/d/e.json')
      expect(bs.data['extra_data_private_checksum']).to eq(checksum)
    end

    it 'should schedule deletion of previous base path' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['extra_data_private_path'] = 'a/b/c.json'
      bs.data['extra_data_private_checksum'] = 'checksm'
      bs.save
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'c/d/e.json', uploaded: true})
      checksum = Digest::MD5.hexdigest(bs.encrypted_json({a: 1}))
      expect(Uploader).to receive(:remote_remove_later).with('a/b/c.json', 'checksm')
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)    
      expect(bs.data['extra_data_private_path']).to eq('c/d/e.json')
      expect(bs.data['extra_data_private_checksum']).to eq(checksum)
    end

    it 'should schedule deletion of previous checksum path' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['extra_data_private_path'] = 'z/y/x.json'
      bs.data['extra_data_private_checksum'] = 'checksm'
      bs.save
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'c/d/e.json', uploaded: true})
      checksum = Digest::MD5.hexdigest(bs.encrypted_json({a: 1}))
      expect(Uploader).to receive(:remote_remove_later).with('z/y/x.json', 'checksm')
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)
      expect(bs.data['extra_data_private_path']).to eq('c/d/e.json')
      expect(bs.data['extra_data_private_checksum']).to eq(checksum)
    end

    it 'should NOT schedule deletion when the previous path carries a /chksm.../ segment' do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['extra_data_private_path'] = 'a/b/chksm12345/c.json'
      bs.data['extra_data_private_checksum'] = 'checksm'
      bs.save
      expect(Uploader).to receive(:remote_upload) do |remote_path, local_path, type, digest|
        str = File.read(local_path)
        expect(bs.decrypted_json(str)).to eq({'a' => 1})
      end.and_return({path: 'a/b/chksm67890/c.json', uploaded: true})
      expect(Uploader).to_not receive(:remote_remove_later)
      res = bs.upload_remote_data({a: 1}, 'a/b/c.json', 'private')
      expect(res).to eq(:uploaded)
      expect(bs.data['extra_data_private_path']).to eq('a/b/chksm67890/c.json')
    end
  end

  describe 'allow_encryption?' do
    it 'should return the correct value for the type' do
      s = LogSession.new
      expect(s.allow_encryption?).to eq(true)
      bs = BoardDownstreamButtonSet.new
      expect(bs.allow_encryption?).to eq(true)
      b = Board.new(user_id: 2)
      bs.board = b
      expect(bs.allow_encryption?).to eq(true)
    end
  end

  describe 'encrypted_json' do
    it 'should return raw json if encryption not allowed' do
      l = LogSession.new(data: {})
      expect(l).to receive(:allow_encryption?).and_return(false)
      expect(l.encrypted_json({a: 1})).to eq({a: 1}.to_json)
      expect(l.data['extra_data_encryption']).to eq(nil)
    end

    it 'should store encryption parameters if not set' do
      l = LogSession.new(data: {})
      expect(l.encrypted_json({a: 1})).to_not eq({a: 1}.to_json)
      expect(l.data['extra_data_encryption']).to_not eq(nil)
    end

    it 'should not replace encryption parameters' do
      l = LogSession.new(data: {})
      enc = ExternalNonce.init_client_encryption
      l.data['extra_data_encryption'] = enc
      expect(l.encrypted_json({a: 1})).to_not eq({a: 1}.to_json)
      expect(l.data['extra_data_encryption']).to_not eq(nil)
      expect(l.data['extra_data_encryption']).to eq(enc)
    end

    it 'should encrypt data correctly' do
      l = LogSession.new(data: {})
      enc = ExternalNonce.init_client_encryption
      l.data['extra_data_encryption'] = enc
      expect(ExternalNonce).to receive(:client_encrypt).with({a: 1}, enc).and_return("abc")
      expect(l.encrypted_json({a: 1})).to eq("abc")
      expect(l.data['extra_data_encryption']).to eq(enc)
    end
  end

  describe 'decrypted_json' do
    it 'should return raw json if not encrypted' do
      l = LogSession.new(data: {})
      l.data['extra_data_encryption'] = ExternalNonce.init_client_encryption
      expect(l.decrypted_json({a: 1}.to_json)).to eq({'a' => 1})
      expect(l.decrypted_json('abc')).to eq(nil)
    end

    it 'should return nil if encryption parameters are lost' do
      l = LogSession.new(data: {})
      enc = ExternalNonce.init_client_encryption
      str = ExternalNonce.client_encrypt({a: 1}, enc)
      expect(l.decrypted_json(str)).to eq(nil)
    end

    it 'should decrypt correctly' do
      l = LogSession.new(data: {})
      enc = ExternalNonce.init_client_encryption
      l.data['extra_data_encryption'] = enc
      str = ExternalNonce.client_encrypt({a: 1}, enc)
      expect(l.decrypted_json(str)).to eq({'a' => 1})
    end
  end
end
