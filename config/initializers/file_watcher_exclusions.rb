# Configure file watcher to exclude large directories that don't need to be watched
# This prevents Rack::Timeout errors when Rails tries to check for file changes
# during request processing in development mode.
#
# The issue: ActiveSupport::FileUpdateChecker was timing out when scanning
# directories like node_modules, dist/, etc. that contain thousands of files.
#
# Solution: Override the watched method to use a timeout and skip slow directory scans

require 'timeout'

if Rails.env.development? && defined?(ActiveSupport::FileUpdateChecker)
  ActiveSupport::FileUpdateChecker.class_eval do
    alias_method :original_watched, :watched

    def watched
      @watched ||= begin
        all = @files.select { |f| File.exist?(f) }
        if @glob
          # Use a timeout to prevent hanging on large directory scans
          # If the glob scan takes too long, return what we have so far
          # Using 5 seconds to give it time but still prevent rack-timeout (15s)
          begin
            Timeout.timeout(5) do
              glob_results = Dir[@glob]
              # Filter out excluded directories from the glob results
              excluded_patterns = [
                '**/node_modules/**',
                '**/app/frontend/node_modules/**',
                '**/app/frontend/dist/**',
                '**/app/frontend/tmp/**',
                '**/app/assets/javascripts/frontend/bower_components/**',
                '**/vendor/**',
                '**/public/assets/**',
                '**/log/**',
                '**/tmp/**',
                '**/.git/**',
                '**/coverage/**',
                '**/backup/**',
                '**/temp_logos/**'
              ]
              
              filtered = glob_results.reject do |file|
                excluded_patterns.any? { |pattern| File.fnmatch?(pattern, file, File::FNM_PATHNAME | File::FNM_DOTMATCH) }
              end
              all.concat(filtered)
            end
          rescue Timeout::Error
            # If glob scan times out, log a warning and return what we have
            Rails.logger.warn "[FileWatcher] Glob pattern #{@glob} timed out, skipping file watch update"
            all
          end
        else
          all
        end
      end
    end
  end
end
