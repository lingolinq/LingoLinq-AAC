import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* THE ORG TABS AS A DROPDOWN (requested 2026-10-02: "when [the left menu] expands, we need the
 * menu on the right to convert to a dropdown", "styled like ... the home page dropdown pill
 * menu"). The dropdown's trigger names the tab you are on, as the home pill dropdown does: Admin
 * on the org index, otherwise the people section the strip lights (`activePeopleSection`, which
 * reads the people page's `shown_view`, which reads its `section` query param).
 */
module('Unit | Controller | organization tab dropdown label', function(hooks) {
  setupTest(hooks);

  test('names the tab you are on', function(assert) {
    this.owner.unregister('service:router');
    this.owner.register('service:router', Service.extend({ currentRouteName: 'organization.index' }));
    var router = this.owner.lookup('service:router');
    var people = this.owner.lookup('controller:organization/people');
    var c = this.owner.lookup('controller:organization');

    assert.strictEqual(c.get('orgTabLabel'), 'Admin', 'the org index');
    router.set('currentRouteName', 'organization.people');
    people.set('section', 'supervisors');
    assert.strictEqual(c.get('orgTabLabel'), 'Supervisors');
    people.set('section', 'extras');
    assert.strictEqual(c.get('orgTabLabel'), 'Symbols', 'the extras section is the Symbols tab');
  });
});
