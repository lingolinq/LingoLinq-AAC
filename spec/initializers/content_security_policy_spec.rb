require 'spec_helper'

describe "content_security_policy" do
  let(:policy) { Rails.application.config.content_security_policy }

  # weblinger is served same-origin from public/weblinger/, so no outside host is
  # needed to load it or its libraries.
  it "should not allow the retired weblinger host in script-src or connect-src" do
    expect(policy.directives['script-src']).not_to include(a_string_matching(/covidspeak/))
    expect(policy.directives['connect-src']).not_to include(a_string_matching(/covidspeak/))
  end

  it "should still allow same-origin scripts" do
    expect(policy.directives['script-src']).to include("'self'")
  end
end
