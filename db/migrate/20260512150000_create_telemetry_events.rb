class CreateTelemetryEvents < ActiveRecord::Migration[5.0]
  def change
    create_table :telemetry_events do |t|
      t.integer :user_id
      t.integer :organization_id
      t.integer :device_id
      t.string :event_type
      t.string :route
      t.string :feature_area
      t.datetime :occurred_at
      t.text :data
      t.timestamps
    end

    add_index :telemetry_events, [:organization_id, :occurred_at]
    add_index :telemetry_events, [:user_id, :occurred_at]
    add_index :telemetry_events, [:event_type, :occurred_at]
    add_index :telemetry_events, [:route, :occurred_at]
  end
end
