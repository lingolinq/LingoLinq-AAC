require 'spec_helper'

# Template gates that keep download buttons off the pages where the download
# cannot work. Rendering the preferences page needs a full user model, so these
# read the templates: each guarded element must sit directly inside its gate.
module DownloadGatesSpec
  TEMPLATES = Rails.root.join('app/frontend/app')
  PREMIUM_VOICES_BUTTON = /ctrlAction "(open_)?premium_voices"/
  PREMIUM_VOICES_GATE = /\A\s*\{\{#if this\.(setup\.)?premium_voices_supported\}\}\s*\z/

  def self.previous_line(lines, idx)
    (idx - 1).downto(0).map { |i| lines[i] }.find { |l| !l.strip.empty? }
  end
end

describe "download gates in templates" do
  it "should put every Premium Voices button directly inside a premium_voices_supported gate" do
    found = []
    Dir.glob(DownloadGatesSpec::TEMPLATES.join('**/*.hbs').to_s).each do |path|
      lines = File.read(path).split("\n")
      lines.each_with_index do |line, idx|
        next unless line.match?(DownloadGatesSpec::PREMIUM_VOICES_BUTTON)
        rel = path.sub("#{Rails.root}/", '')
        found << rel
        expect(DownloadGatesSpec.previous_line(lines, idx)).to match(DownloadGatesSpec::PREMIUM_VOICES_GATE), "#{rel}:#{idx + 1} is not inside the gate"
      end
    end
    # Five buttons: Voice & Output, three in Preferences, the setup voice step.
    expect(found.sort).to eq([
      'app/frontend/app/components/setup/voice.hbs',
      'app/frontend/app/components/voice-output.hbs',
      'app/frontend/app/templates/user/preferences.hbs',
      'app/frontend/app/templates/user/preferences.hbs',
      'app/frontend/app/templates/user/preferences.hbs'
    ])
  end

  it "should show the ambassadors Windows section only when a 64-bit download is configured" do
    lines = File.read(DownloadGatesSpec::TEMPLATES.join('templates/ambassadors.hbs')).split("\n")
    idx = lines.index { |l| l.include?('key="windows_explainer_ambassadors"') }
    expect(idx).not_to be_nil
    heading = lines[0...idx].rindex { |l| l.include?('key="window"') }
    expect(DownloadGatesSpec.previous_line(lines, heading)).to match(/\{\{#if this\.app_state\.domain_settings\.windows_64_bit_url\}\}/)
  end
end
