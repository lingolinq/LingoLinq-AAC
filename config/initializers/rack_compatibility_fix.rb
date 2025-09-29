# Fix for Rails 6.1 + Rack 2.2.18 compatibility issue
# ActionDispatch::FileHandler doesn't have match? method in Rack 2.2.18
# This is a temporary fix until we can upgrade to Rails 7+

if Rails.env.production?
  module ActionDispatch
    class FileHandler
      unless method_defined?(:match?)
        def match?(path)
          # Simple pattern matching for file paths
          path.is_a?(String) && @root && File.exist?(File.join(@root, path))
        end
      end
    end
  end
end