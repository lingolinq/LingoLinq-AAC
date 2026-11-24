require 'spec_helper'

# When a picture, sound or video row is destroyed, the file its address names is deleted only when (1) it is a media
# upload key, (2) it is the row's own upload or the row that uploaded it no longer exists, and (3) no picture, sound or
# video row still names it, in any stored address form (Uploader.removable_by_destroyed_row?). Checked after the
# destroy commits and again in the delete job.
describe Uploadable, "removal of a destroyed row's file" do
  def row(klass, address = nil, user = User.create)
    r = klass.create(user: user)
    cols = {}
    cols[:url] = address if address
    cols[:removable] = true if klass.column_names.include?('removable') # user_videos has no removable column
    r.update_columns(cols) unless cols.empty?
    r.reload
  end

  def key_for(r, folder)
    "#{folder}/#{r.id.to_s.split(//).join('/')}/#{r.global_id}-#{'a' * 128}.png"
  end

  env_wrap('UPLOADS_S3_BUCKET' => 'lingolinq-dev-uploads') do
    let(:bucket) { "https://lingolinq-dev-uploads.s3.amazonaws.com/" }

    it "deletes a row's own file when nothing else uses it" do
      picture = row(ButtonImage)
      url = bucket + key_for(picture, 'images')
      picture.update_columns(url: url)
      expect(Uploader).to receive(:remote_remove).with(url)
      picture.reload.destroy
      Worker.process_queues
    end

    it "keeps a file a picture still uses when a sound with that address is destroyed" do
      picture = row(ButtonImage)
      url = bucket + key_for(picture, 'images')
      picture.update_columns(url: url, removable: true)
      sound = row(ButtonSound, url)
      expect(Worker).not_to receive(:schedule).with(Uploader, :remote_remove_if_unused, anything, anything, anything) # decided at destroy, not only in the job
      expect(Uploader).not_to receive(:remote_remove)
      sound.destroy
      Worker.process_queues
    end

    it "keeps a file a sound still uses when its own picture row is destroyed" do
      picture = row(ButtonImage)
      url = bucket + key_for(picture, 'images')
      picture.update_columns(url: url, removable: true)
      row(ButtonSound, url)
      expect(Uploader).not_to receive(:remote_remove)
      picture.reload.destroy
      Worker.process_queues
    end

    it "keeps a file another row names by its CDN address" do
      prior_cdn = ENV['UPLOADS_S3_CDN']
      ENV['UPLOADS_S3_CDN'] = 'https://cdn.example.com'
      begin
        picture = row(ButtonImage)
        key = key_for(picture, 'images')
        picture.update_columns(url: bucket + key, removable: true)
        row(UserVideo, "https://cdn.example.com/#{key}")
        expect(Uploader).not_to receive(:remote_remove)
        picture.reload.destroy
        Worker.process_queues
      ensure
        ENV['UPLOADS_S3_CDN'] = prior_cdn
      end
    end

    it "never deletes a file outside the media folders, such as a button set" do
      sound = row(ButtonSound, bucket + "extras/1/1_5-#{'b' * 64}/button_set.json")
      expect(Worker).not_to receive(:schedule).with(Uploader, :remote_remove_if_unused, anything, anything, anything)
      expect(Uploader).not_to receive(:remote_remove)
      sound.destroy
      Worker.process_queues
    end

    it "never deletes another existing row's upload, even when nothing names it" do
      picture = row(ButtonImage) # the uploading row exists, under a different address
      sound = row(ButtonSound, bucket + key_for(picture, 'images') + '.0000001.jpg')
      expect(Uploader).not_to receive(:remote_remove)
      sound.destroy
      Worker.process_queues
    end

    it "deletes a file whose uploading row is gone once the last row naming it is destroyed" do
      picture = row(ButtonImage)
      url = bucket + key_for(picture, 'images')
      picture.update_columns(url: url, removable: true)
      sound = row(ButtonSound, url)
      picture.reload.destroy # the sound still names it: kept
      Worker.process_queues
      expect(Uploader).to receive(:remote_remove).with(url)
      sound.destroy
      Worker.process_queues
    end

    it "checks again when the delete job runs" do
      picture = row(ButtonImage)
      url = bucket + key_for(picture, 'images')
      picture.update_columns(url: url, removable: true)
      picture.reload.destroy
      row(ButtonSound, url) # took the address after the destroy, before the job ran
      expect(Uploader).not_to receive(:remote_remove)
      Worker.process_queues
    end

    it "still runs the derived-file cleanup when scheduling the file's removal fails" do
      sound = row(ButtonSound)
      url = bucket + key_for(sound, 'sounds')
      sound.update_columns(url: url)
      sound.reload
      sound.settings['content_type'] = 'audio/mpeg'
      sound.settings['secondary_output'] = {'filename' => "sounds/1/1_9-#{'c' * 128}.wav"}
      sound.save
      allow(Worker).to receive(:schedule).and_call_original
      allow(Worker).to receive(:schedule).with(Uploader, :remote_remove_if_unused, anything, anything, anything).and_raise(Redis::CannotConnectError)
      expect(Worker).to receive(:schedule).with(Uploader, :remote_remove, "sounds/1/1_9-#{'c' * 128}.wav")
      expect { sound.destroy }.not_to raise_error
      expect(ButtonSound.where(id: sound.id).count).to eq(0)
    end

    it "reads the key from every stored address form" do
      prior_cdn = ENV['UPLOADS_S3_CDN']
      ENV['UPLOADS_S3_CDN'] = 'https://cdn.example.com'
      begin
        expect(Uploader.remote_key_for("https://lingolinq-dev-uploads.s3.amazonaws.com/images/1/a.png")).to eq('images/1/a.png')
        expect(Uploader.remote_key_for("https://s3.amazonaws.com/lingolinq-dev-uploads/images/1/a.png")).to eq('images/1/a.png')
        expect(Uploader.remote_key_for("https://cdn.example.com/images/1/a.png")).to eq('images/1/a.png')
      ensure
        ENV['UPLOADS_S3_CDN'] = prior_cdn
      end
    end

    it "knows which row a media key was uploaded for" do
      expect(Uploader.media_key_owner("images/1/2/1_12-#{'a' * 128}.png")).to eq(['ButtonImage', 12])
      expect(Uploader.media_key_owner("sounds/4/5/1_45_abc123-#{'a' * 128}v1699999999.mp3")).to eq(['ButtonSound', 45])
      expect(Uploader.media_key_owner("images/1/3/1_12-#{'a' * 128}.png")).to eq(nil) # folder digits disagree
      expect(Uploader.media_key_owner("extras/1/1_12-#{'a' * 128}.json")).to eq(nil)
      expect(Uploader.media_key_owner("images/1/2/1_12-short.png")).to eq(nil)
    end
  end
end
