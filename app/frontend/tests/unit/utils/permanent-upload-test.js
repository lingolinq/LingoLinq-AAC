import { module, test } from 'qunit';
import { is_permanent_upload_url } from 'frontend/utils/permanent_upload';

/* Which addresses are LingoLinq uploads that never change (#1221, PR #1268).
 * An upload is stored at images|sounds/<id digits>/<global_id>-<sha512 hex> plus a suffix
 * (app/models/concerns/uploadable.rb:58-80); transcoding writes a new key with v<unix time>
 * (app/models/concerns/media_object.rb:87). Production serves it from a CDN, other environments from the bucket
 * (lib/uploader.rb fronted_url), so the host does not matter. Button-set and extra-data files share the host and
 * do change.
 */
module('Unit | Utility | permanent upload', function() {
  var SHA = new Array(129).join('0').replace(/0/g, 'f');

  test('matches uploaded pictures and sounds on any host', function(assert) {
    assert.true(is_permanent_upload_url('https://cdn.example.net/images/1/2/3/1_123-' + SHA + '.png'));
    assert.true(is_permanent_upload_url('https://lingolinq-dev-uploads.s3.amazonaws.com/images/9/1_9-' + SHA + '.svg'));
    assert.true(is_permanent_upload_url('https://s3.amazonaws.com/lingolinq-prod-uploads/sounds/4/5/1_45-' + SHA + '.mp3'));
    assert.true(is_permanent_upload_url('https://cdn.example.net/sounds/4/5/1_45-' + SHA + 'v1699999999.mp3'), 'transcoded');
    assert.true(is_permanent_upload_url('https://cdn.example.net/images/1/2/1_12-' + SHA + '.png.raster.png'), 'raster copy');
  });

  test('does not match files that change or are not uploads', function(assert) {
    assert.false(is_permanent_upload_url('https://cdn.example.net/extras-cache06123/button_set_cache/1_8006/' + SHA + '.json'), 'button set');
    assert.false(is_permanent_upload_url('https://cdn.example.net/extras0/LogSession/1_5/abc/' + SHA + '.json'), 'extra data');
    assert.false(is_permanent_upload_url('https://cdn.example.net/videos/1/1_1-' + SHA + '.mp4'), 'videos are not pictures or sounds');
    assert.false(is_permanent_upload_url('https://app.example.org/api/v1/users/1_1/protected_image/x/images/1/1_1-' + SHA + '.png?user_token=abc'), 'protected image');
    assert.false(is_permanent_upload_url('https://cdn.example.net/images/1/1_1-' + SHA.substring(1) + '.png'), 'digest too short');
    assert.false(is_permanent_upload_url('https://example.com/pictures/cat.png'));
    assert.false(is_permanent_upload_url('https://evil.example/a?u=/images/1/1_1-' + SHA + '.png'), 'shape only in the query');
    assert.false(is_permanent_upload_url('https://evil.example/a#/images/1/1_1-' + SHA + '.png'), 'shape only in the fragment');
    assert.false(is_permanent_upload_url('https://cdn.example.net/x/y/images/1/1_1-' + SHA + '.png'), 'key not at the path root');
    assert.false(is_permanent_upload_url('/images/1/1_1-' + SHA + '.png'), 'relative');
    assert.false(is_permanent_upload_url(null));
    assert.false(is_permanent_upload_url('data:image/png;base64,iVBORw0KGgo='));
  });
});
