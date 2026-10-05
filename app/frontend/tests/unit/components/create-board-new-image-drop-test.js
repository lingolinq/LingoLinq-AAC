import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import contentGrabbers from 'frontend/utils/content_grabbers';
import modal from 'frontend/utils/modal';

/* A DROPPED IMAGE ON A CREATE-BOARD PREVIEW BUTTON SHOWS A SPINNER WHILE IT UPLOADS (2026-10-02,
 * requested: "make sure the image drag drop works on board buttons on the create-board-new page",
 * the board pages' drop having a spinner and a failure message since 75d0176a5). The cell of the
 * label being uploaded carries `uploading` until the upload settles; a failure clears it and says so.
 */
module('Unit | Component | create-board-new image drop', function(hooks) {
  setupTest(hooks);

  function setup(context) {
    var stubs = { read_file: contentGrabbers.read_file, size_image: contentGrabbers.pictureGrabber.size_image, save: contentGrabbers.pictureGrabber.save_image_preview, error: modal.error };
    var upload = RSVP.defer();
    var errors = [];
    contentGrabbers.read_file = function() { return RSVP.resolve({ target: { result: 'data:image/png;base64,AAAA' } }); };
    contentGrabbers.pictureGrabber.size_image = function(url) { return RSVP.resolve({ url: url }); };
    contentGrabbers.pictureGrabber.save_image_preview = function() { return upload.promise; };
    modal.error = function(msg) { errors.push(msg); };
    var component = context.owner.factoryFor('component:create-board-new').create();
    // init builds its own board record (create-board-new.js:68); give it a two-button grid.
    component.set('model.grid', { rows: 1, columns: 2, labels: 'apple\nball' });
    var restore = function() {
      contentGrabbers.read_file = stubs.read_file;
      contentGrabbers.pictureGrabber.size_image = stubs.size_image;
      contentGrabbers.pictureGrabber.save_image_preview = stubs.save;
      modal.error = stubs.error;
      component.destroy();
    };
    var cell = function(label) { return component.get('preview_grid')[0].find(function(c) { return c.label === label; }); };
    return { component: component, upload: upload, errors: errors, restore: restore, cell: cell };
  }

  var drop = { files: [{ type: 'image/png' }] };

  test('the dropped-on button shows the spinner until the image is in place', async function(assert) {
    assert.expect(4);
    var s = setup(this);
    try {
      var done = s.component._applyDroppedImageToLabel('apple', drop);
      await new RSVP.Promise(function(r) { setTimeout(r, 10); });
      assert.true(s.cell('apple').uploading, 'spinner on the dropped-on button');
      assert.false(!!s.cell('ball').uploading, 'not on the others');
      s.upload.resolve(EmberObject.create({ url: 'https://example.com/apple.png' }));
      await done;
      await new RSVP.Promise(function(r) { setTimeout(r, 10); });
      assert.false(!!s.cell('apple').uploading, 'cleared when the image is in place');
      assert.strictEqual(s.cell('apple').image_url, 'https://example.com/apple.png', 'the tile shows the upload');
    } finally {
      s.restore();
    }
  });

  test('a failed upload clears the spinner and says so', async function(assert) {
    assert.expect(2);
    var s = setup(this);
    try {
      var done = s.component._applyDroppedImageToLabel('apple', drop);
      await new RSVP.Promise(function(r) { setTimeout(r, 10); });
      s.upload.reject(new Error('network'));
      await done.catch(function() {});
      await new RSVP.Promise(function(r) { setTimeout(r, 10); });
      assert.false(!!s.cell('apple').uploading, 'spinner cleared');
      assert.deepEqual(s.errors, ['Upload failed'], 'the failure is reported');
    } finally {
      s.restore();
    }
  });
});
