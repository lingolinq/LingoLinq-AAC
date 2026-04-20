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
  shape: 'circle',
  color: 'random-dark',
  gridSize: 16,
  shuffle: true,
  allowDuplicates: false,

  shapeOptions: [
    { value: 'circle', labelKey: 'word_cloud_shape_circle', label: 'Circle' },
    { value: 'cardioid', labelKey: 'word_cloud_shape_cardioid', label: 'Heart' },
    { value: 'diamond', labelKey: 'word_cloud_shape_diamond', label: 'Diamond' },
    { value: 'square', labelKey: 'word_cloud_shape_square', label: 'Square' },
    { value: 'triangle-forward', labelKey: 'word_cloud_shape_triangle_forward', label: 'Triangle (forward)' },
    { value: 'triangle', labelKey: 'word_cloud_shape_triangle', label: 'Triangle' },
    { value: 'pentagon', labelKey: 'word_cloud_shape_pentagon', label: 'Pentagon' },
    { value: 'star', labelKey: 'word_cloud_shape_star', label: 'Star' }
  ],

  colorOptions: [
    { value: 'random-dark', labelKey: 'word_cloud_color_dark', label: 'Dark (random)' },
    { value: 'random-light', labelKey: 'word_cloud_color_light', label: 'Light (random)' },
    { value: '#428bca', labelKey: 'word_cloud_color_blue', label: 'Blue' },
    { value: '#5cb85c', labelKey: 'word_cloud_color_green', label: 'Green' },
    { value: '#f0ad4e', labelKey: 'word_cloud_color_orange', label: 'Orange' }
  ],

  gridSizeOptions: [
    { value: 8, labelKey: 'word_cloud_spacing_compact', label: 'Compact' },
    { value: 16, labelKey: 'word_cloud_spacing_normal', label: 'Normal' },
    { value: 24, labelKey: 'word_cloud_spacing_spread', label: 'Spread' }
  ],

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
    },
    updateShape: function(value) {
      this.set('shape', value);
      this.render_cloud();
    },
    updateColor: function(value) {
      this.set('color', value);
      this.render_cloud();
    },
    updateGridSize: function(value) {
      this.set('gridSize', parseInt(value, 10));
      this.render_cloud();
    },
    toggleShuffle: function() {
      this.set('shuffle', !this.get('shuffle'));
      this.render_cloud();
    },
    toggleDuplicates: function() {
      this.set('allowDuplicates', !this.get('allowDuplicates'));
      this.render_cloud();
    }
  }
});
