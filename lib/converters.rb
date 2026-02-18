# frozen_string_literal: true

# Parent module for OBF/OBZ/PDF conversion. The lib/converters/ directory is
# ignored by Zeitwerk (due to obf-local.rb and other non-standard files), so we
# define the module here and explicitly require the implementations.
module Converters
end

# Load converter implementations. Order matters: LingoLinq is the main one others depend on.
require_relative 'converters/lingo_linq'
require_relative 'converters/obf'
require_relative 'converters/obz'
require_relative 'converters/utils'
require_relative 'converters/pdf'
require_relative 'converters/png'
require_relative 'converters/html_board'
require_relative 'converters/obf-local'
