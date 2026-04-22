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

  var str = 'position: absolute; top: ' + top + '%; left: ' + left + '%; width: ' + width + '%; height: ' + height + '%; overflow: hidden;';
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
