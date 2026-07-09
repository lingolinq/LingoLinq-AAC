import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';

module('Unit | Service | telemetry', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.ajaxCalls = [];
    var testContext = this;
    if (this.owner.lookup('service:telemetry')) {
      this.owner.unregister('service:telemetry');
    }
    if (this.owner.lookup('service:app-state')) {
      this.owner.unregister('service:app-state');
    }
    if (this.owner.lookup('service:persistence')) {
      this.owner.unregister('service:persistence');
    }
    this.owner.register('service:persistence', Service.extend({
      online: true,
      ajax(url, opts) {
        testContext.ajaxCalls.push({ url: url, opts: opts });
        return RSVP.resolve({ success: true });
      }
    }));
    this.owner.register('service:app-state', Service.extend({
      current_route: 'board.index',
      feature_flags: EmberObject.create({ product_telemetry: true }),
      currentUser: EmberObject.create({ id: 'telemetry-user', admin: false }),
      sessionUser: EmberObject.create({ id: 'telemetry-user', admin: false })
    }));
    this.telemetry = this.owner.lookup('service:telemetry');
  });

  test('board activation telemetry omits button text', function(assert) {
    this.telemetry.trackBoardActivation({
      label: 'private label',
      vocalization: 'private speech',
      button_id: 'button-1',
      board: {id: 'board-1'},
      percent_x: 0.5,
      percent_y: 0.25,
      source: 'click'
    });
    this.telemetry.flush();

    assert.equal(this.ajaxCalls.length, 1);
    var payload = JSON.parse(this.ajaxCalls[0].opts.data);
    assert.equal(payload.telemetry_events[0].event_type, 'board_activation');
    assert.equal(payload.telemetry_events[0].data.button_id, 'button-1');
    assert.equal(payload.telemetry_events[0].data.label, undefined);
    assert.equal(payload.telemetry_events[0].data.vocalization, undefined);
  });

  test('route telemetry records prior route duration', function(assert) {
    this.telemetry.trackRoute('index');
    this.telemetry.lastRouteAt = (new Date()).getTime() - 2000;
    this.telemetry.trackRoute('organization.index');
    this.telemetry.flush();

    var payload = JSON.parse(this.ajaxCalls[0].opts.data);
    assert.equal(payload.telemetry_events[0].event_type, 'route_visit');
    assert.equal(payload.telemetry_events[0].route, 'index');
    assert.ok(payload.telemetry_events[0].data.duration_ms >= 2000);
  });
});
