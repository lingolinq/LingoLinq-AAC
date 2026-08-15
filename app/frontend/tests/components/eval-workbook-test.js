import EmberObject from '@ember/object';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';

/*
 * The authorship gate on the report workbook.
 *
 * The server only updates a saved eval in place when the author matches; on a
 * mismatch it files a DUPLICATE evaluation (log_session.rb:1075). So this gate is
 * the only thing standing between a shared iPad and a forked clinical record, and
 * it has to hold on BOTH paths — a saved LogSession, and an eval that so far
 * exists only in memory / in the IndexedDB snapshot.
 */
describe('eval-workbook authorship gate', function() {
  var component = null;

  var build = function(attrs) {
    var c = this.owner.factoryFor('component:eval-workbook').create(attrs || {});
    return c;
  };

  afterEach(function() {
    if (component && !component.isDestroyed) { component.destroy(); }
    component = null;
  });

  var sessionUser = function(id) {
    return EmberObject.create({ sessionUser: EmberObject.create({ id: id }) });
  };

  describe('saved eval (has a LogSession)', function() {
    it('allows the author who recorded it', function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ id: '1_5', eval_in_memory: false, author: EmberObject.create({ id: '1_24' }) }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUser('1_24'));
      expect(component.get('isAuthor')).toEqual(true);
      expect(component.get('canEdit')).toEqual(true);
    });

    it('refuses a different signed-in user', function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ id: '1_5', eval_in_memory: false, author: EmberObject.create({ id: '1_24' }) }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUser('1_99'));
      expect(component.get('isAuthor')).toEqual(false);
      expect(component.get('canEdit')).toEqual(false);
      expect(!!component.get('readOnlyReason')).toEqual(true);
    });

    it('refuses when the log has no author at all', function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ id: '1_5', eval_in_memory: false }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUser('1_24'));
      expect(component.get('isAuthor')).toEqual(false);
    });
  });

  describe('in-memory eval (recovered from the snapshot)', function() {
    // The snapshot is keyed by COMMUNICATOR, not by evaluator, so a second SLP on
    // the same device can open the first SLP's unsaved eval. utils/eval stamps
    // author_id at eval start precisely so this can be checked.
    it('allows the SLP who started the eval', function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1', author_id: '1_24' }
      });
      component.set('appState', sessionUser('1_24'));
      expect(component.get('isAuthor')).toEqual(true);
      expect(component.get('canEdit')).toEqual(true);
    });

    it('refuses a DIFFERENT SLP on the same device', function() {
      // Regression: this used to return true unconditionally for in-memory evals,
      // so SLP-B could save a workbook onto SLP-A's eval and fork the record.
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1', author_id: '1_24' }
      });
      component.set('appState', sessionUser('1_99'));
      expect(component.get('isAuthor')).toEqual(false);
      expect(component.get('canEdit')).toEqual(false);
      expect(!!component.get('readOnlyReason')).toEqual(true);
    });

    it('fails CLOSED when the snapshot predates the author stamp', function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUser('1_24'));
      expect(component.get('isAuthor')).toEqual(false);
    });

    it('fails closed when nobody is signed in', function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1', author_id: '1_24' }
      });
      component.set('appState', EmberObject.create({}));
      expect(component.get('isAuthor')).toEqual(false);
    });
  });
});
