# frozen_string_literal: true

# Generates AI-powered word prediction data using Claude or Gemini.
# Output format matches what word_suggestions.js expects:
#   { "suggestions": { "": [["the", -1.0], ...], "want": [["to", -0.3], ...] } }
#
# Usage:
#   rake predictions:generate                    # full generation (~5K starters)
#   rake predictions:generate[200]               # quick test with 200 starters
#   rake predictions:upload                      # upload to S3
#   rake predictions:generate_and_upload          # both

namespace :predictions do
  desc "Generate AI word prediction data from core AAC vocabulary"
  task :generate, [:batch_size] => :environment do |_t, args|
    require_relative '../ai_prediction_generator'
    batch_size = (args[:batch_size] || 0).to_i
    AiPredictionGenerator.generate(batch_size: batch_size > 0 ? batch_size : nil)
  end

  desc "Upload generated prediction file to S3"
  task :upload => :environment do
    require_relative '../ai_prediction_generator'
    AiPredictionGenerator.upload_to_s3
  end

  desc "Generate and upload prediction data"
  task :generate_and_upload, [:batch_size] => :environment do |_t, args|
    Rake::Task['predictions:generate'].invoke(args[:batch_size])
    Rake::Task['predictions:upload'].invoke
  end
end
