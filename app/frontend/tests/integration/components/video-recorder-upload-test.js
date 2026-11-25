import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { module, test } from 'qunit';
import EmberObject from '@ember/object';

/*
 * THE VIDEO UPLOAD BUTTON OPENS THE FILE PICKER (2026-11-24, #1242 staging test).
 *
 * The upload button has no click handler: a transparent <input type="file"> inside the
 * same .file_select_holder span is laid over it (app.scss `.file_select_holder input`) and
 * takes the click. In the video recorder the buttons sit in `.video_buttons`, whose `.btn`
 * rule is `width: 100%`, so the upload button cannot share a line with "Record Video" and
 * wraps. The span is inline, so it splits across the two lines and the absolutely
 * positioned input is sized from its first, empty fragment: zero pixels wide, beside the
 * button. A click then lands on the bare button, which sits inside the note modal's
 * <form class="md-modal-form"> and has no type, so the browser submits the form and the
 * page reloads (`/<user>/account?video_upload=` in the staging logs).
 *
 * Asserted on geometry rather than with a synthetic click: `click()` dispatches on the
 * element it is given, so it cannot tell which element a real pointer would hit.
 */
module('Integration | Component | video-recorder upload button', function(hooks) {
  setupRenderingTest(hooks);

  test('the file input covers the upload button inside the note form', async function(assert) {
    // utils/content_grabbers is a Proxy over `window.cg`, which the service module sets;
    // the recorder calls videoGrabber.setup on insert, so the service must exist first
    // (same as tests/integration/gif-search-runs-test.js).
    this.owner.lookup('service:content-grabbers');
    this.set('user', EmberObject.create({ currently_premium: true }));
    await render(hbs`
      <form class="md-modal-form" style="width: 560px;">
        <VideoRecorder @user={{this.user}} />
      </form>
    `);

    var input = document.getElementById('video_upload');
    assert.ok(input, 'the video file input is rendered');
    var button = input.parentElement.querySelector('button');
    assert.ok(button, 'the upload button is rendered beside it');

    var b = button.getBoundingClientRect();
    var i = input.getBoundingClientRect();
    assert.ok(b.width > 0, 'the upload button has a width');
    assert.ok(b.height > 0, 'the upload button has a height');
    var covers = i.left <= b.left + 1 && i.right >= b.right - 1 && i.top <= b.top + 1 && i.bottom >= b.bottom - 1;
    assert.ok(covers, 'the file input covers the whole upload button (button ' +
      [b.left, b.top, b.width, b.height].map(Math.round).join(',') + ', input ' +
      [i.left, i.top, i.width, i.height].map(Math.round).join(',') + ')');
  });
});
