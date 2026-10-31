require 'spec_helper'

# aws-sdk-rails points the SDK logger at Rails.logger, and the SDK's default formatter prints
# every request's parameters at info: S3 keys (working links on public-read buckets), raw
# emails, SMS text. config/initializers/aws_logging.rb keeps the line, drops the parameters.
describe "AWS SDK logging" do
  let(:io) { StringIO.new }
  let(:logger) { Logger.new(io) }
  let(:client_opts) { {stub_responses: true, logger: logger, region: 'us-west-2', credentials: Aws::Credentials.new('a', 'b')} }

  it "should log an S3 call without its key" do
    key = "sounds/1/2/3/1_123_abc-#{'d' * 128}.mp3"
    Aws::S3::Client.new(client_opts).head_object(bucket: 'spec-bucket', key: key)
    expect(io.string).to match(/head_object/)
    expect(io.string).to_not include('d' * 128)
  end

  it "should log a raw email send without its contents" do
    mail = Mail.new do
      from 'from@example.com'
      to 'to@example.com'
      subject 'Reset your password'
      body 'Use this reset code: resetcode123'
    end
    Aws::Rails::SesMailer.new(client_opts).deliver!(mail)
    expect(io.string).to match(/send_raw_email/)
    expect(io.string).to_not include('resetcode123')
    expect(io.string).to_not include('Reset your password')
    expect(io.string).to_not include('to@example.com')
  end

  it "should log an SMS publish without its message" do
    Aws::SNS::Client.new(client_opts).publish(phone_number: '+15555550123', message: 'utterance text here')
    expect(io.string).to match(/publish/)
    expect(io.string).to_not include('utterance text here')
  end
end
