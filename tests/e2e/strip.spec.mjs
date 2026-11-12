// SPDX-License-Identifier: AGPL-3.0-or-later
// Engine-independent test of the metadata-stripping path: wrap
// HTMLCanvasElement.prototype.toBlob before the app runs so every JPEG it
// returns carries extra segments, whatever the engine's encoder writes.
import { byteRange } from "../../src/core/index.js";
import { PRESETS } from "../../src/generated/presets.js";
import { test, expect, openApp, loadImage, readResult, jpegSegments } from "./helpers.mjs";

/** Runs in the page before any app code. `mode` is "after-app0" or "no-app0". */
function injectSegments(mode) {
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  const segment = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
  // Exif with IFD0 Make = "Cam" (no Orientation, so decoding is unaffected).
  const exif = segment(0xe1, [
    ...ascii("Exif"), 0, 0,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x0f, 0x00, 0x02, 0x00, 0x00, 0x00, 0x04, ...ascii("Cam"), 0,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const xmp = segment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii('<x:xmpmeta xmlns:x="adobe:ns:meta/">GPS 28.61N 77.21E</x:xmpmeta>')]);
  const iptc = segment(0xed, [...ascii("Photoshop 3.0"), 0, ...ascii("8BIM"), 0x04, 0x04, 0, 0, 0, 0, 0, 0]);
  const com = segment(0xfe, ascii("injected by test"));

  const inject = (bytes) => {
    let head = bytes.subarray(0, 2);
    let rest = bytes.subarray(2);
    const hasApp0 = bytes[2] === 0xff && bytes[3] === 0xe0;
    let extra;
    if (mode === "after-app0") {
      if (hasApp0) {
        const end = 4 + ((bytes[4] << 8) | bytes[5]);
        head = bytes.subarray(0, end);
        rest = bytes.subarray(end);
      }
      extra = [...exif, ...xmp, ...iptc, ...com];
    } else {
      if (hasApp0) rest = bytes.subarray(4 + ((bytes[4] << 8) | bytes[5]));
      extra = [...exif, ...iptc];
    }
    const out = new Uint8Array(head.length + extra.length + rest.length);
    out.set(head, 0);
    out.set(extra, head.length);
    out.set(rest, head.length + extra.length);
    return out;
  };

  window.__injected = 0;
  const original = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    original.call(
      this,
      (blob) => {
        if (!blob || type !== "image/jpeg") return callback(blob);
        blob.arrayBuffer().then((buf) => {
          window.__injected++;
          callback(new Blob([inject(new Uint8Array(buf))], { type: "image/jpeg" }));
        });
      },
      type,
      quality,
    );
  };
}

const CASES = [
  ["ssc", "photo", "photo"],
  ["jee-main", "signature", "signature"],
];

for (const mode of ["after-app0", "no-app0"]) {
  for (const [examId, docId, image] of CASES) {
    test(`stripping: ${mode} injection, ${examId} / ${docId}`, async ({ page }) => {
      await page.addInitScript(injectSegments, mode);
      await openApp(page, `exam=${examId}&doc=${docId}`);
      await loadImage(page, image);
      const before = await page.evaluate(() => window.__injected);
      await page.getByRole("button", { name: "Make my file" }).click();
      await expect(page.locator("#result")).toBeVisible();
      // The wrapper really was in the encode path.
      expect(await page.evaluate(() => window.__injected)).toBeGreaterThan(before);

      const doc = PRESETS.find((p) => p.id === examId).documents.find((d) => d.id === docId);
      const { minBytes, maxBytes } = byteRange(doc.min_kb, doc.max_kb);
      const out = await readResult(page);
      const { markers, frame } = jpegSegments(out.bytes);
      expect(markers).not.toContain(0xe1);
      expect(markers).not.toContain(0xed);
      expect([...out.bytes.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
      expect(out.bytes.subarray(6, 11).toString("latin1")).toBe("JFIF\0");
      expect(out.decoded).toEqual({ width: doc.width, height: doc.height });
      expect(frame).toEqual({ width: doc.width, height: doc.height });
      expect(out.bytes.length).toBeGreaterThanOrEqual(minBytes);
      expect(out.bytes.length).toBeLessThanOrEqual(maxBytes);
      if (mode === "after-app0") expect(markers).toContain(0xfe); // the injected COM survives
      await expect(page.locator("#checklist li.pass", { hasText: "Location & camera data removed" })).toBeVisible();
      await expect(page.locator("#checklist li.fail")).toHaveCount(0);
    });
  }
}
