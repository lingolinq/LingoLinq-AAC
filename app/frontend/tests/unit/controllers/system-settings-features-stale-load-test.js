import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import { settled } from '@ember/test-helpers';
import Service from '@ember/service';
import RSVP from 'rsvp';

/* A LATE RESPONSE FOR THE PREVIOUS ORGANIZATION IS DROPPED (2026-11-09, red-team review). On a direct
 * visit the page loads the default scope's features, then the org list arrives and switches the
 * scope, which starts a second load. If the first response landed last it replaced the second, so
 * the page showed the default's toggles under the org's name, and a Save wrote them to that org.
 * The loads are resolved here in the damaging order: the current org's first, the old one's last. */
module('Unit | Controller | system-settings/features stale load', function(hooks) {
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
    var controller = this.owner.lookup('controller:system-settings/features');

    parent.set('org_id', 'default');
    controller.loadFeatures();
    parent.set('org_id', '1_28');
    controller.loadFeatures();
    assert.ok(pending['default'], 'the default scope was requested');
    assert.ok(pending['1_28'], 'and the org\'s');

    pending['1_28'].resolve({ features: [{ key: 'org_feature', name: "Org feature", category: 'Boards', enabled: true }], categories: ['Boards'] });
    await settled();
    pending['default'].resolve({ features: [{ key: 'default_feature', name: "Default feature", category: 'Boards', enabled: false }], categories: ['Boards'] });
    await settled();

    assert.deepEqual((controller.get('features') || []).map(function(f) { return f.key; }), ['org_feature'], 'the current org\'s features stay');
    assert.deepEqual(controller.get('pendingToggles'), { org_feature: true }, 'and its toggles, which a Save would write');
  });
});
