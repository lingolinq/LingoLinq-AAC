class RenameModelNameToAiModelInAiApiLogs < ActiveRecord::Migration[7.2]
  def change
    rename_column :ai_api_logs, :model_name, :ai_model
  end
end
