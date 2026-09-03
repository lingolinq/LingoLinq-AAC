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
      str, idx = read(%(t "Hello there" key='greeting'))
      expect(str).to eq('Hello there')
      expect(line_char(%(t "Hello there" key='greeting'), idx)).to eq('"')
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

    def line_char(line, idx)
      line[idx]
    end
  end
end
