// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../src/generated/presets.js";
import { cropRect } from "../src/core/index.js";
import {
  CUSTOM_ID,
  canUseServiceWorker,
  isFramed,
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
  requestExamUrl,
  resetAdjust,
  selectionSearch,
  langSwitchSearch,
} from "../src/ui/state.js";
import { STRINGS } from "../src/ui/i18n/en.js";

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

test("parseCustom: bad KB range carries a reason for the UI and the core RangeError message", () => {
  const range = (minKb, maxKb) => parseCustom({ width: "200", height: "200", minKb, maxKb });
  assert.deepEqual(range("50", "20"), { ok: false, error: "range", reason: "order", message: "maxKb must be > minKb (got 50–20)" });
  assert.deepEqual(range("", "20"), { ok: false, error: "range", reason: "min", message: "minKb must be > 0 (got NaN)" });
  assert.equal(range("0", "20").reason, "min");
  assert.equal(range("-5", "20").reason, "min");
  assert.equal(range("20", "20").reason, "order");
  assert.equal(range("20", "").reason, "order");
  const narrow = range("10", "10.001");
  assert.equal(narrow.reason, "narrow");
  assert.match(narrow.message, /bytes wide/);
});

test("every KB-range reason has a string in each locale", async () => {
  const { STRINGS: HI } = await import("../src/ui/i18n/hi.js");
  for (const S of [STRINGS, HI]) {
    for (const key of ["customKbMin", "customKbOrder", "customKbNarrow"]) assert.equal(typeof S[key], "string", key);
  }
});

test("langSwitchSearch keeps only ?exam= and ?doc=", () => {
  assert.equal(langSwitchSearch(""), "");
  assert.equal(langSwitchSearch("?doc=signature"), "?doc=signature");
  assert.equal(langSwitchSearch("?test=1&exam=ssc&doc=photo&x=<y>"), "?exam=ssc&doc=photo");
  assert.equal(langSwitchSearch("?test=1"), "");
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

test("URL params: anything that isn't a known id is ignored", () => {
  const first = { examId: PRESETS[0].id, docId: PRESETS[0].documents[0].id };
  for (const exam of ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "__proto__", "constructor", "toString", "SSC", " ssc", "ssc/", "", "javascript:alert(1)"]) {
    assert.deepEqual(parseSelection(`?exam=${encodeURIComponent(exam)}`, PRESETS), first, JSON.stringify(exam));
  }
  for (const doc of ["<script>", "__proto__", "Photo", "signature "]) {
    assert.deepEqual(parseSelection(`?exam=ssc&doc=${encodeURIComponent(doc)}`, PRESETS), { examId: "ssc", docId: "photo" }, doc);
  }
  // Repeated params: the first wins and must still be valid.
  assert.deepEqual(parseSelection("?exam=nope&exam=ssc", PRESETS), first);
});

test("URL params: custom sizes are never read from the URL", () => {
  const state = createState(PRESETS, "?exam=custom&width=99999&height=<script>&minKb=-1&maxKb=1e9&w=1&h=1");
  assert.equal(state.examId, CUSTOM_ID);
  assert.deepEqual(state.custom, { width: "200", height: "230", minKb: "20", maxKb: "50" });
  // And typed values are validated by parseCustom (whole px in range, KB via byteRange).
  assert.equal(parseCustom({ width: "<script>", height: "100", minKb: "20", maxKb: "50" }).ok, false);
  assert.equal(parseCustom({ width: "1e3", height: "100", minKb: "20", maxKb: "50" }).ok, false);
  assert.equal(parseCustom({ width: "200", height: "200", minKb: "Infinity", maxKb: "Infinity" }).ok, false);
});

test("isFramed", () => {
  const win = {};
  win.self = win;
  win.top = win;
  assert.equal(isFramed(win), false);
  assert.equal(isFramed({ self: {}, top: {} }), true);
  const throwing = { self: {} };
  Object.defineProperty(throwing, "top", {
    get() {
      throw new Error("cross-origin");
    },
  });
  assert.equal(isFramed(throwing), true);
});

test("requestExamUrl: request-exam form, [Exam] title, no other data", () => {
  const url = new URL(requestExamUrl(null, STRINGS.requestSpecs));
  assert.equal(`${url.origin}${url.pathname}`, "https://github.com/GeekyAsif786/ExamSnap/issues/new");
  assert.deepEqual([...url.searchParams], [["template", "request-exam.yml"], ["title", "[Exam] "]]);
  assert.equal(requestExamUrl(null, STRINGS.requestSpecs), "https://github.com/GeekyAsif786/ExamSnap/issues/new?template=request-exam.yml&title=%5BExam%5D%20");
});

test("requestExamUrl: a custom doc adds only width, height and KB range to specs", () => {
  const r = parseCustom({ width: "300", height: "400", minKb: "12.5", maxKb: "40" });
  assert.equal(r.ok, true);
  const raw = requestExamUrl(r.doc, STRINGS.requestSpecs);
  const url = new URL(raw);
  assert.deepEqual([...url.searchParams.keys()], ["template", "title", "specs"]);
  assert.equal(url.searchParams.get("specs"), "Custom size I used in ExamSnap: 300 × 400 px, 12.5–40 KB");
  assert.equal(url.searchParams.get("specs"), STRINGS.requestSpecs(300, 400, 12.5, 40));
  // Spaces are %20 (not +) so GitHub shows them as typed; × and – are UTF-8 encoded.
  assert.match(raw, /&specs=Custom%20size%20I%20used%20in%20ExamSnap%3A%20300%20%C3%97%20400%20px%2C%2012\.5%E2%80%9340%20KB$/);
  // The filename and other doc fields never leak into the URL.
  assert.doesNotMatch(raw, /examsnap-300x400|photo|jpg/);
});
