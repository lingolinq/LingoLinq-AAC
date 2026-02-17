import Component from '@ember/component';
import $ from 'jquery';


export default Component.extend({
  touchStart: function(event) {
    this.select(event);
  },
  touchMove: function(event) {
    this.select(event);
  },
  mouseDown: function(event) {
    this.select(event);
  },
  select: function(event) {
    var $cell = $(event.target).closest('div.cell');
    if($cell.length) {
      event.preventDefault();
      var gridEvent = this.get('gridEvent') || this.get('grid_event');
      if (gridEvent && typeof gridEvent === 'function') {
        gridEvent('setGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
      } else if (gridEvent && typeof gridEvent === 'string') {
        this.sendAction(gridEvent, 'setGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
      } else {
        this.sendAction('grid_event', 'setGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
      }
    }
  },
  didInsertElement: function() {
    var _this = this;
    this.set('handler', function(e) {
      _this.handleMouseMove(e);
    })
    this.element.addEventListener('mousemove', this.get('handler'));
  }, 
  willDestroyElement: function() {
    this.element.removeEventListener('mousemove', this.get('handler'));
  },
  handleMouseMove: function(event) {
    var $cell = $(event.target).closest('div.cell');
    var gridEvent = this.get('gridEvent') || this.get('grid_event');
    if (gridEvent && typeof gridEvent === 'function') {
      if($cell.length) {
        gridEvent('hoverGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
      } else {
        gridEvent('hoverOffGrid');
      }
    } else if (gridEvent && typeof gridEvent === 'string') {
      if($cell.length) {
        this.sendAction(gridEvent, 'hoverGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
      } else {
        this.sendAction(gridEvent, 'hoverOffGrid');
      }
    } else {
      if($cell.length) {
        this.sendAction('grid_event', 'hoverGrid', parseInt($cell.attr('data-row'), 10), parseInt($cell.attr('data-col'), 10));
      } else {
        this.sendAction('grid_event', 'hoverOffGrid');
      }
    }
  }
});
