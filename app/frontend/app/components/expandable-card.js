import Component from '@ember/component';

export default Component.extend({
  classNames: ['la-feature-card'],
  classNameBindings: ['expanded:la-feature-card--expanded'],
  expanded: false,

  actions: {
    toggleExpand: function() {
      this.set('expanded', !this.get('expanded'));
    }
  }
});
