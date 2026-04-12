class FeedbackRouter
  ROUTING = {
    'bug'             => { email: 'support@lingolinq.com',  priority: 'normal' },
    'outage'          => { email: 'support@lingolinq.com',  priority: 'urgent' },
    'feature_request' => { email: 'support@lingolinq.com',  priority: 'low',    notion: true },
    'help'            => { email: 'support@lingolinq.com',  priority: 'normal' },
    'billing'         => { email: 'billing@lingolinq.com',  priority: 'normal' }
  }.freeze

  def self.route(feedback)
    config = ROUTING[feedback.category] or raise ArgumentError, "unknown category: #{feedback.category}"
    feedback.update!(priority: config[:priority]) if feedback.priority != config[:priority]
    FeedbackMailer.notify(feedback, config[:email]).deliver_later
    # TODO Sprint 2: NotionSyncJob.perform_later(feedback.id) if config[:notion]
    # TODO Sprint 2: N8nWebhookJob.perform_later(feedback.id) if config[:priority] == 'urgent'
  end
end
