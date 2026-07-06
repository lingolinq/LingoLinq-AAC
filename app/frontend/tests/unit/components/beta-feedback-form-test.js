import { module, test } from 'qunit';
import { uploadTargetUrl } from 'frontend/components/beta-feedback-form';
import Service from '@ember/service';
import { setupTest } from 'ember-qunit';

module('Unit | Component | beta feedback form', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:app-state', Service.extend({
      sessionUser: null
    }));
    this.owner.register('service:persistence', Service.extend({}));
    this.owner.register('service:router', Service.extend({}));
  });

  test('reaction maps to existing severity values', function(assert) {
    var component = this.owner.factoryFor('component:beta-feedback-form').create();

    assert.equal(component._severityForReaction('great'), 'suggestion');
    assert.equal(component._severityForReaction('okay'), 'minor');
    assert.equal(component._severityForReaction('frustrating'), 'major');
  });

  test('subject is generated from the simplified feedback prompt', function(assert) {
    var component = this.owner.factoryFor('component:beta-feedback-form').create();

    assert.equal(component._subjectFromFeedback('  This worked well  '), 'This worked well');
    assert.ok(component._subjectFromFeedback('x'.repeat(120)).length <= 90);
  });

  test('screen capture options prefer the current browser tab', function(assert) {
    var component = this.owner.factoryFor('component:beta-feedback-form').create();
    var options = component._screenCaptureOptions();

    assert.equal(options.preferCurrentTab, true);
    assert.equal(options.audio.suppressLocalAudioPlayback, false);
    assert.equal(options.systemAudio, 'include');
    assert.equal(options.windowAudio, 'system');
    assert.equal(options.selfBrowserSurface, 'include');
    assert.equal(options.surfaceSwitching, 'include');
    assert.equal(options.video.displaySurface, 'browser');
  });

  test('recording upload posts to post_url, falling back to legacy upload_url', function(assert) {
    assert.equal(uploadTargetUrl({
      post_url: 'https://bucket.s3.us-west-2.amazonaws.com/',
      upload_url: 'https://bucket.s3.amazonaws.com/'
    }), 'https://bucket.s3.us-west-2.amazonaws.com/');
    assert.equal(uploadTargetUrl({
      upload_url: 'https://bucket.s3.amazonaws.com/'
    }), 'https://bucket.s3.amazonaws.com/');
  });

  test('recording upload strips codec parameters from content type', function(assert) {
    var component = this.owner.factoryFor('component:beta-feedback-form').create();
    component.set('recordingMimeType', 'video/webm;codecs=vp9');

    assert.equal(component._recordingUploadContentType(), 'video/webm');
  });

});
