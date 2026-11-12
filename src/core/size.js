// SPDX-License-Identifier: AGPL-3.0-or-later

const MIN_WIDTH = 4;

/**
 * Convert a portal's KB range into a byte range that is valid whether the
 * portal treats 1 KB as 1000 or 1024 bytes.
 *
 * minBytes uses 1024 (the larger reading of min) and maxBytes uses 1000 (the
 * smaller reading of max). If that leaves no room, both use 1000 and
 * `fallback` is true. Throws if the resulting range is under 4 bytes wide.
 *
 * @param {number} minKb
 * @param {number} maxKb
 * @returns {{ minBytes: number, maxBytes: number, fallback: boolean }}
 */
export function byteRange(minKb, maxKb) {
  if (!(minKb > 0)) {
    throw new RangeError(`minKb must be > 0 (got ${minKb})`);
  }
  if (!(maxKb > minKb)) {
    throw new RangeError(`maxKb must be > minKb (got ${minKb}–${maxKb})`);
  }
  let minBytes = Math.ceil(minKb * 1024);
  const maxBytes = Math.floor(maxKb * 1000);
  let fallback = false;
  if (minBytes > maxBytes) {
    minBytes = Math.ceil(minKb * 1000);
    fallback = true;
  }
  // padJpeg can overshoot its target by up to 3 bytes, so a narrower range
  // cannot be padded into safely.
  if (maxBytes - minBytes < MIN_WIDTH) {
    throw new RangeError(
      `range ${minKb}–${maxKb} KB is only ${maxBytes - minBytes} bytes wide (need >= ${MIN_WIDTH})`,
    );
  }
  return { minBytes, maxBytes, fallback };
}
