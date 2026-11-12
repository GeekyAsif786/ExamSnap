// SPDX-License-Identifier: AGPL-3.0-or-later
import { padJpeg } from "./jpeg.js";

const Q_MIN = 0.05;
const Q_MAX = 0.98;
const ITERATIONS = 9;
const PAD_HEADROOM = 512;

/**
 * Find the highest JPEG quality whose output fits a byte range, padding
 * small results up to the minimum.
 *
 * Encoder output size is not guaranteed to be monotonic in q, so the best
 * (highest-q) result under the ceiling from any step is kept.
 *
 * @param {(q: number) => Promise<Uint8Array>} encode
 * @param {{ minBytes: number, maxBytes: number }} range
 * @param {{ margin?: number }} [options]
 * @returns {Promise<
 *   | { ok: boolean, bytes: Uint8Array, size: number, quality: number, padded: boolean }
 *   | { ok: false, reason: "too-large", size: number }
 * >}
 */
export async function fitToRange(encode, { minBytes, maxBytes }, { margin = 0.97 } = {}) {
  const ceiling = Math.max(minBytes, Math.floor(maxBytes * margin));

  let best = null; // { bytes, quality }
  const first = await encode(Q_MAX);
  if (first.length <= ceiling) {
    best = { bytes: first, quality: Q_MAX };
  } else {
    let lo = Q_MIN;
    let hi = Q_MAX;
    for (let i = 0; i < ITERATIONS; i++) {
      const q = (lo + hi) / 2;
      const bytes = await encode(q);
      if (bytes.length <= ceiling) {
        if (!best || q > best.quality) best = { bytes, quality: q };
        lo = q;
      } else {
        hi = q;
      }
    }
  }

  if (!best) {
    const bytes = await encode(Q_MIN);
    if (bytes.length > maxBytes) {
      return { ok: false, reason: "too-large", size: bytes.length };
    }
    best = { bytes, quality: Q_MIN };
  }

  let { bytes } = best;
  let padded = false;
  if (bytes.length < minBytes) {
    bytes = padJpeg(bytes, Math.min(minBytes + PAD_HEADROOM, maxBytes));
    padded = true;
  }

  const size = bytes.length;
  return {
    ok: size >= minBytes && size <= maxBytes,
    bytes,
    size,
    quality: best.quality,
    padded,
  };
}
