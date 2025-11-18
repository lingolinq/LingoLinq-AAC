require 'spec_helper'

describe Pusher do
  it 'should push the message' do
    cred = OpenStruct.new
    sms = OpenStruct.new
    expect(Aws::Credentials).to receive(:new).and_return(cred)
    expect(Aws::SNS::Client).to receive(:new).and_return(sms)
    expect(sms).to receive(:publish).with({
      phone_number: '+11234567890',
      message: "LingoLinq: hello friend",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "1.0"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "LingoLinq"
        }
      }
    }).and_return(OpenStruct.new(message_id: 'asdf'))
    expect(Pusher.sms('1234567890', 'hello friend')).to eq(['asdf'])
  end

  it 'should support E.164 formatting' do
    cred = OpenStruct.new
    sms = OpenStruct.new
    expect(Aws::Credentials).to receive(:new).and_return(cred)
    expect(Aws::SNS::Client).to receive(:new).and_return(sms)
    expect(sms).to receive(:publish).with({
      phone_number: '+15558675309',
      message: "LingoLinq: hello friend",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "1.0"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "LingoLinq"
        }
      }
    }).and_return(OpenStruct.new(message_id: 'asdf'))
    expect(Pusher.sms('(555) 867-5309', 'hello friend')).to eq(['asdf'])
  end

  it 'should send from the specified originator if defined' do
    cred = OpenStruct.new
    sms = OpenStruct.new
    expect(Aws::Credentials).to receive(:new).and_return(cred)
    expect(Aws::SNS::Client).to receive(:new).and_return(sms)
    expect(sms).to receive(:publish).with({
      phone_number: '+15558675309',
      message: "LingoLinq: hello friend",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "1.0"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "LingoLinq"
        },
        "AWS.MM.SMS.OriginationNumber" => {
          data_type: "String",
          string_value: "+123123123"
        },
      }
    }).and_return(OpenStruct.new(message_id: 'asdf'))
    expect(Pusher.sms('(555) 867-5309', 'hello friend', '+123123123')).to eq(['asdf'])
  end

  it 'should deliver to multiple addresses if combined' do
    cred = OpenStruct.new
    sms = OpenStruct.new
    expect(Aws::Credentials).to receive(:new).and_return(cred).at_least(1).times
    expect(Aws::SNS::Client).to receive(:new).and_return(sms).at_least(1).times
    expect(sms).to receive(:publish).with({
      phone_number: '+15558675309',
      message: "LingoLinq: hello friend",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "1.0"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "LingoLinq"
        }
      }
    }).and_return(OpenStruct.new(message_id: 'asdf'))
    expect(sms).to receive(:publish).with({
      phone_number: '+15551234567',
      message: "LingoLinq: hello friend",
      message_attributes: {
        "AWS.SNS.SMS.MaxPrice" => {
          data_type: "Number",
          string_value: "1.0"
        },
        "AWS.SNS.SMS.SenderID" => {
          data_type: "String",
          string_value: "LingoLinq"
        }
      }
    }).and_return(OpenStruct.new(message_id: 'jkl'))
    expect(Pusher.sms('(555) 867-5309, (555) 123-4567', 'hello friend')).to eq(['asdf', 'jkl'])
  end
end
