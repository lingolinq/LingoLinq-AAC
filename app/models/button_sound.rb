class ButtonSound < ActiveRecord::Base
  include Processable
  include Permissions
  include Uploadable
  include MediaObject
  include Async
  include GlobalId
  include SecureSerialize
  protect_global_id
  belongs_to :board
  has_many :board_button_sounds
  belongs_to :user
  before_save :generate_defaults
  after_save :schedule_transcription
  after_destroy :remove_connections
  include Replicate

  has_paper_trail :on => [:destroy] #:only => [:settings, :board_id, :user_id, :public, :path, :url, :data]
  secure_serialize :settings

  add_permissions('view', ['*']) { true }
  add_permissions('view', 'edit') {|user| self.user_id == user.id || (self.user && self.user.allows?(user, 'edit')) }
  cache_permissions

  def generate_defaults
    self.settings ||= {}
    self.settings['license'] ||= {
      'type' => 'private'
    }
    self.public ||= false
    true
  end
  
  def remove_connections
    # TODO: sharding
    BoardButtonSound.where(:button_sound_id => self.id).delete_all
  end
  
  def protected?
    !!self.settings['protected']
  end
  
  def schedule_transcription(frd=false)
    if self.secondary_url && (!self.settings['transcription'] || self.settings['transcription'] == '') && (self.settings['transcription_errors'] || 0) < 2
      if frd
        # https://cloud.google.com/speech/reference/rest/
        ref = self.settings['secondary_output']
        secondary_url = self.secondary_url
        key = ENV['GOOGLE_TRANSLATE_TOKEN']
        # download the wav file
        req = Typhoeus.get(secondary_url)
        encoded_content = [req.body].pack('m0').gsub(/\=+\Z/, '').tr('+/', '-_') # base64 url encoding
        opts = {
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 44100,
            languageCode: 'en',
            profanityFilter: true
          },
          audio: {
            content: encoded_content
          }
        }.to_json
        url = "https://speech.googleapis.com/v1/speech:recognize?key=#{key}"
        # pass it to google cloud recognition async
        # (wav file, 44100Hz, linear PCM)
        res = Typhoeus.post(url, body: opts, headers: { 'Accept-Encoding' => 'application/json', 'Content-Type' => 'application/json'})
        json = JSON.parse(res.body)
        # on success, set transcription (including confidence) and delete the wav file from S3
        if json['results'] && json['results'][0] && json['results'][0]['alternatives'] && json['results'][0]['alternatives'][0]
          alt = json['results'][0]['alternatives'][0]
          if alt && alt['confidence'] && alt['confidence'] > 0.3
            self.settings['transcription'] = alt['transcript']
            self.settings['transcription_confidence'] = alt['confidence']
          else
            self.settings['transcription_uncertain'] = true
          end
          self.settings['secondary_output'] = nil
          self.save
          Uploader.remote_remove(secondary_url)
        # on error, increment failed attempts and give up after second attempt
        else
          self.settings['transcription_errors'] ||= 0
          self.settings['transcription_errors'] += 1
          self.save
          schedule_once(:schedule_transcription, true)
        end
      else
        schedule_once(:schedule_transcription, true)
      end
    end
  end
  
  def secondary_url
    return nil unless self.settings && self.settings['secondary_output'] && self.settings['secondary_output']['filename']
    params = self.remote_upload_params
    params[:upload_url] + self.settings['secondary_output']['filename']
  end
  
  def self.schedule_missing_transcodings
    ButtonSound.where("url NOT LIKE '%.mp3'").where(['created_at > ?', 2.weeks.ago]).each do |bs|
      if bs.settings['extra_transcoding_attempts'] && bs.settings['extra_transcoding_attempts'] > 1
      elsif bs.settings['transcoding_in_progress'] && bs.updated_at > 48.hours.ago
      else
        bs.settings['extra_transcoding_attempts'] ||= 0
        bs.settings['extra_transcoding_attempts'] += 1
        bs.schedule_transcoding(true)
      end
    end

    UserVideo.where("url NOT LIKE '%.mp4'").where(['created_at > ?', 2.weeks.ago]).each do |bs|
      if bs.settings['extra_transcoding_attempts'] && bs.settings['extra_transcoding_attempts'] > 1
      elsif bs.settings['transcoding_in_progress'] && bs.updated_at > 48.hours.ago
      else
        bs.settings['extra_transcoding_attempts'] ||= 0
        bs.settings['extra_transcoding_attempts'] += 1
        bs.schedule_transcoding(true)
      end
    end
  end
  
  
  def self.generate_zip_for(user)
    download_filename = "sounds-#{user.user_name}.zip"
    urls = []
    # TODO: sharding
    json = {RecordedMessages: []}
    ButtonSound.where(:user_id => user.id).each do |sound|
      next unless sound.url
      
      opts = {
        'url' => sound.url,
        'content_type' => sound.settings['content_type'],
        'transcription' => sound.settings['transcription'],
        'duration' => sound.settings['duration'],
        'name' => sound.settings['name'] || 'Sound'
      }
      if sound.secondary_url
        opts['url'] = sound.secondary_url
        opts['content_type'] = sound.settings['secondary_output']['content_type']
      end

      type = MIME::Types[opts['content_type']]
      type = type && type[0]
      extension = "." + opts['url'].split(/\//)[-1].split(/\./)[-1]
      if type && type.respond_to?(:preferred_extension)
        extension = ("." + type.preferred_extension) if type.preferred_extension
      elsif type && type.respond_to?(:extensions)
        extension = ("." + type.extensions[0]) if type && type.extensions && type.extensions.length > 0
      end
      filename = "#{opts['name'].gsub(/[^\w]+/, '-')}-#{sound.global_id.split(/_/)[0..1].join('_')}#{extension}"
      urls << {
        'url' => opts['url'],
        'name' => filename
      }
      duration = sound.settings['duration'] || 0
      seconds = (duration % 60).to_i
      frac = (duration % 60) - seconds.to_f
      dec = frac > 0 ? ".#{frac.to_s.split(/\./)[1]}" : ""
      minutes = (((duration - seconds) / 60) % 60).to_i
      hours = ((((duration - seconds) / 60) - minutes) / 60).to_i
      message = {
        Id: sound.global_id,
        FileName: filename,
        Label: sound.settings['name'],
        Length: "#{hours.to_s.rjust(2, '0')}:#{minutes.to_s.rjust(2, '0')}:#{seconds.to_s.rjust(2, '0')}#{dec}",
        LastModified: sound.updated_at.iso8601,
        CreatedTime: sound.created_at.iso8601
      }
      if sound.settings['transcription']
        message[:Transcription] = {
          Text: sound.settings['transcription'],
          Source: sound.settings['transcription_by_user'] ? 'user' : 'auto',
          Verified: !!sound.settings['transcription_by_user']
        }
      end
      json[:RecordedMessages] << message
    end
    urls << {
      'data' => JSON.pretty_generate(json),
      'name' => 'MessageBank.json'
    }
    Uploader.generate_zip(urls, download_filename)
  end
  
  def self.import_for(user_id, url)
    user = User.find_by_global_id(user_id)
    return nil unless user
    sounds = []
    Uploader.remote_zip(url) do |zipper|
      json = {'RecordedMessages' => []}
      if zipper.glob('MessageBank.json').length > 0
        json = JSON.parse(zipper.read('MessageBank.json')) rescue nil
      end
      filenames = zipper.glob('*.mp3') + zipper.glob('*.wav') + zipper.glob('*.weba') + zipper.glob('*.ogg')
      
      filenames.each_with_index do |filename, idx|
        Progress.update_current_progress(idx.to_f / filenames.length.to_f, :processing_sound)
        filename = filename.to_s
        data = json['RecordedMessages'].detect{|m| m['FileName'] == filename }
        sound_to_upload = nil
        if data
          sound = ButtonSound.find_by_global_id(data['Id'])
          # TODO: sharding
          if sound && sound.user_id == user.id
            sound.settings['name'] = data['Label'] if data['Label']
            if data['Transcription'] && data['Transcription']['Text']
              sound.settings['transcription'] = data['Transcription']['Text']
              sound.settings['transcription_by_user'] = !!data['Transcription']['Verified']
            end
            sound.save
            sounds << sound
          else
            sound_to_upload = {
              filename: filename,
              name: data['Label'],
              transcription: data['Transcription'] && data['Transcription']['Text'],
              transcription_by_user: data['Transcription'] && data['Transcription']['Verified']
            }
          end
        else
          sound_to_upload = {
            filename: filename,
            name: name
          }
        end
        if sound_to_upload
          bs = ButtonSound.new(user: user, settings: {})
          types = MIME::Types.type_for(sound_to_upload[:filename])
          bs.settings['name'] = sound_to_upload[:name]
          bs.settings['content_type'] = types[0] && types[0].to_s
          if sound_to_upload[:transcription]
            bs.settings['transcription'] = sound_to_upload[:transcription]
            bs.settings['transcription_by_user'] = sound_to_upload[:transcription_by_user]
          end
          bs.settings['data_uri'] = zipper.read_as_data(sound_to_upload[:filename])['data']
          bs.save
          bs.upload_to_remote('data_uri')
          sounds << bs
        end
      end
    end
    return sounds.map{|b| JsonApi::Sound.as_json(b) }
  end
  
  def process_params(params, non_user_params)
    raise "user required as sound author" unless self.user_id || non_user_params[:user]
    self.user ||= non_user_params[:user] if non_user_params[:user]
    @download_url = false if non_user_params[:download] == false
    self.settings ||= {}
    if !self.url
      process_url(params['url'], non_user_params) if params['url'] && params['url'].match(/^http/)
      self.settings['content_type'] = params['content_type'] if params['content_type']
      self.settings['duration'] = params['duration'].to_i if params['duration']
      process_license(params['license']) if params['license']
      self.settings['protected'] = params['protected'] if params['protected'] != nil
      self.settings['protected_source'] = params['protected_source'] if params['protected_source'] != nil
      self.settings['protected'] = params['ext_lingolinq_protected'] if params['ext_lingolinq_protected'] != nil
      self.settings['suggestion'] = params['suggestion'] if params['suggestion']
      self.public = params['public'] if params['public'] != nil
    end
    self.settings['name'] = params['name'] if params['name']
    if !params['transcription'].blank?
      if params['transcription'] != self.settings['transcription']
        self.settings['transcription_by_user'] = true
        self.settings['transcription_confidence'] = 1.0
        self.settings['transcription_uncertain'] = false
      end
      self.settings['transcription'] = params['transcription']
    end
    if params['tag']
      self.settings['tags'] = ((self.settings['tags'] || []) + [params['tag']]).uniq
      self.settings['tags'] -= ["not:#{params['tag']}"]
      if params['tag'].match(/^not:/)
        self.settings['tags'] -= [params['tag'].sub(/^not:/, '')]
      end
    end
    true
  end
end
