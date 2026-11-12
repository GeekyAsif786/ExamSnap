// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Convert a portal's KB range into a byte range that is valid whether the
 * portal treats 1 KB as 1000 or 1024 bytes.
 *
 * minBytes uses 1024 (the larger reading of min) and maxBytes uses 1000 (the
 * smaller reading of max). If that leaves no room, both use 1000 and
 * `fallback` is true.
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
  const minBytes = Math.ceil(minKb * 1024);
  const maxBytes = Math.floor(maxKb * 1000);
  if (minBytes > maxBytes) {
    return {
      minBytes: Math.ceil(minKb * 1000),
      maxBytes,
      fallback: true,
    };
  }
  return { minBytes, maxBytes, fallback: false };
}
