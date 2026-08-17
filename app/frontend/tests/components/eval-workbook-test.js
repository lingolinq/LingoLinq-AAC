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

    /*
     * `sessionUser.id` is NOT reliably a global id, so the gate compares
     * `sessionUser.global_id` instead.
     *
     * serializers/application.js pins the session user's record id to the literal
     * 'self' so Ember Data never re-keys the identifier, parking the real id in
     * `_actual_id`; app-state.js:456 loads the user through exactly that path. It
     * is a WINDOW rather than a constant — persistence.js:722 stores the fetched
     * user under its REAL id, so a later local read (persistence.js:394) resolves
     * it and the window closes. Measured in a second tab: the 'self' state was live
     * in 2 of 3 loads when sampled every 250ms, and invisible when sampled after 9s.
     *
     * Before models/user.js declared `_actual_id`, Ember Data dropped it and the
     * record had no usable id at all, so the eval's own author was shown the
     * read-only banner. These cases pin that state deterministically.
     */
    var sessionUserNamed = function(id, user_name, global_id) {
      return EmberObject.create({
        sessionUser: EmberObject.create({ id: id, user_name: user_name, global_id: global_id })
      });
    };

    it("resolves the author through global_id when id is the 'self' alias", function() {
      // The root fix: models/user.js#global_id returns `_actual_id` when the record
      // is keyed 'self'. user_name is left unset here on purpose — global_id alone
      // must carry the identification.
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({
          id: '1_5', eval_in_memory: false,
          author: EmberObject.create({ id: '1_24', user_name: 'marcus_williams_slp' })
        }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUserNamed('self', undefined, '1_24'));
      expect(component.get('isAuthor')).toEqual(true);
      expect(component.get('canEdit')).toEqual(true);
    });

    it("refuses when global_id belongs to a different user", function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({
          id: '1_5', eval_in_memory: false,
          author: EmberObject.create({ id: '1_24', user_name: 'marcus_williams_slp' })
        }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUserNamed('self', 'someone_else_slp', '1_99'));
      expect(component.get('isAuthor')).toEqual(false);
      expect(component.get('canEdit')).toEqual(false);
    });

    it("still fails closed when neither id nor global_id identifies the user", function() {
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({
          id: '1_5', eval_in_memory: false,
          author: EmberObject.create({ id: '1_24' })
        }),
        assessment: { ref_id: 'tmp.1.0.1' }
      });
      component.set('appState', sessionUserNamed('self', 'marcus_williams_slp', undefined));
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

    /*
     * The 'self' sentinel is not an identity.
     *
     * utils/eval.js stamped `sessionUser.id`, which is the literal string 'self'
     * for as long as the session user is loaded through findRecord('user','self')
     * — and that string is the SAME for every account. So a snapshot stamped in
     * that window compares equal to the next signed-in user's 'self', whoever they
     * are. The stamp exists to stop SLP-B forking SLP-A's evaluation, and this
     * defeated it. The stamp now records global_id; the gate refuses the sentinel
     * on either side regardless, because old snapshots still carry it.
     */
    var selfUser = function(global_id) {
      return EmberObject.create({
        sessionUser: EmberObject.create({ id: 'self', global_id: global_id })
      });
    };

    it("refuses a legacy 'self' stamp for a DIFFERENT SLP", function() {
      // The dangerous direction, and the exact state that produced it: SLP-B is
      // INSIDE the 'self' window too, so global_id has not resolved yet and both
      // sides of the comparison read 'self'. That returned TRUE and handed SLP-B an
      // edit lock on SLP-A's eval. global_id is left unset on purpose — supplying
      // one would make the ids differ and the case would pass for the wrong reason.
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1', author_id: 'self' }
      });
      component.set('appState', selfUser(undefined));
      expect(component.get('isAuthor')).toEqual(false);
      expect(component.get('canEdit')).toEqual(false);
      expect(!!component.get('readOnlyReason')).toEqual(true);
    });

    it("refuses a legacy 'self' stamp even for the real author", function() {
      // The price of the above, accepted deliberately: an eval stamped by an older
      // build goes read-only for its own author too, because nothing in the
      // snapshot can distinguish the two cases. Bounded by EVAL_PROGRESS_MAX_AGE_S
      // (24h), and retyping a workbook beats forking the clinical record.
      //
      // Pins the documented TRADE, not the guard: with the sentinel checks removed
      // this still passes, because 'self' and '1_24' differ anyway. The case that
      // actually goes red under that control is the one above.
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1', author_id: 'self' }
      });
      component.set('appState', selfUser('1_24'));
      expect(component.get('isAuthor')).toEqual(false);
    });

    it("resolves the in-memory author through global_id when id is the 'self' alias", function() {
      // Positive control for the two above: the gate must still ALLOW the author
      // during the same 'self' window once the stamp is a real global id. Without
      // this, "refuses everything" would pass the suite.
      component = this.owner.factoryFor('component:eval-workbook').create({
        log: EmberObject.create({ eval_in_memory: true }),
        assessment: { ref_id: 'tmp.1.0.1', author_id: '1_24' }
      });
      component.set('appState', selfUser('1_24'));
      expect(component.get('isAuthor')).toEqual(true);
      expect(component.get('canEdit')).toEqual(true);
    });
  });
});
