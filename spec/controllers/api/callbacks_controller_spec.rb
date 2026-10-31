require 'spec_helper'

describe Api::CallbacksController, :type => :controller do
  describe 'callback' do
    it 'should error on confirming invalid arn' do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('SNS_ARNS').and_return('bacon,fried')
      allow(ENV).to receive(:[]).with('DISABLE_API_CALL_LOGGING').and_return('true')
      expect(JsonApi::Json).to receive(:load_domain)
      request.headers['x-amz-sns-message-type'] = 'SubscriptionConfirmation'
      request.headers['x-amz-sns-topic-arn'] = 'ham'
      post 'callback'
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'error' => 'invalid arn', 'status' => 400})
    end
    
    it 'should succeed on confirming valid arn' do
      ENV['SNS_ARNS'] = 'bacon,fried'
      ENV['AWS_KEY'] = 'nonsense'
      ENV['AWS_SECRET'] = 'shhhhhh'
      ENV['SNS_REGION'] = 'overthere'
      expect(Aws::Credentials).to receive(:new).with('nonsense', 'shhhhhh').and_return('creds')
      client = OpenStruct.new
      expect(Aws::SNS::Client).to receive(:new){|opts| 
        expect(opts[:region]).to eq('overthere')
        expect(opts[:credentials]).to eq('creds')
        expect(opts[:retry_limit]).to eq(2)
        expect(opts[:retry_backoff]).to_not eq(nil)
      }.and_return(client)
      expect(client).to receive(:confirm_subscription).with({topic_arn: 'fried', token: 'ahem', authenticate_on_unsubscribe: 'true'})
      request.headers['x-amz-sns-message-type'] = 'SubscriptionConfirmation'
      request.headers['x-amz-sns-topic-arn'] = 'fried'
      post 'callback', body: {:Token => 'ahem'}.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => true})
    end
    
    it "should ping back subscription confirmation" do
      ENV['SNS_ARNS'] = 'bacon,fried'
      ENV['AWS_KEY'] = 'nonsense'
      ENV['AWS_SECRET'] = 'shhhhhh'
      ENV['SNS_REGION'] = 'overthere'
      expect(Aws::Credentials).to receive(:new).with('nonsense', 'shhhhhh').and_return('creds')
      client = OpenStruct.new
      expect(Aws::SNS::Client).to receive(:new){|opts| 
        expect(opts[:region]).to eq('overthere')
        expect(opts[:credentials]).to eq('creds')
        expect(opts[:retry_limit]).to eq(2)
        expect(opts[:retry_backoff]).to_not eq(nil)
      }.and_return(client)
      expect(client).to receive(:confirm_subscription).with({topic_arn: 'fried', token: 'ahem', authenticate_on_unsubscribe: 'true'})
      request.headers['x-amz-sns-message-type'] = 'SubscriptionConfirmation'
      request.headers['x-amz-sns-topic-arn'] = 'fried'
      post 'callback', body: {:Token => 'ahem'}.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'confirmed' => true})
    end
    
    it "should error on notification missing arn" do
      request.headers['x-amz-sns-message-type'] = 'Notification'
      post 'callback'
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'error' => 'missing topic arn', 'status' => 400})
    end
    
    it "should error on unrecognized callback" do
      request.headers['x-amz-sns-message-type'] = 'SomethingDifferent'
      post 'callback'
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'error' => 'unrecognized callback', 'status' => 400})
    end
    
    it "should reject an inauthentic transcoding event" do
      v = OpenStruct.new
      expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
      expect(v).to receive(:authentic?).and_return(false)
      expect(Transcoder).to_not receive(:handle_event)
      request.headers['x-amz-sns-message-type'] = 'Notification'
      request.headers['x-amz-sns-topic-arn'] = 'fried:audio_conversion_events:chicken'
      post 'callback', body: {a: '1'}.to_json
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'error' => 'inauthentic message', 'status' => 401})
    end

    it "should error on unhandled transcoding event" do
      v = OpenStruct.new
      expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
      expect(v).to receive(:authentic?).and_return(true)
      request.headers['x-amz-sns-message-type'] = 'Notification'
      request.headers['x-amz-sns-topic-arn'] = 'fried:audio_conversion_events:chicken'
      expect(Transcoder).to receive(:handle_event){|params|
        expect(params['a']).to eq('1')
      }.and_return(false)
      post 'callback', body: {a: '1'}.to_json
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'error' => 'event not handled', 'status' => 400})
    end

    it "should succeed on handled transcoding event" do
      v = OpenStruct.new
      expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
      expect(v).to receive(:authentic?).and_return(true)
      request.headers['x-amz-sns-message-type'] = 'Notification'
      request.headers['x-amz-sns-topic-arn'] = 'fried:audio_conversion_events:chicken'
      expect(Transcoder).to receive(:handle_event){|params|
        expect(params['a']).to eq('1')
      }.and_return(true)
      post 'callback', body: {a: '1'}.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'handled' => true})
    end
    
    env_wrap({
      'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert',
      'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'
    }) do
      it "should handle transcoding" do
        u = User.create
        expect(GoSecure).to receive(:nonce).with("security_nonce").and_return("abcdefg")
        expect(GoSecure).to receive(:nonce).with("transcoding_key").and_return("abcdefg")
        bs = ButtonSound.create(:user => u, :settings => {
          'full_filename' => 'sounds/4/3/0-something.wav'
        })
        # The prefix embeds Time.now.to_i captured inside schedule_transcoding (media_object.rb).
        # Read it back from the scheduled job rather than recomputing Time.now here, which flakes
        # when a second ticks over between ButtonSound.create and this line.
        action = Worker.scheduled_actions.detect { |a| a['args'][0..2] == ['Transcoder', 'convert_audio', bs.global_id] }
        expect(action).to_not eq(nil)
        prefix = action['args'][3]
        expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, prefix, "abcdefg")).to eq(true)
        config = OpenStruct.new
        expect(bs.settings['transcoding_attempted']).to eq(true)
        job = OpenStruct.new
        job.id = 'onetwo'
        resp = OpenStruct.new
        resp.job = job
        expect(config).to receive(:create_job){|job_args|
          expect(job_args[:role]).to eq('arn:aws:iam::123:role/MediaConvert')
          expect(job_args[:user_metadata]).to_not eq(nil)
          expect(job_args[:user_metadata]['conversion_type']).to eq('audio')
          expect(job_args[:user_metadata]['audio_id']).to eq(bs.global_id)
          expect(job_args[:settings][:inputs][0][:file_input]).to eq("s3://lingolinq-test-uploads/sounds/4/3/0-something.wav")
          job.user_metadata = job_args[:user_metadata].with_indifferent_access
          job.status = 'COMPLETE'
          # GetJob echoes the destination the job was submitted with; the output
          # paths themselves arrive in the COMPLETE event below.
          destination = job_args[:settings][:output_groups][0][:output_group_settings][:file_group_settings][:destination]
          expect(destination).to eq("s3://lingolinq-test-uploads/#{File.dirname(prefix)}/")
          job.settings = OpenStruct.new(output_groups: [
            OpenStruct.new(output_group_settings: OpenStruct.new(
              file_group_settings: OpenStruct.new(destination: destination)
            ))
          ])
        }.and_return(resp)

        expect(config).to receive(:get_job).with({id: 'onetwo'}).and_return(resp)
        expect(Transcoder).to receive(:config).and_return(config).at_least(1).times

        Worker.process_queues

        v = OpenStruct.new
        expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
        expect(v).to receive(:authentic?).and_return(true)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'fried:audio_conversion_events:chicken'
        post 'callback', body: {'Message' => {
          'detail-type' => 'MediaConvert Job State Change',
          'source' => 'aws.mediaconvert',
          'detail' => {
            'jobId' => 'onetwo',
            'status' => 'COMPLETE',
            'outputGroupDetails' => [{
              'type' => 'FILE_GROUP',
              'outputDetails' => [
                {'outputFilePaths' => ["s3://lingolinq-test-uploads/#{prefix}.mp3"], 'durationInMs' => 111_000},
                {'outputFilePaths' => ["s3://lingolinq-test-uploads/#{prefix}.wav"], 'durationInMs' => 111_000}
              ]
            }]
          }
        }.to_json }.to_json
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json).to eq({'handled' => true})
        bs.reload
        expect(bs.settings['full_filename']).to eq(prefix + '.mp3')
        expect(bs.settings['content_type']).to eq('audio/mp3')
        expect(bs.settings['duration']).to eq(111)
      end

      it "should accept a mediaconvert-named SNS topic for transcoding events" do
        v = OpenStruct.new
        expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
        expect(v).to receive(:authentic?).and_return(true)
        expect(Transcoder).to receive(:handle_event).and_return(true)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'arn:aws:sns:us-west-2:123:lingolinq-mediaconvert-events'
        post 'callback', body: {a: '1'}.to_json
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json).to eq({'handled' => true})
      end

      it "should answer 503 so SNS redelivers when GetJob has not caught up with the event" do
        v = OpenStruct.new
        expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
        expect(v).to receive(:authentic?).and_return(true)
        expect(Transcoder).to receive(:handle_event).and_return(:retry)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'arn:aws:sns:us-west-2:123:lingolinq-mediaconvert-events'
        post 'callback', body: {a: '1'}.to_json
        expect(response.status).to eq(503)
        json = JSON.parse(response.body)
        expect(json['error']).to eq('job not complete yet')
      end
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should handle inbound sms" do
        u = User.create
        t = RemoteTarget.new(target_type: 'sms', user: u)
        t.target_index = 1
        t.contact_id = "mycontact"
        t.target = "5551234567"
        t.save!

        v = OpenStruct.new
        expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
        expect(v).to receive(:authentic?).and_return(true)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'fried:sms_inbound:chicken'
        expect(LogSession).to receive(:message).with({
          device: nil,
          message: "EXAMPLE",
          notify: 'user_only',
          recipient: u,
          reply_id: nil,
          sender: u,
          sender_id: 'mycontact'
        })
        post 'callback', body: {a: '1', 'Message':  {
          "originationNumber": "+15551234567",
          "destinationNumber": "+15558675309",
          "messageKeyword": "JOIN",
          "messageBody": "EXAMPLE",
          "inboundMessageId": "cae173d2-66b9-564c-8309-21f858e9fb84",
          "previousPublishedMessageId": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
      }.to_json }.to_json
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json).to eq({'handled' => true})
        # process_inbound
      end
    end

    # Cloud Run ships every log line to Cloud Logging, and the upload buckets are public-read, so a
    # logged S3 key is a working link to a recording. The 128-hex digest is the secret part of a key.
    describe "logging" do
      let(:io) { StringIO.new }
      let(:digest) { 'e' * 128 }
      let(:transcoding_key) { 'feedfacecafebeef00112233' }
      let(:key) { "sounds/1/7/1_17_0123456789abcdef01234567-#{digest}v1789854837" }

      around(:each) do |example|
        original = Rails.logger
        Rails.logger = Logger.new(io)
        example.run
      ensure
        Rails.logger = original
      end

      def authentic!(result=true)
        v = OpenStruct.new
        expect(Aws::SNS::MessageVerifier).to receive(:new).and_return(v)
        expect(v).to receive(:authentic?).and_return(result)
      end

      def mediaconvert_event(detail)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'arn:aws:sns:us-west-2:123:lingolinq-mediaconvert-nonprod'
        {'Type' => 'Notification', 'MessageId' => '6b2d8a51-1c2e-5b0f-9d1a-2f3e4d5c6b7a', 'Message' => {
          'detail-type' => 'MediaConvert Job State Change', 'source' => 'aws.mediaconvert', 'detail' => detail
        }.to_json}.to_json
      end

      def complete_detail
        {'jobId' => '1789855178463-xw2g13', 'status' => 'COMPLETE',
          'userMetadata' => {'audio_id' => '1_17_0123456789abcdef01234567', 'conversion_type' => 'audio', 'transcoding_key' => transcoding_key},
          'outputGroupDetails' => [{'type' => 'FILE_GROUP', 'outputDetails' => [
            {'outputFilePaths' => ["s3://lingolinq-test-uploads/#{key}.mp3"], 'durationInMs' => 1000}
          ]}]}
      end

      it "should log a COMPLETE event's shape without its keys or transcoding_key" do
        authentic!
        expect(Transcoder).to receive(:handle_event).and_return(true)
        post 'callback', body: mediaconvert_event(complete_detail)
        expect(response).to be_successful
        expect(io.string).to include('1789855178463-xw2g13')
        expect(io.string).to include('COMPLETE')
        expect(io.string).to include('sounds/1/7/1_17_0123456789abcdef01234567-')
        expect(io.string).to_not include(digest)
        expect(io.string).to_not include(transcoding_key)
      end

      it "should log an ERROR event's code without the path in its message" do
        authentic!
        expect(Transcoder).to receive(:handle_event).and_return(true)
        post 'callback', body: mediaconvert_event({'jobId' => '1789855178463-xw2g13', 'status' => 'ERROR', 'errorCode' => 1040,
          'errorMessage' => "Duplicate output paths [s3://lingolinq-dev-uploads/#{key}] found in input job."})
        expect(response).to be_successful
        expect(io.string).to include('1040')
        expect(io.string).to include('Duplicate output paths')
        expect(io.string).to_not include(digest)
      end

      it "should log the event before asking AWS about the job" do
        authentic!
        expect(Transcoder).to receive(:handle_event).and_raise(Aws::MediaConvert::Errors::ServiceError.new(nil, 'boom'))
        expect { post 'callback', body: mediaconvert_event(complete_detail) }.to raise_error(Aws::MediaConvert::Errors::ServiceError)
        expect(io.string).to include('1789855178463-xw2g13')
      end

      env_wrap({'MEDIACONVERT_ROLE_ARN' => 'arn:aws:iam::123:role/MediaConvert', 'UPLOADS_S3_BUCKET' => 'lingolinq-test-uploads'}) do
        it "should log why it rejected an event, without keys" do
          authentic!
          job = OpenStruct.new(id: '1789855178463-xw2g13', status: 'COMPLETE',
            user_metadata: complete_detail['userMetadata'],
            settings: OpenStruct.new(output_groups: [OpenStruct.new(output_group_settings: OpenStruct.new(
              file_group_settings: OpenStruct.new(destination: 's3://lingolinq-test-uploads/other/dir/')))]))
          config = OpenStruct.new
          expect(config).to receive(:get_job).and_return(OpenStruct.new(job: job))
          expect(Transcoder).to receive(:config).and_return(config)
          post 'callback', body: mediaconvert_event(complete_detail)
          expect(response.status).to eq(400)
          expect(io.string).to match(/Transcoder.handle_event rejected job=1789855178463-xw2g13: no mp3 output/)
          expect(io.string).to_not include(digest)
          expect(io.string).to_not include(transcoding_key)
        end
      end

      it "should not log a confirmation's token" do
        ENV['SNS_ARNS'] = 'bacon,fried'
        client = OpenStruct.new
        expect(Aws::SNS::Client).to receive(:new).and_return(client)
        expect(client).to receive(:confirm_subscription)
        request.headers['x-amz-sns-message-type'] = 'SubscriptionConfirmation'
        request.headers['x-amz-sns-topic-arn'] = 'fried'
        post 'callback', body: {:Token => 'tokentokentoken', :SubscribeURL => 'https://sns.example/confirm?Token=tokentokentoken'}.to_json
        expect(response).to be_successful
        expect(io.string).to include('fried')
        expect(io.string).to_not include('tokentokentoken')
      end

      def sms_body
        {'Message' => {'originationNumber' => '+15551234567', 'destinationNumber' => '+15558675309', 'messageBody' => 'private words'}.to_json}.to_json
      end

      it "should not log an inbound SMS it could not verify" do
        authentic!(false)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'fried:sms_inbound:chicken'
        post 'callback', body: sms_body
        expect(response.status).to eq(401)
        expect(io.string).to_not include('5551234567')
        expect(io.string).to_not include('private words')
      end

      it "should not log a verified inbound SMS's number or text" do
        authentic!
        expect(RemoteTarget).to receive(:process_inbound).and_return(true)
        request.headers['x-amz-sns-message-type'] = 'Notification'
        request.headers['x-amz-sns-topic-arn'] = 'fried:sms_inbound:chicken'
        post 'callback', body: sms_body
        expect(response).to be_successful
        expect(io.string).to include('INBOUND SMS NOTIFICATION')
        expect(io.string).to_not include('5551234567')
        expect(io.string).to_not include('private words')
      end
    end
  end
end
