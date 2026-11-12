require 'spec_helper'

# Templates and mail views load images and links from files the app serves
# itself (public/), not from the bare `lingolinq` S3 location left over from the
# fork, which serves nothing. The premium voice download URLs in
# app/frontend/app/utils/tts_voices.js are the one known exception: they are only
# reachable from the installed apps and wait on a voice licensing decision.
module LegacyAssetLocationsSpec
  LEGACY_LOCATION = %r{lingolinq\.s3\.amazonaws\.com/[^\s"']*|s3\.amazonaws\.com/lingolinq/[^\s"']*}
  # tts_voices.js may only point at premium voice downloads, nothing else.
  ALLOWED = { 'app/frontend/app/utils/tts_voices.js' => %r{\Alingolinq\.s3\.amazonaws\.com/voices/} }.freeze
  SCANNED_EXTENSIONS = %w[.hbs .erb .js .rb .html .json .yml .yaml].freeze
  ICONS = {
    'public/images/lessonpix.png' => [300, 300],
    'public/images/pcs.png' => [284, 284],
    'public/images/symbolstix.png' => [350, 350]
  }.freeze

  def self.png_dimensions(path)
    File.open(path, 'rb') do |f|
      return nil unless f.read(8) == "\x89PNG\r\n\x1a\n".b
      f.read(8) # chunk length + IHDR
      f.read(8).unpack('NN')
    end
  end
end

describe "legacy asset locations" do
  it "should not reference the empty legacy S3 location outside tts_voices.js voice downloads" do
    tracked = IO.popen(['git', '-C', Rails.root.to_s, 'ls-files', '-z', '--', 'app', 'lib', 'config', 'public', '.env.example'], &:read).split("\0")
    expect(tracked).to include('app/frontend/app/index.html')
    hits = tracked.flat_map do |rel|
      next [] unless rel == '.env.example' || LegacyAssetLocationsSpec::SCANNED_EXTENSIONS.include?(File.extname(rel))
      allowed = LegacyAssetLocationsSpec::ALLOWED[rel]
      File.binread(Rails.root.join(rel)).scan(LegacyAssetLocationsSpec::LEGACY_LOCATION).reject { |url| allowed && url.match?(allowed) }.map { |url| "#{rel}: #{url}" }
    end
    expect(hits).to eq([])
  end

  it "should ship the symbol library icons as square PNGs" do
    LegacyAssetLocationsSpec::ICONS.each do |rel, dims|
      path = Rails.root.join(rel)
      expect(File.exist?(path)).to eq(true), "missing #{rel}"
      expect(LegacyAssetLocationsSpec.png_dimensions(path)).to eq(dims)
    end
  end

  it "should load every icon the templates reference from a file in public/images" do
    templates = Dir.glob(Rails.root.join('app/frontend/app/**/*.hbs').to_s)
    referenced = templates.flat_map do |path|
      File.read(path).scan(/\{\{path "(images\/(?:lessonpix|pcs|symbolstix|lessonpix_symbolstix_pcs|logos\/ifttt)\.png)"\}\}/).flatten
    end.uniq
    expect(referenced.sort).to eq(['images/lessonpix.png', 'images/lessonpix_symbolstix_pcs.png', 'images/logos/ifttt.png', 'images/pcs.png', 'images/symbolstix.png'])
    referenced.each do |rel|
      expect(File.exist?(Rails.root.join('public', rel))).to eq(true), "missing public/#{rel}"
    end
  end
end
