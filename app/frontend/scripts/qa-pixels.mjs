/**
 * Read ACTUAL RENDERED PIXELS out of a Puppeteer screenshot, with no image dependency.
 *
 * WHY THIS EXISTS. Contrast on this product is a requirement, not a preference, so it has to be
 * computed rather than eyeballed -- and computing it from `getComputedStyle` is a trap. That
 * only exposes `backgroundColor`; it cannot see `background-image`, which is what nearly every
 * surface here is actually painted with. A composite walked up the DOM reading background
 * COLOURS reported the attention card's status badges at ~5.6:1 when the truth is far lower,
 * because every gradient layer in the stack was silently treated as transparent (2026-09-24).
 * A screenshot has already had the gradients, the alphas, the backdrop-filters and the blend
 * modes resolved by the renderer, so a pixel out of it is the only honest answer.
 *
 * NO NEW PACKAGE. A Puppeteer PNG is zlib-deflated scanlines, and `zlib` is in Node's standard
 * library; the only real work is undoing the five PNG row filters. `sharp`/`pngjs` would each
 * be a shared-dependency decision, and this is forty lines.
 */
/* eslint-env node */
import { inflateSync } from 'zlib';

function chunks(buf) {
  const out = {};
  let p = 8; // skip the signature
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IDAT') { out.idat = out.idat ? Buffer.concat([out.idat, data]) : data; }
    else { out[type] = data; }
    p += 12 + len;
  }
  return out;
}

/** Decode an 8-bit truecolour PNG (what Chrome emits) to {width, height, at(x,y)}. */
export function decodePng(buf) {
  const c = chunks(buf);
  const width = c.IHDR.readUInt32BE(0), height = c.IHDR.readUInt32BE(4);
  const depth = c.IHDR[8], colorType = c.IHDR[9];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error('unexpected PNG format: depth ' + depth + ' colorType ' + colorType);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(c.idat);
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride); pos += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;         // left
      const b = prev ? prev[i] : 0;                   // up
      const cc = prev && i >= bpp ? prev[i - bpp] : 0; // up-left
      let v = row[i];
      if (filter === 1) { v += a; }
      else if (filter === 2) { v += b; }
      else if (filter === 3) { v += (a + b) >> 1; }
      else if (filter === 4) {
        const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : cc);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, at: (x, y) => {
    const i = y * stride + x * bpp;
    return { r: px[i], g: px[i + 1], b: px[i + 2] };
  } };
}

const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const luminance = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
export function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The colour a region is PAINTED, ignoring whatever sits on top of it.
 *
 * Takes the modal (most frequent) pixel rather than the mean: a badge's box contains its glyphs
 * and their antialiasing as well as its fill, and averaging those together would report a colour
 * that appears nowhere on screen -- and would drag the "background" toward the text, flattering
 * the contrast figure. The most common pixel in a padded pill IS its fill.
 */
export function dominant(img, rect) {
  const counts = new Map();
  const x0 = Math.max(0, Math.round(rect.x)), y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(img.width, Math.round(rect.x + rect.width));
  const y1 = Math.min(img.height, Math.round(rect.y + rect.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = img.at(x, y);
      const k = (p.r << 16) | (p.g << 8) | p.b;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  let best = null, bestN = -1;
  for (const [k, n] of counts) { if (n > bestN) { bestN = n; best = k; } }
  return { r: (best >> 16) & 255, g: (best >> 8) & 255, b: best & 255, share: bestN / ((x1 - x0) * (y1 - y0)) };
}
