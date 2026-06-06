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
end
