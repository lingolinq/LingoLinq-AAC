import ApplicationSerializer from './application';

/*
 * `category_layout` is read, never sent (2026-10-05). A raw attr is re-sent on every board
 * save, so a session holding an older layout would overwrite a newer one; the server carries
 * the layout onto copies itself (Board#process_params, parent_board_id) and changes it only
 * through its own paths. The OFFLINE local copy is the exception: persistence's
 * convert_model_to_json stores the serialized board as the whole local record, so `serialize`
 * puts a plain copy back for that (`options.localCopy`), the same pattern as `supervisees` in
 * serializers/user.js. Checked by tests/unit/serializers/board-category-layout-test.js.
 */
export default ApplicationSerializer.extend({
  attrs: {
    category_layout: { serialize: false },
  },
  serialize(snapshot, options) {
    var json = this._super(snapshot, options);
    if (!json || typeof json !== 'object' || !snapshot) {
      return json;
    }
    if (options && options.localCopy && snapshot.record && typeof snapshot.record.get === 'function') {
      var layout = snapshot.record.get('category_layout');
      if (layout && typeof layout === 'object') {
        json.category_layout = JSON.parse(JSON.stringify(layout));
      }
    }
    return json;
  },
});
