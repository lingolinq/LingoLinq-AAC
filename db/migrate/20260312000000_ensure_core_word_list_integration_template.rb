# frozen_string_literal: true

class EnsureCoreWordListIntegrationTemplate < ActiveRecord::Migration[7.2]
  def up
    return if UserIntegration.exists?(template: true, integration_key: 'core_word_list')

    UserIntegration.create!(template: true, integration_key: 'core_word_list', settings: {})
  end

  def down
    UserIntegration.find_by(template: true, integration_key: 'core_word_list')&.destroy
  end
end
