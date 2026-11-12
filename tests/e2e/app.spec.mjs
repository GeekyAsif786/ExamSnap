// SPDX-License-Identifier: AGPL-3.0-or-later
import { crc32, deflateSync } from "node:zlib";
import { test, expect, openApp, loadImage, readResult } from "./helpers.mjs";

/** Minimal RGB PNG built in Node (no binary fixtures). */
function makePng(w, h, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set([r, g, b], y * (1 + w * 3) + 1 + x * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("deep link preselects exam and document and is kept in the URL", async ({ page }) => {
  await page.goto("/?exam=jee-main&doc=signature");
  await expect(page.locator("#exam")).toHaveValue("jee-main");
  await expect(page.locator("#doc")).toHaveValue("signature");
  await expect(page.locator("#chips")).toContainText("276 × 118 px");
  await expect(page.locator("#chips")).toContainText("10–30 KB");
  await expect(page.locator("#clean")).toBeHidden(); // adjust step waits for an image
  expect(new URL(page.url()).search).toBe("?exam=jee-main&doc=signature");
});

test("unknown ids fall back to the first preset silently", async ({ page }) => {
  await page.goto("/?exam=nope&doc=nope");
  await expect(page.locator("#exam")).toHaveValue("banking-ibps");
  await expect(page.locator("#doc")).toHaveValue("photo");
  expect(new URL(page.url()).search).toBe("?exam=banking-ibps&doc=photo");
  await expect(page.locator(".error:not(:empty)")).toHaveCount(0);
});

test("changing the selection updates the URL with replaceState", async ({ page }) => {
  await page.goto("/?exam=banking-ibps&doc=photo");
  const before = await page.evaluate(() => history.length);
  await page.locator("#exam").selectOption("ssc");
  await page.locator("#doc").selectOption("signature");
  expect(new URL(page.url()).search).toBe("?exam=ssc&doc=signature");
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test("exams are grouped by category, with Custom size last", async ({ page }) => {
  await page.goto("/");
  const groups = await page.locator("#exam optgroup").evaluateAll((gs) =>
    gs.map((g) => [g.label, [...g.querySelectorAll("option")].map((o) => o.value)]),
  );
  expect(groups).toEqual([
    ["Banking", ["banking-ibps"]],
    ["Entrance exams", ["jee-main"]],
    ["Government jobs", ["ssc", "upsc-cse"]],
  ]);
  await expect(page.locator("#exam > option")).toHaveText(["Custom size…"]);
});

test("secondary-source warning shows only for presets without an official notice", async ({ page }) => {
  await page.goto("/?exam=banking-ibps&doc=photo");
  await expect(page.locator("#warning")).toBeHidden();
  await page.locator("#exam").selectOption("jee-main");
  await expect(page.locator("#warning")).toBeVisible();
  await expect(page.locator("#warning")).toHaveText(
    "These specs come from secondary sources. Check the official notification before submitting.",
  );
});

test("sources list: safe new-tab links with type badges and last verified", async ({ page }) => {
  await page.goto("/?exam=jee-main&doc=photo");
  await page.getByText("Where these numbers come from").click();
  const links = page.locator("#source-list a");
  await expect(links).toHaveCount(3);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", "noopener noreferrer");
  }
  await expect(page.locator("#source-list .badge")).toHaveText(["Secondary", "Secondary", "Official site"]);
  await expect(page.locator("#verified")).toHaveText("Last verified: 2026-11-11");
  await page.locator("#exam").selectOption("banking-ibps");
  await expect(page.locator("#source-list .badge").first()).toHaveText("Official notice");
});

test("document and preset notes are shown as text", async ({ page }) => {
  await page.goto("/?exam=banking-ibps&doc=signature");
  await expect(page.locator("#notes p")).toHaveText([
    "Black ink on white paper. Signatures in CAPITAL LETTERS are not accepted.",
    /^Standard IBPS-style annex/,
  ]);
});

test("custom size with an invalid KB range shows the inline RangeError", async ({ page }) => {
  await openApp(page);
  await loadImage(page, "photo");
  await page.locator("#exam").selectOption("custom");
  await expect(page.locator("#doc-field")).toBeHidden();
  await expect(page.getByRole("button", { name: "Make my file" })).toBeEnabled();

  await page.getByLabel("Min KB").fill("50");
  await page.getByLabel("Max KB").fill("20");
  await expect(page.locator("#custom-error")).toHaveText("maxKb must be > minKb (got 50–20)");
  await expect(page.locator("#custom-error")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByLabel("Max KB")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Make my file" })).toBeDisabled();
  await expect(page.locator("#chips li")).toHaveCount(0);

  await page.getByLabel("Width (px)").fill("10");
  await expect(page.locator("#custom-error")).toHaveText("Width and height must be whole numbers between 50 and 4000 px.");

  await page.getByLabel("Width (px)").fill("300");
  await page.getByLabel("Max KB").fill("60");
  await expect(page.locator("#custom-error")).toHaveText("");
  await expect(page.locator("#chips")).toContainText("300 × 230 px");
  expect(new URL(page.url()).searchParams.get("exam")).toBe("custom");
});

test("custom size makes a file at the custom spec", async ({ page }) => {
  await openApp(page, "exam=custom");
  await loadImage(page, "photo");
  await page.getByLabel("Width (px)").fill("320");
  await page.getByLabel("Height (px)").fill("240");
  await page.getByLabel("Min KB").fill("15");
  await page.getByLabel("Max KB").fill("40");
  await page.getByRole("button", { name: "Make my file" }).click();
  await expect(page.locator("#result")).toBeVisible();
  const out = await readResult(page);
  expect(out.decoded).toEqual({ width: 320, height: 240 });
  await expect(page.locator("#download")).toHaveAttribute("download", "examsnap-320x240.jpg");
});

test("too-large shows its inline message and no result", async ({ page }) => {
  await openApp(page, "exam=custom");
  await loadImage(page, "photo");
  await page.getByLabel("Width (px)").fill("4000");
  await page.getByLabel("Height (px)").fill("3000");
  await page.getByLabel("Min KB").fill("1");
  await page.getByLabel("Max KB").fill("2");
  await page.getByRole("button", { name: "Make my file" }).click();
  await expect(page.locator("#make-msg")).toContainText("Even at the lowest quality the file is");
  await expect(page.locator("#make-msg")).toContainText("Try a tighter crop (zoom in) or turn on Clean background.");
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.getByRole("button", { name: "Make my file" })).toBeEnabled();
});

test("EXIF orientation is applied when decoding", async ({ page }) => {
  await openApp(page);
  await loadImage(page, "exif-jpeg");
  const px = await page.evaluate(() => {
    const b = window.__examsnap.state.bitmap;
    const c = Object.assign(document.createElement("canvas"), { width: b.width, height: b.height });
    const ctx = c.getContext("2d");
    ctx.drawImage(b, 0, 0);
    const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    return { w: b.width, h: b.height, topLeft: at(10, 10), topRight: at(b.width - 10, 10) };
  });
  // Stored 300×200 with red top-left; Orientation 6 rotates 90° clockwise.
  expect([px.w, px.h]).toEqual([200, 300]);
  const isRed = ([r, g, b]) => r > 200 && g < 60 && b < 60;
  const isBlue = ([r, g, b]) => b > 200 && r < 60 && g < 60;
  expect(isRed(px.topRight), `topRight ${px.topRight}`).toBe(true);
  expect(isBlue(px.topLeft), `topLeft ${px.topLeft}`).toBe(true);
});

test("images over 4096 px are downscaled once on load", async ({ page }) => {
  await openApp(page);
  const size = await page.evaluate(async () => {
    const c = Object.assign(document.createElement("canvas"), { width: 5000, height: 2500 });
    c.getContext("2d").fillRect(0, 0, 10, 10);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    await window.__examsnap.loadFile(new File([blob], "big.png", { type: "image/png" }));
    const b = window.__examsnap.state.bitmap;
    return [b.width, b.height];
  });
  expect(size).toEqual([4096, 2048]);
});

test("undecodable files show the HEIC hint inline", async ({ page }) => {
  await openApp(page);
  const ok = await page.evaluate(() =>
    window.__examsnap.loadFile(new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], "IMG_0001.HEIC", { type: "image/heic" })),
  );
  expect(ok).toBe(false);
  await expect(page.locator("#upload-msg")).toHaveText(
    "This browser couldn't read that image. If it's an iPhone HEIC photo, export it as JPG first.",
  );
  await expect(page.locator("#upload-msg")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#adjust")).toBeHidden();
});

test("the file input loads an image", async ({ page }) => {
  await openApp(page);
  const png = makePng(64, 48, [200, 40, 40]);
  await page.locator("#file").setInputFiles({ name: "tiny.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#upload-msg")).toHaveText("Loaded tiny.png (64 × 48 px).");
  await expect(page.locator("#adjust")).toBeVisible();
  await expect(page.getByRole("button", { name: "Make my file" })).toBeEnabled();
});

test("dropping a file on the drop zone loads it", async ({ page }) => {
  await openApp(page);
  const b64 = makePng(80, 60, [20, 120, 40]).toString("base64");
  await page.locator("#drop").evaluate((zone, data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
    zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);
  await expect(page.locator("#upload-msg")).toHaveText("Loaded dropped.png (80 × 60 px).");
});

test("pasting an image loads it", async ({ page }) => {
  await openApp(page);
  const b64 = makePng(30, 20, [20, 40, 160]).toString("base64");
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, b64);
  await expect(page.locator("#upload-msg")).toHaveText("Loaded pasted.png (30 × 20 px).");
});

test("clean background defaults per kind and shows the threshold only when on", async ({ page }) => {
  await openApp(page, "exam=banking-ibps&doc=photo");
  await loadImage(page, "signature");
  await expect(page.getByLabel("Clean background")).not.toBeChecked();
  await expect(page.locator("#threshold-field")).toBeHidden();
  await page.locator("#doc").selectOption("signature");
  await expect(page.getByLabel("Clean background")).toBeChecked();
  await expect(page.locator("#threshold-field")).toBeVisible();
  await expect(page.locator("#threshold")).toHaveValue("170");
  await page.locator("#doc").selectOption("thumb");
  await expect(page.getByLabel("Clean background")).toBeChecked();
  await page.getByLabel("Clean background").uncheck();
  await expect(page.locator("#threshold-field")).toBeHidden();
});

test("keyboard pans and zooms the focused preview; changing document resets", async ({ page }) => {
  await openApp(page, "exam=banking-ibps&doc=photo");
  await loadImage(page, "photo");
  const preview = page.locator("#preview");
  await preview.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  const s = await page.evaluate(() => {
    const { zoom, panX, panY } = window.__examsnap.state;
    return { zoom, panX, panY };
  });
  expect(s.zoom).toBeCloseTo(1.21, 5);
  expect(s.panX).toBeLessThan(0);
  expect(s.panY).toBeLessThan(0);
  expect(Number(await page.locator("#zoom").inputValue())).toBeCloseTo(1.21, 2);

  await page.locator("#doc").selectOption("signature");
  const r = await page.evaluate(() => {
    const { zoom, panX, panY } = window.__examsnap.state;
    return { zoom, panX, panY };
  });
  expect(r).toEqual({ zoom: 1, panX: 0, panY: 0 });
  await expect(page.locator("#zoom")).toHaveValue("1");
});

test("dragging the preview pans; the wheel zooms", async ({ page }) => {
  await openApp(page, "exam=banking-ibps&doc=photo");
  await loadImage(page, "photo");
  await page.locator("#preview").scrollIntoViewIfNeeded();
  const box = await page.locator("#preview").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__examsnap.state.panX)).toBeLessThan(0);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -200);
  await expect.poll(() => page.evaluate(() => window.__examsnap.state.zoom)).toBeGreaterThan(1);
});

