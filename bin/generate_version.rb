#!/usr/bin/env ruby
# Standalone script to generate version ID
# This runs during Docker build without requiring Rails environment

require 'date'

puts "==> Generating version ID..."

preload_file = './app/assets/javascripts/application-preload.js'

if !File.exist?(preload_file)
  puts "  ⚠ Warning: #{preload_file} not found, skipping version generation"
  exit 0
end

str = File.read(preload_file)
match = str.match(/window\.app_version\s+=\s+"([0-9\.]+)(\w*)";/)

if !match
  puts "  ⚠ Warning: Could not find app_version in #{preload_file}, skipping"
  exit 0
end

version = match[1]
revision = match[2]
date_version = Date.today.strftime('%Y.%m.%d')

if version == date_version
  if revision == ""
    revision = 'a'
  elsif revision[-1] == 'z'
    revision = revision[0..-2] + 'aa'
  else
    revision = revision[0..-2] + (revision[-1].ord + 1).chr
  end
  date_version += revision
end

str.sub!(/window\.app_version\s*=\s*"[^"]*";/, "window.app_version = \"#{date_version}\";")
File.write(preload_file, str)

puts "  ✓ Version set to: #{date_version}"
puts "==> Version generation complete!"

