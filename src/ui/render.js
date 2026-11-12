// SPDX-License-Identifier: AGPL-3.0-or-later
// Drawing helpers. No event handling.
import { cleanInk } from "../core/index.js";

/**
 * Fill white, then draw the crop `rect` of `bitmap` scaled to width×height,
 * then optionally run core cleanInk over the pixels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} bitmap
 * @param {{ sx: number, sy: number, sw: number, sh: number }} rect
 * @param {{ width: number, height: number, clean?: boolean, threshold?: number }} options
 */
export function drawCrop(ctx, bitmap, rect, { width, height, clean = false, threshold }) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // White first so transparent pixels don't turn black in the JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
  ctx.restore();
  if (clean) {
    const img = ctx.getImageData(0, 0, width, height);
    cleanInk(img.data, threshold);
    ctx.putImageData(img, 0, 0);
  }
}

/**
 * Redraw `bitmap` at width×height (high-quality smoothing) and return it as
 * a new ImageBitmap. The caller owns both bitmaps.
 *
 * @param {ImageBitmap} bitmap
 * @param {{ width: number, height: number }} size
 * @returns {Promise<ImageBitmap>}
 */
export async function resizeBitmap(bitmap, { width, height }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  const out = await createImageBitmap(canvas);
  canvas.width = canvas.height = 0; // free the backing store now
  return out;
}
