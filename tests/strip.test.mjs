// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureJfif, padJpeg, stripMetadata } from "../src/core/jpeg.js";

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const segment = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const APP0 = segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const APP1 = segment(0xe1, [...ascii("Exif"), 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]);
const XMP = segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x/>"));
const APP2 = segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 9, 9]);
const APP13 = segment(0xed, ascii("Photoshop 3.0\u00008BIM"));
const DQT = segment(0xdb, [0x00, 0x10, 0x0b, 0x0c]);
const SOF0 = segment(0xc0, [8, 0, 10, 0, 20, 1, 1, 0x11, 0]);
// Scan data deliberately contains FF E1 / FF ED byte pairs, which must survive.
const SOS = [...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0xff, 0x00, 0xff, 0xe1, 0xff, 0xed, 0x34];
const u8 = (...parts) => new Uint8Array(parts.flat());

test("WebKit-style APP0 + APP1 + APP13 header: APP1 and APP13 removed, rest byte-identical", () => {
  const input = u8(SOI, APP0, APP1, APP13, SOF0, DQT, SOS, EOI);
  assert.deepEqual(stripMetadata(input), u8(SOI, APP0, SOF0, DQT, SOS, EOI));
});

test("XMP (also APP1) is removed; APP2 ICC profile is kept", () => {
  const input = u8(SOI, APP0, APP2, XMP, APP1, DQT, SOF0, SOS, EOI);
  assert.deepEqual(stripMetadata(input), u8(SOI, APP0, APP2, DQT, SOF0, SOS, EOI));
});

test("nothing to strip returns the same array", () => {
  const input = u8(SOI, APP0, APP2, DQT, SOF0, SOS, EOI);
  assert.equal(stripMetadata(input), input);
});

test("APP1 right after SOI (no JFIF) is removed", () => {
  assert.deepEqual(stripMetadata(u8(SOI, APP1, DQT, SOS, EOI)), u8(SOI, DQT, SOS, EOI));
});

test("fill bytes before a marker are tolerated", () => {
  const input = u8(SOI, APP0, [0xff], APP1, DQT, SOS, EOI);
  assert.deepEqual(stripMetadata(input), u8(SOI, APP0, [0xff], DQT, SOS, EOI));
});

test("unparseable headers are returned unchanged", () => {
  const truncated = u8(SOI, APP0, APP1.slice(0, 6));
  assert.equal(stripMetadata(truncated), truncated);
  const badLength = u8(SOI, [0xff, 0xe1, 0x00, 0x01], DQT, SOS);
  assert.equal(stripMetadata(badLength), badLength);
  const noMarker = u8(SOI, APP0, [0x00, 0x00], APP1, SOS);
  assert.equal(stripMetadata(noMarker), noMarker);
  const noSos = u8(SOI, APP0, APP1);
  assert.equal(stripMetadata(noSos), noSos);
  const standalone = u8(SOI, [0xff, 0xd0], APP1, SOS);
  assert.equal(stripMetadata(standalone), standalone);
});

test("rejects non-JPEG input", () => {
  assert.throws(() => stripMetadata(new Uint8Array([0x89, 0x50])), TypeError);
});

test("strip then pad keeps JFIF first and stays metadata-free", () => {
  const stripped = stripMetadata(u8(SOI, APP0, APP1, APP13, DQT, SOF0, SOS, EOI));
  const padded = padJpeg(stripped, stripped.length + 100);
  assert.deepEqual([...padded.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  assert.deepEqual(stripMetadata(padded), padded);
  assert.equal(stripMetadata(padded), padded);
});

test("ensureJfif: already JFIF returns the same array", () => {
  const input = u8(SOI, APP0, DQT, SOS, EOI);
  assert.equal(ensureJfif(input), input);
});

test("ensureJfif: no APP0 gets a standard JFIF APP0 right after SOI", () => {
  const out = ensureJfif(u8(SOI, DQT, SOS, EOI));
  assert.deepEqual(out, u8(SOI, APP0, DQT, SOS, EOI));
  assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  assert.deepEqual([...out.subarray(6, 11)], [...ascii("JFIF"), 0]);
});

test("ensureJfif: a non-JFIF APP0 (e.g. JFXX) or APP1 first gets JFIF in front", () => {
  const jfxx = segment(0xe0, [...ascii("JFXX"), 0, 0x10]);
  assert.deepEqual(ensureJfif(u8(SOI, jfxx, DQT, SOS)), u8(SOI, APP0, jfxx, DQT, SOS));
  assert.deepEqual(ensureJfif(u8(SOI, APP2, DQT, SOS)), u8(SOI, APP0, APP2, DQT, SOS));
});

test("strip + ensureJfif on an APP0-less WebKit-like header yields JFIF and no metadata", () => {
  const out = ensureJfif(stripMetadata(u8(SOI, APP1, APP13, DQT, SOF0, SOS, EOI)));
  assert.deepEqual(out, u8(SOI, APP0, DQT, SOF0, SOS, EOI));
});

test("ensureJfif rejects non-JPEG input", () => {
  assert.throws(() => ensureJfif(new Uint8Array([0x00, 0x01])), TypeError);
});
