# frozen_string_literal: true

# Browsers POST CSP violation reports with these media types (legacy report-uri
# and Reporting API). Register them so Mime lookup works and controller tests
# can assign POST parameters without ActionController::TestRequest raising
# "Unknown Content-Type".
Mime::Type.register 'application/csp-report', :csp_report
Mime::Type.register 'application/reports+json', :reports_json
