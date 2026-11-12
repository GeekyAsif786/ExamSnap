// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../src/generated/presets.js";
import { cropRect } from "../src/core/index.js";
import {
  CUSTOM_ID,
  canUseServiceWorker,
  clampZoom,
  createState,
  currentDoc,
  defaultClean,
  fitWithin,
  formatKb,
  groupByCategory,
  hasMetadataSegment,
  hasNotice,
  panBy,
  parseCustom,
  parseSelection,
  previewSize,
  resetAdjust,
  selectionSearch,
} from "../src/ui/state.js";
import { STRINGS } from "../src/ui/strings.js";

test("parseSelection: known exam and doc", () => {
  assert.deepEqual(parseSelection("?exam=jee-main&doc=signature", PRESETS), { examId: "jee-main", docId: "signature" });
});

test("parseSelection: unknown exam falls back to the first preset and its first doc", () => {
  const first = { examId: PRESETS[0].id, docId: PRESETS[0].documents[0].id };
  assert.deepEqual(parseSelection("?exam=nope&doc=signature", PRESETS), first);
  assert.deepEqual(parseSelection("", PRESETS), first);
});

test("parseSelection: known exam with unknown doc falls back to that exam's first doc", () => {
  assert.deepEqual(parseSelection("?exam=ssc&doc=nope", PRESETS), { examId: "ssc", docId: "photo" });
  assert.deepEqual(parseSelection("?exam=ssc", PRESETS), { examId: "ssc", docId: "photo" });
});

test("parseSelection: custom", () => {
  assert.deepEqual(parseSelection("?exam=custom&doc=x", PRESETS), { examId: CUSTOM_ID, docId: null });
});

test("selectionSearch keeps other params and drops doc for custom", () => {
  assert.equal(selectionSearch("?test=1", { examId: "ssc", docId: "photo" }), "?test=1&exam=ssc&doc=photo");
  assert.equal(
    selectionSearch("?exam=ssc&doc=photo&test=1", { examId: "jee-main", docId: "signature" }),
    "?exam=jee-main&doc=signature&test=1",
  );
  assert.equal(selectionSearch("?exam=ssc&doc=photo", { examId: CUSTOM_ID, docId: null }), "?exam=custom");
});

test("selectionSearch round-trips through parseSelection", () => {
  for (const p of PRESETS) {
    for (const d of p.documents) {
      const sel = { examId: p.id, docId: d.id };
      assert.deepEqual(parseSelection(selectionSearch("", sel), PRESETS), sel);
    }
  }
});

test("parseSelection: a landing page's exam is the default, ?exam= and ?doc= override", () => {
  assert.deepEqual(parseSelection("", PRESETS, "ssc"), { examId: "ssc", docId: "photo" });
  assert.deepEqual(parseSelection("?doc=signature", PRESETS, "ssc"), { examId: "ssc", docId: "signature" });
  assert.deepEqual(parseSelection("?exam=jee-main&doc=signature", PRESETS, "ssc"), { examId: "jee-main", docId: "signature" });
  assert.deepEqual(parseSelection("?exam=custom", PRESETS, "ssc"), { examId: CUSTOM_ID, docId: null });
  // Unknown ?exam= on a landing page falls back to the page's exam.
  assert.deepEqual(parseSelection("?exam=nope", PRESETS, "ssc"), { examId: "ssc", docId: "photo" });
  // An unknown page exam behaves like the root page.
  assert.deepEqual(parseSelection("", PRESETS, "nope"), { examId: PRESETS[0].id, docId: PRESETS[0].documents[0].id });
});

test("selectionSearch on a landing page omits ?exam= for the page's own exam", () => {
  assert.equal(selectionSearch("?test=1", { examId: "ssc", docId: "signature" }, "ssc"), "?test=1&doc=signature");
  assert.equal(selectionSearch("?exam=ssc&doc=photo", { examId: "ssc", docId: "photo" }, "ssc"), "?doc=photo");
  assert.equal(selectionSearch("", { examId: "jee-main", docId: "photo" }, "ssc"), "?exam=jee-main&doc=photo");
  assert.equal(selectionSearch("?doc=photo", { examId: CUSTOM_ID, docId: null }, "ssc"), "?exam=custom");
  for (const p of PRESETS) {
    for (const d of p.documents) {
      const sel = { examId: p.id, docId: d.id };
      assert.deepEqual(parseSelection(selectionSearch("", sel, "ssc"), PRESETS, "ssc"), sel);
    }
  }
});

