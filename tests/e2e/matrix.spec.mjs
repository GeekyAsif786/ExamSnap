// SPDX-License-Identifier: AGPL-3.0-or-later
// Every preset × document × image type, on every engine: the downloaded
// file must be an exact-size, in-range, metadata-free JFIF JPEG.
import { PRESETS } from "../../src/generated/presets.js";
import { byteRange } from "../../src/core/index.js";
import { test, expect, openApp, loadImage, readResult, jpegSegments, IMAGE_TYPES } from "./helpers.mjs";

for (const preset of PRESETS) {
  for (const doc of preset.documents) {
    for (const type of IMAGE_TYPES) {
      test(`${preset.id} / ${doc.id} × ${type}`, async ({ page }) => {
        await openApp(page, `exam=${preset.id}&doc=${doc.id}`);
        await loadImage(page, type);
        await page.getByRole("button", { name: "Make my file" }).click();
        await expect(page.locator("#result")).toBeVisible();

        const out = await readResult(page);
        const { minBytes, maxBytes } = byteRange(doc.min_kb, doc.max_kb);

        // Decodes, at exactly the document's size.
        expect(out.decoded).toEqual({ width: doc.width, height: doc.height });
        // Size within the byte range.
        expect(out.bytes.length).toBeGreaterThanOrEqual(minBytes);
        expect(out.bytes.length).toBeLessThanOrEqual(maxBytes);
        // FF D8 FF E0 then "JFIF" at offset 6.
        expect([...out.bytes.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
        expect(out.bytes.subarray(6, 10).toString("latin1")).toBe("JFIF");
        // No APP1 (Exif/XMP) anywhere in the header; SOF agrees on size.
        const { markers, frame } = jpegSegments(out.bytes);
        expect(markers).not.toContain(0xe1);
        expect(markers.at(-1)).toBe(0xda);
        expect(frame).toEqual({ width: doc.width, height: doc.height });

        if (type === "transparent-png") {
          // Transparent corners must come out white, not black.
          for (const c of out.corner) expect(c).toBeGreaterThan(235);
        }

        // Every checklist item passes and the link downloads the right name.
        await expect(page.locator("#checklist li.fail")).toHaveCount(0);
        await expect(page.locator("#checklist li.pass")).toHaveCount(4);
        await expect(page.locator("#download")).toHaveAttribute("download", doc.filename);
      });
    }
  }
}
