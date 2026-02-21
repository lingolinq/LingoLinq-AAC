#!/usr/bin/env ruby
# Diagnostic script to inspect OBZ file contents and verify images are present.
# Usage: ruby scripts/inspect_obz.rb path/to/board.obz
#
# OBZ structure (Open Board Format archive):
#   - ZIP file containing manifest.json, board JSON files, and image/sound binaries
#   - manifest.json: root board path, paths for images/sounds/boards
#   - board_<id>.obf: JSON with buttons (image_id refs) and images array (path or data)
#   - images/image_<id>.<ext>: binary image files

require 'zip'
require 'json'

obz_path = ARGV[0]
unless obz_path && File.exist?(obz_path)
  puts "Usage: ruby scripts/inspect_obz.rb <path/to/board.obz>"
  exit 1
end

puts "=== OBZ Inspection: #{obz_path} ===\n\n"

issues = []
Zip::File.open(obz_path) do |zip|
  # 1. Check manifest
  manifest_entry = zip.find { |e| e.name == 'manifest.json' }
  unless manifest_entry
    puts "ERROR: No manifest.json found - invalid OBZ file"
    exit 1
  end

  manifest = JSON.parse(manifest_entry.get_input_stream.read)
  puts "Manifest:"
  puts "  Root board: #{manifest['root']}"
  puts "  Format: #{manifest['format']}"

  image_paths = manifest.dig('paths', 'images') || {}
  sound_paths = manifest.dig('paths', 'sounds') || {}
  puts "  Image paths in manifest: #{image_paths.keys.length}"
  puts "  Sound paths in manifest: #{sound_paths.keys.length}"

  # 2. List all entries
  entry_names = zip.entries.map(&:name)
  image_entries = entry_names.select { |e| e.start_with?('images/') }
  board_entries = entry_names.select { |e| e.end_with?('.obf') }

  puts "\nZip contents:"
  puts "  Total entries: #{entry_names.length}"
  puts "  Board files: #{board_entries.length} (#{board_entries.join(', ')})"
  puts "  Image files: #{image_entries.length}"

  # 3. Verify each image path in manifest exists in zip
  image_paths.each do |id, path|
    unless entry_names.include?(path)
      issues << "Manifest references image #{id} at '#{path}' but file NOT in zip"
    end
  end

  # 4. Parse root board and check images
  root_content = zip.read(manifest['root'])
  root_board = JSON.parse(root_content)

  buttons_with_images = (root_board['buttons'] || []).select { |b| b['image_id'] }
  images_array = root_board['images'] || []

  puts "\nRoot board (#{manifest['root']}):"
  puts "  Buttons: #{root_board['buttons']&.length || 0}"
  puts "  Buttons with image_id: #{buttons_with_images.length}"
  puts "  Images in board JSON: #{images_array.length}"

  # 5. Check each image referenced by buttons
  button_image_ids = buttons_with_images.map { |b| b['image_id'] }.uniq
  puts "\nImage analysis:"

  button_image_ids.each do |img_id|
    img = images_array.find { |i| i['id'] == img_id }
    if img.nil?
      issues << "Button references image_id '#{img_id}' but NO image in images array"
      next
    end

    has_data = img['data'] && img['data'].length > 0
    has_path = img['path'] && img['path'].length > 0
    has_url = img['url'] && img['url'].length > 0

    status = []
    status << "data(#{img['data']&.length || 0} chars)" if has_data
    status << "path=#{img['path']}" if has_path
    status << "url=#{img['url']&.slice(0, 50)}..." if has_url && !has_data && !has_path

    if has_path
      if entry_names.include?(img['path'])
        status << "FILE EXISTS in zip"
      else
        issues << "Image #{img_id} path '#{img['path']}' NOT FOUND in zip"
      end
    elsif !has_data && !has_url
      issues << "Image #{img_id} has neither data, path, nor url - WILL NOT DISPLAY"
    end

    puts "  #{img_id}: #{status.join(' | ') || 'MISSING CONTENT'}"
  end

  # 6. Check for orphan images (in zip but not in manifest)
  image_entries.each do |entry|
    # Entry format: images/image_<id>.<ext>
    id_from_path = entry.match(/images\/image_(.+)\.\w+/)&.[](1)
    if id_from_path && !image_paths.value?(entry)
      # Could be in manifest with different structure
    end
  end
end

puts "\n=== Summary ==="
if issues.empty?
  puts "No obvious issues found. Images appear to be embedded."
  puts "\nIf images still don't display on import, the problem may be:"
  puts "  1. Import logic (ButtonImage.process, upload_to_remote)"
  puts "  2. Frontend rendering (process_for_displaying, button image resolution)"
  puts "  3. Protected images - user may lack permission for protected_source"
else
  puts "ISSUES DETECTED:"
  issues.each { |i| puts "  - #{i}" }
end
