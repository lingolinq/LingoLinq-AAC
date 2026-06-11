require 'spec_helper'

describe SystemEmailTemplateSecurity do
  describe '.validate!' do
    it 'allows output-only ERB tags' do
      expect {
        described_class.validate!('<p><%= app_name %></p>')
      }.not_to raise_error
    end

    it 'rejects Ruby code blocks' do
      expect {
        described_class.validate!('<% if @user %>hello<% end %>')
      }.to raise_error(ArgumentError, /output tags/)
    end

    it 'rejects dangerous expressions in output tags' do
      expect {
        described_class.validate!('<%= system("rm -rf /") %>')
      }.to raise_error(ArgumentError, /disallowed/)
    end

    it 'allows escaped ERB literals' do
      expect {
        described_class.validate!('<%% foo %>')
      }.not_to raise_error
    end
  end
end
