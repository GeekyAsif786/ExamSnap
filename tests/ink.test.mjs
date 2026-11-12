// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanInk } from "../src/core/ink.js";

test("cleanInk: light pixels become white, alpha untouched", () => {
  const px = new Uint8ClampedArray([200, 200, 200, 128, 170, 170, 170, 7, 255, 240, 230, 255]);
  cleanInk(px);
  assert.deepEqual([...px], [255, 255, 255, 128, 255, 255, 255, 7, 255, 255, 255, 255]);
});

test("cleanInk: dark pixels get darker, alpha untouched", () => {
  const before = [100, 120, 140, 200, 30, 20, 10, 0, 169, 169, 169, 255];
  const px = new Uint8ClampedArray(before);
  cleanInk(px);
  for (let i = 0; i < before.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      assert.ok(px[i + c] < before[i + c], `channel ${c} of pixel ${i / 4} did not darken`);
    }
    assert.equal(px[i + 3], before[i + 3], "alpha changed");
  }
  // 100,120,140: l = 29.9 + 70.44 + 15.96 = 116.3; k = 0.5 * 116.3 / 170
  const k = (0.5 * 116.3) / 170;
  assert.deepEqual([...px.subarray(0, 3)], [100 * k, 120 * k, 140 * k].map((v) => Math.round(v)));
});

test("cleanInk: black stays black, operates in place, honours threshold", () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 120, 120, 120, 255]);
  const out = cleanInk(px, 100);
  assert.equal(out, px);
  assert.deepEqual([...px], [0, 0, 0, 255, 255, 255, 255, 255]);
});
