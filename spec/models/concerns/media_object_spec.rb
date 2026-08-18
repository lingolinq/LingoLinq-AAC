require 'spec_helper'

describe MediaObject, :type => :model do
  let(:u) { User.create }
  describe "update_media_object" do
    it "should update the record if the filename has changed" do
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'sounds/1/2/3/4/5/6/a-b.wav', 'transcoding_keys' => ['qwert']})
      # expect(Uploader).to receive(:remote_remove).with('sounds/1/2/3/4/5/6/a-b.wav')
      res = bs.update_media_object({
        'filename' => 'sounds/1/2/3/4/5/6/a-b.mp3',
        'content_type' => 'a/b',
        'duration' => '123',
        'thumbnail_filename' => 'a/b/c.jpg'
      })
      expect(res).to eq(false)

      res = bs.update_media_object({
        'filename' => 'sounds/1/2/3/4/5/6/a-b.mp3',
        'content_type' => 'a/b',
        'duration' => '123',
        'thumbnail_filename' => 'a/b/c.jpg',
        'transcoding_key' => 'qwert'
      })
      expect(res).to eq(true)
      expect(bs.settings['full_filename']).to eq('sounds/1/2/3/4/5/6/a-b.mp3')
      expect(bs.settings['content_type']).to eq('a/b')
      expect(bs.settings['duration']).to eq(123)
      expect(bs.settings['thumbnail_filename']).to eq('a/b/c.jpg')
    end
    
    it "should return false if nothing has changed" do
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'sounds/1/2/3/4/5/6/a-b.wav'})
      expect(Uploader).to_not receive(:remote_remove)
      res = bs.update_media_object({'filename' => 'sounds/1/2/3/4/5/6/a-b.wav'})
      expect(res).to eq(false)
    end

    it "should preserve a superseded thumbnail_filename's STEM (not just one key) and secondary_output in prior state" do
      # An overlapping/stalled transcode job that completes after a
      # replacement was already scheduled (ButtonSound.schedule_missing_transcodings
      # runs daily) would otherwise overwrite thumbnail_filename and
      # secondary_output with no record of the outgoing value -- the same
      # orphan risk full_filename is already guarded against a few lines
      # above in this method. The outgoing thumbnail is preserved as a STEM
      # (prior_thumbnail_stems), not folded into prior_full_filenames as a
      # single key: it may itself have been a multi-object family.
      old_thumb = 'videos/1/2/3/1_5-oldv1723400000.mp4.00001.png'
      old_stem = 'videos/1/2/3/1_5-oldv1723400000.mp4'
      old_secondary = 'sounds/1/2/3/1_5-oldv1723400000.wav'
      v = UserVideo.create(:user => u, :settings => {
        'full_filename' => 'videos/1/2/3/1_5-oldv1723400000.mp4',
        'thumbnail_filename' => old_thumb,
        'secondary_output' => {'filename' => old_secondary, 'content_type' => 'audio/wav'},
        'transcoding_keys' => ['qwert']
      })
      res = v.update_media_object({
        'filename' => 'videos/1/2/3/1_5-newv1723500000.mp4',
        'content_type' => 'video/mp4',
        'transcoding_key' => 'qwert',
        'thumbnail_filename' => 'videos/1/2/3/1_5-newv1723500000.mp4.00001.png',
        'secondary_output' => {'filename' => 'sounds/1/2/3/1_5-newv1723500000.wav'}
      })
      expect(res).to eq(true)
      expect(v.settings['thumbnail_filename']).to eq('videos/1/2/3/1_5-newv1723500000.mp4.00001.png')
      expect(v.settings['secondary_output']['filename']).to eq('sounds/1/2/3/1_5-newv1723500000.wav')
      expect(v.settings['prior_thumbnail_stems']).to eq([old_stem])
      expect(v.settings['prior_full_filenames']).to include(old_secondary)
      expect(v.settings['prior_full_filenames']).to_not include(old_thumb)
    end

    it "should fall back to preserving the raw value in prior_full_filenames when the outgoing thumbnail_filename doesn't match the expected stem shape" do
      malformed = 'not-a-recognizable-thumbnail-shape'
      v = UserVideo.create(:user => u, :settings => {
        'full_filename' => 'videos/1/2/3/1_5-oldv1723400000.mp4',
        'thumbnail_filename' => malformed,
        'transcoding_keys' => ['qwert']
      })
      v.update_media_object({
        'filename' => 'videos/1/2/3/1_5-newv1723500000.mp4',
        'content_type' => 'video/mp4',
        'transcoding_key' => 'qwert',
        'thumbnail_filename' => 'videos/1/2/3/1_5-newv1723500000.mp4.00001.png'
      })
      expect(v.settings['prior_thumbnail_stems'].to_a).to eq([])
      expect(v.settings['prior_full_filenames']).to include(malformed)
    end
  end
  
  describe "media_object_error" do
    it "should append error messages" do
      bs = ButtonSound.create(:user => u)
      bs.media_object_error('asdf')
      expect(bs.reload.settings['media_object_errors']).to eq(['asdf'])
      bs.media_object_error({a: 1})
      expect(bs.reload.settings['media_object_errors']).to eq(['asdf', {'a' =>  1}])
    end
  end
  
  describe "schedule_transcoding" do
    it "should do nothing if transcoding already attempted" do
      bs = ButtonSound.create(:user => u, :settings => {'transcoding_attempted' => true})
      expect(Worker).to_not receive(:schedule)
      bs.schedule_transcoding
    end
    
    it "should do nothing if no filename defined" do
      bs = ButtonSound.create(:user => u, :settings => {})
      expect(Worker).to_not receive(:schedule)
      bs.schedule_transcoding
    end
    
    it "should schedule transcoding only the first save after a filename is created" do
      expect(GoSecure).to receive(:nonce).and_return('chicken').at_least(1).times
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c'})
      action = Worker.scheduled_actions.detect { |a| a['args'][0..2] == ['Transcoder', 'convert_audio', bs.global_id] }
      expect(action).to_not eq(nil)
      prefix = action['args'][3]
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, prefix, 'chicken')).to eq(true)

      Worker.flush_queues
      bs.settings['full_filename'] = 'c/d/e'
      expect(Worker).to_not receive(:schedule)
      bs.schedule_transcoding
      bs.schedule_transcoding
    end
    
    it "should re-transcode if already attempted but force=true" do
      expect(GoSecure).to receive(:nonce).and_return('chicken').at_least(1).times
      bs = ButtonSound.create(:user => u, :settings => {'full_filename' => 'a/b/c'})
      action = Worker.scheduled_actions.detect { |a| a['args'][0..2] == ['Transcoder', 'convert_audio', bs.global_id] }
      expect(action).to_not eq(nil)
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, action['args'][3], 'chicken')).to eq(true)

      Worker.flush_queues
      bs.schedule_transcoding(true)
      action = Worker.scheduled_actions.detect { |a| a['args'][0..2] == ['Transcoder', 'convert_audio', bs.global_id] }
      expect(action).to_not eq(nil)
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, action['args'][3], 'chicken')).to eq(true)
    end
  end

  describe "remove_derivative_remote_data" do
    it "should do nothing when there are no derivative objects" do
      s = ButtonSound.create(:user => u, :settings => {})
      expect(Uploader).to_not receive(:remote_remove)
      s.destroy
      Worker.process_queues
    end

    it "should schedule removal of a pending (not-yet-transcribed) secondary_output" do
      key = 'sounds/1/2/3/pending-key1723500000.wav'
      # full_filename + a non-matching-bucket url are pre-set so
      # schedule_transcription's incidental call to the full_filename
      # accessor (via secondary_url -> remote_upload_params) doesn't memoize
      # a fresh, untracked value and trip the abandoned-upload check below,
      # and so the url doesn't also satisfy Uploader.removable_remote_url?
      # and pull in Uploadable's own primary-url sibling hook.
      s = ButtonSound.create(:user => u, :settings => {
        'content_type' => 'audio/mp3',
        'full_filename' => 'sounds/1/2/3/1_5-currentpending.mp3',
        'secondary_output' => {'filename' => key, 'content_type' => 'audio/wav'}
      }, :url => 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/1_5-currentpending.mp3')
      expect(Uploader).to receive(:remote_remove).with(key)
      s.destroy
      Worker.process_queues
      expect(ButtonSound.where(id: s.id).count).to eq(0)
    end

    it "should schedule removal of a secondary_output left behind by an org-gated transcription" do
      key = 'sounds/1/2/3/gated-key1723500000.wav'
      o = Organization.create(settings: {'total_licenses' => 1, 'external_ai_processing' => false})
      gated_user = User.create
      o.add_user(gated_user.user_name, false, true)
      gated_user.reload
      s = ButtonSound.create(:user => gated_user, :settings => {
        'content_type' => 'audio/mp3',
        'full_filename' => 'sounds/1/2/3/1_5-currentgated.mp3',
        'secondary_output' => {'filename' => key, 'content_type' => 'audio/wav'}
      }, :url => 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/1_5-currentgated.mp3')
      # Confirms the fixture actually represents the gated state: schedule_transcription
      # skips Google and leaves secondary_output in place, matching production
      # behavior where a gated-off org never clears it on its own.
      expect(Organization).to receive(:log_external_ai_processing_skip).with(gated_user, 'transcription')
      s.schedule_transcription(true)
      expect(s.settings['secondary_output']).to_not eq(nil)

      expect(Uploader).to receive(:remote_remove).with(key)
      s.destroy
      Worker.process_queues
      expect(ButtonSound.where(id: s.id).count).to eq(0)
      # ButtonSound.create above fired the real (unmocked) after_save ->
      # schedule_transcription once, which wrote a real AuditEvent via
      # Organization.log_external_ai_processing_skip; AuditEvent commits
      # outside the RSpec transaction, so clean it up explicitly here.
      AuditEvent.delete_all
    end

    it "should schedule removal of a secondary_output left behind by a permanently failed transcription" do
      key = 'sounds/1/2/3/failed-key1723500000.wav'
      s = ButtonSound.create(:user => u, :settings => {
        'content_type' => 'audio/mp3',
        'full_filename' => 'sounds/1/2/3/1_5-currentfailed.mp3',
        'secondary_output' => {'filename' => key, 'content_type' => 'audio/wav'},
        'transcription_errors' => 2
      }, :url => 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/1_5-currentfailed.mp3')
      expect(Uploader).to receive(:remote_remove).with(key)
      s.destroy
      Worker.process_queues
      expect(ButtonSound.where(id: s.id).count).to eq(0)
    end

    it "should schedule removal of every prior_full_filenames entry left by repeated transcodes" do
      # url is set and matches full_filename, representing the normal
      # completed-upload case; this must NOT also trigger the
      # abandoned-upload full_filename sweep below (that's a separate test).
      s = ButtonSound.create(:user => u, :settings => {
        'full_filename' => 'sounds/1/2/3/current-key.mp3',
        'prior_full_filenames' => ['sounds/1/2/3/orig-upload-key.m4a', 'sounds/1/2/3/first-transcode-key.mp3']
      }, :url => 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/current-key.mp3')
      expect(Uploader).to receive(:remote_remove).with('sounds/1/2/3/orig-upload-key.m4a')
      expect(Uploader).to receive(:remote_remove).with('sounds/1/2/3/first-transcode-key.mp3')
      s.destroy
      Worker.process_queues
      expect(ButtonSound.where(id: s.id).count).to eq(0)
    end

    it "should schedule removal of an abandoned upload's full_filename when url was never finalized" do
      # Mirrors app/controllers/concerns/remote_uploader.rb: the client
      # requests upload params (persisting full_filename) before it ever PUTs
      # to S3, and self.url is only set later by the /upload_success
      # confirmation callback. url absent here means that confirmation never
      # arrived, even though a real object may exist in S3 under this key.
      key = 'sounds/1/2/3/1_5-abandoned1723500000.m4a'
      s = ButtonSound.create(:user => u, :settings => {'full_filename' => key})
      expect(Uploader).to receive(:remote_remove).with(key)
      s.destroy
      Worker.process_queues
      expect(ButtonSound.where(id: s.id).count).to eq(0)
    end

    it "should NOT schedule removal of full_filename when it is the record's current, already-covered object" do
      # Uploadable's own after_destroy (schedule_remote_removal_if_unique)
      # already handles this case via self.url; scheduling it again here
      # would be redundant (and, if a future change ever adds a checksum,
      # could race with that cleanup).
      key = 'sounds/1/2/3/1_5-completed1723500000.m4a'
      s = ButtonSound.create(:user => u, :settings => {'full_filename' => key},
        :url => "https://example-uploads.s3.amazonaws.com/#{key}")
      expect(Uploader).to_not receive(:remote_remove).with(key)
      s.destroy
      Worker.process_queues
      expect(ButtonSound.where(id: s.id).count).to eq(0)
    end

    it "should let a real Uploader.remote_remove call pass the scary-delete guard for an abandoned-upload full_filename key" do
      key = 'sounds/1/2/3/1_5-abandoned1723500000.m4a'
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      s = ButtonSound.create(:user => u, :settings => {'full_filename' => key})
      stub_real_s3_removal(key, bucket)
      s.destroy
      Worker.process_queues
    end

    it "should schedule a thumbnail-family lookup for a UserVideo's thumbnail stem, not a single guessed key" do
      # Neither the real count nor the real image format is knowable from
      # stored metadata alone, so this schedules a lookup (by record-owned
      # stem) rather than a single Uploader.remote_remove(key) call.
      key = 'videos/1/2/3/clip-keyv1723500000.mp4.00001.png'
      stem = 'videos/1/2/3/clip-keyv1723500000.mp4'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => key})
      expect(Worker).to receive(:schedule).with(Uploader, :remote_remove_thumbnail_family, stem, 'UserVideo', v.global_id)
      v.destroy
    end

    it "should recover the thumbnail stem from a legacy '.0000.png' thumbnail_filename" do
      # UserVideo rows transcoded before the digit-count fix shipped got
      # thumbnail_filename hardcoded as "<video_key>.0000.png"
      # (lib/transcoder.rb's old literal suffix). That value was never a real
      # S3 object; only the stem before it is trustworthy, and the family
      # lookup below discovers whatever AWS actually created.
      legacy_key = 'videos/1/2/3/1_5-legacyv1723500000.mp4.0000.png'
      stem = 'videos/1/2/3/1_5-legacyv1723500000.mp4'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => legacy_key})
      expect(Worker).to receive(:schedule).with(Uploader, :remote_remove_thumbnail_family, stem, 'UserVideo', v.global_id)
      v.destroy
    end

    it "should schedule a family sweep for BOTH the current thumbnail stem and a superseded one from an overlapping transcode" do
      current_key = 'videos/1/2/3/1_5-currentv1723500000.mp4.00001.png'
      current_stem = 'videos/1/2/3/1_5-currentv1723500000.mp4'
      prior_stem = 'videos/1/2/3/1_5-oldv1723400000.mp4'
      v = UserVideo.create(:user => u, :settings => {
        'thumbnail_filename' => current_key,
        'prior_thumbnail_stems' => [prior_stem]
      })
      scheduled_stems = []
      allow(Worker).to receive(:schedule) do |klass, method, *args|
        scheduled_stems << args[0] if method == :remote_remove_thumbnail_family
      end
      v.destroy
      expect(scheduled_stems).to match_array([current_stem, prior_stem])
    end

    # The next tests let the REAL Uploader.remote_remove run (stubbing only the
    # Aws::S3::Client boundary, matching spec/lib/uploader_spec.rb's pattern)
    # instead of stubbing remote_remove itself, so the "scary delete" guard
    # regex actually executes against production-shaped keys. secondary_output
    # and prior_full_filenames keys are single-extension and pass the generic
    # rule cleanly; thumbnail_filename passes via the narrow, named
    # Uploader.elastic_transcoder_thumbnail_key? exception (lib/uploader.rb)
    # added specifically for AWS's two-extension-segment thumbnail shape,
    # rather than a broad widening of the shared guard.
    def stub_real_s3_removal(key, bucket)
      s3_client = instance_double(Aws::S3::Client)
      allow(Aws::S3::Client).to receive(:new).and_return(s3_client)
      allow(Uploader).to receive(:remote_upload_config).and_return({
        access_key: 'test_key', secret: 'test_secret', bucket_name: bucket, static_bucket_name: 'spec-static'
      })
      expect(s3_client).to receive(:head_object).with(bucket: bucket, key: key).and_return(Aws::S3::Types::HeadObjectOutput.new)
      expect(s3_client).to receive(:delete_object).with(bucket: bucket, key: key).and_return(true)
    end

    it "should let a real Uploader.remote_remove call pass the scary-delete guard for a secondary_output key" do
      key = 'sounds/1/2/3/1_5-abcdef1723500000.wav'
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      current_key = 'sounds/1/2/3/1_5-currentrealguard.mp3'
      s = ButtonSound.create(:user => u, :settings => {
        'content_type' => 'audio/mp3',
        'full_filename' => current_key,
        'secondary_output' => {'filename' => key, 'content_type' => 'audio/wav'}
      }, :url => "https://example-uploads.s3.amazonaws.com/#{current_key}")
      stub_real_s3_removal(key, bucket)
      s.destroy
      Worker.process_queues
    end

    it "should let a real Uploader.remote_remove call pass the scary-delete guard for a prior_full_filenames key" do
      key = 'sounds/1/2/3/1_5-abcdef.m4a'
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      current_key = 'sounds/1/2/3/1_5-abcdefv1723500000.mp3'
      # Non-matching-bucket url: this test targets ONLY the prior_full_filenames
      # key. A url on the real configured bucket would also satisfy
      # Uploader.removable_remote_url? and pull in Uploadable's own primary-url
      # sibling hook, which stub_real_s3_removal's single-key expectations
      # aren't set up to receive.
      s = ButtonSound.create(:user => u, :settings => {
        'full_filename' => current_key,
        'prior_full_filenames' => [key]
      }, :url => "https://example-uploads.s3.amazonaws.com/#{current_key}")
      stub_real_s3_removal(key, bucket)
      s.destroy
      Worker.process_queues
    end

    # The thumbnail family: neither the real thumbnail count nor its image
    # format (jpg vs png) is knowable from stored metadata alone, so instead
    # of guessing a single key, the destroy-time worker lists the record's
    # own bounded S3 prefix (never a broader directory) and strictly
    # re-filters the response against the real AWS thumbnail grammar before
    # scheduling any delete. Stubs Aws::S3::Client's list_objects_v2 in
    # addition to head_object/delete_object, so both the listing boundary
    # AND the per-key "scary delete" guard actually execute.
    def stub_thumbnail_family_removal(prefix, listed_keys, deleted_keys, bucket)
      s3_client = instance_double(Aws::S3::Client)
      allow(Aws::S3::Client).to receive(:new).and_return(s3_client)
      allow(Uploader).to receive(:remote_upload_config).and_return({
        access_key: 'test_key', secret: 'test_secret', bucket_name: bucket, static_bucket_name: 'spec-static'
      })
      expect(s3_client).to receive(:list_objects_v2).with(bucket: bucket, prefix: prefix, max_keys: 1000, continuation_token: nil).and_return(
        Aws::S3::Types::ListObjectsV2Output.new(contents: listed_keys.map { |k| Aws::S3::Types::Object.new(key: k) })
      )
      deleted_keys.each do |key|
        expect(s3_client).to receive(:head_object).with(bucket: bucket, key: key).and_return(Aws::S3::Types::HeadObjectOutput.new)
        expect(s3_client).to receive(:delete_object).with(bucket: bucket, key: key).and_return(true)
      end
      (listed_keys - deleted_keys).each do |key|
        expect(s3_client).to_not receive(:head_object).with(bucket: bucket, key: key)
      end
      s3_client
    end

    it "should delete a single real '.00001.png' thumbnail discovered under the record's own prefix" do
      stem = 'videos/1/2/3/1_5-singlev1723500000.mp4'
      key = "#{stem}.00001.png"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => key})
      stub_thumbnail_family_removal("#{stem}.", [key], [key], bucket)
      v.destroy
      Worker.process_queues
      expect(UserVideo.where(id: v.id).count).to eq(0)
    end

    it "should delete a single real '.00001.jpg' thumbnail (the other AWS-supported format)" do
      stem = 'videos/1/2/3/1_5-jpgv1723500000.mp4'
      key = "#{stem}.00001.jpg"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => key})
      stub_thumbnail_family_removal("#{stem}.", [key], [key], bucket)
      v.destroy
      Worker.process_queues
    end

    it "should delete every thumbnail in a multi-thumbnail family (00001, 00002, 00003)" do
      stem = 'videos/1/2/3/1_5-multiv1723500000.mp4'
      keys = ["#{stem}.00001.png", "#{stem}.00002.png", "#{stem}.00003.png"]
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => keys.first})
      stub_thumbnail_family_removal("#{stem}.", keys, keys, bucket)
      v.destroy
      Worker.process_queues
    end

    it "should recover the stem from a legacy '.0000.png' thumbnail_filename and delete the real discovered object, not the legacy value" do
      # UserVideo rows transcoded before the digit-count fix shipped got
      # thumbnail_filename hardcoded as "<video_key>.0000.png"
      # (lib/transcoder.rb's old literal suffix) -- never a real S3 object.
      # The stem recovered from it is real, and listing discovers what AWS
      # actually created under that stem.
      stem = 'videos/1/2/3/1_5-legacyv1723500000.mp4'
      legacy_key = "#{stem}.0000.png"
      real_key = "#{stem}.00001.png"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => legacy_key})
      stub_thumbnail_family_removal("#{stem}.", [real_key], [real_key], bucket)
      v.destroy
      Worker.process_queues
    end

    it "should not delete an unrelated object that only shares a broader S3 prefix" do
      # S3 prefix matching is a plain string prefix, not aware of this
      # record's exact stem -- the strict per-key grammar filter afterward is
      # the actual safety boundary, not the listing call.
      stem = 'videos/1/2/3/1_5-strictv1723500000.mp4'
      real_key = "#{stem}.00001.png"
      unrelated_key = "#{stem}extra-unrelated.00001.png"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => real_key})
      stub_thumbnail_family_removal("#{stem}.", [real_key, unrelated_key], [real_key], bucket)
      v.destroy
      Worker.process_queues
    end

    it "should reject malformed counter widths returned by listing (four or six digits)" do
      stem = 'videos/1/2/3/1_5-malformedv1723500000.mp4'
      real_key = "#{stem}.00001.png"
      four_digit = "#{stem}.0001.png"
      six_digit = "#{stem}.000012.png"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => real_key})
      stub_thumbnail_family_removal("#{stem}.", [real_key, four_digit, six_digit], [real_key], bucket)
      v.destroy
      Worker.process_queues
    end

    it "should not fail account erasure when the family lookup finds no matching objects" do
      # A legitimate outcome: an earlier lifecycle step may have already
      # removed them. Must not raise or block the rest of the destroy.
      stem = 'videos/1/2/3/1_5-emptyv1723500000.mp4'
      key = "#{stem}.00001.png"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => key})
      allow(Rails.logger).to receive(:info)
      stub_thumbnail_family_removal("#{stem}.", [], [], bucket)
      expect { v.destroy }.to_not raise_error
      expect { Worker.process_queues }.to_not raise_error
      expect(UserVideo.where(id: v.id).count).to eq(0)
      expect(Rails.logger).to have_received(:info).with(/found no matching objects/)
    end

    it "should not raise when S3 enumeration itself fails (e.g. ListBucket denied), and should log it" do
      stem = 'videos/1/2/3/1_5-deniedv1723500000.mp4'
      key = "#{stem}.00001.png"
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => key})
      allow(Aws::S3::Client).to receive(:new).and_raise(Aws::S3::Errors::AccessDenied.new(nil, 'denied'))
      allow(Uploader).to receive(:remote_upload_config).and_return({
        access_key: 'test_key', secret: 'test_secret', bucket_name: 'lingolinq-dev-uploads', static_bucket_name: 'spec-static'
      })
      allow(Rails.logger).to receive(:error)
      expect { v.destroy }.to_not raise_error
      expect { Worker.process_queues }.to_not raise_error
      expect(UserVideo.where(id: v.id).count).to eq(0)
      expect(Rails.logger).to have_received(:error).with(/enumeration failed/)
    end

    it "should not let one thumbnail's delete failure suppress an attempt at its sibling" do
      stem = 'videos/1/2/3/1_5-siblingv1723500000.mp4'
      boom_key = "#{stem}.00001.png"
      ok_key = "#{stem}.00002.png"
      bucket = ENV['UPLOADS_S3_BUCKET'].presence || 'lingolinq-dev-uploads'
      v = UserVideo.create(:user => u, :settings => {'thumbnail_filename' => boom_key})
      s3_client = instance_double(Aws::S3::Client)
      allow(Aws::S3::Client).to receive(:new).and_return(s3_client)
      allow(Uploader).to receive(:remote_upload_config).and_return({
        access_key: 'test_key', secret: 'test_secret', bucket_name: bucket, static_bucket_name: 'spec-static'
      })
      allow(s3_client).to receive(:list_objects_v2).and_return(
        Aws::S3::Types::ListObjectsV2Output.new(contents: [
          Aws::S3::Types::Object.new(key: boom_key),
          Aws::S3::Types::Object.new(key: ok_key)
        ])
      )
      allow(s3_client).to receive(:head_object).with(bucket: bucket, key: boom_key).and_raise(Aws::S3::Errors::AccessDenied.new(nil, 'denied'))
      expect(s3_client).to receive(:head_object).with(bucket: bucket, key: ok_key).and_return(Aws::S3::Types::HeadObjectOutput.new)
      expect(s3_client).to receive(:delete_object).with(bucket: bucket, key: ok_key).and_return(true)
      allow(Rails.logger).to receive(:error)
      expect { v.destroy }.to_not raise_error
      expect { Worker.process_queues }.to_not raise_error
    end

    it "should log and return gracefully, without aborting the destroy, when settings can't be read" do
      # settings is secure_serialize'd (go_secure); a decrypt/parse failure on
      # a legacy or corrupted row must never propagate out of this
      # after_destroy_commit callback into Flusher's user-erasure sweep.
      s = ButtonSound.create(:user => u, :settings => {
        'full_filename' => 'sounds/1/2/3/1_5-currentdecryptfail.mp3'
      }, :url => 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/1_5-currentdecryptfail.mp3')
      allow(Rails.logger).to receive(:error)
      allow(s).to receive(:settings).and_raise(StandardError.new('simulated decrypt failure'))
      expect(Uploader).to_not receive(:remote_remove)
      expect { s.destroy }.to_not raise_error
      expect { Worker.process_queues }.to_not raise_error
      expect(Rails.logger).to have_received(:error).with(/key collection failed/)
    end

    it "should log and continue past a key that fails to schedule, rather than aborting the destroy" do
      boom_key = 'sounds/1/2/3/boom-key1723500000.wav'
      ok_key = 'sounds/1/2/3/ok-key1723500000.m4a'
      s = ButtonSound.create(:user => u, :settings => {
        'content_type' => 'audio/mp3',
        'full_filename' => 'sounds/1/2/3/1_5-currentresilience.mp3',
        'secondary_output' => {'filename' => boom_key},
        'prior_full_filenames' => [ok_key]
      }, :url => 'https://example-uploads.s3.amazonaws.com/sounds/1/2/3/1_5-currentresilience.mp3')
      allow(Rails.logger).to receive(:error)
      scheduled = []
      allow(Worker).to receive(:schedule) do |klass, method, key|
        scheduled << key
        raise "simulated enqueue failure" if key == boom_key
      end
      expect { s.destroy }.to_not raise_error
      expect(scheduled).to match_array([boom_key, ok_key])
      expect(Rails.logger).to have_received(:error).with(/#{Regexp.escape(boom_key)}/)
      expect(ButtonSound.where(id: s.id).count).to eq(0)
    end
  end
end
