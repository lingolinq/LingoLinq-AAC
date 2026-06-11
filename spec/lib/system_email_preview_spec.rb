require 'spec_helper'

describe SystemEmailPreview do
  describe '.sample_user' do
    it 'returns synthetic placeholder data' do
      user = SystemEmailPreview.sample_user
      expect(user.email).to eq('preview@example.com')
      expect(user.global_id).to eq('#1#_preview-user')
      expect(user.display_user_name).to eq('preview_user')
      expect(user.settings['email']).to eq('preview@example.com')
    end
  end
end
