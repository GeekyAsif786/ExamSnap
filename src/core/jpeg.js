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
 * Offset just past the leading APPn segments (FF E0–FF EF), i.e. right before
 * the first non-APPn marker. Returns 2 (right after SOI) if there are no
 * APPn segments or the structure can't be parsed safely.
 * @param {Uint8Array} bytes SOI-prefixed data.
 * @returns {number}
 */
function insertionOffset(bytes) {
  let pos = 2;
  while (pos + 1 < bytes.length && bytes[pos] === 0xff && bytes[pos + 1] >= 0xe0 && bytes[pos + 1] <= 0xef) {
    if (pos + 4 > bytes.length) return 2; // truncated length field
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (len < 2 || pos + 2 + len > bytes.length) return 2; // bad or truncated length
    pos += 2 + len;
  }
  // Must land on another marker; otherwise we don't trust the walk.
  if (pos + 1 >= bytes.length || bytes[pos] !== 0xff) return 2;
  return pos;
}

/**
 * Grow a JPEG to at least `targetLen` bytes without changing the decoded
 * image, by inserting COM (comment) segments filled with spaces after the
 * leading APPn segments, so APP0/JFIF stays immediately after SOI. If the
 * APPn segments can't be parsed safely, inserts right after SOI instead.
 * The result length is in [targetLen, targetLen + 3].
 *
 * @param {Uint8Array} bytes
 * @param {number} targetLen
 * @returns {Uint8Array} the input itself if already >= targetLen.
 */
export function padJpeg(bytes, targetLen) {
  if (!isJpeg(bytes)) throw new TypeError("padJpeg: input is not a JPEG");
  if (bytes.length >= targetLen) return bytes;

  const at = insertionOffset(bytes);
  const sizes = segmentSizes(targetLen - bytes.length);
  const added = sizes.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(bytes.length + added);
  out.set(bytes.subarray(0, at), 0);
  let pos = at;
  for (const size of sizes) {
    const len = size - 2;
    out[pos] = 0xff;
    out[pos + 1] = 0xfe;
    out[pos + 2] = len >> 8;
    out[pos + 3] = len & 0xff;
    out.fill(0x20, pos + 4, pos + size);
    pos += size;
  }
  out.set(bytes.subarray(at), pos);
  return out;
}
