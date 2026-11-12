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

const METADATA_MARKERS = new Set([0xe1, 0xed]); // APP1 (EXIF/XMP), APP13 (IPTC/Photoshop)

/**
 * Remove metadata segments that can carry location or camera data — APP1
 * (EXIF, XMP) and APP13 (IPTC / Photoshop) — from the header of a JPEG.
 * Everything else, including APP0 JFIF, APP2 ICC profiles and the scan data,
 * is kept byte-for-byte. Some encoders (WebKit/ImageIO) write these segments
 * even for canvas output.
 *
 * If the header can't be walked safely up to SOS, the input is returned
 * unchanged rather than risk corrupting it.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} the input itself if nothing was removed.
 */
export function stripMetadata(bytes) {
  if (!isJpeg(bytes)) throw new TypeError("stripMetadata: input is not a JPEG");
  const keep = []; // [start, end) ranges to keep
  let start = 0;
  let pos = 2;
  for (;;) {
    if (pos + 4 > bytes.length || bytes[pos] !== 0xff) return bytes;
    const marker = bytes[pos + 1];
    if (marker === 0xff) {
      pos++; // fill byte before a marker
      continue;
    }
    if (marker === 0xda) break; // SOS: scan data follows, stop
    // Standalone markers (TEM, RSTn, SOI, EOI) have no business in the header.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) return bytes;
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (len < 2 || pos + 2 + len > bytes.length) return bytes;
    if (METADATA_MARKERS.has(marker)) {
      keep.push([start, pos]);
      start = pos + 2 + len;
    }
    pos += 2 + len;
  }
  if (!keep.length) return bytes;
  keep.push([start, bytes.length]);
  const out = new Uint8Array(keep.reduce((n, [a, b]) => n + (b - a), 0));
  let at = 0;
  for (const [a, b] of keep) {
    out.set(bytes.subarray(a, b), at);
    at += b - a;
  }
  return out;
}

// APP0 JFIF 1.01, aspect ratio 1:1 (units 0), no thumbnail.
const JFIF_APP0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];

/**
 * Make sure a JPEG starts with an APP0 JFIF segment (FF D8 FF E0 … "JFIF\0"),
 * which some portals check for. If the first segment after SOI isn't APP0
 * JFIF, a standard JFIF 1.01 APP0 (1:1 aspect, no thumbnail) is inserted
 * right after SOI. Decoded pixels are unchanged.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} the input itself if it already starts with JFIF.
 */
export function ensureJfif(bytes) {
  if (!isJpeg(bytes)) throw new TypeError("ensureJfif: input is not a JPEG");
  const hasJfif =
    bytes.length >= 11 &&
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    bytes[6] === 0x4a &&
    bytes[7] === 0x46 &&
    bytes[8] === 0x49 &&
    bytes[9] === 0x46 &&
    bytes[10] === 0x00;
  if (hasJfif) return bytes;
  const out = new Uint8Array(bytes.length + JFIF_APP0.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(JFIF_APP0, 2);
  out.set(bytes.subarray(2), 2 + JFIF_APP0.length);
  return out;
}
