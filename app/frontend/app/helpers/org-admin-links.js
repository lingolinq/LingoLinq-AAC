import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';
import { canViewAdminActions, canViewOrgTelemetry } from '../utils/admin_nav';
import { is_classic } from '../utils/view_style';

// {{#let (org-admin-links org) as |links|}}: `links.adminActions` and `links.telemetry` say which of
// the org's admin pages to offer, by the rules in utils/admin_nav.js (the same ones the pages and
// the server apply). Used by the Basic org rail and the Modern org page's tools section;
// `basic` lets that section stand down in Basic, where the rail already carries both links.
export default Helper.extend({
  appState: service('app-state'),
  compute(params) {
    var org = params[0];
    return {
      adminActions: canViewAdminActions(org),
      telemetry: canViewOrgTelemetry(org, this.get('appState.sessionUser'), this.get('appState.feature_flags')),
      basic: is_classic(this.get('appState.effective_view_user'))
    };
  }
});
