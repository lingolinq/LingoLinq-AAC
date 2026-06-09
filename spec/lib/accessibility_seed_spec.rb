require 'spec_helper'

describe AccessibilitySeed do
  describe '.ensure_all!' do
    it 'creates accessibility users, boards, and preferences idempotently' do
      2.times { described_class.ensure_all! }

      eye_gaze_user = User.find_by(user_name: AccessibilitySeed::EYE_GAZE_USER_NAME)
      switch_user = User.find_by(user_name: AccessibilitySeed::SWITCH_USER_NAME)

      expect(eye_gaze_user).to_not eq(nil)
      expect(switch_user).to_not eq(nil)
      expect(eye_gaze_user.settings['public']).to eq(true)
      expect(switch_user.settings['public']).to eq(true)

      device = eye_gaze_user.settings.dig('preferences', 'devices', 'default')
      expect(device['dwell']).to eq(true)
      expect(device['dwell_type']).to eq('eyegaze')

      switch_device = switch_user.settings.dig('preferences', 'devices', 'default')
      expect(switch_device['scanning']).to eq(true)
      expect(switch_device['scanning_mode']).to eq('row')

      AccessibilitySeed::EYE_GAZE_BOARD_SLUGS.each do |slug|
        board = Board.find_by_path(AccessibilitySeed.board_key(slug))
        expect(board).to_not eq(nil)
        expect(board.public).to eq(true)
      end

      home = Board.find_by_path(AccessibilitySeed.board_key('home'))
      vocalizations = home.settings['buttons'].map { |b| b['vocalization'] }.compact
      expect(vocalizations).to include(':clear', ':speak', ':home', ':back', ':backspace')

      expect(eye_gaze_user.settings.dig('preferences', 'home_board', 'id')).to eq(home.global_id)
      expect(User.where(user_name: [AccessibilitySeed::EYE_GAZE_USER_NAME, AccessibilitySeed::SWITCH_USER_NAME]).count).to eq(2)
      expect(Board.where(user_id: eye_gaze_user.id).count).to eq(3)
    end
  end
end
