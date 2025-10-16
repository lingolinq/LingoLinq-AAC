# Fix for Sprockets Ruby 3.2+ chomp! error
# See: https://github.com/rails/sprockets/issues/716
#
# In Ruby 3.2+, String#chomp! returns nil when there's nothing to chomp.
# Sprockets expects chomp! to always return self (the string).
# This monkey patch makes String#chomp! behave like it did in Ruby < 3.2

if RUBY_VERSION >= '3.2.0'
  class String
    # Store the original chomp! method
    alias_method :original_chomp!, :chomp!

    # Override chomp! to always return self instead of nil
    def chomp!(separator = $/)
      result = original_chomp!(separator)
      # In Ruby 3.2+, chomp! returns nil if nothing was removed
      # We need to return self instead for Sprockets compatibility
      result.nil? ? self : result
    end
  end

  puts "✅ String#chomp! patched for Ruby 3.2+ (Sprockets compatibility)"
else
  puts "⏭️  Ruby < 3.2, String#chomp! patch not needed"
end
