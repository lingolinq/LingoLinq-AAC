# Fix for Sprockets Ruby 3.2+ chomp! error
# See: https://github.com/rails/sprockets/issues/716
#
# The issue is in Sprockets::DirectiveProcessor#process_source where
# processed_header.chomp! is called on line 157, but processed_header
# can be a boolean true instead of a string.

if defined?(Sprockets::DirectiveProcessor)
  module SprocketsChompFix
    def process_source(source)
      # Call the original method
      result = super(source)
      
      # result is [processed_header, directives]
      # Ensure processed_header is a string before it's used
      if result.is_a?(Array) && result.length >= 1
        processed_header = result[0]
        
        # Convert boolean true to empty string
        if processed_header == true || processed_header == false
          result[0] = ""
        elsif !processed_header.is_a?(String)
          result[0] = processed_header.to_s
        end
      end
      
      result
    end
  end
  
  Sprockets::DirectiveProcessor.prepend(SprocketsChompFix)
  Rails.logger.info "✅ Sprockets chomp! fix applied (Ruby 3.2+ compatibility)"
else
  Rails.logger.info "⏭️  Sprockets not loaded, chomp! fix not needed"
end

