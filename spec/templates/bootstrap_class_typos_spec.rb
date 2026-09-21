require 'spec_helper'

# Static guard against near-miss spellings of Bootstrap utility classes in Ember
# templates.
#
# WHY THIS EXISTS
#   A misspelled class name is the quietest possible frontend defect: the template
#   compiles, the page renders, no test fails, no linter objects, and the styling
#   simply never applies. `table-reponsive` (one `s`) shipped twice in
#   app/frontend/app/templates/user/log.hbs and sat there through every green run,
#   leaving two assessment tables with no horizontal scroll of their own.
#
#   Bootstrap 3.4.1 is imported into the build as a plain stylesheet
#   (app/frontend/ember-cli-build.js:60 imports
#   node_modules/bootstrap/dist/css/bootstrap.min.css), so its class names are never
#   resolved against anything at build time. Nothing but a check like this one can
#   catch a typo in them.
#
# WRITTEN AS THE CLASS, NOT THE INSTANCE
#   Pinning "log.hbs line 199 says table-responsive" would prove nothing that a grep
#   does not already prove, and would go stale the moment the file moves. This scans
#   every template for a known set of misspellings, so the NEXT one is caught too.
#   Add an entry when you find a new near-miss.
describe 'bootstrap utility class typos' do
  # misspelling => the correct Bootstrap class it was meant to be
  MISSPELLINGS = {
    'table-reponsive'  => 'table-responsive',
    'table-respsonive' => 'table-responsive',
    'col-xs-'          => nil, # placeholder guard: real classes, never flagged
  }.freeze

  # Only the two spellings that are genuinely wrong. `col-xs-` above is a real
  # Bootstrap prefix and is excluded so the list documents intent without flagging.
  ACTIVE_TYPOS = MISSPELLINGS.reject { |_typo, correct| correct.nil? }.freeze

  let(:template_files) do
    Dir.glob(Rails.root.join('app/frontend/app/{templates,components}/**/*.hbs'))
  end

  it 'has templates to scan (guards against a silently empty glob)' do
    expect(template_files.length).to be > 100
  end

  ACTIVE_TYPOS.each do |typo, correct|
    it "contains no occurrence of the misspelling '#{typo}' (meant: '#{correct}')" do
      offenders = template_files.each_with_object([]) do |path, acc|
        File.readlines(path).each_with_index do |line, idx|
          next unless line.include?(typo)
          acc << "#{path.sub(Rails.root.to_s + '/', '')}:#{idx + 1}"
        end
      end

      expect(offenders).to be_empty,
        "Found '#{typo}' (should be '#{correct}') at:\n  #{offenders.join("\n  ")}"
    end
  end
end