test("preview is crisp on hi-DPI and at most 420 CSS px tall", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 }, baseURL });
  const page = await context.newPage();
  await openApp(page, "exam=upsc-cse&doc=photo");
  await loadImage(page, "photo");
  const m = await page.locator("#preview").evaluate((c) => ({
    w: c.width,
    h: c.height,
    cssW: c.getBoundingClientRect().width,
    cssH: c.getBoundingClientRect().height,
  }));
  expect(m.cssH).toBeLessThanOrEqual(420);
  expect(m.h).toBe(Math.round(m.cssH * 2));
  expect(m.cssW / m.cssH).toBeCloseTo(400 / 500, 2);
  await context.close();
});

test("making again revokes the previous object URL; padded note shows when padded", async ({ page }) => {
  await openApp(page, "exam=jee-main&doc=signature");
  await loadImage(page, "signature");
  const make = page.getByRole("button", { name: "Make my file" });
  await make.click();
  await expect(page.locator("#result")).toBeVisible();
  const first = await page.locator("#download").getAttribute("href");
  const out = await readResult(page);
  await expect(page.locator("#padded")).toBeVisible({ visible: out.padded });
  if (out.padded) {
    await expect(page.locator("#padded")).toHaveText("File padded up to the minimum size; the image itself is unchanged.");
  }

  await make.click();
  await expect(page.locator("#result")).toBeVisible();
  const second = await page.locator("#download").getAttribute("href");
  expect(second).not.toBe(first);
  const firstAlive = await page.evaluate(async (url) => {
    try {
      await (await fetch(url)).arrayBuffer();
      return true;
    } catch {
      return false;
    }
  }, first);
  expect(firstAlive).toBe(false);
});

