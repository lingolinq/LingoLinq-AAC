#!/usr/bin/env ruby
require 'bundler/setup'
require 'active_model'

bool_type = ActiveModel::Type::Boolean.new

test_values = [
  'true', 'TRUE', 'True',
  'false', 'FALSE', 'False',
  't', 'T', 'f', 'F',
  'yes', 'YES', 'Yes',
  'no', 'NO', 'No',
  'on', 'ON', 'On',
  'off', 'OFF', 'Off',
  '1', '0',
  1, 0,
  true, false,
  '', nil
]

puts "Testing ActiveModel::Type::Boolean.new.cast:"
test_values.each do |val|
  result = bool_type.cast(val)
  puts "#{val.inspect} (#{val.class}) -> #{result.inspect} (#{result.class})"
end
