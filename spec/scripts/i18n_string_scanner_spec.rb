# frozen_string_literal: true

require 'spec_helper'
require_relative '../../scripts/i18n_string_scanner'

describe I18nStringScanner do
  describe '.read_quoted' do
    # Helper: the callers always hand in the index of the opening quote.
    def read(line)
      described_class.read_quoted(line, line.index(/["']/))
    end

    it 'reads a plain double-quoted string' do
      line = %(t "Hello there" key='greeting')
      str, idx = described_class.read_quoted(line, line.index('"'))
      expect(str).to eq('Hello there')
      expect(line[idx]).to eq('"')
    end

    it 'reads a plain single-quoted string' do
      str, = read(%(t 'Hello there' key="greeting"))
      expect(str).to eq('Hello there')
    end

    it 'does not stop at a quote that is escaped MID-string' do
      str, = read(%(t "say \\"hi\\" now" key='x'))
      expect(str).to eq('say "hi" now')
    end

    # THE REGRESSION. templates/privacy.hbs:87 opens its string with an escaped quote. The old
    # scanner tested the character AFTER the one it had just consumed for a backslash, so a
    # LEADING escape was consumed as content, idx landed on the escaped quote, and the loop's
    # own condition ended the string immediately. The captured value was a single backslash,
    # which reached every locale file as "\\" and could never recover, because --merge keeps
    # any existing value.
    it 'does not stop at a quote that is escaped as the FIRST character' do
      str, = read(%(t "\\"Do Not Sell or Share My Personal Information\\" (CCPA):" key='p'))
      expect(str).to eq('"Do Not Sell or Share My Personal Information" (CCPA):')
    end

    it 'reads a string that is ONLY an escaped quote' do
      str, = read(%(t "\\"" key='x'))
      expect(str).to eq('"')
    end

    # CONSECUTIVE escapes are a THIRD behaviour class this fix changes, distinct from a leading
    # escape. The old scanner consumed a character and then tested the NEXT one, so back-to-back
    # escapes desynchronised it: `a\"\"b` came out as `a"\` — it lost the second pair and kept a
    # stray backslash. Built by concatenation rather than written as one literal, because the
    # escaping is the thing under test and a %() literal makes it unreadable.
    it 'handles consecutive escaped quotes without desynchronising' do
      line = 't "a' + '\\"' + '\\"' + 'b" key=' + "'x'"
      expect(line).to include('a\\"\\"b')
      str, = described_class.read_quoted(line, line.index('"'))
      expect(str).to eq('a""b')
    end

    # A RUN of backslashes must halve, not lose parity. Four in source is two escaped
    # backslashes and must yield two; the old scanner produced three.
    it 'collapses a run of escaped backslashes with the right parity' do
      line = 't "' + ('\\' * 4) + '" key=' + "'x'"
      str, = described_class.read_quoted(line, line.index('"'))
      expect(str).to eq('\\' * 2)
    end

    it 'keeps the character after any backslash, not just quotes' do
      str, = read(%(t "a\\\\b" key='x'))
      expect(str).to eq('a\\b')
    end

    it 'does not treat the other quote style as a terminator' do
      str, = read(%(t "it's fine" key='x'))
      expect(str).to eq("it's fine")
    end

    it 'returns the index of the closing quote so the caller can keep scanning' do
      line = %(t "abc" key='x')
      _str, idx = read(line)
      expect(line[idx]).to eq('"')
      expect(line.index(/key=/, idx)).to be > idx
    end

    it 'stops at end of line rather than looping on an unterminated string' do
      str, idx = read(%(t "never closed))
      expect(str).to eq('never closed')
      expect(idx).to eq(%(t "never closed).length)
    end

    it 'tolerates a trailing backslash at end of line' do
      expect { read(%(t "oops\\)) }.not_to raise_error
    end
  end
end
