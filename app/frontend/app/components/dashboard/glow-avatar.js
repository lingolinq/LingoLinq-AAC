import Component from '@ember/component';
import { observer } from '@ember/object';

// Hue (0-1) of the attention card's teal/mint background. Hues near this read
// as lower-contrast glows and get an opacity boost; warm hues far from it pop
// on their own and are eased back (see the hue-aware opacity below).
const CARD_HUE = 0.467;

// RGB (0-255) <-> HSL (h 0-1, s 0-1, l 0-1) so the extracted color can be
// normalized to a vivid, consistent glow regardless of the avatar's tone.
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if(max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if(max === r) { h = (g - b) / d + (g < b ? 6 : 0); }
    else if(max === g) { h = (b - r) / d + 2; }
    else { h = (r - g) / d + 4; }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  var r, g, b;
  if(s === 0) {
    r = g = b = l;
  } else {
    var hue2rgb = function(p, q, t) {
      if(t < 0) { t += 1; }
      if(t > 1) { t -= 1; }
      if(t < 1 / 6) { return p + (q - p) * 6 * t; }
      if(t < 1 / 2) { return q; }
      if(t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// A decorative avatar <img> that derives a soft glow color from the image
// itself, so each communicator's halo matches their own avatar's tone. The
// extracted color is exposed as the `--avatar-glow-rgb` custom property on the
// element; the consuming selector (e.g. .md-attention-item__avatar) builds the
// box-shadow from it and supplies a fallback color when extraction can't run
// (cross-origin tainting, decode failure, or no image).
export default Component.extend({
  tagName: 'img',
  attributeBindings: ['src', 'alt', 'ariaHidden:aria-hidden'],
  alt: '',
  ariaHidden: 'true',

  didInsertElement() {
    this._super(...arguments);
    this._applyGlow();
  },

  srcChanged: observer('src', function() {
    this._applyGlow();
  }),

  _applyGlow() {
    var element = this.element;
    var src = this.get('src');
    if(!element || !src) { return; }
    // Read pixels from a separate CORS-enabled image so the displayed <img>
    // is untouched and remote avatars served with CORS headers can be sampled.
    var loader = new Image();
    loader.crossOrigin = 'anonymous';
    loader.onload = function() {
      try {
        var size = 24;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(loader, 0, 0, size, size);
        var data = ctx.getImageData(0, 0, size, size).data;
        // Average only the avatar's actual colored pixels: skip transparent,
        // near-white, and near-black ones (background, page bleed, outlines)
        // and weight by saturation so the dominant hue leads. Default avatars
        // are a small colored icon on a large white disc, so without this the
        // average washes out to a pale tint that can't be seen as a glow.
        var r = 0, g = 0, b = 0, weightSum = 0;
        for(var i = 0; i < data.length; i += 4) {
          if(data[i + 3] < 128) { continue; }
          var pr = data[i], pg = data[i + 1], pb = data[i + 2];
          var max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
          if(min > 235 || max < 25) { continue; }
          var sat = max === 0 ? 0 : (max - min) / 255;
          if(sat < 0.12) { continue; }
          var w = sat * sat + 0.05;
          r += pr * w;
          g += pg * w;
          b += pb * w;
          weightSum += w;
        }
        if(weightSum <= 0) { return; }
        r = r / weightSum;
        g = g / weightSum;
        b = b / weightSum;
        // Normalize to a vivid, consistent glow: lift saturation and pin
        // lightness to a mid range so every hue (including greens/blues that
        // blend into the teal card) reads at the same strength as the warm ones.
        var hsl = rgbToHsl(r, g, b);
        var norm = hslToRgb(hsl[0], Math.min(1, hsl[1] * 1.5 + 0.2), Math.max(0.45, Math.min(0.58, hsl[2])));
        var rgb = norm[0] + ', ' + norm[1] + ', ' + norm[2];
        // Hue-aware opacity so every avatar reads with equal presence: the card
        // background is teal/mint, so warm hues (far from it) pop while cool hues
        // near it get muddled. Lift opacity for hues close to the card's teal and
        // ease it off for warm hues, converging on the same perceived glow.
        var dist = Math.abs(hsl[0] - CARD_HUE);
        if(dist > 0.5) { dist = 1 - dist; }
        var boost = 0.9 + (1 - dist / 0.5) * 0.45; // ~0.9 (warm) .. ~1.35 (teal-adjacent)
        var strong = (0.18 * boost).toFixed(3);
        var soft = (0.09 * boost).toFixed(3);
        element.style.setProperty('--avatar-glow-strong', 'rgba(' + rgb + ', ' + strong + ')');
        element.style.setProperty('--avatar-glow-soft', 'rgba(' + rgb + ', ' + soft + ')');
      } catch(e) {
        // Cross-origin taint or decode failure — keep the SCSS fallback glow.
      }
    };
    loader.src = src;
  }
});
