namespace :openaac do
  desc "Import OpenAAC vocabulary sets from openboardformat.org"
  task import_vocabularies: :environment do
    require 'open-uri'
    require 'fileutils'
    require Rails.root.join('lib', 'converters', 'cough_drop')
    
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

    # Initialize options hash for converter
    import_opts = {
      'user' => admin_user,
      'boards' => {}  # Track board mappings during import
    }
    
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
          result = Converters::LingoLinq.from_obz(file_path.to_s, import_opts)
          puts "OK Successfully imported #{vocab[:name]}"
          result.each_with_index do |board, idx|
            if idx == 0
              # The first board is typically the main navigation board
              board.public = true
              board.settings['home_board'] = true
              board.settings['unlisted'] = false
            else
              # Topic boards should be public but unlisted (only accessible via navigation)
              board.public = true
              board.settings['unlisted'] = true
            end
            board.generate_stats
            board.save_without_post_processing
          end
        elsif filename.end_with?('.obf')
          # Use Converters::Utils for OBF files
          result = Converters::LingoLinq.from_obf(file_path.to_s, import_opts)
          puts "OK Successfully imported #{vocab[:name]}"
          result.public = true
          result.settings['home_board'] = true
          result.settings['unlisted'] = false
          result.generate_stats
          result.save_without_post_processing
        end
        
        # Clean up downloaded file
        File.delete(file_path) if File.exist?(file_path)
        
      rescue => e
        puts "ERROR ERROR importing #{vocab[:name]}: #{e.message}"
      puts e.backtrace.first(10).join("\n")  # Always show backtrace for debugging       
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

  desc "Import a single OpenAAC vocabulary set"
  task :import_single, [:vocab_name] => :environment do |t, args|
    require 'open-uri'
    require 'fileutils'
    require Rails.root.join('lib', 'converters', 'cough_drop')

    # Define all vocabulary sets
    all_vocabularies = {
      'quick-core-24' => { name: 'Quick Core 24', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-24.obz' },
      'quick-core-40' => { name: 'Quick Core 40', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-40.obz' },
      'quick-core-60' => { name: 'Quick Core 60', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-60.obz' },
      'quick-core-84' => { name: 'Quick Core 84', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-84.obz' },
      'quick-core-112' => { name: 'Quick Core 112', url: 'https://openboards.s3.amazonaws.com/examples/quick-core-112.obz' },
      'vocal-flair-24' => { name: 'Vocal Flair 24', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-24.obz' },
      'vocal-flair-40' => { name: 'Vocal Flair 40', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-40.obz' },
      'vocal-flair-60' => { name: 'Vocal Flair 60', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-60.obz' },
      'vocal-flair-84' => { name: 'Vocal Flair 84', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-84.obz' },
      'vocal-flair-84-keyboard' => { name: 'Vocal Flair 84 With Keyboard', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-84-with-keyboard.obz' },
      'vocal-flair-112' => { name: 'Vocal Flair 112', url: 'https://openboards.s3.amazonaws.com/examples/vocal-flair-112.obz' },
      'communikate-20' => { name: 'CommuniKate 20', url: 'https://openboards.s3.amazonaws.com/examples/communikate-20.obz' },
      'communikate-12' => { name: 'CommuniKate 12', url: 'https://openboards.s3.amazonaws.com/examples/ck12.obz' },
      'project-core' => { name: 'Project Core', url: 'https://openboards.s3.amazonaws.com/examples/project-core.obf' },
      'sequoia-15' => { name: 'Sequoia 15', url: 'https://openboards.s3.amazonaws.com/examples/sequoia-15.obz' }
    }

    vocab_key = args[:vocab_name]
    unless vocab_key
      puts "ERROR: Please specify a vocabulary name"
      puts "Usage: rake openaac:import_single[quick-core-24]"
      puts "\nAvailable vocabularies:"
      all_vocabularies.keys.each { |k| puts "  - #{k}" }
      exit 1
    end

    vocab = all_vocabularies[vocab_key]
    unless vocab
      puts "ERROR: Unknown vocabulary '#{vocab_key}'"
      puts "\nAvailable vocabularies:"
      all_vocabularies.keys.each { |k| puts "  - #{k}" }
      exit 1
    end

    # Get or create admin user
    admin_user = User.find_by(user_name: 'example') || User.first
    unless admin_user
      puts "ERROR: No admin user found. Please run db:seed first."
      exit 1
    end

    # Create temp directory
    temp_dir = Rails.root.join('tmp', 'vocab_import')
    FileUtils.mkdir_p(temp_dir)

    import_opts = {
      'user' => admin_user,
      'boards' => {}
    }

    puts "="*60
    puts "Importing: #{vocab[:name]}"
    puts "="*60

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

      # Import
      puts "Importing into database..."
      if filename.end_with?('.obz')
        result = Converters::LingoLinq.from_obz(file_path.to_s, import_opts)
        puts "OK Successfully imported #{vocab[:name]}"
        result.each_with_index do |board, idx|
          if idx == 0
            board.public = true
            board.settings['home_board'] = true
            board.settings['unlisted'] = false
          else
            board.public = true
            board.settings['unlisted'] = true
          end
          board.generate_stats
          board.save_without_post_processing
        end
        puts "  Imported #{result.length} boards"
      elsif filename.end_with?('.obf')
        result = Converters::LingoLinq.from_obf(file_path.to_s, import_opts)
        puts "OK Successfully imported #{vocab[:name]}"
        result.public = true
        result.settings['home_board'] = true
        result.settings['unlisted'] = false
        result.generate_stats
        result.save_without_post_processing
        puts "  Imported 1 board"
      end

      # Clean up
      File.delete(file_path) if File.exist?(file_path)

    rescue => e
      puts "ERROR ERROR: #{e.message}"
      puts e.backtrace.first(10).join("\n")
      exit 1
    end

    puts "="*60
    puts "Import complete!"
    puts "="*60
  end
end
end
