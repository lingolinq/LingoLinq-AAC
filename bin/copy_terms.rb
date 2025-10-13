#!/usr/bin/env ruby
# Standalone script to copy legal templates from ERB to Ember HBS
# This runs during Docker build without requiring Rails environment

puts "==> Copying terms and legal templates..."

['privacy', 'terms', 'jobs', 'privacy_practices'].each do |type|
  erb_file = "./app/views/shared/_#{type}.html.erb"
  hbs_file = "./app/frontend/app/templates/#{type}.hbs"
  
  if File.exist?(erb_file)
    str = "<!-- auto-generated from #{erb_file} -->\n"
    str += File.read(erb_file)
    File.open(hbs_file, 'w') do |f|
      f.puts str
    end
    puts "  ✓ Copied #{type}.html.erb -> #{type}.hbs"
  else
    puts "  ⚠ Warning: #{erb_file} not found, skipping"
  end
end

puts "==> Terms copying complete!"

