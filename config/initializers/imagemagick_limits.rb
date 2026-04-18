# Cap per-process ImageMagick resource use to prevent OOM kills.
#
# The obf gem's PDF board export fans out up to 20 concurrent `convert`
# child processes per board (lib/obf/pdf.rb#317). At density 300, a single
# SVG rasterization can briefly allocate hundreds of MB. With 20 in flight,
# total memory spikes past the cgroup limit and Render kills the entire
# worker container with no Ruby-level error captured.
#
# ImageMagick reads MAGICK_*_LIMIT from its process environment, so spawned
# `convert` children inherit these limits automatically. No gem patching
# required and any Render override (set explicitly on a service) wins.
#
# Defaults sized for the 2 GB worker plan: 64MiB x 20 concurrent ~ 1.3 GB,
# leaving headroom for the Ruby/Rails baseline (~600 MB) and Prawn buffers.
ENV['MAGICK_MEMORY_LIMIT'] ||= '64MiB'
ENV['MAGICK_MAP_LIMIT']    ||= '128MiB'
ENV['MAGICK_DISK_LIMIT']   ||= '2GiB'
ENV['MAGICK_THREAD_LIMIT'] ||= '1'
