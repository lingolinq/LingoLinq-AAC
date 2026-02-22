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
end
