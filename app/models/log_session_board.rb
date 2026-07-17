class LogSessionBoard < ApplicationRecord
  belongs_to :board
  belongs_to :log_session
  include Replicate

  def self.find_sessions(board_ids, options)
    Stats.sanitize_find_options!(options)
    board = board_ids[0] && Board.find_by_global_id(board_ids[0])
    raise(Stats.StatsError, "board not found") unless board
    # TODO: sharding
    session_ids = LogSessionBoard.where(board_id: board_ids).map(&:log_session_id)
    sessions = LogSession.where(['started_at > ? AND started_at < ?', options[:start_at], options[:end_at]])
    sessions = sessions.where(id: session_ids).select('id, log_type, started_at')
  end

  def self.init_stats(sessions, board)
    stats = {}
    stats[:total_sessions] = sessions.select{|s| s.log_type == 'session' }.length
    
    stats
  end

  def self.track_button!(stats, event, board, board_id)
    # on this board
    button_id = event['button']['id']
    button = (board.buttons || []).detect{|b| b['id'] == button_id }

    # TRACK:
    # number of times each button was hit
    # average travel distance per button
    # average depth per button activation
    # number of sub-boards with activity
    # most-common starting location
    # uses over time

    stats[:boards][board_id] ||= {}
    if board_id != 'self'
      stats[:boards][board_id][:sub_ids] ||= {}
      stats[:boards][board_id][:sub_ids][event['buttons']['board']['id']] ||= 0
      stats[:boards][board_id][:sub_ids][event['buttons']['board']['id']] += 1
    end
    stats[:boards][board_id][:count] ||= 0
    stats[:boards][board_id][:count] += 1
    if button
      stats[:boards][board_id][:buttons] ||= {}
      stats[:boards][board_id][:buttons][button_id] ||= {
        label: button['label'],
        vocalization: button['vocalization'],
        count: 0,
        depth_sum: 0,
        travel_sum: 0
      }
      stats[:boards][board_id][:buttons][button_id][:spoken] = true if (event['button']['spoken'] || event['button']['for_speaking'])
      stats[:boards][board_id][:buttons][button_id][:count] += 1
      stats[:boards][board_id][:buttons][button_id][:depth_sum] += event['button']['depth'] || 0
      stats[:boards][board_id][:buttons][button_id][:travel_sum] += event['button']['percent_travel'] || 0
      if event['button']['prior_percent_x'] && event['button']['first_on_board']
        stats[:boards][board_id][:start_locations] ||= []
        stats[:boards][board_id][:start_locations] << [event['button']['prior_percent_x'], event['button']['prior_percent_y']]
      end
    end
  end

  def self.button_stats(sessions, board)
    stats = {
      :boards => {}
    }
    session_ids = sessions.map(&:id)
    LogSession.where(id: session_ids).find_in_batches(batch_size: 5) do |batch|
      batch.each do |session|
        session.assert_extra_data
        session.data['events'].each do |event|
          from_board = true
          if event['type'] == 'button'
            if event['button']['board']['id'] == board_id || event['button']['board']['parent_id'] == board_id
              for_parent = event['button']['board']['id'] != board_id
              from_board = true
              travel_tally = 0
              if event['button'] && event['button']['percent_travel']
                travel_tally += event['button']['percent_travel']
              end
              track_button!(stats, event, board, 'self')
            elsif event['button']['depth'] == 0
              from_board = false
              travel_tally = 0
            elsif from_board
              # reached from this board
              travel_tally += LogSession.travel_activation_score 
              if event['button'] && event['button']['percent_travel']
                travel_tally += event['button']['percent_travel']
              end
              track_button!(stats, event, board, board.global_id)
            end
          end
        end
      end
    end
    stats[:boards].each do |board_id, hash|
      locations = hash[:start_locations] || []
      hash.delete(:start_locations)
    end
    stats
  end
end
