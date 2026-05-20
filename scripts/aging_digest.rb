#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'
require 'date'

# Configuration
THRESHOLD_DAYS = 14
WEBHOOK_URL = ENV['GOOGLE_CHAT_WEBHOOK_AUTOMATION']
REPO = ENV['GITHUB_REPOSITORY'] || "lingolinq/LingoLinq-AAC"

def fetch_aging_items(type)
  # Updated date check logic: gh CLI doesn't easily filter by date in JSON output directly
  # so we fetch all and filter in Ruby.
  cmd = "gh #{type} list --repo #{REPO} --state open --json number,title,updatedAt,url,author --limit 100"
  output = `#{cmd}`
  return [] if output.strip.empty?
  
  items = JSON.parse(output)
  items.select do |item|
    updated_at = DateTime.parse(item['updatedAt']).to_date
    updated_at < Date.today - THRESHOLD_DAYS
  end
rescue => e
  puts "Error fetching #{type}s: #{e.message}"
  []
end

puts "Fetching aging items for #{REPO}..."
prs = fetch_aging_items('pr')
issues = fetch_aging_items('issue')

if prs.empty? && issues.empty?
  puts "No items aging more than #{THRESHOLD_DAYS} days. Skipping notification."
  exit 0
end

message = "⏳ *Aging Items Digest (>#{THRESHOLD_DAYS} days since activity)*\n"
message += "Repository: `#{REPO}`\n\n"

if prs.any?
  message += "*Pull Requests (#{prs.length}):*\n"
  prs.sort_by { |p| p['updatedAt'] }.each do |pr|
    days = (Date.today - DateTime.parse(pr['updatedAt']).to_date).to_i
    message += "• <#{pr['url']}|##{pr['number']}: #{pr['title']}> _(#{days}d)_ \n"
  end
  message += "\n"
end

if issues.any?
  message += "*Issues (#{issues.length}):*\n"
  # Filter out PRs if gh issue list returns them (sometimes it does depending on version/repo)
  # But usually gh issue list is clean.
  issues.sort_by { |i| i['updatedAt'] }.each do |issue|
    days = (Date.today - DateTime.parse(issue['updatedAt']).to_date).to_i
    message += "• <#{issue['url']}|##{issue['number']}: #{issue['title']}> _(#{days}d)_\n"
  end
end

if WEBHOOK_URL.to_s.empty? || WEBHOOK_URL == "placeholder"
  puts "--- DIGEST PREVIEW ---"
  puts message
  puts "----------------------"
  puts "No GOOGLE_CHAT_WEBHOOK_AUTOMATION configured. Set the environment variable to send."
else
  puts "Sending notification to Google Chat..."
  uri = URI.parse(WEBHOOK_URL)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  request = Net::HTTP::Post.new(uri.request_uri, {'Content-Type' => 'application/json'})
  request.body = { text: message }.to_json
  response = http.request(request)
  
  if response.code.to_i >= 200 && response.code.to_i < 300
    puts "Notification sent successfully."
  else
    puts "Failed to send notification. Status: #{response.code}"
    puts response.body
    exit 1
  end
end
