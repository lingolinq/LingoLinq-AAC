import Component from '@ember/component';

export default Component.extend({
  tagName: 'input',
  type: 'text',
  autocapitalize: 'off',
  autocorrect: 'off',
  attributeBindings: ['id', 'placeholder', 'value', 'autocapitalize', 'autocorrect', 'autocomplete'],
  change: function() {
    this.set('value', this.get('element').value);
  }
});
