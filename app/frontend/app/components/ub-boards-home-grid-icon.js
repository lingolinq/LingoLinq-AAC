import Component from '@ember/component';

export default Component.extend({
  tagName: 'svg',
  classNames: ['ub-boards-home-grid-icon'],
  attributeBindings: ['xmlns', 'viewBox', 'ariaHidden:aria-hidden', 'focusable'],
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 48 48',
  ariaHidden: 'true',
  focusable: 'false',
});
