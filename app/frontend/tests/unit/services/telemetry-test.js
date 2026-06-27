import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest, primePersistenceService } from '../../helpers';
import { stubPersistence } from '../../helpers/persistence-stub';

module('Unit | Service | telemetry', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.ajaxCalls = [];
    primePersistenceService(this.owner);
    var testContext = this;
    this.owner.register('service:app-state', Service.extend({
      current_route: 'board.index',
      feature_flags: { product_telemetry: true },
      currentUser: EmberObject.create({ admin: false })
    }));
    this.restorePersistence = stubPersistence({
      online: true,
      ajax: function(url, opts) {
        testContext.ajaxCalls.push({url: url, opts: opts});
        return RSVP.resolve({success: true});
      }
    });
  });

  hooks.afterEach(function() {
    if (this.restorePersistence) {
      this.restorePersistence();
    }
  });

  test('board activation telemetry omits button text', function(assert) {
    var telemetry = this.owner.lookup('service:telemetry');
    telemetry.trackBoardActivation({
      label: 'private label',
      vocalization: 'private speech',
      button_id: 'button-1',
      board: {id: 'board-1'},
      percent_x: 0.5,
      percent_y: 0.25,
      source: 'click'
    });
    telemetry.flush();

    assert.equal(this.ajaxCalls.length, 1);
    var payload = JSON.parse(this.ajaxCalls[0].opts.data);
    assert.equal(payload.telemetry_events[0].event_type, 'board_activation');
    assert.equal(payload.telemetry_events[0].data.button_id, 'button-1');
    assert.equal(payload.telemetry_events[0].data.label, undefined);
    assert.equal(payload.telemetry_events[0].data.vocalization, undefined);
  });

  test('route telemetry records prior route duration', function(assert) {
    var telemetry = this.owner.lookup('service:telemetry');
    telemetry.trackRoute('index');
    telemetry.lastRouteAt = (new Date()).getTime() - 2000;
    telemetry.trackRoute('organization.index');
    telemetry.flush();

    var payload = JSON.parse(this.ajaxCalls[0].opts.data);
    assert.equal(payload.telemetry_events[0].event_type, 'route_visit');
    assert.equal(payload.telemetry_events[0].route, 'index');
    assert.ok(payload.telemetry_events[0].data.duration_ms >= 2000);
  });
});
