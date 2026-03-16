require 'spec_helper'

describe Api::CallbacksController, :type => :controller do
  describe 'callback' do
    it 'should error on confirming invalid arn' do
      expect(ENV).to receive('[]').with('SNS_ARNS').and_return('bacon,fried')
      expect(ENV).to receive('[]').with('DISABLE_API_CALL_LOGGING').and_return('true')
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
    
    it "should error on unhandled transcoding event" do
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
    
    it "should handle transcoding" do
      u = User.create
      expect(GoSecure).to receive(:nonce).with("security_nonce").and_return("abcdefg")
      expect(GoSecure).to receive(:nonce).with("transcoding_key").and_return("abcdefg")
      bs = ButtonSound.create(:user => u, :settings => {
        'full_filename' => 'sounds/4/3/0-something.wav'
      })
      prefix = bs.file_path + bs.file_prefix + "v" + Time.now.to_i.to_s
      expect(Worker.scheduled?(Transcoder, :convert_audio, bs.global_id, prefix, "abcdefg")).to eq(true)
      config = OpenStruct.new
      expect(bs.settings['transcoding_attempted']).to eq(true)
      job = OpenStruct.new
      job.id = 'onetwo'
      resp = OpenStruct.new
      resp.job = job
      expect(config).to receive(:create_job){|job_args|
        expect(job_args[:pipeline_id]).to eq(ENV['TRANSCODER_AUDIO_PIPELINE'])
        expect(job_args[:user_metadata]).to_not eq(nil)
        expect(job_args[:input]).to_not eq(nil)
        expect(job_args[:outputs]).to_not eq(nil)
        expect(job_args[:outputs][0][:preset_id]).to eq(Transcoder::AUDIO_PRESET)
        expect(job_args[:outputs][1][:preset_id]).to eq(Transcoder::AUDIO_TRANSCRIBE_PRESET)
        expect(job_args[:user_metadata]).to_not eq(nil)
        expect(job_args[:user_metadata][:conversion_type]).to eq('audio')
        expect(job_args[:user_metadata][:audio_id]).to eq(bs.global_id)
        job.user_metadata = job_args[:user_metadata].with_indifferent_access
        job.outputs = [OpenStruct.new(job_args[:output])]
        job.outputs[0].duration = 111
        job.outputs[0].key = job_args[:outputs][0][:key]
      }.and_return(resp)
      
      expect(config).to receive(:read_job).with({id: 'onetwo'}).and_return(resp)
      # expect(Uploader).to receive(:remote_remove).with('sounds/4/3/0-something.wav')
      expect(Transcoder).to receive(:config).and_return(config).at_least(1).times

      Worker.process_queues

      request.headers['x-amz-sns-message-type'] = 'Notification'
      request.headers['x-amz-sns-topic-arn'] = 'fried:audio_conversion_events:chicken'
      post 'callback', body: {'Message' => {
        'jobId' => 'onetwo',
        'state' => 'COMPLETED'
      }.to_json }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'handled' => true})
      bs.reload
      expect(bs.settings['full_filename']).to eq(prefix + '.mp3')
      expect(bs.settings['content_type']).to eq('audio/mp3')
      expect(bs.settings['duration']).to eq(111)
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
