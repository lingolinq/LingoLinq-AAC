require 'spec_helper'

describe AiFocusWordSet, type: :model do
  it "normalizes prompts and hashes locale/core settings" do
    set = AiFocusWordSet.create!(
      scrubbed_prompt: "  Grinch   Lesson  ",
      locale: 'en',
      include_core_words: true,
      words: ['go', 'more']
    )

    expect(set.normalized_prompt).to eq('grinch lesson')
    expect(set.prompt_hash).to eq(AiFocusWordSet.hash_for(
      scrubbed_prompt: 'Grinch Lesson',
      locale: 'en',
      include_core_words: true
    ))
  end

  it "dedupes and caps generated words" do
    words = ['go', 'Go'] + (1..250).map { |i| "word#{i}" }
    set = AiFocusWordSet.create!(
      scrubbed_prompt: 'large lesson',
      locale: 'en',
      include_core_words: true,
      words: words
    )

    expect(set.words.first).to eq('go')
    expect(set.words.length).to eq(AiFocusWordSet::MAX_STORED_WORDS)
    expect(set.word_count).to eq(AiFocusWordSet::MAX_STORED_WORDS)
  end

  it "records applied words separately from generated words" do
    set = AiFocusWordSet.create!(
      scrubbed_prompt: 'garden lesson',
      locale: 'en',
      include_core_words: true,
      words: ['plant', 'water']
    )

    set.record_usage!(final_words: 'plant, grow, grow', action: 'set_focus_words')

    expect(set.reload.words).to eq(['plant', 'water'])
    expect(set.applied_words).to eq(['plant', 'grow'])
    expect(set.applied_count).to eq(1)
    expect(set.status).to eq('reviewed')
  end

  it "tracks analysis usage separately" do
    set = AiFocusWordSet.create!(
      scrubbed_prompt: 'math lesson',
      locale: 'en',
      include_core_words: true,
      words: ['add', 'more']
    )

    set.record_usage!(final_words: ['add'], action: 'analyze_focus_words')

    expect(set.reload.analysis_count).to eq(1)
    expect(set.applied_count).to eq(0)
    expect(set.applied_words).to eq(['add'])
  end

  it "looks up records globally by scrubbed prompt, locale, and core flag" do
    set = AiFocusWordSet.create!(
      scrubbed_prompt: 'shared topic',
      locale: 'en',
      include_core_words: false,
      words: ['topic']
    )

    expect(AiFocusWordSet.find_for(
      scrubbed_prompt: ' shared   topic ',
      locale: 'en',
      include_core_words: false
    )).to eq(set)
  end

  describe "EU AI Act Article 50(2) marker" do
    let(:marker) { Art50Marker.build(provider: 'claude', model: 'claude-haiku-4-5-20251001') }

    def new_set(prompt)
      AiFocusWordSet.create!(scrubbed_prompt: prompt, locale: 'en', include_core_words: true, words: ['go'])
    end

    it "persists an AI-generation marker through record_generation! and re-verifies it on read" do
      set = new_set('marked lesson')
      set.record_generation!(new_words: ['more'], marker: marker)

      reloaded = AiFocusWordSet.find(set.id)
      expect(Art50Marker.verify(reloaded.ai_generated_marker)).to eq(true)
      expect(reloaded.ai_generated_marker['provider']).to eq('claude')
    end

    it "exposes a non-secret public view that withholds signature and content_id" do
      set = new_set('public view lesson')
      set.ai_generated_marker = marker
      set.save!

      view = set.reload.ai_generated_public_view
      expect(view['marked']).to eq(true)
      expect(view['provider']).to eq('claude')
      expect(view).not_to have_key('signature')
      expect(view).not_to have_key('content_id')
    end

    it "reads a forged marker as unmarked (nil), never as verified" do
      set = new_set('forged lesson')
      set[:ai_generated] = marker.merge('signature' => 'deadbeef').to_json
      set.save!

      expect(set.reload.ai_generated_marker).to be_nil
      expect(set.ai_generated_public_view).to be_nil
    end

    it "does not wipe an existing marker on a marker-less re-record (cache-hit accretion)" do
      set = new_set('sticky lesson')
      set.record_generation!(new_words: ['more'], marker: marker)
      set.record_generation!(new_words: ['stop'], marker: nil)

      expect(Art50Marker.verify(set.reload.ai_generated_marker)).to eq(true)
    end

    it "leaves a set with no marker unmarked" do
      set = new_set('plain lesson')
      expect(set.ai_generated_marker).to be_nil
      expect(set.ai_generated_public_view).to be_nil
    end
  end
end