test("createState honours the page exam", () => {
  assert.equal(createState(PRESETS, "", "upsc-cse").examId, "upsc-cse");
});

test("defaultClean: on for signature and thumb only", () => {
  assert.equal(defaultClean("signature"), true);
  assert.equal(defaultClean("thumb"), true);
  assert.equal(defaultClean("photo"), false);
  assert.equal(defaultClean("document"), false);
  assert.equal(defaultClean(undefined), false);
});

test("hasNotice", () => {
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, hasNotice(p)]));
  assert.deepEqual(byId, { "banking-ibps": true, "jee-main": false, ssc: false, "upsc-cse": false });
});

test("groupByCategory keeps order", () => {
  const groups = groupByCategory(PRESETS);
  assert.deepEqual(
    groups.map((g) => [g.category, g.presets.map((p) => p.id)]),
    [
      ["Banking", ["banking-ibps"]],
      ["Entrance exams", ["jee-main"]],
      ["Government jobs", ["ssc", "upsc-cse"]],
    ],
  );
});

test("parseCustom: valid", () => {
  const r = parseCustom({ width: "200", height: "230", minKb: "20", maxKb: "50" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc, {
    id: "custom",
    kind: "photo",
    width: 200,
    height: 230,
    min_kb: 20,
    max_kb: 50,
    filename: "examsnap-200x230.jpg",
  });
  assert.equal(parseCustom({ width: "50", height: "4000", minKb: "0.5", maxKb: "1.5" }).ok, true);
});

test("parseCustom: bad dimensions", () => {
  for (const [width, height] of [
    ["49", "100"],
    ["100", "4001"],
    ["10.5", "100"],
    ["", "100"],
    ["abc", "100"],
    ["-100", "100"],
  ]) {
    assert.deepEqual(parseCustom({ width, height, minKb: "20", maxKb: "50" }), { ok: false, error: "size" }, `${width}×${height}`);
  }
});

test("parseCustom: bad KB range carries the core RangeError message", () => {
  assert.deepEqual(parseCustom({ width: "200", height: "200", minKb: "50", maxKb: "20" }), {
    ok: false,
    error: "range",
    message: "maxKb must be > minKb (got 50–20)",
  });
  assert.equal(parseCustom({ width: "200", height: "200", minKb: "", maxKb: "20" }).message, "minKb must be > 0 (got NaN)");
  assert.match(parseCustom({ width: "200", height: "200", minKb: "10", maxKb: "10.001" }).message, /bytes wide/);
});

test("currentDoc and resetAdjust follow the selection", () => {
  const state = createState(PRESETS, "?exam=jee-main&doc=signature");
  assert.equal(currentDoc(state, PRESETS).filename, "Signature.jpg");
  assert.equal(state.clean, true, "signature defaults to clean");

  state.zoom = 3;
  state.panX = 0.5;
  state.docId = "photo";
  resetAdjust(state, PRESETS);
  assert.deepEqual([state.zoom, state.panX, state.panY, state.clean, state.threshold], [1, 0, 0, false, 170]);

  state.examId = CUSTOM_ID;
  state.custom.maxKb = "1";
  assert.equal(currentDoc(state, PRESETS), null);
});

test("clampZoom", () => {
  assert.equal(clampZoom(0.5), 1);
  assert.equal(clampZoom(2.5), 2.5);
  assert.equal(clampZoom(9), 4);
  assert.equal(clampZoom(NaN), 1);
});

test("panBy: dragging right pans left, clamped, no-op without slack", () => {
  const imgW = 4000;
  const imgH = 3000;
  const rect = cropRect(imgW, imgH, 200, 230, 1, 0, 0); // full height, slack in x only
  const view = { rect, imgW, imgH, cssW: 200, cssH: 230 };
  const a = panBy({ panX: 0, panY: 0 }, 10, 10, view);
  assert.ok(a.panX < 0);
  assert.equal(a.panY, 0, "no vertical slack at zoom 1");
  // Dragging by the whole slack (in CSS px) moves from centre to the edge.
  const slackCss = (imgW - rect.sw) / (rect.sw / view.cssW);
  assert.ok(Math.abs(panBy({ panX: 0, panY: 0 }, -slackCss / 2, 0, view).panX - 1) < 1e-9);
  assert.equal(panBy({ panX: 0, panY: 0 }, -1e6, 0, view).panX, 1);
  assert.equal(panBy({ panX: 0, panY: 0 }, 1e6, 0, view).panX, -1);
});

test("fitWithin", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 4000, height: 3000, scaled: false });
  assert.deepEqual(fitWithin(4096, 100), { width: 4096, height: 100, scaled: false });
  assert.deepEqual(fitWithin(8192, 6144), { width: 4096, height: 3072, scaled: true });
  assert.deepEqual(fitWithin(3000, 5000), { width: 2458, height: 4096, scaled: true });
});

