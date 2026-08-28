# frozen_string_literal: true

require 'spec_helper'
require 'json'
require_relative '../../scripts/notion_rich_text'

describe NotionRichText do
  describe '.rich' do
    it 'returns an empty array for blank input' do
      expect(NotionRichText.rich(nil)).to eq([])
      expect(NotionRichText.rich('')).to eq([])
    end

    it 'returns a single object under the per-object cap' do
      text = 'a' * NotionRichText::MAX_CONTENT
      result = NotionRichText.rich(text)
      expect(result.length).to eq(1)
      expect(result.first['text']['content']).to eq(text)
    end

    it 'splits text longer than the per-object cap into multiple objects' do
      text = 'a' * (NotionRichText::MAX_CONTENT + 50)
      result = NotionRichText.rich(text)
      expect(result.length).to eq(2)
      expect(result.map { |obj| obj['text']['content'].length }).to all(be <= NotionRichText::MAX_CONTENT)
      expect(result.map { |obj| obj['text']['content'] }.join).to eq(text)
    end

    it 'preserves the LL-b3e3a0b99c remediation that a single 1900-char slice used to drop' do
      register = JSON.parse(File.read(Rails.root.join('audit-reports', 'FINDINGS.json')))
      finding = register['findings'].find { |f| f['id'] == 'LL-b3e3a0b99c' }
      text = finding.dig('remediation', 'options').to_s
      expect(text.length).to be > NotionRichText::MAX_CONTENT

      result = NotionRichText.rich(text)
      expect(result.length).to be > 1
      expect(result.map { |obj| obj['text']['content'] }.join).to eq(text)
      expect(result.last['text']['content']).to include('CURRENT_VERSION')
    end
  end
end
