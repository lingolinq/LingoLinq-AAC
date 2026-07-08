# frozen_string_literal: true

require 'spec_helper'
require 'art50_marking_audit'

# EU AI Act Article 50(2) compliance audit. Verifies that Art50MarkingAudit
# correctly classifies AI-marked originals and their copies, distinguishes a valid
# server-signed marker from a forged/stripped one, and guards divide-by-zero when
# there is no AI content to audit.
describe Art50MarkingAudit do
  let(:valid_marker) { Art50Marker.build(provider: 'claude', model: 'claude-haiku-4-5-20251001') }
  let(:user) { User.create }

  # BoardDownstreamButtonSet rows committed by other specs and encrypted under a
  # different key raise "bad decrypt" when copy_for regenerates button sets here;
  # clear them so this file is deterministic (same guard as board_art50_marking_spec).
  before(:each) { BoardDownstreamButtonSet.delete_all }

  # Audit only the boards a given example creates: the test DB carries orphaned
  # committed board rows that would otherwise pollute absolute counts.
  def audit(*boards)
    Art50MarkingAudit.run(scope: Board.where(id: boards.map(&:id)))
  end

  describe 'divide-by-zero guard' do
    it 'reports 100% coverage and compliant when there is no AI content' do
      plain = Board.create(user: user)
      stats = audit(plain)
      expect(stats[:originals][:total]).to eq(0)
      expect(stats[:copies][:total]).to eq(0)
      expect(stats[:originals_coverage]).to eq(100.0)
      expect(stats[:copies_coverage]).to eq(100.0)
      expect(stats[:compliant]).to eq(true)
    end
  end

  describe 'originals' do
    it 'counts a validly AI-marked original as valid and compliant' do
      b = Board.create(user: user)
      b.settings['ai_generated'] = valid_marker
      b.save

      stats = audit(b)
      expect(stats[:originals][:total]).to eq(1)
      expect(stats[:originals][:valid]).to eq(1)
      expect(stats[:originals][:invalid]).to eq(0)
      expect(stats[:originals_coverage]).to eq(100.0)
      expect(stats[:compliant]).to eq(true)
    end

    it 'flags an original whose marker does not verify as invalid and non-compliant' do
      b = Board.create(user: user)
      # A forged marker written directly to settings (bypassing process_params
      # verify-on-save) simulates tampering or a legacy write path.
      b.settings['ai_generated'] = valid_marker.merge('model' => 'tampered')
      b.save

      stats = audit(b)
      expect(stats[:originals][:total]).to eq(1)
      expect(stats[:originals][:valid]).to eq(0)
      expect(stats[:originals][:invalid]).to eq(1)
      expect(stats[:originals][:invalid_ids]).to include(b.global_id)
      expect(stats[:compliant]).to eq(false)
    end

    it 'ignores an unmarked (non-AI) original' do
      b = Board.create(user: user)
      stats = audit(b)
      expect(stats[:originals][:total]).to eq(0)
      expect(stats[:compliant]).to eq(true)
    end
  end

  describe 'copies' do
    it 'counts a copy of an AI-marked board that retained its marker as valid' do
      src = Board.create(user: user, public: true)
      src.settings['ai_generated'] = valid_marker
      src.save
      copy = src.copy_for(user)

      stats = audit(src, copy)
      expect(stats[:originals][:total]).to eq(1)
      expect(stats[:copies][:total]).to eq(1)
      expect(stats[:copies][:valid]).to eq(1)
      expect(stats[:copies][:stripped]).to eq(0)
      expect(stats[:compliant]).to eq(true)
    end

    it 'flags a copy whose marker was stripped as stripped and non-compliant' do
      src = Board.create(user: user, public: true)
      src.settings['ai_generated'] = valid_marker
      src.save
      copy = src.copy_for(user)
      # Simulate a path that dropped the marker on the copy while its source stays marked.
      copy.settings.delete('ai_generated')
      copy.save

      stats = audit(src, copy)
      expect(stats[:copies][:total]).to eq(1)
      expect(stats[:copies][:valid]).to eq(0)
      expect(stats[:copies][:stripped]).to eq(1)
      expect(stats[:copies][:stripped_ids]).to include(copy.global_id)
      expect(stats[:compliant]).to eq(false)
    end

    it 'does not count a copy of a non-AI board (nothing to carry)' do
      src = Board.create(user: user, public: true)
      copy = src.copy_for(user)

      stats = audit(src, copy)
      expect(stats[:copies][:total]).to eq(0)
      expect(stats[:compliant]).to eq(true)
    end
  end
end