test("adjusting after making clears the stale result", async ({ page }) => {
  await openApp(page, "exam=ssc&doc=photo");
  await loadImage(page, "photo");
  await page.getByRole("button", { name: "Make my file" }).click();
  await expect(page.locator("#result")).toBeVisible();
  await page.locator("#zoom").fill("2");
  await expect(page.locator("#result")).toBeHidden();
});

test("result is announced and the download link saves the file", async ({ page }) => {
  await openApp(page, "exam=ssc&doc=signature");
  await loadImage(page, "signature");
  await page.getByRole("button", { name: "Make my file" }).click();
  await expect(page.locator("#result-status")).toHaveText(/^Your file is ready: signature\.jpg, \d+\.\d KB\.$/);
  await expect(page.locator("#result-status")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#checklist")).toContainText("Location & camera data removed");
  await expect(page.locator("#checklist")).toContainText(/\d+\.\d KB \(allowed 10–20 KB\)/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
  expect(download.suggestedFilename()).toBe("signature.jpg");
});

test("no hard-coded text: every data-s key resolves to a string", async ({ page }) => {
  await page.goto("/");
  const empty = await page.locator("[data-s]").evaluateAll((ns) => ns.filter((n) => !n.textContent.trim()).map((n) => n.dataset.s));
  expect(empty).toEqual([]);
  await expect(page).toHaveTitle("ExamSnap — exam photo & signature resizer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ExamSnap");
  await expect(page.locator(".tagline")).toHaveText("Exact pixels. Exact KB. Your photo never leaves your device.");
});

test("the test hook is absent without ?test=1", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#exam")).toHaveValue("banking-ibps");
  expect(await page.evaluate(() => "__examsnap" in window)).toBe(false);
});

test("works at 360 px wide without horizontal scrolling", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, baseURL });
  const page = await context.newPage();
  await openApp(page, "exam=banking-ibps&doc=declaration");
  await loadImage(page, "photo");
  await page.getByRole("button", { name: "Make my file" }).click();
  await expect(page.locator("#result")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const sel of ["#exam", "#doc", "#make", "#download", "label[for=file]"]) {
    const box = await page.locator(sel).boundingBox();
    expect(box.height, sel).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});
