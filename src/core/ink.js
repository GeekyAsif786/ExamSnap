// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Clean up a scanned signature in place: paper (luminance >= threshold)
 * becomes pure white, ink is darkened proportionally. Alpha is untouched.
 *
 * @param {Uint8ClampedArray} rgba RGBA pixel data, e.g. ImageData.data.
 * @param {number} [threshold=170]
 * @returns {Uint8ClampedArray} the same array.
 */
export function cleanInk(rgba, threshold = 170) {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (l >= threshold) {
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
    } else {
      const k = 0.5 * (l / threshold);
      rgba[i] = r * k;
      rgba[i + 1] = g * k;
      rgba[i + 2] = b * k;
    }
  }
  return rgba;
}
