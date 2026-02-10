import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

/**
 * Word Cloud modal (component-based).
 * Opens from the stats page "word cloud" link to show word frequency cloud(s).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  zoom: 1.0,
  word_cloud_id: null,

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'word-cloud';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    {};
    this.set('model', {
      stats: options.stats,
      stats2: options.stats2,
      user: options.user
    });
    this.render_cloud();
  },

  stretch_ratio: computed('model.stats2', function() {
    return this.get('model.stats2') ? 2.0 : null;
  }),

  render_cloud: function() {
    this.set('word_cloud_id', Math.random());
  },

  actions: {
    opening: function() {
      this.render_cloud();
    },
    closing: function() {},
    close() {
      this.get('modal').close();
    },
    refresh: function() {
      this.render_cloud();
    },
    zoom: function(direction) {
      if (direction === 'in') {
        this.set('zoom', Math.round(this.get('zoom') * 1.2 * 10.0) / 10.0);
      } else {
        this.set('zoom', Math.round(this.get('zoom') / 1.2 * 10.0) / 10.0);
      }
      this.render_cloud();
    }
  }
});
