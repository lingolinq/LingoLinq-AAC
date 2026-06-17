#!/usr/bin/env ruby
require 'bundler/setup'
require 'active_model'

bool_type = ActiveModel::Type::Boolean.new

# Test the exact logic from the controller
def controller_logic(param_value, bool_type)
  (bool_type.cast(param_value) == true)
end

test_cases = [
  [true, true],
  [false, false],
  ["true", true],
  ["false", false],
  ["True", true],
  ["False", true],  # BUG: "False" -> true!
  ["TRUE", true],
  ["FALSE", false],
  ["yes", true],
  ["no", true],     # BUG: "no" -> true!
  ["Yes", true],
  ["No", true],     # BUG: "No" -> true!
  ["YES", true],
  ["NO", true],     # BUG: "NO" -> true!
  ["1", true],
  ["0", false],
  ["on", true],
  ["off", false],
  ["On", true],
  ["Off", true],    # BUG: "Off" -> true!
]

puts "Testing controller logic (ActiveModel::Type::Boolean.new.cast(value) == true):"
test_cases.each do |input, expected|
  result = controller_logic(input, bool_type)
  status = result == expected ? "OK" : "BUG!"
  puts "#{input.inspect} -> #{result} (expected #{expected}) #{status}"
end
