// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { isJpeg, padJpeg } from "../src/core/jpeg.js";

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
/** A marker segment: FF <marker>, 2-byte length counting itself, payload. */
const segment = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];

// APP0 JFIF 1.01, no thumbnail: 14-byte payload, length 16.
const APP0 = segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const APP1 = segment(0xe1, [...ascii("Exif"), 0, 0, 0x4d, 0x4d, 0x00, 0x2a]);
const DQT = segment(0xdb, [0x00, 0x10, 0x0b, 0x0c]);
const SCAN_DATA = [0x12, 0x34, 0x56, 0x78];

const VARIANTS = {
  "no APPn": [...SOI, ...DQT, ...SCAN_DATA, ...EOI],
  "APP0 JFIF": [...SOI, ...APP0, ...DQT, ...SCAN_DATA, ...EOI],
  "APP0 + APP1": [...SOI, ...APP0, ...APP1, ...DQT, ...SCAN_DATA, ...EOI],
};
const jpeg = (name) => new Uint8Array(VARIANTS[name]);

/** Skip leading APPn segments from offset 2; return the offset after them. */
function skipAppSegments(bytes) {
  let pos = 2;
  while (bytes[pos] === 0xff && bytes[pos + 1] >= 0xe0 && bytes[pos + 1] <= 0xef) {
    pos += 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
  }
  return pos;
}

/** Walk COM segments starting at `pos`; return where they end and how many. */
function walkComSegments(bytes, pos) {
  let count = 0;
  while (bytes[pos] === 0xff && bytes[pos + 1] === 0xfe) {
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    assert.ok(len >= 2, `segment ${count} length ${len} < 2`);
    for (let i = pos + 4; i < pos + 2 + len; i++) {
      assert.equal(bytes[i], 0x20, `payload byte at ${i} is not a space`);
    }
    pos += 2 + len;
    count++;
  }
  return { end: pos, count };
}

/**
 * Assert `out` is `src` with COM segments inserted at `at`, and nothing else
 * changed. Returns the number of COM segments.
 */
function assertPaddedAt(src, out, at) {
  assert.deepEqual(out.subarray(0, at), src.subarray(0, at), "bytes before the padding changed");
  const { end, count } = walkComSegments(out, at);
  assert.ok(count >= 1, "no COM segment at the insertion point");
  assert.deepEqual(out.subarray(end), src.subarray(at), "walk did not land exactly on the original data");
  return count;
}

test("isJpeg", () => {
  assert.equal(isJpeg(jpeg("APP0 JFIF")), true);
  assert.equal(isJpeg(new Uint8Array([0xff])), false);
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(isJpeg(new Uint8Array()), false);
});

for (const variant of Object.keys(VARIANTS)) {
  for (const extra of [1, 3, 4, 5, 65537, 65540, 140000]) {
    test(`padJpeg +${extra} bytes (${variant})`, () => {
      const src = jpeg(variant);
      const target = src.length + extra;
      const out = padJpeg(src, target);

      assert.ok(out.length >= target, `length ${out.length} < target ${target}`);
      assert.ok(out.length <= target + 3, `length ${out.length} > target + 3`);
      assertPaddedAt(src, out, skipAppSegments(src));
      assert.equal(out[out.length - 2], 0xff);
      assert.equal(out[out.length - 1], 0xd9);
    });
  }
}

test("(a) APP0/JFIF stays at the start and COM follows it", () => {
  const src = jpeg("APP0 JFIF");
  const out = padJpeg(src, src.length + 1000);
  assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  assert.deepEqual([...out.subarray(6, 11)], [...ascii("JFIF"), 0]);
  assertPaddedAt(src, out, 2 + APP0.length);
});

test("(b) APP0 and APP1 both stay first, in order", () => {
  const src = jpeg("APP0 + APP1");
  const out = padJpeg(src, src.length + 1000);
  assert.deepEqual([...out.subarray(2, 2 + APP0.length)], APP0);
  assert.deepEqual([...out.subarray(2 + APP0.length, 2 + APP0.length + APP1.length)], APP1);
  assertPaddedAt(src, out, 2 + APP0.length + APP1.length);
});

test("(c) no APPn: COM goes right after SOI", () => {
  const src = jpeg("no APPn");
  const out = padJpeg(src, src.length + 1000);
  assertPaddedAt(src, out, 2);
});

test("(d) unparseable APPn structure falls back to right after SOI without throwing", () => {
  const cases = {
    "APP0 length runs past the end": [...SOI, 0xff, 0xe0, 0x40, 0x00, ...ascii("JFIF"), ...EOI],
    "length field cut off": [...SOI, 0xff, 0xe0, 0x00],
    "APP0 length < 2": [...SOI, 0xff, 0xe0, 0x00, 0x01, ...DQT, ...EOI],
    "missing FF after APP0": [...SOI, ...APP0, 0x12, 0x34, ...EOI],
    "nothing after APP0": [...SOI, ...APP0],
    "only SOI": [...SOI],
  };
  for (const [name, bytes] of Object.entries(cases)) {
    const src = new Uint8Array(bytes);
    for (const extra of [1, 5, 70000]) {
      const out = padJpeg(src, src.length + extra);
      assert.ok(out.length >= src.length + extra && out.length <= src.length + extra + 3, name);
      assertPaddedAt(src, out, 2);
    }
  }
});

test("padJpeg uses multiple segments when needed", () => {
  const src = jpeg("APP0 JFIF");
  const out = padJpeg(src, src.length + 140000);
  assert.equal(assertPaddedAt(src, out, 2 + APP0.length), 3);
});

test("padJpeg returns input unchanged when already big enough", () => {
  const src = jpeg("APP0 JFIF");
  assert.equal(padJpeg(src, src.length), src);
  assert.equal(padJpeg(src, 3), src);
});

test("padJpeg throws on non-JPEG input", () => {
  assert.throws(() => padJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 100), TypeError);
  assert.throws(() => padJpeg(new Uint8Array(), 100), TypeError);
});
