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
          job.output_group_details = [
            OpenStruct.new({
              output_details: [
                OpenStruct.new({
                  duration_in_ms: 111_000,
                  output_file_paths: ["s3://lingolinq-test-uploads/#{prefix}.mp3"]
                }),
                OpenStruct.new({
                  duration_in_ms: 111_000,
                  output_file_paths: ["s3://lingolinq-test-uploads/#{prefix}.wav"]
                })
              ]
            })
          ]
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
            'status' => 'COMPLETE'
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
  end
end
