namespace :fix do
  desc "Populate ButtonImage url from pending_url for OpenSymbols images"
  task :button_image_urls => :environment do
    puts "=== Fixing ButtonImage URLs ==="
    
    broken_images = ButtonImage.where("url IS NULL OR url = ''")
    total = broken_images.count
    
    puts "Found #{total} ButtonImages with missing URLs"
    
    if total == 0
      puts "All ButtonImages already have URLs!"
      next
    end
    
    fixed = 0
    errors = 0
    
    broken_images.find_each(batch_size: 100) do |bi|
      begin
        pending_url = bi.settings['pending_url'] if bi.settings
        
        if pending_url && !pending_url.empty?
          bi.url = pending_url
          bi.settings.delete('pending')
          bi.settings.delete('pending_url')
          bi.settings.delete('errored_pending_url')
          bi.save!
          
          fixed += 1
          puts "  [#{fixed}/#{total}] Fixed" if fixed % 500 == 0
        else
          errors += 1
        end
      rescue => e
        errors += 1
        puts "  [ERROR] #{e.message}"
      end
    end
    
    puts "\n=== Complete ==="
    puts "Fixed: #{fixed}, Errors: #{errors}, Total: #{total}"
    
    remaining = ButtonImage.where("url IS NULL OR url = ''").count
    puts "Remaining missing URLs: #{remaining}"
    
    with_urls = ButtonImage.where("url IS NOT NULL AND url != ''").count
    puts "ButtonImages with URLs: #{with_urls}"
  end

  desc "Re-resolve plain S3 ButtonImages to OpenSymbols library URLs for skin tones (optional BOARD=key or id)"
  task :enrich_skin_library_urls => :environment do
    board_arg = ENV['BOARD']
    force = ENV['FORCE'] == '1'

    if board_arg.present?
      puts "=== Enriching skin library URLs for board #{board_arg} ==="
      changed = Board.enrich_button_images_for_skin(board_arg, force)
      puts changed ? "Updated button images for #{board_arg}" : "No changes for #{board_arg}"
      next
    end

    scope = ButtonImage.where("url ~* 'amazonaws|lingolinq.*uploads'")
    unless force
      scope = scope.where("settings->>'library_url_lookup_attempted' IS NULL OR settings->>'library_url_lookup_attempted' = 'false'")
    end
    total = scope.count
    puts "=== Enriching skin library URLs (#{total} images#{force ? ', force' : ''}) ==="

    enriched = 0
    scope.find_each(batch_size: 50) do |bi|
      label = bi.settings['button_label'] || bi.settings['search_term']
      if bi.ensure_library_url_for_skin!(label: label, force: force)
        enriched += 1
        puts "  [#{enriched}/#{total}] #{bi.global_id}" if enriched % 25 == 0
      end
    end

    puts "\n=== Complete ==="
    puts "Enriched: #{enriched} / #{total}"
  end
end
