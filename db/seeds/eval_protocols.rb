# Persists the five baseline EvalProtocol profiles to the database.
#
# The model's STATIC_PROFILES + static_protocol_definition already
# provide in-memory templates so the index/show endpoints work without
# any DB rows. Seeding the same definitions here gives non-static
# lookups (and SLP-authored overrides) a starting point, and lets the
# admin UI display the same catalog for editing once that ships.
#
# Idempotent: re-running this file refreshes settings on existing
# records but does NOT create duplicates. Loaded from db/seeds.rb so
# it runs as part of `rake db:seed`.

EvalProtocol::STATIC_PROFILES.each do |code|
  definition = EvalProtocol.static_protocol_definition(code)
  next unless definition

  protocol = EvalProtocol.find_or_initialize_by(public_protocol_id: code)
  protocol.population_profile = code
  protocol.protocol_version ||= '1.0'
  # Merge so any SLP-edited keys at top level (e.g. `public`) survive
  # re-runs, but the canonical protocol body always matches the model.
  settings = (protocol.settings || {}).dup
  settings['public'] = true if settings['public'].nil?
  settings['protocol'] = definition
  protocol.settings = settings

  if protocol.new_record?
    protocol.save!
    puts "✓ Created EvalProtocol #{code}"
  elsif protocol.changed?
    protocol.save!
    puts "✓ Updated EvalProtocol #{code}"
  else
    puts "✓ EvalProtocol #{code} already up to date"
  end
end
