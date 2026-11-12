// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { cropRect } from "../src/core/crop.js";

const INPUTS = [
  [4000, 3000],
  [3000, 4000],
  [500, 500],
];
const OUTPUTS = [
  [200, 230],
  [500, 350],
];
const ZOOMS = [1, 2.5, 8];
const PANS = [-1, 0, 1];

function assertValid(r, imgW, imgH, outW, outH, label) {
  assert.ok(Math.abs(r.sw / r.sh - outW / outH) < 1e-9, `${label}: aspect ${r.sw / r.sh}`);
  assert.ok(r.sw > 0 && r.sh > 0, `${label}: positive size`);
  assert.ok(r.sx >= 0 && r.sy >= 0, `${label}: origin inside`);
  assert.ok(r.sx + r.sw <= imgW, `${label}: right edge ${r.sx + r.sw} > ${imgW}`);
  assert.ok(r.sy + r.sh <= imgH, `${label}: bottom edge ${r.sy + r.sh} > ${imgH}`);
}

test("cropRect: aspect matches output and rect stays inside the image", () => {
  let n = 0;
  for (const [imgW, imgH] of INPUTS)
    for (const [outW, outH] of OUTPUTS)
      for (const zoom of ZOOMS)
        for (const panX of PANS)
          for (const panY of PANS) {
            const label = `${imgW}x${imgH}->${outW}x${outH} z${zoom} p${panX},${panY}`;
            assertValid(cropRect(imgW, imgH, outW, outH, zoom, panX, panY), imgW, imgH, outW, outH, label);
            n++;
          }
  assert.equal(n, 3 * 2 * 3 * 3 * 3);
});

test("cropRect: zoom 1 covers the full width or height", () => {
  const wide = cropRect(4000, 3000, 200, 230);
  assert.equal(wide.sh, 3000);
  const tall = cropRect(3000, 4000, 500, 350);
  assert.equal(tall.sw, 3000);
});

test("cropRect: zoom shrinks around the centre at pan 0", () => {
  const r = cropRect(4000, 3000, 500, 350, 2);
  const full = cropRect(4000, 3000, 500, 350, 1);
  assert.ok(Math.abs(r.sw - full.sw / 2) < 1e-9);
  assert.ok(Math.abs(r.sx + r.sw / 2 - 2000) < 1e-9);
  assert.ok(Math.abs(r.sy + r.sh / 2 - 1500) < 1e-9);
});

test("cropRect: pan -1 and 1 reach the edges", () => {
  const left = cropRect(4000, 3000, 200, 230, 1, -1, 0);
  assert.equal(left.sx, 0);
  const right = cropRect(4000, 3000, 200, 230, 1, 1, 0);
  assert.equal(right.sx + right.sw, 4000);
  const top = cropRect(3000, 3000, 200, 230, 3, 0, -1);
  assert.equal(top.sy, 0);
  const bottom = cropRect(3000, 3000, 200, 230, 3, 0, 1);
  assert.ok(Math.abs(bottom.sy + bottom.sh - 3000) < 1e-9);
});

test("cropRect: out-of-range zoom and pan are clamped, not thrown", () => {
  assert.deepEqual(cropRect(4000, 3000, 200, 230, 0.1), cropRect(4000, 3000, 200, 230, 1));
  assert.deepEqual(cropRect(4000, 3000, 200, 230, 50), cropRect(4000, 3000, 200, 230, 8));
  assert.deepEqual(cropRect(4000, 3000, 200, 230, 2, -5, 9), cropRect(4000, 3000, 200, 230, 2, -1, 1));
  assert.deepEqual(cropRect(4000, 3000, 200, 230, -Infinity, Infinity), cropRect(4000, 3000, 200, 230, 1, 1));
  assert.deepEqual(cropRect(4000, 3000, 200, 230, NaN, NaN, NaN), cropRect(4000, 3000, 200, 230));
});

test("cropRect: throws on non-positive dimensions", () => {
  assert.throws(() => cropRect(0, 100, 10, 10), RangeError);
  assert.throws(() => cropRect(100, 100, 10, -1), RangeError);
});
