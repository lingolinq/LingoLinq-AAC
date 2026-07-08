import { htmlSafe } from '@ember/template';
import { get } from '@ember/object';

export function bg_class(model) {
  var pos = (get(model, 'background.position') || '').split(',');
  var fit = 'stretch';
  if(pos[0] == 'center') {
    fit = 'contain';
  }
  return htmlSafe(fit);
}

export function bg_style(model) {
  var rows = get(model, 'grid.rows');
  var cols = get(model, 'grid.columns');
  var pos = (get(model, 'background.position') || '').split(',');
  var xmin = Math.max(parseInt(pos[1], 10) || 0, 0);
  var xmax = Math.min(parseInt(pos[3], 10) || cols - 1, cols - 1) + 1;
  var ymin = Math.max(parseInt(pos[2], 10) || 0, 0);
  var ymax = Math.min(parseInt(pos[4], 10) || rows - 1, rows - 1) + 1;

  var width = 100 * (xmax - xmin) / cols;
  var height = 100 * (ymax - ymin) / rows;
  var left = 100 * xmin / cols;
  var top = 100 * ymin / rows;

  // Eval boards: the answer-button grid starts a few px above the region's exact
  // percentage bottom (button grid padding), so a full-percentage region overhangs
  // the top button row by ~8px. Trim a small fixed inset off the height for eval
  // so the region clears the buttons. Fixed px, so it works whatever the region's
  // percentage is (33/50/66%) and however many button rows there are.
  var height_css = height + '%';
  if(/^obf\/eval/.test(get(model, 'key') || '')) {
    height_css = 'calc(' + height + '% - 14px)';
  }
  var str = 'position: absolute; top: ' + top + '%; left: ' + left + '%; width: ' + width + '%; height: ' + height_css + '; overflow: hidden;';
  if(get(model, 'background.color') && window.tinycolor) {
    var clr = window.tinycolor(get(model, 'background.color'));
    if(clr && clr.toRgbString()) {
      str = str + ' background: ' + clr.toRgbString();
    }
  }
  return htmlSafe(str);
}

export function bg_img_style(model) {
  var pos = (get(model, 'background.position') || '').split(',');
  var fit = 'fill';
  if(pos[0] == 'center') {
    fit = 'contain';
  } else if(pos[0] == 'cover') {
    fit = 'cover';
  }
  return htmlSafe('object-fit: ' + fit + '; object-position: center;');
}
