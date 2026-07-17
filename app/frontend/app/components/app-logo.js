import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';

export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  app_state: alias('appState'),

  logoUrl: computed('app_state.domain_settings.logo_url', function() {
    return this.get('app_state.domain_settings.logo_url');
  }),

  resolvedSize: computed('size', function() {
    var sizeMap = {
      'xs': '20px',
      'sm': '50px',
      'md': '100px'
    };
    var size = this.get('size') || 'md';
    if (size === 'auto') { return null; }
    return sizeMap[size] || size;
  }),

  imgStyle: computed('resolvedSize', function() {
    var size = this.get('resolvedSize');
    if (!size) { return htmlSafe(''); }
    return htmlSafe('width: ' + size + ';');
  }),

  resolvedImgAlt: computed('imgAlt', function() {
    return this.get('imgAlt') || 'Logo';
  }),

  isShowImage: computed('showImage', function() {
    return this.get('showImage') !== false;
  }),

  isShowName: computed('showName', function() {
    return !!this.get('showName');
  }),

  isBrandedName: computed('nameStyle', function() {
    return this.get('nameStyle') === 'branded';
  }),

  hasLinkRoute: computed('linkRoute', function() {
    return !!this.get('linkRoute');
  })
});
