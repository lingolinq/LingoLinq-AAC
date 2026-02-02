namespace :openaac do
  desc "Import OpenAAC vocabulary sets from openboardformat.org"
  task import_vocabularies: :environment do
    require 'open-uri'
    require 'fileutils'
    
    # Create temp directory for downloads
    temp_dir = Rails.root.join('tmp', 'vocab_import')
    FileUtils.mkdir_p(temp_dir)
    
    # Define all vocabulary sets to import
    vocabularies = [
      # Quick Core Series
      { name: 'Quick Core 24', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-24.obz' },
      { name: 'Quick Core 40', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-40.obz' },
      { name: 'Quick Core 60', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-60.obz' },
      { name: 'Quick Core 84', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-84.obz' },
      { name: 'Quick Core 112', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-112.obz' },
      
      # Vocal Flair Series
      { name: 'Vocal Flair 24', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-24.obz' },
      { name: 'Vocal Flair 40', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-40.obz' },
      { name: 'Vocal Flair 60', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-60.obz' },
      { name: 'Vocal Flair 84', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-84.obz' },
      { name: 'Vocal Flair 84 With Keyboard', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-84-with-keyboard.obz' },
      { name: 'Vocal Flair 112', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-112.obz' },
      
      # Other vocabularies
      { name: 'CommuniKate 20', url: 'https://openboards.s3.amazonaws.com/examples/communikate-20.obz' },
      { name: 'CommuniKate 12', url: 'https://openboards.s3.amazonaws.com/examples/ck12.obz' },
      { name: 'Project Core', url: 'https://openboards.s3.amazonaws.com/examples/project-core.obf' },
      { name: 'Sequoia 15', url: 'https://openboards.s3.amazonaws.com/examples/sequoia-15.obz' }
    ]
    
    # Get or create admin user for board ownership
    admin_user = User.find_by(user_name: 'example') || User.first
    unless admin_user
      puts "ERROR: No admin user found. Please run db:seed first."
      exit 1
    end
    
    puts "\n" + "="*60
    puts "OpenAAC Vocabulary Import"
    puts "Importing vocabularies as user: #{admin_user.user_name}"
    puts "="*60
    
    vocabularies.each do |vocab|
      puts "\n" + "-"*60
      puts "Processing: #{vocab[:name]}"
      puts "-"*60
      
      begin
        # Download file
        filename = File.basename(URI.parse(vocab[:url]).path)
        file_path = temp_dir.join(filename)
        
        puts "Downloading from #{vocab[:url]}..."
        URI.open(vocab[:url]) do |remote_file|
          File.open(file_path, 'wb') do |local_file|
            local_file.write(remote_file.read)
          end
        end
        
        file_size_mb = File.size(file_path) / 1024.0 / 1024.0
        puts "Downloaded #{file_size_mb.round(2)} MB"
        
        # Import using existing OBF converter
        puts "Importing into database..."
        if filename.end_with?('.obz')
          # Use Converters::Utils for OBZ files
          result = Converters::Utils.obz_to_boards(file_path.to_s, admin_user)
          puts "✓ Successfully imported #{vocab[:name]}"
          puts "  Boards created: #{result[:boards]&.count || 'unknown'}"
        elsif filename.end_with?('.obf')
          # Use Converters::Utils for OBF files
          result = Converters::Utils.obf_to_boards(file_path.to_s, admin_user)
          puts "✓ Successfully imported #{vocab[:name]}"
          puts "  Board created: #{result[:board]&.key || 'unknown'}"
        end
        
        # Clean up downloaded file
        File.delete(file_path) if File.exist?(file_path)
        
      rescue => e
        puts "✗ ERROR importing #{vocab[:name]}: #{e.message}"
        puts e.backtrace.first(5).join("\n") if ENV['VERBOSE']
        # Continue with next vocabulary even if one fails
      end
    end
    
    puts "\n" + "="*60
    puts "Import complete!"
    puts "Total vocabularies processed: #{vocabularies.length}"
    puts "="*60
    
    # Clean up temp directory
    FileUtils.rm_rf(temp_dir)
  end
  
  desc "List available OpenAAC vocabularies"
  task list_vocabularies: :environment do
    vocabularies = [
      'Quick Core 24', 'Quick Core 40', 'Quick Core 60', 'Quick Core 84', 'Quick Core 112',
      'Vocal Flair 24', 'Vocal Flair 40', 'Vocal Flair 60', 'Vocal Flair 84', 
      'Vocal Flair 84 With Keyboard', 'Vocal Flair 112',
      'CommuniKate 20', 'CommuniKate 12', 'Project Core', 'Sequoia 15'
    ]
    
    puts "\nAvailable OpenAAC Vocabularies:"
    puts "="*60
    vocabularies.each_with_index do |vocab, idx|
      puts "#{idx + 1}. #{vocab}"
    end
    puts "="*60
    puts "\nTo import all: rake openaac:import_vocabularies"
    puts "\n"
  end
end
