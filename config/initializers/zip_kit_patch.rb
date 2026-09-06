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
#
# rubyzip 3.x COMPATIBILITY. rubyzip 3.0 removed the Zip::File::CREATE constant in
# favour of a `create: true` keyword, and obf 0.9.9.3 still writes
# `Zip::File.open(dest_path, Zip::File::CREATE)` (lib/obf/utils.rb:487). We upgraded
# to rubyzip >= 3.4 for CVE-2026-85396, so that original method -- and the
# `build_zip_rubyzip` alias this file keeps -- would raise NameError the moment
# anything called it. The zip_kit path does not touch it, which is why the upgrade
# looks clean until someone sets OBF_ZIPKIT_PATCH=0 and the fallback dies.
# The fallback is repaired below rather than deleted, so the escape hatch this file
# documents actually works.

require 'zip'
require 'zip_kit'

# Repair obf's rubyzip WRITE path for rubyzip 3.x, unconditionally: it must be correct
# whether or not the zip_kit patch is enabled, because OBF_ZIPKIT_PATCH=0 falls back to it.
module OBF
  module Utils
    class << self
      # ::OBF::Utils, root-qualified deliberately. Inside `module OBF; module Utils`
      # a bare `OBF::Utils` resolves relative to OBF as OBF::OBF::Utils and raises
      # NameError. develop carries the same bug in the zip_kit build_zip above; it is
      # latent only because all four production callers (exporter.rb:39,76,
      # log_session.rb:2196, uploader.rb:601) pass dest_path, so the nil branch never
      # runs. Found by calling build_zip with no argument in a test.
      def build_zip_rubyzip3(dest_path = nil, &block)
        dest_path ||= ::OBF::Utils.temp_path(['archive', '.obz'])
        Zip::File.open(dest_path, create: true) do |zipfile|
          block.call(Zipper.new(zipfile))
        end
      end
    end
  end
end

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
        # Points at the rubyzip-3.x-safe implementation above, NOT at obf's original,
        # which references the removed Zip::File::CREATE constant.
        alias_method :build_zip_rubyzip, :build_zip_rubyzip3

        def build_zip(dest_path = nil, &block)
          if !dest_path
            dest_path = ::OBF::Utils.temp_path(['archive', '.obz'])
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
else
  # Escape hatch taken. obf's own build_zip is broken under rubyzip 3.x, so point
  # build_zip at the repaired implementation instead of leaving a NameError in place.
  module OBF
    module Utils
      class << self
        alias_method :build_zip, :build_zip_rubyzip3
      end
    end
  end
end
