import Component from '@ember/component';


export default Component.extend({
  
  actions: {
    support() {
      // Use closure action if provided, otherwise no-op (actions are handled in template)
      var action = this.get('support');
      if (action && typeof action === 'function') {
        action();
      }
    },
    language() {
      // Use closure action if provided, otherwise no-op (actions are handled in template)
      var action = this.get('language');
      if (action && typeof action === 'function') {
        action();
      }
    }
  }
});
