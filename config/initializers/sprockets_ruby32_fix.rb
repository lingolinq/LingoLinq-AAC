# Fix for Sprockets chomp! issue with Ruby 3.2+
# See: https://github.com/rails/sprockets/issues/716

# The issue is in Sprockets::DirectiveProcessor at line 84 where it calls chomp!
# on a value that can be boolean instead of string.
# We patch the method that processes directives to ensure the value is a string.

# IMPORTANT: Only apply this patch during asset precompilation, NOT during production runtime.
# In production, assets are precompiled and served as static files - Sprockets should not be involved.
# This patch interferes with static asset serving and causes 500 errors.
if defined?(Sprockets::DirectiveProcessor) && (Rails.env.development? || Rails.env.test? || ENV['RAILS_GROUPS']&.include?('assets'))
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
  Rails.logger.info "✅ Sprockets Ruby 3.2 fix applied for asset precompilation"
else
  Rails.logger.info "⏭️  Sprockets Ruby 3.2 fix skipped (production runtime - using precompiled assets)"
end