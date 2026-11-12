// SPDX-License-Identifier: AGPL-3.0-or-later

const MIN_SEGMENT = 4; // FF FE + 2-byte length, empty payload
const MAX_PAYLOAD = 65533; // length field max 0xFFFF, which counts its own 2 bytes
const MAX_SEGMENT = MAX_PAYLOAD + 4;

/**
 * @param {Uint8Array} bytes
 * @returns {boolean} true if the data starts with the JPEG SOI marker.
 */
export function isJpeg(bytes) {
  return bytes instanceof Uint8Array && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * Split `total` bytes into COM segment sizes, each in [MIN_SEGMENT, MAX_SEGMENT].
 * Returns sizes summing to exactly `total` when total >= MIN_SEGMENT,
 * otherwise a single MIN_SEGMENT segment.
 * @param {number} total
 * @returns {number[]}
 */
function segmentSizes(total) {
  if (total <= MIN_SEGMENT) return [MIN_SEGMENT];
  const n = Math.ceil(total / MAX_SEGMENT);
  // With n >= 2, total / n > MAX_SEGMENT / 2, far above MIN_SEGMENT.
  const base = Math.floor(total / n);
  const extra = total % n;
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(base + (i < extra ? 1 : 0));
  return sizes;
}

/**
 * Grow a JPEG to at least `targetLen` bytes without changing the decoded
 * image, by inserting COM (comment) segments filled with spaces right after
 * the SOI marker. The result length is in [targetLen, targetLen + 3].
 *
 * @param {Uint8Array} bytes
 * @param {number} targetLen
 * @returns {Uint8Array} the input itself if already >= targetLen.
 */
export function padJpeg(bytes, targetLen) {
  if (!isJpeg(bytes)) throw new TypeError("padJpeg: input is not a JPEG");
  if (bytes.length >= targetLen) return bytes;

  const sizes = segmentSizes(targetLen - bytes.length);
  const added = sizes.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(bytes.length + added);
  out[0] = 0xff;
  out[1] = 0xd8;
  let pos = 2;
  for (const size of sizes) {
    const len = size - 2;
    out[pos] = 0xff;
    out[pos + 1] = 0xfe;
    out[pos + 2] = len >> 8;
    out[pos + 3] = len & 0xff;
    out.fill(0x20, pos + 4, pos + size);
    pos += size;
  }
  out.set(bytes.subarray(2), pos);
  return out;
}
