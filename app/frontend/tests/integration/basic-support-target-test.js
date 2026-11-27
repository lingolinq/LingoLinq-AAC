import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * Guards the Basic board header Support control. The 36px rule is nested in
 * `#within_ember.board-alt-view` (app/styles/app.scss), so the compiled selector is
 * `#within_ember.board-alt-view #inner_header:has(#nav_header) .ll-bento-help-btn`.
 *
 * The painted circle is width/height 36px. A ::after with inset -4px on that
 * same element is the 44px hit target, and 4px of horizontal margin keeps the
 * ring off the settings gear (the next flex sibling in #identity).
 * offsetWidth/offsetHeight are layout pixels and ignore the #ember-testing
 * transform; elementFromPoint uses viewport pixels, so the 2px step is scaled
 * by the same transform.
 *
 * testem.js launches Chrome at 1440x900, so the <=1024px padding rule never
 * applies in the main document. The narrow-frame test copies those styles into
 * a 390px iframe, where that media query does apply.
 *
 * A .ll-bento-help-btn under board-alt with no #nav_header must not take the
 * slop. That is the speak-mode Home link's shape. The app-navbar fixture is a
 * separate guard: that link is not inside .board-alt-view.
 */
QUnit.module('Integration | Basic Support tap target', function (hooks) {
  setupRenderingTest(hooks);

  let narrowFrame = null;

  hooks.afterEach(function () {
    if (narrowFrame) {
      narrowFrame.remove();
      narrowFrame = null;
    }
  });

  function pointOutside(el, cssPx) {
    let rect = el.getBoundingClientRect();
    let scaleX = rect.width / el.offsetWidth;
    return {
      x: rect.right + (cssPx * scaleX),
      y: rect.top + (rect.height / 2)
    };
  }

  function pointInsideFromLeft(el, cssPx) {
    let rect = el.getBoundingClientRect();
    let scaleX = rect.width / el.offsetWidth;
    return {
      x: rect.left + (cssPx * scaleX),
      y: rect.top + (rect.height / 2)
    };
  }

  function gapCss(leftEl, rightEl) {
    let left = leftEl.getBoundingClientRect();
    let right = rightEl.getBoundingClientRect();
    let scaleX = left.width / leftEl.offsetWidth;
    return (right.left - left.right) / scaleX;
  }

  QUnit.test('the Basic board Support link keeps a 36px circle and a 44px hit target', async function (assert) {
    await render(hbs`
      <div id="within_ember" class="board-alt-view" style="padding: 16px;">
        <div id="inner_header">
          <span id="nav_header"></span>
          <span id="identity">
            <a href="/support" class="ll-bento-help-btn ll-bento-help-btn--nav ll-bento-help-btn--nav-icon-only ll-bento-help-btn--support">
              <span class="ll-bento-help-btn__icon" aria-hidden="true">
                <svg class="ll-bento-help-btn__nav-icon ll-bento-help-btn__support-icon" width="20" height="20"></svg>
              </span>
            </a>
            <a href="/settings" class="ll-header-settings-btn">Settings</a>
          </span>
        </div>
      </div>
    `);

    let doc = document;
    let link = doc.querySelector('#inner_header .ll-bento-help-btn--support');
    let gear = doc.querySelector('.ll-header-settings-btn');
    let point = pointOutside(link, 2);
    let farther = pointOutside(link, 20);
    let onGear = pointInsideFromLeft(gear, 2);
    let slop = getComputedStyle(link, '::after');
    assert.strictEqual(link.offsetWidth, 36, 'the painted border box stays 36px wide');
    assert.strictEqual(link.offsetHeight, 36, 'the painted border box stays 36px tall');
    assert.ok(gapCss(link, gear) >= 4, 'at least 4px between the circle and the settings gear');
    assert.strictEqual(
      doc.elementFromPoint(point.x, point.y),
      link,
      'a point 2px outside the circle hits the link (44px target)'
    );
    assert.strictEqual(
      doc.elementFromPoint(onGear.x, onGear.y),
      gear,
      'a point 2px inside the settings gear is the gear, not the Support ring'
    );
    assert.strictEqual(slop.width, '44px', 'the hit slop is 44px wide');
    assert.strictEqual(slop.height, '44px', 'the hit slop is 44px tall');
    assert.notStrictEqual(
      doc.elementFromPoint(farther.x, farther.y),
      link,
      'a point 20px outside misses, so the slop is the 4px ring and not a larger box'
    );
  });

  QUnit.test('at 390px the <=1024px padding rule does not eat the hit ring', async function (assert) {
    narrowFrame = document.createElement('iframe');
    narrowFrame.setAttribute('title', '390px support target');
    narrowFrame.style.cssText = 'width:390px;height:220px;border:0;position:absolute;left:0;top:0;';
    document.getElementById('ember-testing').appendChild(narrowFrame);
    let doc = narrowFrame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head></head><body></body></html>');
    doc.close();
    let copied = 0;
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      let style = doc.createElement('style');
      try {
        style.textContent = Array.prototype.map.call(sheet.cssRules, function (rule) {
          return rule.cssText;
        }).join('\n');
      } catch (e) {
        return;
      }
      doc.head.appendChild(style);
      copied = copied + 1;
    });
    assert.ok(copied > 0, 'the app styles were copied into the 390px frame');
    assert.true(
      doc.defaultView.matchMedia('(max-width: 1024px)').matches,
      'the frame is inside the 1024px breakpoint'
    );
    doc.body.innerHTML = [
      '<div id="within_ember" class="board-alt-view" style="padding:16px;">',
      '<div id="inner_header"><span id="nav_header"></span><span id="identity">',
      '<a href="/support" class="ll-bento-help-btn ll-bento-help-btn--nav ll-bento-help-btn--nav-icon-only ll-bento-help-btn--support">',
      '<span class="ll-bento-help-btn__icon" aria-hidden="true">',
      '<svg class="ll-bento-help-btn__support-icon" width="20" height="20"></svg>',
      '</span></a>',
      '<a href="/settings" class="ll-header-settings-btn">Settings</a>',
      '</span></div></div>'
    ].join('');
    let link = doc.querySelector('.ll-bento-help-btn--support');
    let gear = doc.querySelector('.ll-header-settings-btn');
    let slop = doc.defaultView.getComputedStyle(link, '::after');
    let pad = doc.defaultView.getComputedStyle(link);
    let onGear = pointInsideFromLeft(gear, 2);
    assert.strictEqual(link.offsetWidth, 36, 'the painted border box stays 36px at 390px');
    assert.strictEqual(link.offsetHeight, 36, 'the painted border box stays 36px tall at 390px');
    assert.strictEqual(pad.paddingTop, '0px', 'the 1024px padding rule does not inset the circle');
    assert.strictEqual(pad.paddingRight, '0px', 'the 1024px padding rule does not inset the circle');
    assert.strictEqual(slop.width, '44px', 'the hit slop stays 44px at 390px');
    assert.ok(gapCss(link, gear) >= 4, 'the ring still clears the settings gear at 390px');
    assert.strictEqual(
      doc.elementFromPoint(onGear.x, onGear.y),
      gear,
      'a point 2px inside the settings gear is the gear at 390px'
    );
  });

  QUnit.test('a board-alt help link with no #nav_header does not take the hit slop', async function (assert) {
    await render(hbs`
      <div id="within_ember" class="board-alt-view" style="padding: 16px;">
        <div id="inner_header">
          <a href="/home" class="ll-bento-help-btn ll-bento-help-btn--nav">Home</a>
        </div>
      </div>
    `);

    let link = document.querySelector('#within_ember.board-alt-view .ll-bento-help-btn');
    assert.strictEqual(document.querySelector('#nav_header'), null, 'this fixture has no #nav_header');
    assert.strictEqual(getComputedStyle(link, '::after').content, 'none', 'no hit-slop pseudo-element');
  });

  QUnit.test('the app-navbar Support link does not take the board hit target', async function (assert) {
    await render(hbs`
      <div id="inner_header" style="padding: 16px;">
        <nav class="app-navbar">
          <a href="/support" class="ll-bento-help-btn ll-bento-help-btn--nav ll-bento-help-btn--nav-icon-only ll-bento-help-btn--support">
            <span class="ll-bento-help-btn__icon" aria-hidden="true">
              <svg class="ll-bento-help-btn__nav-icon ll-bento-help-btn__support-icon" width="20" height="20"></svg>
            </span>
          </a>
        </nav>
      </div>
    `);

    let link = document.querySelector('.app-navbar .ll-bento-help-btn--support');
    let point = pointOutside(link, 2);
    assert.strictEqual(document.querySelector('#nav_header'), null, 'this fixture has no #nav_header');
    assert.strictEqual(document.querySelector('#within_ember'), null, 'this fixture is not the board-alt header');
    assert.strictEqual(getComputedStyle(link, '::after').content, 'none', 'no hit-slop pseudo-element');
    assert.notStrictEqual(
      link.offsetWidth + 'x' + link.offsetHeight,
      '36x36',
      'the app-navbar Support button does not take the 36px board square'
    );
    assert.notStrictEqual(
      document.elementFromPoint(point.x, point.y),
      link,
      'a point 2px outside the app-navbar Support button misses it'
    );
  });
});
