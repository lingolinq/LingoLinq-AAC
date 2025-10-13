# Fix for Sprockets chomp! issue with Ruby 3.2+
# See: https://github.com/rails/sprockets/issues/716

# The issue is in Sprockets::DirectiveProcessor at line 84 where it calls chomp!
# on a value that can be boolean instead of string.
# We patch the method that processes directives to ensure the value is a string.

# DISABLED: Sprockets middleware is not used in production.
# Assets are precompiled during Docker build and served as static files.
# This avoids the Ruby 3.2 chomp! error entirely by not invoking Sprockets at runtime.

# Only apply this patch in development/test where Sprockets is actively used
if !Rails.env.production? && defined?(Sprockets::DirectiveProcessor)
  module SprocketsChompFix
    def call(input)
      # Call the original implementation
      result = super(input)

      # Ensure result[:data] is a string before any chomp! operations
      if result && result[:data] && !result[:data].is_a?(String)
        result[:data] = result[:data].to_s
      end

      result
    end
  end

  Sprockets::DirectiveProcessor.prepend(SprocketsChompFix)
  Rails.logger.info "✅ Sprockets Ruby 3.2 fix applied for development/test"
else
  Rails.logger.info "⏭️  Sprockets middleware disabled in production - serving static assets"
end