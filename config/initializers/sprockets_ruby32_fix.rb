# Fix for Sprockets chomp! issue with Ruby 3.2+
# See: https://github.com/rails/sprockets/issues/716

# The issue is in Sprockets::DirectiveProcessor at line 84 where it calls chomp!
# on a value that can be boolean instead of string.
# We patch the method that processes directives to ensure the value is a string.

# IMPORTANT: This patch must be applied whenever Sprockets is loaded, including production.
# Even though assets are precompiled, Rails may still use Sprockets to serve them when
# RAILS_SERVE_STATIC_FILES=true, which is required for containerized deployments.
if defined?(Sprockets::DirectiveProcessor)
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
  Rails.logger.info "✅ Sprockets Ruby 3.2 fix applied (prevents chomp! NoMethodError)"
else
  Rails.logger.info "⏭️  Sprockets not loaded, fix not needed"
end