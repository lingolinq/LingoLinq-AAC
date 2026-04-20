import Component from '@ember/component';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  canvas_style: computed('short', 'tiny', function() {
    var res = 'width: 100%; height: 400px;';
    if(this.get('short')) { res = "width: 100%; height: 300px;"; }
    if(this.get('tiny')) { res = "width: 100%; height: 150px;"; }
    return htmlSafe(res);
  }),
  canvas_height: computed('short', function() {
    if(this.get('short')) {
      return (768 * 2 / 3);
    } else if(this.get('tiny')) {
      return 768 / 2;
    } else {
      return 768;
    }
  }),
  draw: observer('stats', 'ref_stats', 'zoom', 'word_cloud_id', 'shape', 'color', 'gridSize', 'shuffle', 'allowDuplicates', function() {
    var elem = this.get('element').getElementsByClassName('word_cloud')[0];
    if(elem) {
      var list = [];
      var max = 1;
      var _this = this;
      var list1 = (this.get('stats.modeling') ? this.get('stats.modeled_words_by_frequency') : this.get('stats.words_by_frequency')) || [];
      var allowDuplicates = _this.get('allowDuplicates');
      list1.forEach(function(obj) {
        if(!obj.text.match(/^[\+:]/)) {
          max = Math.max(max, obj.count);
          if (allowDuplicates && obj.count > 1) {
            var copies = Math.min(Math.ceil(obj.count / 3), 5);
            for (var i = 0; i < copies; i++) {
              list.push([obj.text, obj.count / (i + 1)]);
            }
          } else {
            list.push([obj.text, obj.count]);
          }
        }
      });
      if(this.get('ref_stats')) {
        var list2 = (this.get('ref_stats.modeling') ? this.get('ref_stats.modeled_words_by_frequency') : this.get('ref_stats.words_by_frequency')) || [];
        list2.forEach(function(obj) {
          if(!obj.text.match(/^[\+:]/)) {
            max = Math.max(max, obj.count);
          }
        });
      }
      var opts = {
        list: list,
        gridSize: _this.get('gridSize') || 16,
        weightFactor: function (size) {
          var res = ((size / max) * 245 * (_this.get('zoom') || 1)) + 5;
          return res;
        }
      };
      var shape = _this.get('shape');
      if (shape) { opts.shape = shape; }
      var color = _this.get('color');
      if (color) { opts.color = color; }
      var shuffle = _this.get('shuffle');
      if (shuffle !== undefined) { opts.shuffle = shuffle; }
      window.WordCloud(elem, opts);
    }
  })
});