test("previewSize keeps aspect, width-limited or height-limited", () => {
  assert.deepEqual(previewSize(140, 60, 350), { width: 350, height: 150 });
  assert.deepEqual(previewSize(200, 230, 800), { width: 365, height: 420 });
});

test("formatKb: one decimal, never shows a valid file outside its range", () => {
  assert.equal(formatKb(20480), "20.0");
  assert.equal(formatKb(20 * 1024 + 1023), "20.9");
  assert.equal(formatKb(10000, true), "10.0");
  // Every byte count byteRange allows for 20–50 KB displays within 20–50.
  for (const bytes of [20 * 1024, 50 * 1000]) {
    const kb = Number(formatKb(bytes));
    assert.ok(kb >= 20 && kb <= 50, `${bytes} -> ${kb}`);
  }
});

test("strings: every value is a string, a function, or a map of strings", () => {
  for (const [key, v] of Object.entries(STRINGS)) {
    const ok =
      typeof v === "string" ||
      typeof v === "function" ||
      (typeof v === "object" && Object.values(v).every((x) => typeof x === "string"));
    assert.ok(ok, key);
  }
  assert.equal(STRINGS.tagline, "Exact pixels. Exact KB. Your photo never leaves your device.");
});

/** Build a JPEG-shaped byte array from [marker, payloadLength] segments, then SOS. */
function jpegWith(segments) {
  const out = [0xff, 0xd8];
  for (const [marker, n] of segments) out.push(0xff, marker, (n + 2) >> 8, (n + 2) & 0xff, ...new Array(n).fill(0));
  out.push(0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9);
  return new Uint8Array(out);
}

test("hasMetadataSegment: APP0/DQT/space-padding COM is clean; APP1, APP13 or text COM is not", () => {
  // jpegWith fills payloads with zero bytes, so build COM segments by hand.
  const com = (text) => [...[0xff, 0xfe, (text.length + 2) >> 8, (text.length + 2) & 0xff], ...[...text].map((c) => c.charCodeAt(0))];
  const withCom = (text) =>
    new Uint8Array([0xff, 0xd8, ...jpegWith([[0xe0, 14]]).subarray(2, 20), ...com(text), 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
  assert.equal(hasMetadataSegment(withCom(" ".repeat(40))), false);
  assert.equal(hasMetadataSegment(withCom("Made on PhoneCam X-200")), true);
  assert.equal(hasMetadataSegment(jpegWith([[0xe0, 14], [0xdb, 67]])), false);
  assert.equal(hasMetadataSegment(jpegWith([[0xe0, 14], [0xe1, 30]])), true);
  assert.equal(hasMetadataSegment(jpegWith([[0xed, 30]])), true);
  // APP2 (ICC profile) is colour data, not location/camera data.
  assert.equal(hasMetadataSegment(jpegWith([[0xe0, 14], [0xe2, 30]])), false);
});

test("hasMetadataSegment: unparseable input is treated as not clean", () => {
  assert.equal(hasMetadataSegment(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), true);
  assert.equal(hasMetadataSegment(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
  assert.equal(hasMetadataSegment(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x00, 0x00])), true);
  assert.equal(hasMetadataSegment(null), true);
});

test("canUseServiceWorker: https or localhost only", () => {
  assert.equal(canUseServiceWorker({ protocol: "https:", hostname: "geekyasif786.github.io" }), true);
  assert.equal(canUseServiceWorker({ protocol: "http:", hostname: "localhost" }), true);
  assert.equal(canUseServiceWorker({ protocol: "http:", hostname: "127.0.0.1" }), true);
  assert.equal(canUseServiceWorker({ protocol: "http:", hostname: "[::1]" }), true);
  assert.equal(canUseServiceWorker({ protocol: "http:", hostname: "192.168.1.5" }), false);
  assert.equal(canUseServiceWorker({ protocol: "file:", hostname: "" }), false);
});
