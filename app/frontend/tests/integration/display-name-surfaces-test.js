import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import EmberObject from '@ember/object';

/*
 * The "No name" sentinel, asserted on the REAL components that render other
 * people's names.
 *
 * Why these and not a Playwright script: every surface below takes a
 * `limited_identity` payload — a plain object, not an Ember-Data record — so the
 * `display_name` computed on the user model cannot run and a silent regression
 * renders either the sentinel or nothing at all. These mount the actual
 * component in headless Chrome, so they catch that, and unlike an ad-hoc browser
 * script they run in CI on every change.
 *
 * Each case asserts BOTH directions on purpose: a nameless user must resolve to
 * their handle, and a user with a real name must keep it. A fix that clobbered
 * real names would pass a one-directional test.
 *
 * See app/utils/display_name.js and docs/task-management/LEARNINGS.md.
 */

const SENTINEL = 'No name';

// Shaped like JsonApi::User.as_json(u, limited_identity: true).
function payload(name, user_name) {
  return { id: '1_' + user_name, name: name, user_name: user_name, avatar_url: '' };
}

const NAMELESS = payload(SENTINEL, 'nameless_one');
const NAMED = payload('Ada Lovelace', 'ada');

function textOf(element) {
  return element.textContent.replace(/\s+/g, ' ').trim();
}

QUnit.module('Integration | "No name" sentinel across real surfaces', function(hooks) {
  setupRenderingTest(hooks);

  /*
   * supervision-settings.hbs renders the same rows twice: the inline/dashboard
   * layout (lines 43 and 152) and, past the {{else}} at line 184, the modal
   * layout (lines 244 and 357). Only the inline half is covered here.
   *
   * The modal half cannot be driven from a rendering test: its opening hook
   * OVERWRITES the model from modal settings — `this.set('model', options.user)`
   * or `EmberObject.create(options)` (supervision-settings.js:61-66) — so a
   * passed-in @model is discarded and the component renders "None found".
   * Seeding real modal state is the slow, flaky path this repo deliberately
   * avoids in QUnit (see tests/integration/modal-close-button-test.js).
   * Lines 244/357 are the identical {{display-name}} call in a different layout,
   * so the risk is low — but it is uncovered, not verified.
   */
  QUnit.test('supervision-settings (inline) resolves the sentinel and keeps real names', async function(assert) {
    this.set('model', EmberObject.create({
      supervisors_or_managing_org: true,
      supervisors: [NAMELESS, NAMED],
      supervisees: [NAMELESS, NAMED],
      known_supervisees: [NAMELESS, NAMED]
    }));
    await render(hbs`<SupervisionSettings @model={{this.model}} @inline={{true}} />`);
    const txt = textOf(this.element);
    assert.true(txt.includes('nameless_one'), 'the rows rendered, and the nameless user shows their handle');
    assert.false(txt.includes(SENTINEL), 'no "No name" anywhere in the rendered component');
    assert.true(txt.includes('Ada Lovelace'), 'a real name is preserved, not replaced by the handle');
  });

  // The "Shared with" list sits behind {{#if this.board.permissions.share}}
  // (share-board.hbs:78) — without that flag the block never renders and the
  // assertions below would pass vacuously.
  QUnit.test('share-board "Shared with" list resolves the sentinel and keeps real names', async function(assert) {
    this.set('board', EmberObject.create({
      name: 'Test Board',
      key: 'someone/test',
      public: false,
      permissions: { share: true },
      shared_users: [NAMELESS, NAMED]
    }));
    await render(hbs`<ShareBoard @board={{this.board}} />`);
    const txt = textOf(this.element);
    assert.true(txt.includes('nameless_one'), 'the shared-users list rendered, and shows the handle');
    assert.false(txt.includes(SENTINEL), 'no "No name" in the shared-users list');
    assert.true(txt.includes('Ada Lovelace'), 'a real name is preserved');
  });

  // The start-code lookup page. `result` is assigned straight from the
  // /api/v1/start_code response (controllers/start_codes.js:22), which was
  // verified live to return name:"No name" with user_name alongside it.
  QUnit.test('start-code lookup shows the handle for a supervisor target', async function(assert) {
    this.set('result', { code: 'abc', supervisor: true, target_id: '1_9', name: SENTINEL, user_name: 'nameless_one' });
    await render(hbs`{{#if this.result.supervisor}}<span id="out">{{display-name this.result}}</span>{{/if}}`);
    assert.strictEqual(this.element.querySelector('#out').textContent.trim(), 'nameless_one',
      'renders the handle the Rails change now supplies, not the sentinel');
  });

  QUnit.test('start-code lookup keeps an organization name, which has no handle', async function(assert) {
    this.set('result', { code: 'abc', organization: true, target_id: '1_1', name: 'Springfield Schools' });
    await render(hbs`<span id="out">{{display-name this.result}}</span>`);
    assert.strictEqual(this.element.querySelector('#out').textContent.trim(), 'Springfield Schools',
      'an org name survives — it must not be blanked by the handle fallback');
  });
});
