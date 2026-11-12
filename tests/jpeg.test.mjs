// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { isJpeg, padJpeg } from "../src/core/jpeg.js";

// SOI, a fake APP0-ish body, EOI.
const BODY = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0x12, 0x34, 0x56];
const fakeJpeg = () => new Uint8Array([0xff, 0xd8, ...BODY, 0xff, 0xd9]);

/** Walk COM segments from offset 2; return the offset where they end. */
function walkComSegments(bytes) {
  let pos = 2;
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

test("isJpeg", () => {
  assert.equal(isJpeg(fakeJpeg()), true);
  assert.equal(isJpeg(new Uint8Array([0xff])), false);
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(isJpeg(new Uint8Array()), false);
});

for (const extra of [1, 3, 4, 5, 65537, 65540, 140000]) {
  test(`padJpeg +${extra} bytes`, () => {
    const src = fakeJpeg();
    const target = src.length + extra;
    const out = padJpeg(src, target);

    assert.ok(out.length >= target, `length ${out.length} < target ${target}`);
    assert.ok(out.length <= target + 3, `length ${out.length} > target + 3`);
    assert.equal(out[0], 0xff);
    assert.equal(out[1], 0xd8);

    const { end, count } = walkComSegments(out);
    assert.ok(count >= 1);
    // The walk must land exactly on the original data after SOI.
    assert.deepEqual(out.subarray(end), src.subarray(2));
    assert.equal(out[out.length - 2], 0xff);
    assert.equal(out[out.length - 1], 0xd9);
  });
}

test("padJpeg uses multiple segments when needed", () => {
  const src = fakeJpeg();
  const { count } = walkComSegments(padJpeg(src, src.length + 140000));
  assert.equal(count, 3);
});

test("padJpeg returns input unchanged when already big enough", () => {
  const src = fakeJpeg();
  assert.equal(padJpeg(src, src.length), src);
  assert.equal(padJpeg(src, 3), src);
});

test("padJpeg throws on non-JPEG input", () => {
  assert.throws(() => padJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 100), TypeError);
  assert.throws(() => padJpeg(new Uint8Array(), 100), TypeError);
});
