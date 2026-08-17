require 'spec_helper'

describe Flusher do
  describe "find_user" do
    it "should error on user not found" do
      expect { Flusher.find_user(0, 'nobody') }.to raise_error("user not found")
    end
    
    it "should error on mismatched user" do
      u = User.create
      expect { Flusher.find_user(u.global_id, 'wrong_name') }.to raise_error("wrong user!")
    end
    
    it "should return the user if found" do
      u = User.create
      expect(Flusher.find_user(u.global_id, u.user_name)).to eq(u)
    end
  end
  
  describe "flush_versions" do
    it "should delete all versions", :versioning => true do
      PaperTrail.request.whodunnit = 'user:sue'
      u = User.create
      u.user_name = 'different_name'
      u.save
      u.user_name = 'another_name'
      u.save
      u.reload
      expect(u.versions.count).to eq(3)
      Flusher.flush_versions(u.id, u.class.to_s)
      u.reload
      expect(u.versions.count).to eq(0)
    end
  end
  
  describe "flush_record" do
    it "should destroy the record" do
      u = User.create
      expect(User.where(:id => u.id).count).to eq(1)
      Flusher.flush_record(u)
      expect(User.where(:id => u.id).count).to eq(0)
    end
    
    it "should call flush_versions" do
      u = User.create
      expect(Flusher).to receive(:flush_versions).with(u.id, u.class.to_s)
      Flusher.flush_record(u)
    end
  end
  
  describe "flush_user_logs" do
    it "should call find_user" do
      u = User.create
      expect(Flusher).to receive(:find_user).with(u.global_id, u.user_name).and_return(u)
      Flusher.flush_user_logs(u.global_id, u.user_name)
    end

    it "should remove ai api logs for the user only" do
      u = User.create
      u2 = User.create
      log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', user_global_id: u.global_id)
      log2 = AiApiLog.create!(ai_provider: 'gemini', request_type: 'word_suggestion', user_global_id: u.global_id)
      other_user_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', user_global_id: u2.global_id)
      anonymous_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')

      Flusher.flush_user_logs(u.global_id, u.user_name)
      expect(AiApiLog.where(:id => log.id).count).to eq(0)
      expect(AiApiLog.where(:id => log2.id).count).to eq(0)
      expect(AiApiLog.where(:id => other_user_log.id).count).to eq(1)
      expect(AiApiLog.where(:id => anonymous_log.id).count).to eq(1)
    end

    it "should remove all log sessions and log session versions", :versioning => true do
      PaperTrail.request.whodunnit = 'user:jane'
      u = User.create
      d = Device.create(:user => u)
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 8.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s2 = LogSession.new(:device => d, :user => u, :author => u)
      s2.data = {}
      s2.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => 90.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => 94.minutes.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s2.save
      
      Flusher.flush_user_logs(u.global_id, u.user_name)
      expect(LogSession.where(:id => s.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'LogSession', :item_id => s.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'LogSession').count).to eq(0)
      expect(LogSession.where(:id => s2.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'LogSession', :item_id => s2.id).count).to eq(0)
    end
    
    it "should remove weekly stats summaries" do
      PaperTrail.request.whodunnit = 'user:jane'
      u = User.create
      d = Device.create(:user => u)
      # Use fixed timestamps in the same week to avoid flakiness near week boundaries.
      # Both sessions must share the same first-event timestamp so they land in the
      # same weekyear (base_time - 3600 can cross Sunday midnight and create 2 summaries).
      base_time = 3.days.ago.to_i
      s = LogSession.new(:device => d, :user => u, :author => u)
      s.data = {}
      s.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => base_time, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => base_time + 120, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s.save
      s2 = LogSession.new(:device => d, :user => u, :author => u)
      s2.data = {}
      s2.data['events'] = [
        {'user_id' => u.global_id, 'geo' => ['2', '3'], 'timestamp' => base_time, 'type' => 'button', 'button' => {'label' => 'hat', 'board' => {'id' => '1_1'}}},
        {'user_id' => u.global_id, 'geo' => ['1', '2'], 'timestamp' => base_time + 60, 'type' => 'button', 'button' => {'label' => 'cow', 'board' => {'id' => '1_1'}}}
      ]
      s2.save
      Worker.process_queues
      expect(WeeklyStatsSummary.where(user_id: u.id).count).to eq(1)
      
      Flusher.flush_user_logs(u.global_id, u.user_name)
      expect(LogSession.where(:id => s.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'LogSession', :item_id => s.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'LogSession').count).to eq(0)
      expect(LogSession.where(:id => s2.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'LogSession', :item_id => s2.id).count).to eq(0)
      expect(WeeklyStatsSummary.where(user_id: u.id).count).to eq(0)
    end
  end
  
  describe "flush_board" do
    it "should call flush_record" do
      u = User.create
      b = Board.create(:user => u)
      allow(Flusher).to receive(:flush_record)
      expect(Flusher).to receive(:flush_record).with(b, b.id, "Board")
      Flusher.flush_board(b.global_id, b.key)
    end
    
    it "should remove the board's image and sound records", :versioning => true do
      PaperTrail.request.whodunnit = 'user:todd'
      u = User.create
      b = Board.create(:user => u)
      i = ButtonImage.create(user: u)
      i2 = ButtonImage.create(user: u)
      BoardButtonImage.connect(b.id, [{:id => i.global_id}, {:id => i2.global_id}])
      s = ButtonSound.create(user: u)
      BoardButtonSound.create(:board_id => b.id, :button_sound_id => s.id)
      expect(ButtonImage.count).to eq(2)
      expect(ButtonSound.count).to eq(1)

      Flusher.flush_board(b.global_id, b.key)
      expect(ButtonImage.count).to eq(0)
      expect(ButtonSound.count).to eq(0)
      expect(BoardButtonImage.where(:board_id => b.id).count).to eq(0)
      expect(BoardButtonSound.where(:board_id => b.id).count).to eq(0)
      expect(Board.where(:id => b.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'ButtonImage', :item_id => i.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'ButtonImage', :item_id => i2.id).count).to eq(0)
      expect(PaperTrail::Version.where(:item_type => 'ButtonSound', :item_id => s.id).count).to eq(0)
    end
    
    it "should remove all board connections" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u1)
      u1.settings['preferences']['home_board'] = {'key' => b.key, 'id' => b.global_id}
      u1.save
      u2.settings['preferences']['home_board'] = {'key' => b.key, 'id' => b.global_id}
      u2.save
      u3.settings['preferences']['home_board'] = {'key' => b.key, 'id' => b.global_id}
      u3.save
      Worker.process_queues
      expect(UserBoardConnection.where(:board_id => b.id).count).to eq(3)
      Flusher.flush_board(b.global_id, b.key)
      expect(UserBoardConnection.where(:board_id => b.id).count).to eq(0)
    end
    
    it "should remove the board as the home board for any users" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u1)
      u1.settings['preferences']['home_board'] = {'key' => b.key, 'id' => b.global_id}
      u1.save
      u2.settings['preferences']['home_board'] = {'key' => b.key, 'id' => b.global_id}
      u2.save
      u3.settings['preferences']['home_board'] = {'key' => b.key, 'id' => b.global_id}
      u3.save
      Worker.process_queues
      expect(UserBoardConnection.where(:board_id => b.id).count).to eq(3)
      Flusher.flush_board(b.global_id, b.key)
      expect(UserBoardConnection.where(:board_id => b.id).count).to eq(0)
      expect(u1.reload.settings['preferences']['home_board']).to eq(nil)
      expect(u2.reload.settings['preferences']['home_board']).to eq(nil)
      expect(u3.reload.settings['preferences']['home_board']).to eq(nil)
    end
    
    it "should remove orphan files from remote storage" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      # Removable URLs must be uploads-bucket HTTPS paths matching
      # Uploader.remote_remove's guard after the bucket prefix is stripped:
      # /\w+\/.+\/\w+-\w+(\.\w+)?$/ (or /^extras/). Extension is optional;
      # the pattern is end-anchored. Non-removable library assets stay off
      # the uploads bucket so check_for_removable does not force removable=true.
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      pic_url = "https://#{uploads_bucket}.s3.amazonaws.com/images/abc123/pic-one.png"
      pic2_url = "https://opensymbols.s3.amazonaws.com/libraries/mulberry/cat.png"
      pic3_url = "https://#{uploads_bucket}.s3.amazonaws.com/images/abc123/pic-three.png"
      sound_url = "https://#{uploads_bucket}.s3.amazonaws.com/sounds/abc123/sound-one.mp3"
      i = ButtonImage.create(:user => u, :removable => true, :url => pic_url)
      i2 = ButtonImage.create(:user => u, :removable => false, :url => pic2_url)
      i3 = ButtonImage.create(:user => u, :removable => true, :url => pic3_url)
      BoardButtonImage.connect(b.id, [{:id => i.global_id}, {:id => i2.global_id}, {:id => i3.global_id}])
      BoardButtonImage.connect(b2.id, [{:id => i3.global_id}])
      s = ButtonSound.create(:user => u, :removable => true, :url => sound_url)
      BoardButtonSound.create(:board_id => b.id, :button_sound_id => s.id)
      expect(i.removable).to eq(true)
      expect(i2.removable).to eq(false)
      expect(i3.removable).to eq(true)
      expect(s.removable).to eq(true)

      expect(Uploader).to receive(:remote_remove).with(pic_url)
      expect(Uploader).to receive(:remote_remove).with(sound_url)
      expect(Uploader).not_to receive(:remote_remove).with(pic2_url)
      expect(Uploader).not_to receive(:remote_remove).with(pic3_url)
      
      Flusher.flush_board(b.global_id, b.key)
      Worker.process_queues
      expect(ButtonImage.count).to eq(1)
      expect(ButtonSound.count).to eq(0)
      expect(BoardButtonImage.where(:board_id => b.id).count).to eq(0)
      expect(BoardButtonSound.where(:board_id => b.id).count).to eq(0)
      expect(Board.where(:id => b.id).count).to eq(0)
    end
    
    it "should support aggressive flushing" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      pic_url = "https://#{uploads_bucket}.s3.amazonaws.com/images/abc123/pic-one.png"
      pic2_url = "https://opensymbols.s3.amazonaws.com/libraries/mulberry/cat.png"
      pic3_url = "https://#{uploads_bucket}.s3.amazonaws.com/images/abc123/pic-three.png"
      sound_url = "https://#{uploads_bucket}.s3.amazonaws.com/sounds/abc123/sound-one.mp3"
      i = ButtonImage.create(:user => u, :removable => true, :url => pic_url)
      i2 = ButtonImage.create(:user => u, :removable => false, :url => pic2_url)
      i3 = ButtonImage.create(:user => u, :removable => true, :url => pic3_url)
      BoardButtonImage.connect(b.id, [{:id => i.global_id}, {:id => i2.global_id}, {:id => i3.global_id}])
      BoardButtonImage.connect(b2.id, [{:id => i3.global_id}])
      s = ButtonSound.create(:user => u, :removable => true, :url => sound_url)
      BoardButtonSound.create(:board_id => b.id, :button_sound_id => s.id)
      expect(i.removable).to eq(true)
      expect(i2.removable).to eq(false)
      expect(i3.removable).to eq(true)
      expect(s.removable).to eq(true)

      expect(Uploader).to receive(:remote_remove).with(pic_url)
      expect(Uploader).to receive(:remote_remove).with(sound_url)
      expect(Uploader).not_to receive(:remote_remove).with(pic2_url)
      expect(Uploader).to receive(:remote_remove).with(pic3_url)
      
      expect(ButtonImage.count).to eq(3)

      Flusher.flush_board(b.global_id, b.key, true)
      Worker.process_queues
      expect(ButtonImage.count).to eq(0)
      expect(ButtonSound.count).to eq(0)
      expect(BoardButtonImage.where(:board_id => b.id).count).to eq(0)
      expect(BoardButtonSound.where(:board_id => b.id).count).to eq(0)
      expect(Board.where(:id => b.id).count).to eq(0)
    end
  end
  
  describe "flush_user_boards" do
    it "should call find_user" do
      u = User.create
      expect(Flusher).to receive(:find_user).with(u.global_id, u.user_name).and_return(u)
      Flusher.flush_user_boards(u.global_id, u.user_name)
    end
    
    it "should call flush_board for all the user's boards" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      expect(Flusher).to receive(:flush_board).with(b1.global_id, b1.key, true)
      expect(Flusher).to receive(:flush_board).with(b2.global_id, b2.key, true)
      expect(Flusher).to receive(:flush_board).with(b3.global_id, b3.key, true)
      Flusher.flush_user_boards(u.global_id, u.user_name)
    end
  end

  describe "flush_user_content" do
    it "should flush all user-related content" do
      u = User.create
      d = Device.create(user: u)
      o = []
      17.times do |i|
        obj = {}
        o << obj
        expect(Flusher).to receive(:flush_record).with(obj).and_return(true)
      end
      expect(Device).to receive(:where).with(:user_id => u.id).and_return([d, o[0], o[1]])
      expect(Utterance).to receive(:where).with(:user_id => u.id).and_return([o[2]])
      expect(NfcTag).to receive(:where).with(:user_id => u.id).and_return([o[3], o[4]])
      expect(UserIntegration).to receive(:where).with(:user_id => u.id).and_return([o[5]])
      expect(UserGoal).to receive(:where).with(:user_id => u.id).and_return([o[6], o[7], o[8]])
      expect(UserBadge).to receive(:where).with(:user_id => u.id).and_return([o[9]])
      expect(Webhook).to receive(:where).with(:user_id => u.id).and_return([o[10], o[11]])
      expect(UserBoardConnection).to receive(:where).with(:user_id => u.id).and_return([o[12]])
      expect(UserLink).to receive(:where).with(:user_id => u.id).and_return([o[13]])
      expect(ButtonSound).to receive(:where).with(:user_id => u.id).and_return([o[14]])
      expect(UserVideo).to receive(:where).with(:user_id => u.id).and_return([o[15]])
      expect(LogSnapshot).to receive(:where).with(:user_id => u.id).and_return([o[16]])
      Flusher.flush_user_content(u.global_id, u.user_name, d)
    end

    it "should flush off-board ButtonSound and UserVideo records and schedule S3 removal" do
      u = User.create
      u2 = User.create
      # Uploads-bucket HTTPS URLs matching Uploader.remote_remove's guard after
      # the bucket prefix is stripped: /\w+\/.+\/\w+-\w+(\.\w+)?$/ (or /^extras/).
      # Extension is optional; the pattern is end-anchored. example.com URLs
      # would raise the "scary delete" guard if the stub were removed, so they
      # mask regressions.
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      sound_url = "https://#{uploads_bucket}.s3.amazonaws.com/sounds/abc123/voice-rec.mp3"
      video_url = "https://#{uploads_bucket}.s3.amazonaws.com/videos/abc123/clip-vid.mp4"
      other_sound_url = "https://#{uploads_bucket}.s3.amazonaws.com/sounds/def456/other-rec.mp3"
      other_video_url = "https://#{uploads_bucket}.s3.amazonaws.com/videos/def456/other-vid.mp4"
      # Off-board / message-bank recording (no BoardButtonSound)
      sound = ButtonSound.create(user: u, removable: true, url: sound_url)
      video = UserVideo.create(user: u, url: video_url)
      other_sound = ButtonSound.create(user: u2, removable: true, url: other_sound_url)
      other_video = UserVideo.create(user: u2, url: other_video_url)

      expect(Uploader).to receive(:remote_remove).with(sound_url)
      expect(Uploader).to receive(:remote_remove).with(video_url)
      expect(Uploader).not_to receive(:remote_remove).with(other_sound_url)
      expect(Uploader).not_to receive(:remote_remove).with(other_video_url)

      Flusher.flush_user_content(u.global_id, u.user_name)
      Worker.process_queues

      expect(ButtonSound.where(id: sound.id).count).to eq(0)
      expect(UserVideo.where(id: video.id).count).to eq(0)
      expect(ButtonSound.where(id: other_sound.id).count).to eq(1)
      expect(UserVideo.where(id: other_video.id).count).to eq(1)
    end

    it "should schedule S3 removal of derivative media objects (secondary_output, prior_full_filenames) through the real Flusher.flush_user_content path" do
      # Exercises MediaObject#remove_derivative_remote_data via the actual
      # production caller (ButtonSound.where(user_id:).each { flush_record }
      # in lib/flusher.rb) and a freshly-DB-loaded record, not a direct
      # in-memory .destroy on the object returned by .create -- the two
      # differ in whether settings has already been decrypted/memoized
      # (spec/models/concerns/media_object_spec.rb covers the .destroy path
      # directly; this covers the sweep that actually calls it in production).
      u = User.create
      secondary_key = 'sounds/1/2/3/1_5-secondaryabc1723500000.wav'
      prior_key = 'sounds/1/2/3/1_5-priorabc.m4a'
      sound = ButtonSound.create(user: u, settings: {
        'content_type' => 'audio/mp3',
        'full_filename' => 'sounds/1/2/3/1_5-currentflush.mp3',
        'secondary_output' => {'filename' => secondary_key, 'content_type' => 'audio/wav'},
        'prior_full_filenames' => [prior_key]
      }, url: 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/1_5-currentflush.mp3')

      expect(Uploader).to receive(:remote_remove).with(secondary_key)
      expect(Uploader).to receive(:remote_remove).with(prior_key)

      Flusher.flush_user_content(u.global_id, u.user_name)
      Worker.process_queues

      expect(ButtonSound.where(id: sound.id).count).to eq(0)
    end

    it "should flush LogSnapshot records for the user without touching other users" do
      u = User.create
      u2 = User.create
      snap = LogSnapshot.create(user: u, settings: {'name' => 'Week of May'})
      other = LogSnapshot.create(user: u2, settings: {'name' => 'Keep me'})

      Flusher.flush_user_content(u.global_id, u.user_name)

      expect(LogSnapshot.where(id: snap.id).count).to eq(0)
      expect(LogSnapshot.where(id: other.id).count).to eq(1)
    end
  end

  describe "transfer_user_content" do
    it "should rename boards" do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u1)
      expect(Board).to receive(:where).with(:user_id => u1.id).and_return([b])
      expect(b).to receive(:rename_to).with("#{u2.user_name}/unnamed-board")
      Flusher.transfer_user_content(u1.global_id, u1.user_name, u2.global_id, u2.user_name)
      expect(b.reload.user).to eq(u2)
    end

    it "should update user_id on other records" do
      u1 = User.create
      u2 = User.create
      ref = {}
      expect(ref).to receive(:update_all).with(user_id: u2.id).and_return(1).exactly(11).times
      expect(NfcTag).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(UserIntegration).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(UserGoal).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(UserBadge).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(Webhook).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(UserBoardConnection).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(UserLink).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(ButtonSound).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(ButtonImage).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(UserVideo).to receive(:where).with(:user_id => u1.id).and_return(ref)
      expect(License).to receive(:where).with(:user_id => u1.id).and_return(ref)
      Flusher.transfer_user_content(u1.global_id, u1.user_name, u2.global_id, u2.user_name)
    end

    it "should transfer license seats so they are not orphaned on merge" do
      u1 = User.create
      u2 = User.create
      o = Organization.create
      l = License.create!(organization: o, user: u1, seat_type: 'student', status: 'active')
      Flusher.transfer_user_content(u1.global_id, u1.user_name, u2.global_id, u2.user_name)
      expect(l.reload.user_id).to eq(u2.id)
    end
  end
  
  describe "flush_user_completely" do
    it "should call find_user" do
      u = User.create
      expect(Flusher).to receive(:find_user).with(u.global_id, u.user_name).at_least(3).times.and_return(u)
      Flusher.flush_user_completely(u.global_id, u.user_name)
    end
    
    it "should call flush_user_logs" do
      u = User.create
      expect(Flusher).to receive(:flush_user_logs).with(u.global_id, u.user_name)
      Flusher.flush_user_completely(u.global_id, u.user_name)
    end
    
    it "should call flush_user_boards" do
      u = User.create
      expect(Flusher).to receive(:flush_user_boards).with(u.global_id, u.user_name)
      Flusher.flush_user_completely(u.global_id, u.user_name)
    end
    
    it "should remove the user's devices, including any versions" do
      u = User.create
      d = Device.create(:user => u)
      Flusher.flush_user_completely(u.global_id, u.user_name)
      expect(Device.where(:user_id => u.id).count).to eq(0)
    end
    
    it "should remove the user's utterances, including any versions" do
      u = User.create
      ut = Utterance.create(:user => u)
      Flusher.flush_user_completely(u.global_id, u.user_name)
      expect(Utterance.where(:user_id => u.id).count).to eq(0)
    end
    
    it 'should flush user tags' do
      u = User.create
      NfcTag.create(user: u)
      expect(NfcTag.count).to eq(1)
      Flusher.flush_user_completely(u.global_id, u.user_name)
      expect(NfcTag.count).to eq(0)
    end
    
    it "should remove any public comments by the user"
    
    it "should remove identity from any log notes recorded on other users by the user" do
      u = User.create
      u2 = User.create
      d = Device.create(:user => u)
      LogSession.create(:user => u, :author => u2, :device => d)
      expect(LogSession.where(:author_id => u2.id).count).to eq(1)
      expect(LogSession.where(:user_id => u.id).count).to eq(1)

      Flusher.flush_user_completely(u2.global_id, u2.user_name)
      expect(LogSession.where(:author_id => u2.id).count).to eq(0)
      expect(LogSession.where(:user_id => u.id).count).to eq(1)
    end
    
    it "should call flush_record for the user" do
      u = User.create
      expect(Flusher).to receive(:flush_record).with(u, u.id, u.class.to_s)
      Flusher.flush_user_completely(u.global_id, u.user_name)
    end

    it "should log an audit event recording the permanent destruction" do
      u = User.create
      gid = u.global_id
      AuditEvent.delete_all
      Flusher.flush_user_completely(u.global_id, u.user_name)
      ev = AuditEvent.all.to_a.find { |e| e.data['type'] == 'user_permanently_destroyed' }
      expect(ev).to_not eq(nil)
      expect(ev.user_key).to eq('system')
      expect(ev.data['user_id']).to eq(gid)
    end
  end

  describe "flush_deleted_users" do
    it "should flush deleted users" do
      u = User.create
      u2 = User.create(:schedule_deletion_at => 6.hours.ago)
      u3 = User.create(:schedule_deletion_at => 6.hours.from_now)
      Flusher.flush_deleted_users
      expect(Worker.scheduled?(Flusher, :flush_user_completely, u.global_id, u.user_name)).to eq(false)
      expect(Worker.scheduled?(Flusher, :flush_user_completely, u2.global_id, u2.user_name)).to eq(true)
      expect(Worker.scheduled?(Flusher, :flush_user_completely, u3.global_id, u3.user_name)).to eq(false)
    end
  end

  describe "flush_leftovers" do
    it "should not error when there is nothing to flush" do
      expect { Flusher.flush_leftovers }.to_not raise_error
    end

    it "should never destroy button_images -- board_button_images no longer reflects live usage" do
      # Regression guard: Board#map_images stopped calling BoardButtonImage.connect
      # for images (board.rb), so an actively-used image now has zero
      # board_button_images rows -- the same state a genuinely orphaned image would
      # be in. flush_leftovers must not use that join table as an orphan signal for
      # images (it still can for sounds, whose connect/disconnect stayed active).
      # This reproduces real usage via process_buttons + grid_buttons, not a manual
      # BoardButtonImage.connect call, so it actually exercises the live code path.
      u = User.create
      old_in_use = ButtonImage.create(user: u, removable: true)
      old_in_use.update_column(:created_at, 8.days.ago)
      b = Board.create!(user: u)
      b.process_buttons([{ 'id' => '1', 'label' => 'hat', 'image_id' => old_in_use.global_id }], u)
      b.save
      expect(BoardButtonImage.where(button_image_id: old_in_use.id).count).to eq(0)
      Flusher.flush_leftovers
      expect(ButtonImage.where(id: old_in_use.id).count).to eq(1)

      old_orphan = ButtonImage.create(user: u, removable: true)
      old_orphan.update_column(:created_at, 8.days.ago)
      recent = ButtonImage.create(user: u, removable: true)
      Flusher.flush_leftovers
      expect(ButtonImage.where(id: old_orphan.id).count).to eq(1)
      expect(ButtonImage.where(id: recent.id).count).to eq(1)
    end

    it "should never destroy button_sounds -- board_button_sounds sync can be deferred to an async job" do
      # Regression guard: BoardButtonSound.connect/disconnect are still called (unlike
      # images), but Board#map_images can defer that resync via @map_later to a real
      # Resque job (Board#swap_images, the batch public/privacy toggle). During that
      # window a sound already referenced by a board's grid_buttons can have zero
      # board_button_sounds rows, so a join-table-only orphan check has a live-data-
      # deletion race (the same underlying flaw as the button_images case above).
      # flush_leftovers must not delete button_sounds via that signal at all.
      u = User.create
      old_in_use = ButtonSound.create(user: u, removable: true)
      old_in_use.update_column(:created_at, 8.days.ago)
      b = Board.create!(user: u)
      b.process_buttons([{ 'id' => '1', 'label' => 'moo', 'sound_id' => old_in_use.global_id }], u)
      # Reproduce the real @map_later deferral (Board#swap_images / the batch
      # public-privacy toggle set this instance variable before saving) so
      # map_images defers to an async job instead of syncing board_button_sounds
      # synchronously -- the exact window the join-table check would be blind to.
      b.instance_variable_set('@map_later', true)
      b.save
      expect(BoardButtonSound.where(button_sound_id: old_in_use.id).count).to eq(0)
      Flusher.flush_leftovers
      expect(ButtonSound.where(id: old_in_use.id).count).to eq(1)

      old_orphan = ButtonSound.create(user: u, removable: true)
      old_orphan.update_column(:created_at, 8.days.ago)
      recent = ButtonSound.create(user: u, removable: true)
      Flusher.flush_leftovers
      expect(ButtonSound.where(id: old_orphan.id).count).to eq(1)
      expect(ButtonSound.where(id: recent.id).count).to eq(1)
    end

    it "should remove a board_button_image left dangling by a hard-deleted button_image" do
      u = User.create
      b = Board.create(user: u)
      i = ButtonImage.create(user: u)
      bbi = BoardButtonImage.create!(board_id: b.id, button_image_id: i.id)
      i.delete
      Flusher.flush_leftovers
      expect(BoardButtonImage.where(id: bbi.id).count).to eq(0)
    end

    it "should remove a board_button_image left dangling by a hard-deleted board" do
      u = User.create
      b = Board.create(user: u)
      i = ButtonImage.create(user: u)
      bbi = BoardButtonImage.create!(board_id: b.id, button_image_id: i.id)
      b.delete
      Flusher.flush_leftovers
      expect(BoardButtonImage.where(id: bbi.id).count).to eq(0)
    end

    it "should not remove a board_button_image with a live board and button_image" do
      u = User.create
      b = Board.create(user: u)
      i = ButtonImage.create(user: u)
      bbi = BoardButtonImage.create!(board_id: b.id, button_image_id: i.id)
      Flusher.flush_leftovers
      expect(BoardButtonImage.where(id: bbi.id).count).to eq(1)
    end

    it "should remove a board_button_sound left dangling by a hard-deleted button_sound" do
      u = User.create
      b = Board.create(user: u)
      s = ButtonSound.create(user: u)
      bbs = BoardButtonSound.create!(board_id: b.id, button_sound_id: s.id)
      s.delete
      Flusher.flush_leftovers
      expect(BoardButtonSound.where(id: bbs.id).count).to eq(0)
    end

    it "should not remove a board_button_sound with a live board and button_sound" do
      u = User.create
      b = Board.create(user: u)
      s = ButtonSound.create(user: u)
      bbs = BoardButtonSound.create!(board_id: b.id, button_sound_id: s.id)
      Flusher.flush_leftovers
      expect(BoardButtonSound.where(id: bbs.id).count).to eq(1)
    end

    it "should remove a log_session_board left dangling by a hard-deleted log_session" do
      u = User.create
      d = Device.create(:user => u)
      b = Board.create(user: u)
      s = LogSession.create!(user: u, author: u, device: d)
      lsb = LogSessionBoard.create!(log_session_id: s.id, board_id: b.id)
      s.delete
      Flusher.flush_leftovers
      expect(LogSessionBoard.where(id: lsb.id).count).to eq(0)
    end

    it "should not remove a log_session_board with a live session and board" do
      u = User.create
      d = Device.create(:user => u)
      b = Board.create(user: u)
      s = LogSession.create!(user: u, author: u, device: d)
      lsb = LogSessionBoard.create!(log_session_id: s.id, board_id: b.id)
      Flusher.flush_leftovers
      expect(LogSessionBoard.where(id: lsb.id).count).to eq(1)
    end

    it "should not touch developer keys -- there is no expiration concept for them (LL-991d259b2a)" do
      key = DeveloperKey.create!
      Flusher.flush_leftovers
      expect(DeveloperKey.where(id: key.id).count).to eq(1)
    end

    it "should destroy progress records more than a month old" do
      old = Progress.create!
      old.update_column(:created_at, 40.days.ago)
      recent = Progress.create!
      Flusher.flush_leftovers
      expect(Progress.where(id: old.id).count).to eq(0)
      expect(Progress.where(id: recent.id).count).to eq(1)
    end

    it "should remove a user_board_connection left dangling by a hard-deleted user" do
      u = User.create
      b = Board.create(user: u)
      ubc = UserBoardConnection.create!(user_id: u.id, board_id: b.id)
      u.delete
      Flusher.flush_leftovers
      expect(UserBoardConnection.where(id: ubc.id).count).to eq(0)
    end

    it "should not remove a user_board_connection with a live user and board" do
      u = User.create
      b = Board.create(user: u)
      ubc = UserBoardConnection.create!(user_id: u.id, board_id: b.id)
      Flusher.flush_leftovers
      expect(UserBoardConnection.where(id: ubc.id).count).to eq(1)
    end

    it "should report but not delete paper trail versions whose item_type no longer maps to any class" do
      # PaperTrail::Version has a real polymorphic belongs_to :item, so .create!
      # would itself raise NameError trying to resolve a bogus item_type (the gem's
      # version_limit callback loads .item). Insert directly to simulate a version
      # row left behind from a since-renamed/removed model, bypassing that check --
      # the same way it would have been possible historically, before the rename.
      #
      # Per DATA_RETENTION.md:30, these rows require 6-year retention + cold-storage
      # archival, not deletion -- an unconstantizable item_type only proves the code
      # was renamed, not that the audit evidence is disposable. flush_leftovers must
      # only report/count these, never delete them (see LL-991d259b2a follow-up).
      PaperTrail::Version.insert!({ item_type: 'LegacyWidgetThatNoLongerExists', item_id: 12345, event: 'destroy', created_at: Time.now })
      Flusher.flush_leftovers
      expect(PaperTrail::Version.where(item_type: 'LegacyWidgetThatNoLongerExists').count).to eq(1)
      ev = AuditEvent.where(event_type: 'retention_flush').order('id DESC').first
      expect(ev.data['versions_stale_type_detected_not_deleted']).to eq(1)
    end

    it "should treat an item_type that resolves to a non-model Ruby constant as stale, not as a live model" do
      # safe_constantize succeeds for ANY resolvable constant, not just ActiveRecord
      # models -- 'File' resolves to the built-in File class. A truthy-only check
      # would wrongly treat that as "still a real model" and skip counting it.
      PaperTrail::Version.insert!({ item_type: 'File', item_id: 12345, event: 'destroy', created_at: Time.now })
      Flusher.flush_leftovers
      expect(PaperTrail::Version.where(item_type: 'File').count).to eq(1)
      ev = AuditEvent.where(event_type: 'retention_flush').order('id DESC').first
      expect(ev.data['versions_stale_type_detected_not_deleted']).to eq(1)
    end

    it "should not remove paper trail versions for a real model class, even for a destroyed record (audit trail preservation)", :versioning => true do
      PaperTrail.request.whodunnit = 'user:jane'
      u = User.create
      u.user_name = 'renamed'
      u.save
      u.reload
      version_ids = u.versions.pluck(:id)
      expect(version_ids).to_not be_empty
      u.destroy
      Flusher.flush_leftovers
      expect(PaperTrail::Version.where(id: version_ids).count).to eq(version_ids.length)
    end

    it "should log a retention_flush AuditEvent with per-category counts" do
      old = Progress.create!
      old.update_column(:created_at, 40.days.ago)
      Flusher.flush_leftovers
      ev = AuditEvent.where(event_type: 'retention_flush').order('id DESC').first
      expect(ev).to_not eq(nil)
      expect(ev.user_key).to eq('system')
      expect(ev.data['progresses']).to eq(1)
    end
  end
end
