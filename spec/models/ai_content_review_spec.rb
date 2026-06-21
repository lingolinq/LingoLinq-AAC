require 'spec_helper'

describe AiContentReview, :type => :model do
  def valid_attrs(overrides = {})
    {
      user_global_id: '1_1',
      content_type: 'Board',
      content_global_id: '1_99',
      requested_at: Time.now.utc
    }.merge(overrides)
  end

  describe "validations" do
    it "is valid with the required fields" do
      expect(AiContentReview.new(valid_attrs)).to be_valid
    end

    it "requires user_global_id, content_type, content_global_id, requested_at" do
      review = AiContentReview.new
      expect(review).not_to be_valid
      expect(review.errors[:user_global_id]).to be_present
      expect(review.errors[:content_type]).to be_present
      expect(review.errors[:content_global_id]).to be_present
      expect(review.errors[:requested_at]).to be_present
    end

    it "rejects an unknown status" do
      expect(AiContentReview.new(valid_attrs(status: 'bogus'))).not_to be_valid
    end

    it "rejects an unknown review_type" do
      expect(AiContentReview.new(valid_attrs(review_type: 'bogus'))).not_to be_valid
    end

    it "defaults status to pending and review_type to user_request" do
      review = AiContentReview.create!(valid_attrs)
      expect(review.status).to eq('pending')
      expect(review.review_type).to eq('user_request')
      expect(review.article_50_triggered).to eq(false)
    end
  end

  describe "scopes" do
    it "filters pending, open, jurisdiction, and article_50" do
      pending = AiContentReview.create!(valid_attrs(jurisdiction: 'EU', article_50_triggered: true))
      done = AiContentReview.create!(valid_attrs(status: 'completed'))

      expect(AiContentReview.pending).to include(pending)
      expect(AiContentReview.pending).not_to include(done)
      expect(AiContentReview.open).to include(pending)
      expect(AiContentReview.open).not_to include(done)
      expect(AiContentReview.for_jurisdiction('EU')).to include(pending)
      expect(AiContentReview.article_50).to include(pending)
      expect(AiContentReview.article_50).not_to include(done)
    end
  end

  describe ".request_review" do
    it "creates a pending review from a user-like object" do
      user = Struct.new(:global_id).new('1_42')
      review = AiContentReview.request_review(
        user: user,
        content_type: 'Board',
        content_global_id: '1_99',
        reason: 'Looks AI-generated',
        jurisdiction: 'EU',
        article_50_triggered: true
      )
      expect(review).to be_persisted
      expect(review.user_global_id).to eq('1_42')
      expect(review.status).to eq('pending')
      expect(review.requested_at).to be_present
    end

    it "accepts a raw global_id string" do
      review = AiContentReview.request_review(
        user: '1_7', content_type: 'Board', content_global_id: '1_99'
      )
      expect(review.user_global_id).to eq('1_7')
    end
  end
end
