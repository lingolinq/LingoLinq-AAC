require 'spec_helper'

# When a picture, sound or video row is destroyed, its file in the uploads bucket is deleted only when no picture,
# sound or video row still uses it, in any of the address forms a row stores (Uploader.remote_path_in_use?). The check
# runs when the row is destroyed and again in the delete job, since a row can take the address in between.
describe Uploadable, "removal of a file still in use" do
  def row(klass, address, user = User.create)
    r = klass.create(user: user)
    r.update_columns(klass.column_names.include?('removable') ? {url: address, removable: true} : {url: address}) # user_videos has no removable column
    r.reload
  end

  env_wrap('UPLOADS_S3_BUCKET' => 'lingolinq-dev-uploads') do
    let(:key) { "images/1/2/1_12-#{'a' * 128}.png" }
    let(:url) { "https://lingolinq-dev-uploads.s3.amazonaws.com/#{key}" }

    it "deletes the file when nothing else uses it" do
      sound = row(ButtonSound, url)
      expect(Uploader).to receive(:remote_remove).with(url)
      sound.destroy
      Worker.process_queues
    end

    it "keeps a file a picture still uses when a sound with that address is destroyed" do
      row(ButtonImage, url)
      sound = row(ButtonSound, url)
      expect(Worker).not_to receive(:schedule).with(Uploader, :remote_remove_if_unused, anything) # checked at destroy, not only in the job
      expect(Uploader).not_to receive(:remote_remove)
      sound.destroy
      Worker.process_queues
    end

    it "keeps a file a sound still uses when a picture with that address is destroyed" do
      row(ButtonSound, url)
      picture = row(ButtonImage, url)
      expect(Uploader).not_to receive(:remote_remove)
      picture.destroy
      Worker.process_queues
    end

    it "keeps a file another row uses under its CDN address" do
      prior_cdn = ENV['UPLOADS_S3_CDN']
      ENV['UPLOADS_S3_CDN'] = 'https://cdn.example.com'
      begin
        row(UserVideo, "https://cdn.example.com/#{key}")
        picture = row(ButtonImage, url)
        expect(Uploader).not_to receive(:remote_remove)
        picture.destroy
        Worker.process_queues
      ensure
        ENV['UPLOADS_S3_CDN'] = prior_cdn
      end
    end

    it "checks again when the delete job runs" do
      picture = row(ButtonImage, url)
      picture.destroy
      row(ButtonSound, url) # took the address after the destroy, before the job ran
      expect(Uploader).not_to receive(:remote_remove)
      Worker.process_queues
    end
  end
end
