import { module, test } from 'qunit';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* `focusedRoomsLabel` swaps the org hero's big title for the "Rooms - <org>" page label on the rooms
 * list in Focused (templates/organization.hbs). Modern + Focused since 2026-09-29/30; Basic + Focused
 * too since 2026-10-01 (requested: Basic Focused's rooms header should match Modern Focused's).
 */
module('Unit | Controller | organization focusedRoomsLabel', function(hooks) {
  setupTest(hooks);

  function controllerAt(context, routeName, layout, style) {
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({ currentRouteName: routeName }));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ effectiveLayout: layout, effective_view_style: style }));
    return context.owner.factoryFor('controller:organization').create();
  }

  test('the rooms list in Focused, in both views', function(assert) {
    assert.true(controllerAt(this, 'organization.rooms', 'focused', 'modern').get('focusedRoomsLabel'), 'Modern');
    assert.true(controllerAt(this, 'organization.rooms', 'focused', 'classic').get('focusedRoomsLabel'), 'Basic');
  });

  test('not in Gentle, and not on other org pages', function(assert) {
    assert.false(controllerAt(this, 'organization.rooms', 'gentle', 'classic').get('focusedRoomsLabel'), 'Basic Gentle');
    assert.false(controllerAt(this, 'organization.rooms', 'gentle', 'modern').get('focusedRoomsLabel'), 'Modern Gentle');
    assert.false(controllerAt(this, 'organization.room', 'focused', 'classic').get('focusedRoomsLabel'), 'a room, as in Modern');
    assert.false(controllerAt(this, 'organization.index', 'focused', 'classic').get('focusedRoomsLabel'), 'Admin');
  });
});
