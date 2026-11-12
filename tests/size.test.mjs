// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { byteRange } from "../src/core/size.js";

test("byteRange uses 1024 for min and 1000 for max", () => {
  assert.deepEqual(byteRange(20, 50), {
    minBytes: 20480,
    maxBytes: 50000,
    fallback: false,
  });
});

test("byteRange rounds min up and max down", () => {
  assert.deepEqual(byteRange(0.5, 1.0005), {
    minBytes: 512,
    maxBytes: 1000,
    fallback: false,
  });
});

test("byteRange falls back to 1000-based when the mixed range is empty", () => {
  // 49 * 1024 = 50176 > 50000
  assert.deepEqual(byteRange(49, 50), {
    minBytes: 49000,
    maxBytes: 50000,
    fallback: true,
  });
});

test("byteRange throws RangeError on invalid input", () => {
  assert.throws(() => byteRange(0, 10), RangeError);
  assert.throws(() => byteRange(-1, 10), RangeError);
  assert.throws(() => byteRange(10, 10), RangeError);
  assert.throws(() => byteRange(20, 10), RangeError);
  assert.throws(() => byteRange(NaN, 10), RangeError);
  assert.throws(() => byteRange(10, NaN), RangeError);
});
