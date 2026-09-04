import Component from '@ember/component';

export default Component.extend({
  tagName: '',

  init() {
    this._super(...arguments);
    var self = this;
    // Bind at render, same as parent copy-board: ctrlAction returns a click
    // handler. `(fn this.ctrlAction …)` would call the factory on click and
    // discard that handler, so Copy Just This Board would no-op.
    this.ctrlAction = function() {
      var parent = self.get('parent');
      if (parent && typeof parent.ctrlAction === 'function') {
        return parent.ctrlAction.apply(parent, arguments);
      }
      return function() {};
    };
  }
});
