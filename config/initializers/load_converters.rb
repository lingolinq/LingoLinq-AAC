# frozen_string_literal: true

# lib/converters/ is ignored by Zeitwerk (obf-local.rb, non-standard structure).
# Explicitly load converters so Converters::* constants are available.
require Rails.root.join('lib', 'converters')
