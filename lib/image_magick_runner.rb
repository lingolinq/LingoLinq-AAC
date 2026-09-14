# Runs ImageMagick binaries with an explicit argv, so no shell is involved and shell
# metacharacters in any argument are inert as a class rather than case by case. Mirrors the
# argv form already used for these binaries in
# config/initializers/obf_save_image_hardening.rb:91-118.
module ImageMagickRunner
  # C isspace(): tab, newline, vertical tab, form feed, carriage return, space.
  LEADING_SPACE_BYTES = [9, 10, 11, 12, 13, 32].freeze
  AT_SIGN_BYTE = 0x40

  # Kernel#system treats a SINGLE argument as a shell command line, so a degenerate argv
  # would silently reintroduce the shell this module exists to remove.
  def self.run(*args)
    args = args.flatten.map(&:to_s)
    raise ArgumentError, 'ImageMagickRunner.run needs a command plus at least one argument' if args.length < 2
    # montage/convert fall back to reading STDIN when handed an empty path and then block
    # forever, which would wedge the Resque worker; the backticks this replaced never had
    # that failure mode because the shell dropped the empty word.
    result = system(*args, :in => File::NULL)
    # nil means the process never started; false means it ran and exited non-zero. Do NOT raise
    # on nil. system collapses EVERY pre-exec failure to nil -- a missing binary, but equally
    # EACCES, EISDIR, ENAMETOOLONG and E2BIG -- so the errno cannot be recovered here, and
    # E2BIG is attacker-reachable: button_list has no length cap (utterance.rb:331) and ~30k
    # buttons of Tempfile-length paths is ~1.8MB of argv. An exception escapes
    # generate_preview, so utterance.rb:55 never latches large_image_url_attempted and the job
    # re-enqueues on every later save -- a permanent failure loop from one request. Degrade
    # like any other montage failure instead; Uploader.remote_upload already returns nil for a
    # missing file (uploader.rb:63). Only the binary name is logged -- a label is the user's
    # spoken sentence, and utterances are not regex-scrubbable (pii_scrubbing_formatter.rb:18).
    Rails.logger.warn("ImageMagickRunner could not execute #{args.first}") if result.nil? && defined?(Rails)
    result
  end

  # ImageMagick interprets three things inside -label at the ARGV level, so dropping the
  # shell is necessary but not sufficient. Measured on IM 6.9.12-98 with `compare -metric AE`
  # between rendered PNGs:
  #   '\'         introduces an escape    -- 'a\b' renders as 'ab'
  #   '%'         starts a format spec    -- '%[fx:1+1]' renders as '2' (an expression evaluator)
  #   leading '@' reads a FILE            -- '@/etc/hostname' renders that file's contents,
  #                                          and leading whitespace is skipped first
  # Each replacement renders as the original character, so real AAC vocabulary is unchanged.
  def self.escape_label(label)
    escaped = label.to_s.gsub('\\') { '\\\\' }.gsub('%', '%%')
    # ImageMagick skips C isspace() bytes BEFORE testing for a leading '@', so
    # String#start_with?('@') is not the same predicate it looks like: " @secret.txt" reaches
    # the file read. The byte set is measured, not assumed -- sweeping every ASCII byte as a
    # prefix and asking montage which ones reach InterpretImageProperties gives exactly
    # 9, 10, 11, 12, 13 and 32, and no non-ASCII whitespace (NBSP, U+1680, U+3000, U+2028,
    # U+0085) qualifies, so Ruby's \s would be wrong in both directions.
    #
    # Done byte-wise rather than with a Regexp on purpose: Regexp matching raises
    # ArgumentError on a string with invalid UTF-8, and labels are attacker-supplied. That
    # exception would escape generate_preview and leave large_image_url_attempted unset
    # (utterance.rb:50-55), re-enqueuing the job on every later save.
    offset = 0
    offset += 1 while LEADING_SPACE_BYTES.include?(escaped.getbyte(offset))
    return escaped unless escaped.getbyte(offset) == AT_SIGN_BYTE
    escaped.byteslice(0, offset) + '\\' + escaped.byteslice(offset, escaped.bytesize - offset)
  end
end
