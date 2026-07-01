# frozen_string_literal: true

require 'spec_helper'

# EU AI Act Article 50(2) durable persistence (slice 2). The signed provenance
# marker minted in slice 1 (lib/art50_marker.rb) must survive a board save, be
# verified server-side (never trust client input), propagate through copies, stay
# inline through content offload, and be machine-readable in the JSON API output.
describe 'Board Art.50(2) marker persistence' do
  let(:valid_marker) { Art50Marker.build(provider: 'claude', model: 'claude-haiku-4-5-20251001') }

  # BoardDownstreamButtonSet rows can be committed outside the per-example fixture
  # transaction by other specs and survive across runs (see docs/task-management notes on
  # test-DB orphan rows). Stale rows encrypted under a different key raise
  # OpenSSL::Cipher::CipherError ("bad decrypt") when copy_for regenerates button sets here.
  # Clear them per example so this file is deterministic regardless of leftover pollution.
  before(:each) { BoardDownstreamButtonSet.delete_all }

  describe 'verify-on-save (Board#process_params)' do
    it 'persists a valid, server-signed marker onto settings on update' do
      u = User.create
      b = Board.create(user: u)
      b.process({'ai_generated' => valid_marker}, {user: u, author: u})
      expect(b.reload.settings['ai_generated']).to eq(valid_marker)
      expect(Art50Marker.marked?(b.settings)).to eq(true)
    end

    it 'persists a valid marker on create (process_new)' do
      u = User.create
      b = Board.process_new({'name' => 'AI board', 'ai_generated' => valid_marker}, {user: u, author: u})
      expect(b.persisted?).to eq(true)
      expect(b.settings['ai_generated']).to eq(valid_marker)
      expect(Art50Marker.verify(b.settings['ai_generated'])).to eq(true)
    end

    it 'silently drops a forged marker (bad signature) without breaking the save' do
      u = User.create
      forged = valid_marker.merge('provider' => 'evil-corp')
      b = Board.process_new({'name' => 'b', 'ai_generated' => forged}, {user: u, author: u})
      expect(b.persisted?).to eq(true)
      expect(b.settings['ai_generated']).to be_nil
    end

    it 'silently drops a structurally invalid marker (not a signed hash)' do
      u = User.create
      b = Board.process_new({'name' => 'b', 'ai_generated' => {'marked' => true}}, {user: u, author: u})
      expect(b.persisted?).to eq(true)
      expect(b.settings['ai_generated']).to be_nil
    end

    it 'never lets a forged marker overwrite an existing valid one' do
      u = User.create
      b = Board.create(user: u)
      b.settings['ai_generated'] = valid_marker
      b.save
      forged = valid_marker.merge('model' => 'tampered')
      b.process({'ai_generated' => forged}, {user: u, author: u})
      expect(b.reload.settings['ai_generated']).to eq(valid_marker)
    end

    it 'lets a valid harvested marker overwrite an existing valid one (accepted bearer behavior)' do
      # The marker is a provenance BEARER token by design (see lib/art50_marker.rb): a
      # genuine server-signed marker verifies regardless of which board carries it, so a
      # second valid marker replaces a first. This test locks that in as a deliberate,
      # documented tradeoff (per-board provenance sub-fields are not board-authenticated).
      u = User.create
      b = Board.create(user: u)
      first = Art50Marker.build(provider: 'claude', model: 'first')
      second = Art50Marker.build(provider: 'claude', model: 'second')
      b.settings['ai_generated'] = first
      b.save
      b.process({'ai_generated' => second}, {user: u, author: u})
      expect(b.reload.settings['ai_generated']).to eq(second)
    end

    it 'leaves settings untouched when no marker is supplied' do
      u = User.create
      b = Board.create(user: u)
      b.process({'name' => 'renamed'}, {user: u, author: u})
      expect(b.reload.settings).not_to have_key('ai_generated')
    end
  end

  describe 'propagation through copy_for / BoardCloner' do
    it 'carries a valid marker onto a copy' do
      u = User.create
      src = Board.create(user: u, public: true)
      src.settings['ai_generated'] = valid_marker
      src.save
      copy = src.copy_for(u)
      expect(copy.settings['ai_generated']).to eq(valid_marker)
      expect(Art50Marker.verify(copy.settings['ai_generated'])).to eq(true)
    end

    it 'leaves a copy unmarked when the source has no marker' do
      u = User.create
      src = Board.create(user: u, public: true)
      copy = src.copy_for(u)
      expect(copy.settings['ai_generated']).to be_nil
    end
  end

  describe 'content offload round-trip (BoardContent)' do
    it 'keeps the marker inline and valid after offloading buttons/grid/etc.' do
      u = User.create
      b = Board.create(user: u)
      b.settings['ai_generated'] = valid_marker
      b.settings['buttons'] = [{'id' => 1, 'label' => 'hi'}]
      b.settings['grid'] = {'rows' => 1, 'columns' => 1, 'order' => [[1]]}
      b.save
      BoardContent.generate_from(b)
      b.reload
      # offload actually happened (content lives on a BoardContent record now), but the
      # marker is not an offloadable attribute, so it stays inline on board.settings
      expect(b.board_content_id).to be_present
      expect(b.board_content_id).to be > 0
      expect(b.settings['ai_generated']).to eq(valid_marker)
      expect(Art50Marker.verify(b.settings['ai_generated'])).to eq(true)
      # and the offloaded content is still loadable alongside the inline marker
      expect(BoardContent.load_content(b, 'buttons')).to eq([{'id' => 1, 'label' => 'hi'}])
    end
  end

  describe 'machine-readability in JSON API output' do
    it 'exposes a non-secret provenance view (no signature, no content_id)' do
      u = User.create
      b = Board.create(user: u)
      b.settings['ai_generated'] = valid_marker
      b.save
      json = JsonApi::Board.build_json(b.reload)
      expect(json['ai_generated']).to eq({
        'marked' => true,
        'spec' => 'eu-ai-act-art50-2',
        'provider' => valid_marker['provider'],
        'model' => valid_marker['model'],
        'generated_at' => valid_marker['generated_at']
      })
      # the server-secret signature and the AiApiLog-linking content_id are NOT exposed
      expect(json['ai_generated']).not_to have_key('signature')
      expect(json['ai_generated']).not_to have_key('content_id')
    end

    it 'reports nil for a board with no marker' do
      u = User.create
      b = Board.create(user: u)
      json = JsonApi::Board.build_json(b.reload)
      expect(json['ai_generated']).to be_nil
    end

    it 'reports nil (unmarked) for a forged marker that somehow reached settings' do
      u = User.create
      b = Board.create(user: u)
      b.settings['ai_generated'] = valid_marker.merge('model' => 'tampered')
      b.save
      json = JsonApi::Board.build_json(b.reload)
      expect(json['ai_generated']).to be_nil
    end
  end
end
