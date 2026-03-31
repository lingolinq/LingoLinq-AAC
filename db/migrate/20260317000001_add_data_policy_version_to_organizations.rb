class AddDataPolicyVersionToOrganizations < ActiveRecord::Migration[7.0]
  def change
    add_column :organizations, :data_policy_version, :integer, default: 0
  end
end
