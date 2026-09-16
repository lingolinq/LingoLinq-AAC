# Be sure to restart your server when you modify this file.

# Configure sensitive parameters which will be filtered from the log file.
Rails.application.config.filter_parameters += [:password, :access_token, :board, :user, :log, :message, :image, :sound, :utterance, :client_secret, :code]
