import Component from '@ember/component';
import $ from 'jquery';


export default Component.extend({
  triggerGridEvent: function() {
    var args = Array.prototype.slice.call(arguments);
    var gridEvent = this.get('gridEvent') || this.get('grid_event');
    if (gridEvent && typeof gridEvent === 'function') {
      gridEvent.apply(null, args);
    } else {
      var actionName = typeof gridEvent === 'string' ? gridEvent : 'grid_event';
      var target = this.get('targetObject');
      if (target && typeof target.send === 'function') {
        target.send.apply(target, [actionName].concat(args));
      }
    }
  },
  touchStart: function (event) {
    this.select(event);
  },
  touchMove: function (event) {
    this.select(event);
  },
  mouseDown: function (event) {
    this.select(event);
  },
  select: function (event) {
    var $cell = $(event.target).closest('div.cell');
    if ($cell.length) {
      event.preventDefault();
      this.triggerGridEvent('setGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
    }
  },
  didInsertElement: function () {
    var _this = this;
    this.set('handler', function (e) {
      _this.handleMouseMove(e);
    })
    this.element.addEventListener('mousemove', this.get('handler'));
  },
  willDestroyElement: function () {
    this.element.removeEventListener('mousemove', this.get('handler'));
  },
  handleMouseMove: function (event) {
    var $cell = $(event.target).closest('div.cell');
    if($cell.length) {
      this.triggerGridEvent('hoverGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
    } else {
      this.triggerGridEvent('hoverOffGrid');
    }
  }
});