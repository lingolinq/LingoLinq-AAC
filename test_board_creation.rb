#!/usr/bin/env ruby
# Script to manually create a board and trace buttonset creation
# Usage: rails runner test_board_creation.rb

require 'pp'

# Find or create a test user
user = User.find_by(user_name: 'example') || User.first
unless user
  puts "No user found. Please create a user first."
  exit 1
end

puts "=" * 80
puts "Creating board for user: #{user.user_name} (#{user.global_id})"
puts "=" * 80

# Create a new board with some buttons
board_params = {
  'name' => "Test Board #{Time.now.to_i}",
  'grid' => {
    'rows' => 2,
    'columns' => 4,
    'order' => [
      [1, 2, nil, nil],
      [3, 4, nil, nil]
    ]
  },
  'buttons' => [
    {'id' => 1, 'label' => 'hello', 'vocalization' => 'hello'},
    {'id' => 2, 'label' => 'world', 'vocalization' => 'world'},
    {'id' => 3, 'label' => 'test', 'vocalization' => 'test'},
    {'id' => 4, 'label' => 'board', 'vocalization' => 'board'}
  ],
  'locale' => 'en',
  'public' => false
}

puts "\n1. Creating board with params:"
puts "   Name: #{board_params['name']}"
puts "   Buttons: #{board_params['buttons'].length}"

# Create the board
opts = {
  user: user,
  author: user
}

puts "\n2. Calling Board.process_new..."
board = Board.process_new(board_params, opts)

if board.errored?
  puts "   ERROR: Board creation failed!"
  puts "   Errors: #{board.processing_errors.inspect}"
  exit 1
end

puts "   Board created: #{board.global_id}"
puts "   Board key: #{board.key}"
puts "   Board ID: #{board.id}"

# Check if buttonset was created
puts "\n3. Checking for buttonset..."
buttonset = board.board_downstream_button_set

if buttonset
  puts "   ✓ Buttonset found: #{buttonset.global_id}"
  puts "   Buttonset board_id: #{buttonset.board_id}"
  puts "   Buttonset user_id: #{buttonset.user_id}"
  puts "   Buttonset data keys: #{buttonset.data.keys.inspect}" if buttonset.data
  puts "   Buttonset persisted?: #{buttonset.persisted?}"
  puts "   Buttonset created_at: #{buttonset.created_at}"
  puts "   Buttonset updated_at: #{buttonset.updated_at}"
else
  puts "   ✗ No buttonset found!"
  puts "   Attempting to create buttonset manually..."
  
  begin
    BoardDownstreamButtonSet.update_for(board.global_id, true)
    board.reload
    buttonset = board.board_downstream_button_set
    if buttonset
      puts "   ✓ Buttonset created: #{buttonset.global_id}"
    else
      puts "   ✗ Buttonset still not found after manual creation"
    end
  rescue => e
    puts "   ✗ Error creating buttonset: #{e.class}: #{e.message}"
    puts "   Backtrace:"
    puts e.backtrace.first(5).map { |l| "     #{l}" }.join("\n")
  end
end

# Check board settings
puts "\n4. Board settings:"
puts "   full_set_revision: #{board.full_set_revision}"
puts "   current_revision: #{board.current_revision}"
puts "   board_downstream_button_set_id: #{board.settings['board_downstream_button_set_id']}"

puts "\n" + "=" * 80
puts "Done!"
puts "=" * 80
