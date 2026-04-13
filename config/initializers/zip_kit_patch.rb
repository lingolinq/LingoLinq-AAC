# frozen_string_literal: true

# Monkey-patch OBF::Utils.build_zip to use zip_kit instead of rubyzip.
# zip_kit writes ZIP files in a streaming, append-only fashion with flat
# ~128KB memory overhead regardless of archive size. rubyzip buffers the
# entire archive in memory (seekable IO).
#
# Only the write path is patched. OBF::Utils.load_zip stays on rubyzip
# because zip_kit cannot read/extract ZIP entries.
#
# Set OBF_ZIPKIT_PATCH=0 to disable and fall back to rubyzip writing.

require 'zip_kit'

if !ENV['OBF_ZIPKIT_PATCH'].to_s.match(/\A(0|false|no|off)\z/i)
  module OBF
    module Utils
      # Shim that presents the same add(path, contents) interface as
      # OBF::Utils::Zipper but delegates to ZipKit::Streamer.
      class ZipKitZipper
        def initialize(streamer)
          @streamer = streamer
        end

        # Add content (string or binary) as a named entry in the ZIP.
        def add(path, contents)
          @streamer.write_file(path) do |sink|
            sink << contents.b
          end
        end

        # Stream a local file into the ZIP without loading it all into memory.
        def add_file(path, local_path)
          @streamer.write_file(path) do |sink|
            File.open(local_path, 'rb') do |f|
              IO.copy_stream(f, sink)
            end
          end
        end
      end

      class << self
        alias_method :build_zip_rubyzip, :build_zip

        def build_zip(dest_path = nil, &block)
          if !dest_path
            dest_path = OBF::Utils.temp_path(['archive', '.obz'])
          end
          File.open(dest_path, 'wb') do |file_io|
            ZipKit::Streamer.open(file_io) do |streamer|
              block.call(ZipKitZipper.new(streamer))
            end
          end
        end
      end
    end
  end

  Rails.logger.info('[zip_kit] OBF::Utils.build_zip patched for streaming ZIP writes') if defined?(Rails.logger) && Rails.logger
end
