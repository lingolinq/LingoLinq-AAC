require 'spec_helper'

describe BetaFeedbackRecording, type: :model do
  it 'should reject unsupported content types' do
    rec = BetaFeedbackRecording.new(content_type: 'text/plain', byte_size: 1000)
    expect(rec.valid?).to eq(false)
    expect(rec.errors[:content_type]).to be_present
  end

  it 'should reject files over 100 MB' do
    rec = BetaFeedbackRecording.new(content_type: 'video/webm', byte_size: BetaFeedbackRecording::MAX_BYTES + 1)
    expect(rec.valid?).to eq(false)
    expect(rec.errors[:byte_size]).to be_present
  end

  it 'should flush expired recordings' do
    rec = BetaFeedbackRecording.create!(
      content_type: 'video/webm',
      byte_size: 1000,
      status: 'confirmed',
      confirmed_at: 91.days.ago,
      expires_at: 1.day.ago
    )
    expect(Uploader).to receive(:remote_remove_upload_path).with(rec.upload_key).and_return(true)

    expect(BetaFeedbackRecording.flush_expired).to eq(1)
    rec.reload
    expect(rec.status).to eq('deleted')
    expect(rec.deleted_at).to be_present
  end

  # remote_remove_upload_path answers nil without S3 credentials (lib/uploader.rb); the row itself
  # is the durable retry: it stays undeleted and the next scheduled flush tries again
  it 'should keep an expired recording for the next flush when its remote delete did not happen' do
    rec = BetaFeedbackRecording.create!(
      content_type: 'video/webm',
      byte_size: 1000,
      status: 'confirmed',
      confirmed_at: 91.days.ago,
      expires_at: 1.day.ago
    )
    expect(Uploader).to receive(:remote_remove_upload_path).with(rec.upload_key).and_return(nil, true)

    BetaFeedbackRecording.flush_expired
    rec.reload
    expect(rec.status).to eq('confirmed')
    expect(rec.deleted_at).to eq(nil)

    BetaFeedbackRecording.flush_expired
    rec.reload
    expect(rec.status).to eq('deleted')
    expect(rec.deleted_at).to be_present
  end
end
