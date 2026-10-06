import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* THE SAVED CATEGORY LAYOUT IS READ, NEVER SENT (2026-10-05).
 * `category_layout` is the board's default categorized arrangement (Board#process_params,
 * docs/task-management/2026-10-05_category-layout-on-board.md). A raw attr is re-sent on every
 * board save, so a session holding an older layout would overwrite a newer one; the client
 * therefore never sends it (the server carries it onto copies itself). The offline local copy is
 * different: persistence#convert_model_to_json stores the SERIALIZED board as the whole local
 * record, so the layout must stay in that copy or an offline save would erase it locally.
 */
module('Unit | Serializer | board category layout', function(hooks) {
  setupTest(hooks);

  var layout = { version: 1, rows: 1, columns: 2, order: [[1, 2]], cells: [[0, 0]], blocks: [{ category: 'people' }] };

  function serialized(context, value, options) {
    var store = context.owner.lookup('service:store');
    var record = store.createRecord('board', { key: 'example/test', category_layout: value });
    return store.serializerFor('board').serialize(record._createSnapshot(), options);
  }

  test('the network payload leaves the layout out', function(assert) {
    var json = serialized(this, layout, { includeId: true });
    assert.false('category_layout' in json, 'not sent');
  });

  test('the offline local copy keeps it as plain data', function(assert) {
    var json = serialized(this, layout, { includeId: true, localCopy: true });
    assert.deepEqual(json.category_layout, layout, 'kept for the local copy');
    assert.notStrictEqual(json.category_layout, layout, 'a copy, not the live object');
  });

  test('a board with no layout serializes as before', function(assert) {
    var json = serialized(this, undefined, { includeId: true, localCopy: true });
    assert.false('category_layout' in json, 'nothing invented');
  });
});
