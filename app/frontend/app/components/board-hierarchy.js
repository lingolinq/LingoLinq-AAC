import Component from '@ember/component';

export default Component.extend({
  actions: {
    toggle_board_hierarchy: function(board_id, state) {
      this.get('hierarchy').toggle(board_id, state);
    },
    select_all: function(state) {
      // Honor the passed state so the same action drives both Select All
      // (no arg / true) and Deselect All (false). Existing callers pass no
      // argument, so they keep selecting everything.
      this.get('hierarchy').set_downstream(null, 'selected', state !== false);
    },
  }
});
