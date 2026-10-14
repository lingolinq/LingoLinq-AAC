# Regenerates the English schema-2 language files (db/language/en/*.json) from the
# pinned OpenAAC inputs in db/language/vendor/. Reads only those vendored files:
# no database, no network. Commit the result; the spec in
# spec/lib/language/schema2_generator_spec.rb fails if the committed files drift
# from what this task produces.
#
# Run: bundle exec rake language:schema2
namespace :language do
  desc 'Regenerate db/language/en/*.json from the pinned vendored OpenAAC inputs'
  task :schema2 do
    require Rails.root.join('lib', 'language', 'schema2_generator').to_s
    Language::Schema2Generator.generate!.each { |path| puts "wrote #{path}" }
  end
end
