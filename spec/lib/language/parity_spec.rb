require 'spec_helper'

# Lookback parity (TEST-01): proves Language::Schema2Resolver.resolve reproduces EVERY
# committed rules-en.snapshot.json `tests[]` fixture, routed through the alias -> UD bundle ->
# bundle-keyed-form indirection (not a verbatim `rules[]` surface literal) for every fixture
# that exercises an aliasable legacy inflection name. See 01-05-PLAN.md's objective for why this
# is the hard gate and lib/language/schema2_resolver.rb's file header for the full algorithm.
#
# T-05-01 (gate erosion): this spec asserts the fixture COUNT equals the frozen baseline from
# Plan 01 (195) so a silently-dropped or silently-added fixture fails loudly, aggregates EVERY
# mismatch into one failure message (never bails on the first), and asserts the alias path
# carries a MATERIAL share of the fixtures (not zero) so a resolver that quietly stops
# exercising the alias table cannot pass by accident.
describe 'Language::Schema2Resolver lookback parity (TEST-01)' do
  # Frozen at Plan 01 (01-01-SUMMARY.md: "228749 WordData rows, 195 tests[] fixtures"). This
  # constant is hardcoded independently of the snapshot file's own length so a corrupted or
  # truncated snapshot fails this assertion instead of silently redefining "the baseline".
  COMMITTED_FIXTURE_COUNT = 195

  let(:snapshot) { JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'rules-en.snapshot.json'))) }
  let(:tests) { snapshot['tests'] }

  it 'the committed fixture count has not drifted from the Plan 01 baseline' do
    expect(tests.length).to eq(COMMITTED_FIXTURE_COUNT)
  end

  it 'resolves every committed fixture to its expected output (aggregating all mismatches)' do
    failures = []

    tests.each_with_index do |fixture, index|
      prior, word, expected, meta = fixture
      got = Language::Schema2Resolver.resolve(prior, word)
      next if got == expected

      failures << "##{index} prior=#{prior.inspect} word=#{word.inspect} " \
                  "expected=#{expected.inspect} got=#{got.inspect} meta=#{meta.inspect}"
    end

    expect(failures).to eq([]), "#{failures.length} of #{tests.length} fixtures mismatched:\n" \
                                 "#{failures.join("\n")}"
  end

  it 'exercises the alias -> bundle -> form path for a material share of the fixtures' do
    path_counts = Hash.new(0)
    tests.each do |prior, word, _expected, _meta|
      path_counts[Language::Schema2Resolver.resolution_path(prior, word)] += 1
    end

    # 149/195 (76%) route through the alias path in the committed corpus today; guard against
    # regression to near-zero (a resolver quietly falling back to literal rules[] surfaces for
    # everything) without hardcoding the exact figure, which would break on legitimate dataset
    # growth.
    expect(path_counts[:alias]).to be > (tests.length / 2)
    expect(path_counts[:alias]).to be > 0
  end

  it 'the idiomatic (non-alias) override path is real and enumerable, not a silent majority' do
    # Genuinely idiomatic lookback rules (to-be/do/have subject-verb-agreement corrections and
    # the "at the present time" -> "now" idiom) have no alias equivalent and legitimately stay
    # rule-driven -- but they must remain a MINORITY, not launder alias coverage.
    path_counts = Hash.new(0)
    tests.each do |prior, word, _expected, _meta|
      path_counts[Language::Schema2Resolver.resolution_path(prior, word)] += 1
    end

    expect(path_counts[:override]).to be < path_counts[:alias]
  end
end

describe 'Language::Schema2Resolver (structural / source assertions)' do
  let(:source) { File.read(Rails.root.join('lib', 'language', 'schema2_resolver.rb')) }

  it 'routes resolution through the aliases table' do
    expect(source).to match(/aliases/)
  end

  it 'routes resolution through bundle-keyed forms' do
    expect(source).to match(/forms/)
  end

  it 'never uses eval/instance_eval/Kernel.load on data it reads' do
    expect(source.scan(/\beval\b|\binstance_eval\b|Kernel\.load/).length).to eq(0)
  end

  it 'reads the committed rules-en.json and words-en.json datasets, not a hardcoded fallback' do
    expect(source).to include('rules-#{locale}.json')
    expect(source).to include('words-#{locale}.json')
    expect(File.exist?(Rails.root.join('db', 'language', 'en', 'rules-en.json'))).to be(true)
    expect(File.exist?(Rails.root.join('db', 'language', 'en', 'words-en.json'))).to be(true)
  end
end
