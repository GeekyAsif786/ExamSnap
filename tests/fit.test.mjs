// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitToRange } from "../src/core/fit.js";
import { isJpeg } from "../src/core/jpeg.js";

/** A fake JPEG of exactly n bytes: FF D8, filler, FF D9. */
function fakeJpeg(n) {
  const b = new Uint8Array(n);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[n - 2] = 0xff;
  b[n - 1] = 0xd9;
  return b;
}

/** Wrap size(q) as an async encoder that records every call. */
function fakeEncoder(sizeOf) {
  const calls = [];
  const encode = async (q) => {
    assert.ok(q >= 0.05 && q <= 0.98, `q ${q} out of [0.05, 0.98]`);
    const size = Math.round(sizeOf(q));
    calls.push({ q, size });
    return fakeJpeg(size);
  };
  return { encode, calls };
}

const KB20_50 = { minBytes: 20480, maxBytes: 50000 };
const KB10_20 = { minBytes: 10240, maxBytes: 20000 };

test("(a) normal encoder: in range, not padded", async () => {
  const { encode } = fakeEncoder((q) => 2000 + q * 60000);
  const r = await fitToRange(encode, KB20_50);
  assert.equal(r.ok, true);
  assert.equal(r.padded, false);
  assert.ok(r.size >= KB20_50.minBytes && r.size <= KB20_50.maxBytes);
  assert.ok(r.size <= Math.floor(50000 * 0.97), "respects the safety margin");
  assert.equal(r.bytes.length, r.size);
  assert.ok(r.quality > 0.05 && r.quality < 0.98);
});

test("(a) uses q=0.98 straight away when it fits", async () => {
  const { encode, calls } = fakeEncoder((q) => 20000 + q * 10000);
  const r = await fitToRange(encode, KB20_50);
  assert.equal(r.ok, true);
  assert.equal(r.quality, 0.98);
  assert.equal(calls.length, 1);
});

test("(b) tiny output is padded into range", async () => {
  const { encode } = fakeEncoder((q) => 200 + q * 5000);
  const r = await fitToRange(encode, KB10_20);
  assert.equal(r.ok, true);
  assert.equal(r.padded, true);
  assert.equal(r.quality, 0.98);
  assert.ok(r.size >= 10240 + 512 && r.size <= 10240 + 512 + 3);
  assert.ok(isJpeg(r.bytes));
});

test("(c) output that never fits returns too-large", async () => {
  const { encode, calls } = fakeEncoder(() => 90000);
  const r = await fitToRange(encode, KB10_20);
  assert.deepEqual(r, { ok: false, reason: "too-large", size: 90000 });
  assert.equal(calls.at(-1).q, 0.05, "tried the minimum quality last");
});

test("(c) q=0.05 above the ceiling but under max is still accepted", async () => {
  // ceiling = floor(20000 * 0.97) = 19400; nothing above q=0.05 fits it.
  const { encode } = fakeEncoder((q) => (q === 0.05 ? 19800 : 30000));
  const r = await fitToRange(encode, KB10_20);
  assert.equal(r.ok, true);
  assert.equal(r.quality, 0.05);
  assert.equal(r.size, 19800);
});

test("(d) non-monotonic encoder: keeps best in-range q, not the last tried", async () => {
  // Fits only in a band around q 0.5–0.6; too big both above AND below it,
  // so size dips and rises across q.
  const sizeOf = (q) => (q >= 0.5 && q <= 0.6 ? 15000 + (q - 0.5) * 10000 : 40000);
  assert.ok(sizeOf(0.3) > sizeOf(0.55) && sizeOf(0.55) < sizeOf(0.7), "encoder is non-monotonic");
  const { encode, calls } = fakeEncoder(sizeOf);
  const r = await fitToRange(encode, KB10_20);
  const ceiling = Math.floor(20000 * 0.97);

  assert.equal(r.ok, true);
  assert.equal(r.padded, false);
  assert.ok(r.size >= 10240 && r.size <= 20000);

  const fitting = calls.filter((c) => c.size <= ceiling);
  const bestQ = Math.max(...fitting.map((c) => c.q));
  const last = calls.at(-1);

  assert.equal(r.quality, bestQ, "returned the highest q that fit");
  assert.equal(r.size, fitting.find((c) => c.q === bestQ).size);
  assert.notEqual(last.q, bestQ, "the last tried q is a different one");
  assert.ok(last.size > ceiling, "and the last tried q did not fit");
});

test("custom margin changes the ceiling", async () => {
  const { encode } = fakeEncoder((q) => q * 60000);
  const r = await fitToRange(encode, KB20_50, { margin: 0.5 });
  assert.equal(r.ok, true);
  assert.ok(r.size <= 25000);
});

test("padding never overshoots maxBytes in a 10-byte-wide range", async () => {
  const range = { minBytes: 10240, maxBytes: 10250 };
  const { encode } = fakeEncoder((q) => 200 + q * 5000);
  const r = await fitToRange(encode, range);
  assert.equal(r.ok, true);
  assert.equal(r.padded, true);
  assert.ok(r.size >= range.minBytes && r.size <= range.maxBytes, `size ${r.size}`);
});

test("padding a 1–3 byte shortfall in the narrowest allowed range stays in range", async () => {
  // 4 bytes wide; pad target = maxBytes - 3 = minBytes + 1. A 2-byte shortfall
  // forces a 4-byte COM segment, i.e. the full 3-byte overshoot.
  const range = { minBytes: 10000, maxBytes: 10004 };
  for (const size of [9998, 9999]) {
    const { encode } = fakeEncoder(() => size);
    const r = await fitToRange(encode, range);
    assert.equal(r.ok, true, `start ${size} -> ${r.size}`);
    assert.ok(r.size <= range.maxBytes);
  }
});
