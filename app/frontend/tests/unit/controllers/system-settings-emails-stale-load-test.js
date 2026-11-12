import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { settled } from '@ember/test-helpers';
import Service from '@ember/service';
import RSVP from 'rsvp';

/* The Emails tab's twin of system-settings-features-stale-load-test.js (senior-dev review 2026-11-10:
 * only Features was tested). A late response for the organization that was selected before must not
 * replace the current one's templates. Resolved in the damaging order: the current org first. */
module('Unit | Controller | system-settings/emails stale load', function(hooks) {
  setupTest(hooks);

  test('the previous scope\'s late response does not replace the current one', async function(assert) {
    var pending = {};
    this.owner.unregister('service:persistence');
    this.owner.register('service:persistence', Service.extend({
      ajax(url) {
        var d = RSVP.defer();
        pending[decodeURIComponent(url.split('org_id=')[1])] = d;
        return d.promise;
      }
    }));
    var parent = this.owner.lookup('controller:system-settings');
    var controller = this.owner.lookup('controller:system-settings/emails');

    parent.set('org_id', 'default');
    controller.loadTemplates();
    parent.set('org_id', '1_28');
    controller.loadTemplates();
    assert.ok(pending['default'], 'the default scope was requested');
    assert.ok(pending['1_28'], 'and the org\'s');

    pending['1_28'].resolve({ templates: [{ key: 'org/welcome', name: "Org welcome" }], categories: ['Account'] });
    await settled();
    pending['default'].resolve({ templates: [{ key: 'default/welcome', name: "Default welcome" }], categories: ['Account'] });
    await settled();

    assert.deepEqual((controller.get('templates') || []).map(function(t) { return t.key; }), ['org/welcome'], 'the current org\'s templates stay');
  });
});
