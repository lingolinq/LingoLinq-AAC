require 'spec_helper'

# Source-level guards for the signup AI data-sharing sentence. Signup sends the
# disclosure version it showed on every request (app/frontend/app/routes/register.js
# and controllers/register.js), and the server records consent when that version is
# current. So the sentence has to be on the page in every consent layout, and the
# version the page claims has to be the server's.
describe 'signup AI data-sharing sentence' do
  let(:register_lines) { File.read(Rails.root.join('app/frontend/app/templates/register.hbs')).split("\n") }

  # Line numbers of the sentence that sit inside an {{#if this.showCoppaConsent}}
  # block (either branch). Inside that block only one layout would show it.
  def note_lines_inside_coppa_conditional(lines)
    inside = []
    depth = nil
    lines.each_with_index do |line, idx|
      opens = line.scan(/\{\{#(?:if|unless|each|let|with)\b/).length
      closes = line.scan(%r{\{\{/(?:if|unless|each|let|with)\}\}}).length
      if depth.nil?
        depth = 0 if line.include?('{{#if this.showCoppaConsent}}')
      end
      unless depth.nil?
        depth += opens - closes
        if depth <= 0
          depth = nil
        elsif line.include?('key="register_ai_consent_note"')
          inside << (idx + 1)
        end
      end
    end
    inside
  end

  it 'shows the sentence on both signup forms' do
    expect(register_lines.count { |l| l.include?('key="register_ai_consent_note"') }).to eq(2)
  end

  it 'shows the sentence in both consent layouts, not only when the age question is off' do
    expect(register_lines.any? { |l| l.include?('{{#if this.showCoppaConsent}}') }).to eq(true)
    expect(note_lines_inside_coppa_conditional(register_lines)).to eq([])
  end

  it 'links the sentence to the current disclosure' do
    register_lines.select { |l| l.include?('key="register_ai_consent_note"') }.each do |line|
      expect(line).to include('href="/ai_consent/disclosures/current"')
    end
  end

  it 'keeps the version the signup page claims equal to the current disclosure version' do
    gate = File.read(Rails.root.join('app/frontend/app/utils/article50_gate.js'))
    claimed = gate[/AI_CONSENT_REGISTRATION_VERSION\s*=\s*(\d+)\s*;/, 1]
    expect(claimed).to be_present
    expect(claimed.to_i).to eq(LingoLinq::AiConsentDisclosures::CURRENT_VERSION)
  end
end
