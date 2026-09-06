require 'spec_helper'
require 'zip'

# Regression coverage for CVE-2026-85396 / GHSA-47m2-wp7j-p9vc, a High-severity path
# traversal in rubyzip before 3.4.0.
#
# WHY THIS IS A REAL PATH AND NOT A PAPER FINDING. .obz import takes an archive
# uploaded by a user, and OBF::Utils.load_zip extracts it with rubyzip
# (config/initializers/zip_kit_patch.rb moved only the WRITE path to zip_kit, so
# extraction is still rubyzip). An archive whose entry name escapes the destination
# directory is therefore attacker-controlled input reaching a vulnerable extractor.
#
# These examples assert the fixed BEHAVIOUR, not the version string, so they keep
# their value if the pin is ever loosened: a downgrade below 3.4.0 makes them fail.
describe 'rubyzip path traversal (CVE-2026-85396)' do
  # Build a ZIP whose single entry name climbs out of any extraction root.
  # Written with raw Zip::OutputStream so the malicious name survives: the normal
  # entry API may itself sanitise, which would make this fixture prove nothing.
  def malicious_zip(entry_name)
    path = File.join(Dir.mktmpdir, 'evil.zip')
    Zip::OutputStream.open(path) do |zos|
      zos.put_next_entry(entry_name)
      zos.write('pwned')
    end
    path
  end

  let(:escape_name) { '../../../../../../tmp/lingolinq_zipslip_probe.txt' }

  before do
    FileUtils.rm_f('/tmp/lingolinq_zipslip_probe.txt')
  end

  after do
    FileUtils.rm_f('/tmp/lingolinq_zipslip_probe.txt')
  end

  it 'is running a rubyzip release that carries the fix' do
    expect(Gem::Version.new(Zip::VERSION)).to be >= Gem::Version.new('3.4.0')
  end

  # Asserts the SECURITY PROPERTY (nothing is written outside the destination), not the
  # mechanism. The first version of this example asserted `raise_error`, which failed:
  # rubyzip 3.4+ SKIPS the unsafe entry with a warning rather than raising. That was my
  # assumption about the fix, not the fix. Pinning the mechanism would also make the test
  # brittle against a future release that chooses to raise instead.
  it 'writes nothing outside the extraction directory for a traversing entry' do
    zip_path = malicious_zip(escape_name)

    Dir.mktmpdir do |dest|
      Zip::File.open(zip_path) do |zipfile|
        entry = zipfile.entries.first
        target = File.join(dest, entry.name)
        begin
          entry.extract(target)
        rescue StandardError
          # Raising is also acceptable; both refusals satisfy the property below.
        end
      end

      # Nothing may have landed anywhere under the destination either.
      escaped_inside = Dir.glob(File.join(dest, '**', '*'), File::FNM_DOTMATCH)
                          .reject { |f| File.basename(f) =~ /\A\.\.?\z/ }
      expect(escaped_inside).to be_empty
    end

    expect(File.exist?('/tmp/lingolinq_zipslip_probe.txt'))
      .to be(false), 'a ZIP entry escaped the extraction directory: path traversal is live'
  end

  it 'does not leave an escaped file behind when the whole archive is extracted' do
    zip_path = malicious_zip(escape_name)

    Dir.mktmpdir do |dest|
      begin
        Zip::File.open(zip_path) do |zipfile|
          zipfile.each { |e| e.extract(File.join(dest, e.name)) }
        end
      rescue StandardError
        # Raising is the correct, fixed behaviour.
      end
    end

    expect(File.exist?('/tmp/lingolinq_zipslip_probe.txt'))
      .to be(false), 'a ZIP entry escaped the extraction directory: path traversal is live'
  end

  it 'still reads a well-formed archive, so the fix did not break .obz import' do
    path = File.join(Dir.mktmpdir, 'good.obz')
    Zip::File.open(path, create: true) do |z|
      z.get_output_stream('manifest.json') { |o| o << '{"format":"open-board-0.1"}' }
    end

    names = []
    OBF::Utils.load_zip(path) do |zipper|
      names << 'manifest.json' if zipper.read('manifest.json')
    end
    expect(names).to eq(['manifest.json'])
  end
end
