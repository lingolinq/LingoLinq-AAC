import { module, test } from 'qunit';
import EvalSession from 'frontend/utils/eval_session';

const PEDS_INTAKE = { age_band: '6-12', etiology: 'autism', current_comm: 'single_symbol', suspected_access: 'touch' };
const PROGRESSIVE_INTAKE = { age_band: '65+', etiology: 'progressive', current_comm: 'phrase', suspected_access: 'gaze' };

module('Unit | Utility | eval_session', function(hooks) {
  test('starts in configuring state', function(assert) {
    const session = EvalSession.create();
    assert.strictEqual(session.get('state'), 'configuring');
    assert.strictEqual(session.get('subtestIndex'), 0);
    assert.deepEqual(session.get('events'), []);
    assert.strictEqual(session.get('mode'), 'quick_screen');
  });

  test('beginScreening moves into screening and picks a profile', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    assert.strictEqual(session.get('state'), 'screening');
    assert.strictEqual(session.get('protocolProfile'), 'peds-emerging');
    assert.ok(session.get('startedAt'), 'startedAt timestamp recorded');
  });

  test('subtest order is profile-specific', function(assert) {
    const peds = EvalSession.create();
    peds.beginScreening(PEDS_INTAKE);
    assert.deepEqual(
      peds.subtestOrder(),
      ['stage_probe', 'access_snapshot', 'library_compare', 'vocab_probe', 'wrap']
    );

    const adult = EvalSession.create();
    adult.beginScreening(PROGRESSIVE_INTAKE);
    assert.deepEqual(
      adult.subtestOrder(),
      ['access_snapshot', 'cognitive_probe', 'vocab_probe', 'wrap']
    );
  });

  test('recordEvent appends and timestamps', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    session.recordEvent({ subtest: 'stage_probe', response: 'correct' });
    session.recordEvent({ subtest: 'stage_probe', response: 'incorrect' });
    const events = session.get('events');
    assert.strictEqual(events.length, 2);
    assert.ok(events[0].ts, 'ts stamped on event');
    assert.strictEqual(events[0].response, 'correct');
  });

  test('recordEvent ignores events without a subtest', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    session.recordEvent({ response: 'correct' });
    session.recordEvent(null);
    assert.strictEqual(session.get('events').length, 0);
  });

  test('advanceSubtest steps through the order then triggers review', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    const order = session.subtestOrder();
    for (let i = 0; i < order.length - 1; i++) {
      session.advanceSubtest();
    }
    assert.strictEqual(session.get('state'), 'screening', 'still screening after intermediate advances');
    session.advanceSubtest();
    assert.strictEqual(session.get('state'), 'reviewing', 'final advance enters reviewing');
    assert.ok(session.get('recommendation'), 'recommendation generated on review');
  });

  test('promoteToTargeted resets index and updates state', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    session.advanceSubtest();
    session.promoteToTargeted();
    assert.strictEqual(session.get('state'), 'targeting');
    assert.strictEqual(session.get('subtestIndex'), 0);
  });

  test('toLogPayload builds the documented LogSession shape', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    session.recordEvent({ subtest: 'stage_probe', response: 'correct' });
    session.review();
    const payload = session.toLogPayload();
    assert.strictEqual(payload.log_type, 'eval');
    assert.strictEqual(payload.data.eval_mode, 'quick_screen');
    assert.strictEqual(payload.data.protocol_version, '1.0');
    assert.strictEqual(payload.data.item_bank_profile, 'peds-emerging');
    assert.strictEqual(payload.data.events.length, 1);
    assert.ok(payload.data.recommendation, 'recommendation included');
    assert.ok(typeof payload.data.duration_s === 'number', 'duration_s computed');
    assert.strictEqual(payload.data.ai_generated, null, 'no Article 50(2) marker before AI narration runs');
  });

  test('toLogPayload carries the Article 50(2) ai_generated marker through when set', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    const marker = { marked: true, spec: 'eu-ai-act-art50-2', provider: 'claude', model: 'claude-opus-4-7', generated_at: '2026-07-10T00:00:00Z', content_id: 'abc', sig_alg: 'GoSecure.lite_hmac.v1', signature: 'sig' };
    session.set('aiNarrative', 'Drafted narrative.');
    session.set('aiGenerated', marker);
    const payload = session.toLogPayload();
    assert.strictEqual(payload.data.ai_narrative, 'Drafted narrative.');
    assert.deepEqual(payload.data.ai_generated, marker, 'raw marker carried through unmodified');
  });

  test('progressFraction reflects the subtest cursor', function(assert) {
    const session = EvalSession.create();
    session.beginScreening(PEDS_INTAKE);
    assert.strictEqual(session.progressFraction(), 0);
    session.advanceSubtest();
    assert.ok(session.progressFraction() > 0 && session.progressFraction() < 1);
  });

  /* `subtestOrder()` drops the library-comparison subtests when the app's
     `feature_flags.eval_single_library` is on (app/utils/eval_session.js `_withoutLibrarySubtests`,
     read through LingoLinq.appState). These tests boot no app, so they used to read whatever
     app-state an EARLIER test had left behind, destroyed: the expected order above held only while
     that leftover had the flag off. Each test now gets its own app-state with the flag pinned off
     (what the assertions above encode); the flag-on order is asserted below. Registered last, but
     QUnit hooks apply to every test in the module. */
  standInGlobals(hooks, { appState: () => EmberObject.create({ feature_flags: { eval_single_library: false } }) });

  test('single-library deployments drop the library comparison subtests', function(assert) {
    this.standIns.appState.set('feature_flags', { eval_single_library: true });
    const peds = EvalSession.create();
    peds.beginScreening(PEDS_INTAKE);
    assert.deepEqual(peds.subtestOrder(), ['stage_probe', 'access_snapshot', 'vocab_probe', 'wrap']);
  });

  test('single-library deployments drop the three-way library subtest from targeting too', function(assert) {
    this.standIns.appState.set('feature_flags', { eval_single_library: true });
    const peds = EvalSession.create();
    peds.beginScreening(PEDS_INTAKE);
    peds.promoteToTargeted();
    assert.deepEqual(peds.subtestOrder(), ['adaptive_grid', 'access_co_trial', 'syntax_probe', 'motor_map', 'wrap']);
  });
});

// Kept below the baselined lint rows so they do not shift (see .eslint-todo).
import EmberObject from '@ember/object';
import { standInGlobals } from 'frontend/tests/helpers/stand-in-globals';
