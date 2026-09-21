import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Guards `.speak-bar__button-list-wrap { position: relative }` in app/styles/app.scss.
 *
 * The board-intro button (`[role="button"].extra-btn`, templates/application.hbs) is
 * position:absolute and renders as a SIBLING of #button_list rather than inside it: it
 * was moved out so a role="button" would stop being nested inside an <a href>
 * (no-nested-interactive). Its containing block is therefore the wrap. If the wrap is
 * static, the nearest positioned ancestor is the FIXED header, and the button renders
 * beside the account avatar instead of in the sentence bar -- measured +776px left and
 * +17.5px top on dev.
 *
 * No other CI gate can see that. ember-template-lint, the eslint gate, `ember build`
 * and the acceptance suite were ALL green on the broken version, because none of them
 * resolves a CSS containing block. This test is the only thing standing between that
 * declaration and a future deletion.
 *
 * Deliberately asserts against a bare `.speak-bar__button-list-wrap` with no ancestor
 * context, because the rule is deliberately unprefixed (see its comment in app.scss).
 * Rebuilding an `#inner_header > #speak` ancestry here would let a re-scoped regression
 * pass, which is the specific mistake this is here to catch.
 */
QUnit.module('Integration | speak bar | board-intro anchor', function (hooks) {
  setupRenderingTest(hooks);

  QUnit.test('the button-list wrap establishes a containing block', async function (assert) {
    await render(hbs`<div class="speak-bar__button-list-wrap"></div>`);

    let wrap = document.querySelector('.speak-bar__button-list-wrap');
    assert.ok(wrap, 'the wrap rendered');
    assert.strictEqual(
      getComputedStyle(wrap).position,
      'relative',
      '.speak-bar__button-list-wrap must be position:relative so the absolutely-positioned board-intro button anchors to the sentence bar and not to the fixed header'
    );
  });

  QUnit.test('an absolutely positioned child resolves to the wrap, not an outer ancestor', async function (assert) {
    await render(
      hbs`<div class="speak-bar__button-list-wrap"><div class="board-intro-probe" style="position: absolute; top: 3px;"></div></div>`
    );

    let wrap = document.querySelector('.speak-bar__button-list-wrap');
    let probe = document.querySelector('.board-intro-probe');
    assert.strictEqual(
      probe.offsetParent,
      wrap,
      'offsetParent must be the wrap; if it resolves to an outer element the board-intro button escapes the sentence bar'
    );
  });
});
