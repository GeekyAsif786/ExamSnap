// SPDX-License-Identifier: AGPL-3.0-or-later

const clamp = (v, lo, hi, fallback) => (Number.isNaN(v) ? fallback : Math.min(hi, Math.max(lo, v)));

/**
 * "Cover" source rectangle for drawing an imgW×imgH image into an outW×outH
 * output. The rect has the output's aspect ratio and always lies inside the
 * image.
 *
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} outW
 * @param {number} outH
 * @param {number} [zoom=1] clamped to [1, 8]; shrinks the rect around its centre.
 * @param {number} [panX=0] clamped to [-1, 1]; -1 = left edge, 1 = right edge.
 * @param {number} [panY=0] clamped to [-1, 1]; -1 = top edge, 1 = bottom edge.
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function cropRect(imgW, imgH, outW, outH, zoom = 1, panX = 0, panY = 0) {
  for (const [name, v] of Object.entries({ imgW, imgH, outW, outH })) {
    if (!(v > 0) || !Number.isFinite(v)) {
      throw new RangeError(`cropRect: ${name} must be a positive number (got ${v})`);
    }
  }
  const z = clamp(zoom, 1, 8, 1);
  const px = clamp(panX, -1, 1, 0);
  const py = clamp(panY, -1, 1, 0);

  const aspect = outW / outH;
  let sw, sh;
  if (imgW / imgH > aspect) {
    sh = imgH / z;
    sw = sh * aspect;
  } else {
    sw = imgW / z;
    sh = sw / aspect;
  }

  const slackX = imgW - sw;
  const slackY = imgH - sh;
  const sx = Math.min(slackX * ((px + 1) / 2), slackX);
  const sy = Math.min(slackY * ((py + 1) / 2), slackY);
  return { sx, sy, sw, sh };
}
