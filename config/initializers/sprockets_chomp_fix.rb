# Fix for Sprockets Ruby 3.2+ chomp! error
# See: https://github.com/rails/sprockets/issues/716
#
# In Ruby 3.2+, String#chomp! returns nil when there's nothing to chomp.
# This causes issues in Sprockets DirectiveProcessor.
# We patch Sprockets directly rather than modifying String globally.

if defined?(Sprockets::DirectiveProcessor)
  module SprocketsRuby32Fix
    # Patch the method that has the chomp! bug
    def process_source(source)
      result = super(source)

      # Ensure the first element (processed_header) is always a string
      if result.is_a?(Array) && result.length >= 1
        result[0] = "" if result[0].nil?
        result[0] = result[0].to_s unless result[0].is_a?(String)
      end

      result
    end
  end

  Sprockets::DirectiveProcessor.prepend(SprocketsRuby32Fix)
  puts "✅ Sprockets DirectiveProcessor patched for Ruby 3.2+ compatibility"
else
  puts "⏭️  Sprockets not loaded, patch not needed"
end
