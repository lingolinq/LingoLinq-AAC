require 'spec_helper'

describe FeedbackRouter, :type => :model do
  def build_feedback(category:, priority: 'normal', email: nil)
    Feedback.create!(
      category: category,
      priority: priority,
      description: 'something happened',
      email: email,
      device_info: {},
      status: 'open'
    )
  end

  before(:each) do
    @mailer = double('mailer', deliver_later: true)
    allow(FeedbackMailer).to receive(:notify).and_return(@mailer)
  end

  describe '.route' do
    it 'routes bug to support@lingolinq.com with normal priority' do
      f = build_feedback(category: 'bug')
      FeedbackRouter.route(f)
      expect(FeedbackMailer).to have_received(:notify).with(f, 'support@lingolinq.com')
      expect(f.priority).to eq('normal')
    end

    it 'routes outage to support@lingolinq.com and assigns urgent priority' do
      f = build_feedback(category: 'outage', priority: 'normal')
      FeedbackRouter.route(f)
      expect(FeedbackMailer).to have_received(:notify).with(f, 'support@lingolinq.com')
      expect(f.reload.priority).to eq('urgent')
    end

    it 'routes feature_request to support@lingolinq.com and assigns low priority' do
      f = build_feedback(category: 'feature_request', priority: 'normal')
      FeedbackRouter.route(f)
      expect(FeedbackMailer).to have_received(:notify).with(f, 'support@lingolinq.com')
      expect(f.reload.priority).to eq('low')
    end

    it 'routes help to support@lingolinq.com with normal priority' do
      f = build_feedback(category: 'help')
      FeedbackRouter.route(f)
      expect(FeedbackMailer).to have_received(:notify).with(f, 'support@lingolinq.com')
      expect(f.priority).to eq('normal')
    end

    it 'routes billing to billing@lingolinq.com with normal priority' do
      f = build_feedback(category: 'billing')
      FeedbackRouter.route(f)
      expect(FeedbackMailer).to have_received(:notify).with(f, 'billing@lingolinq.com')
      expect(f.priority).to eq('normal')
    end

    it 'updates feedback.priority when router runs and config differs' do
      f = build_feedback(category: 'outage', priority: 'normal')
      expect { FeedbackRouter.route(f) }.to change { f.reload.priority }.from('normal').to('urgent')
    end

    it 'raises ArgumentError for unknown category' do
      f = Feedback.new(category: 'nope', priority: 'normal', description: 'x', device_info: {}, status: 'open')
      expect { FeedbackRouter.route(f) }.to raise_error(ArgumentError, /unknown category/)
    end
  end
end
