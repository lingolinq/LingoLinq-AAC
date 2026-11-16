# Runs ImageMagick binaries with an explicit argv, so no shell is involved and shell
# metacharacters in any argument are inert as a class rather than case by case. Mirrors the
# argv form already used for these binaries in
# config/initializers/obf_save_image_hardening.rb:91-118.
#
# ImageMagick commands also run confined: a per-call policy lets ImageMagick open only the files
# named on the command line, its output, its own temp directory, and its config and font files,
# whatever the format of the image.
require 'fileutils'
require 'tmpdir'

module ImageMagickRunner
  # C isspace(): tab, newline, vertical tab, form feed, carriage return, space.
  LEADING_SPACE_BYTES = [9, 10, 11, 12, 13, 32].freeze
  AT_SIGN_BYTE = 0x40
  IMAGEMAGICK_COMMANDS = %w[convert montage identify magick].freeze
  # A policy pattern is a glob read by ImageMagick's own tokenizer, so a path holding glob syntax or
  # a quote cannot be allowed literally; it is left out and that open is refused.
  UNSAFE_PATTERN_CHARS = /[*?\[\]{}()\\"'`<>&\s]/
  # ImageMagick's config and font files, read while drawing text. Globbed rather than asked of
  # ImageMagick, so allowing them never runs a binary.
  SYSTEM_READ_GLOBS = %w[
    /etc/ImageMagick-* /usr/share/ImageMagick-* /usr/local/etc/ImageMagick-* /usr/local/share/ImageMagick-*
    /opt/homebrew/etc/ImageMagick-* /opt/homebrew/share/ImageMagick-*
    /opt/homebrew/Cellar/imagemagick/*/etc/ImageMagick-* /opt/homebrew/Cellar/imagemagick/*/share/ImageMagick-*
    /usr/share/fonts /usr/local/share/fonts /opt/homebrew/share/fonts /System/Library/Fonts /Library/Fonts
  ].freeze
  # Private directories of spawned commands still running, by pid.
  SPAWNED = {}
  # A private directory this old belongs to a process that ended without sweeping it (a Resque job
  # child exits right after its last spawned render), so any process removes it.
  STALE_DIR_SECONDS = 3600
  SPAWNED_LOCK = Mutex.new

  # Kernel#system treats a SINGLE argument as a shell command line, so a degenerate argv
  # would silently reintroduce the shell this module exists to remove.
  def self.run(*args)
    args = argv(args)
    # montage/convert fall back to reading STDIN when handed an empty path and then block
    # forever, which would wedge the Resque worker; the backticks this replaced never had
    # that failure mode because the shell dropped the empty word.
    result = begin
      confined(args) { |env| system(*env, *args, :in => File::NULL) }
    rescue SystemCallError, ArgumentError
      # Setting up the private directory can fail (a full or unwritable temp directory), and an
      # argument holding a NUL byte raises from File.file? and from system itself. Either is a
      # render that did not happen, so it is reported like one; see below for why run never raises.
      nil
    end
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

  # Returns the command's stdout, for callers that parse it. A non-zero exit returns whatever was
  # printed, as backticks did. Unlike run, a binary that cannot start raises: uploadable.rb's
  # identify call always failed its job that way, so a missing binary stays visible. The output
  # is scrubbed because a Regexp on invalid UTF-8 raises ArgumentError, and what a command prints
  # can come from the file it read.
  def self.capture(*args)
    args = argv(args)
    confined(args) { |env| IO.popen(*env, args, :in => File::NULL, &:read) }.scrub
  end

  # Starts the command without waiting and returns its pid, for callers that run several at once.
  # The private directory outlives this call; it is removed by a later call once the process is gone,
  # or once stale (not by a finalizer: Resque ends a job with exit!, which skips them).
  def self.spawn(*args)
    args = argv(args)
    sweep_spawned
    return Process.spawn(*args, :in => File::NULL) unless imagemagick?(args)
    dir = private_dir(args)
    begin
      pid = Process.spawn(confined_env(dir), *args, :in => File::NULL)
    rescue StandardError
      FileUtils.rm_rf(dir)
      raise
    end
    SPAWNED_LOCK.synchronize { SPAWNED[pid] = dir }
    pid
  end

  def self.confined(args)
    sweep_spawned
    return yield([]) unless imagemagick?(args)
    dir = private_dir(args)
    begin
      yield([confined_env(dir)])
    ensure
      FileUtils.rm_rf(dir)
    end
  end
  private_class_method :confined

  def self.imagemagick?(args)
    IMAGEMAGICK_COMMANDS.include?(File.basename(args.first))
  end
  private_class_method :imagemagick?

  # ImageMagick also reads policy files under $HOME and $XDG_CONFIG_HOME after the private one, and
  # the last matching rule wins, so a policy file there could re-allow any path. Both point at the
  # private directory, which holds only the private policy.
  def self.confined_env(dir)
    configure = [dir, ENV['MAGICK_CONFIGURE_PATH']].compact.reject(&:empty?).join(':')
    { 'MAGICK_CONFIGURE_PATH' => configure, 'MAGICK_TEMPORARY_PATH' => dir, 'HOME' => dir, 'XDG_CONFIG_HOME' => dir }
  end
  private_class_method :confined_env

  # The last matching rule wins (measured on ImageMagick 6.9.11, 6.9.12 and 7.1), so everything is
  # denied first. Reads: absolute paths on the command line that name a file (an [n] frame selector
  # stripped). Write: the last argument, except for identify. ImageMagick 6.9.12 matches a pattern
  # against the path as written and its '*' spans '/', so '<allowed dir>/../../<file>' matches
  # '<allowed dir>/*'; the final rule refuses any '..' segment. An argument that is not valid UTF-8
  # is skipped, because a Regexp on it raises ArgumentError: nothing is allowed for it.
  def self.private_dir(args)
    dir = Dir.mktmpdir('magick-confine')
    write_policy(dir, args)
    dir
  rescue Exception # rubocop:disable Lint/RescueException -- remove the directory whatever stopped it
    FileUtils.rm_rf(dir) if dir
    raise
  end
  private_class_method :private_dir

  def self.write_policy(dir, args)
    command, *rest = args
    rules = [['none', '*']]
    system_read_dirs.each { |d| rules += pattern_variants(d).map { |p| ['read', "#{p}/*"] } }
    rest.each do |arg|
      next unless arg.valid_encoding?
      path = arg.sub(/\[[^\]]*\]\z/, '')
      rules += pattern_variants(path).map { |p| ['read', p] } if path.start_with?('/') && File.file?(path)
    end
    if File.basename(command) != 'identify' && rest.last.to_s.start_with?('/')
      rules += pattern_variants(rest.last).map { |p| ['write', p] }
    end
    rules += pattern_variants(dir).map { |p| ['read|write', "#{p}/*"] }
    rules << ['none', '*/..*']
    xml = rules.map { |rights, pattern| %(  <policy domain="path" rights="#{rights}" pattern="#{pattern}"/>) }
    File.write(File.join(dir, 'policy.xml'), "<policymap>\n#{xml.join("\n")}\n</policymap>\n")
  end
  private_class_method :write_policy

  # A path as given and resolved (macOS reaches its temp directory through /private), minus any
  # form the policy cannot hold literally or that is not valid UTF-8.
  def self.pattern_variants(path)
    return [] unless path.valid_encoding?
    real = begin
      File.exist?(path) ? File.realpath(path) : File.join(File.realpath(File.dirname(path)), File.basename(path))
    rescue SystemCallError
      path
    end
    [path, real].uniq.reject { |p| !p.valid_encoding? || p.match?(UNSAFE_PATTERN_CHARS) }
  end
  private_class_method :pattern_variants

  # Never a directory that is, holds or sits inside the temp directory, where other jobs' files live.
  def self.system_read_dirs
    @system_read_dirs ||= begin
      tmp = File.realpath(Dir.tmpdir)
      Dir.glob(SYSTEM_READ_GLOBS).select { |d| File.directory?(d) }.map { |d| File.realpath(d) }.uniq.reject do |d|
        d == '/' || d == tmp || tmp.start_with?("#{d}/") || d.start_with?("#{tmp}/")
      end
    end
  end
  private_class_method :system_read_dirs

  def self.sweep_spawned
    Dir.glob(File.join(Dir.tmpdir, 'magick-confine*')).each do |dir|
      FileUtils.rm_rf(dir) if File.mtime(dir) < Time.now - STALE_DIR_SECONDS
    rescue SystemCallError
      next
    end
    SPAWNED_LOCK.synchronize do
      SPAWNED.delete_if do |pid, dir|
        gone = begin
          Process.kill(0, pid)
          false
        rescue Errno::ESRCH
          true
        rescue Errno::EPERM
          false
        end
        FileUtils.rm_rf(dir) if gone
        gone
      end
    end
  end
  private_class_method :sweep_spawned

  def self.argv(args)
    args = args.flatten.map(&:to_s)
    raise ArgumentError, 'ImageMagickRunner needs a command plus at least one argument' if args.length < 2
    args
  end
  private_class_method :argv

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
