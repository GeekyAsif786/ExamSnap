// SPDX-License-Identifier: AGPL-3.0-or-later
import { test as base, expect } from "@playwright/test";

/**
 * Report every securitypolicyviolation event (in any frame, across
 * navigations) from `context` into `sink`.
 */
async function watchCsp(context, sink) {
  await context.exposeBinding("__examsnapCspViolation", ({ frame }, detail) => sink.push(`${frame.url()} — ${detail}`));
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__examsnapCspViolation(`${e.violatedDirective} blocked ${e.blockedURI || "(inline)"} at ${e.sourceFile}:${e.lineNumber}`);
    });
  });
}

/**
 * Fixtures:
 * - every context (the default one and any made with `newContext`) fails the
 *   test on a Content-Security-Policy violation;
 * - `page` also fails on any uncaught page error or any request that leaves
 *   the dev server (blob:/data: are local);
 * - `newContext(options)` makes an extra, watched context with the project's
 *   baseURL; it is closed after the test.
 */
export const test = base.extend({
  cspViolations: [
    // Playwright requires a destructuring pattern here, even an empty one.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const violations = [];
      await use(violations);
      expect(violations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context, cspViolations }, use) => {
    await watchCsp(context, cspViolations);
    await use(context);
  },
  newContext: async ({ browser, baseURL, cspViolations }, use) => {
    const made = [];
    await use(async (options = {}) => {
      const context = await browser.newContext({ baseURL, ...options });
      await watchCsp(context, cspViolations);
      made.push(context);
      return context;
    });
    for (const c of made) await c.close().catch(() => {});
  },
  page: async ({ page, baseURL }, use) => {
    const problems = [];
    const origin = new URL(baseURL).origin;
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith(`${origin}/`) && !url.startsWith("blob:") && !url.startsWith("data:")) {
        problems.push(`external request: ${url}`);
      }
    });
    await use(page);
    expect(problems, "page errors / external requests").toEqual([]);
  },
});
export { expect };

/**
 * Wait until the app has finished starting on the current page: its
 * language module is loaded, the selects are built and the URL is synced
 * (the app then sets <html data-ready="1">). One-shot reads (evaluate,
 * textContent, getAttribute, count) are only safe after this.
 */
export async function waitReady(page) {
  await page.locator('html[data-ready="1"]').waitFor({ state: "attached" });
}

/** Navigate to an app page (relative to baseURL, or absolute) and wait until it is ready. */
export async function gotoReady(page, url) {
  const res = await page.goto(url);
  await waitReady(page);
  return res;
}

/** Reload an app page and wait until it is ready. */
export async function reloadReady(page) {
  await page.reload();
  await waitReady(page);
}

/** Open the app with the test hook enabled. */
export async function openApp(page, query = "") {
  // Relative to baseURL (the built site under BASE_PATH).
  await gotoReady(page, `./?test=1${query ? `&${query}` : ""}`);
  await page.waitForFunction(() => window.__examsnap);
}

export const IMAGE_TYPES = ["photo", "signature", "transparent-png", "exif-jpeg"];

/**
 * Generate a test image in the page (no binary fixtures) and pass it to the
 * app's loadFile. Runs inside the browser via page.evaluate, so it must be
 * self-contained.
 */
export async function generateAndLoad(type) {
  const toBlob = (canvas, mime, q) => new Promise((r) => canvas.toBlob(r, mime, q));
  const canvasOf = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });

  // xorshift32: fast, deterministic noise.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  async function photo() {
    // Noisy 4000×3000 "photo": smooth colour gradient plus heavy per-pixel noise.
    const w = 4000;
    const h = 3000;
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const n = (rand() - 0.5) * 90;
        d[i] = 120 + (x / w) * 100 + n;
        d[i + 1] = 90 + (y / h) * 110 + n;
        d[i + 2] = 160 - (x / w) * 60 + n;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new File([await toBlob(c, "image/jpeg", 0.9)], "photo.jpg", { type: "image/jpeg" });
  }

  async function signature() {
    // Sparse dark-blue strokes on slightly noisy off-white paper.
    const w = 1600;
    const h = 700;
    const c = canvasOf(w, h);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 12;
      d[i] = 236 + n;
      d[i + 1] = 231 + n;
      d[i + 2] = 218 + n;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = "#1c2340";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(260, 470);
    ctx.bezierCurveTo(380, 120, 520, 140, 520, 400);
    ctx.bezierCurveTo(540, 560, 700, 200, 820, 380);
    ctx.bezierCurveTo(900, 500, 1040, 240, 1180, 360);
    ctx.bezierCurveTo(1260, 420, 1340, 300, 1400, 330);
    ctx.moveTo(300, 540);
    ctx.lineTo(1300, 500);
    ctx.stroke();
    return new File([await toBlob(c, "image/jpeg", 0.92)], "signature.jpg", { type: "image/jpeg" });
  }

  async function transparentPng() {
    // Fully transparent background with an opaque dark disc in the centre.
    const c = canvasOf(600, 600);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#203040";
    ctx.beginPath();
    ctx.arc(300, 300, 140, 0, Math.PI * 2);
    ctx.fill();
    return new File([await toBlob(c, "image/png")], "transparent.png", { type: "image/png" });
  }

  async function exifJpeg() {
    // Stored 300×200 (landscape), red top-left quadrant, blue elsewhere, with
    // EXIF Orientation = 6 (rotate 90° clockwise to display). Displayed
    // correctly it is 200×300 with red in the top-right.
    const c = canvasOf(300, 200);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 150, 100);
    const jpeg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.95)).arrayBuffer());
    // APP1: "Exif\0\0" + big-endian TIFF header + IFD0 with one entry.
    const tiff = [
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM, 42, IFD0 at offset 8
      0x00, 0x01, // 1 entry
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation SHORT 1 = 6
      0x00, 0x00, 0x00, 0x00, // no next IFD
    ];
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const len = payload.length + 2;
    const app1 = [0xff, 0xe1, len >> 8, len & 0xff, ...payload];
    const out = new Uint8Array(jpeg.length + app1.length);
    out.set(jpeg.subarray(0, 2), 0);
    out.set(app1, 2);
    out.set(jpeg.subarray(2), 2 + app1.length);
    return new File([out], "rotated.jpg", { type: "image/jpeg" });
  }

  const make = { photo, signature, "transparent-png": transparentPng, "exif-jpeg": exifJpeg }[type];
  return window.__examsnap.loadFile(await make());
}

/** Generate an image of `type` in the page and load it through the app. */
export async function loadImage(page, type) {
  const ok = await page.evaluate(generateAndLoad, type);
  expect(ok, `loadFile(${type})`).toBe(true);
}

/**
 * The current result as { bytes: Buffer, decoded: {width, height}, corner: [r,g,b] }.
 * `corner` is the top-left pixel of the decoded output.
 */
export async function readResult(page) {
  const r = await page.evaluate(async () => {
    const res = window.__examsnap.state.result;
    if (!res) return null;
    const blob = new Blob([res.bytes], { type: "image/jpeg" });
    const bmp = await createImageBitmap(blob);
    const c = Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const corner = [...ctx.getImageData(1, 1, 1, 1).data.slice(0, 3)];
    let bin = "";
    for (let i = 0; i < res.bytes.length; i += 0x8000) bin += String.fromCharCode(...res.bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), decoded: { width: bmp.width, height: bmp.height }, corner, padded: res.padded };
  });
  if (!r) return null;
  return { bytes: Buffer.from(r.b64, "base64"), decoded: r.decoded, corner: r.corner, padded: r.padded };
}

/**
 * Walk JPEG segments up to SOS. Returns marker bytes in order, each
 * segment's payload, and the SOF frame size.
 * @param {Uint8Array} bytes
 */
export function jpegSegments(bytes) {
  const markers = [];
  const segments = []; // { marker, payload } for every segment before SOS
  let frame = null;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error(`expected marker at ${pos}`);
    const m = bytes[pos + 1];
    if (m === 0xff) {
      pos++; // fill byte
      continue;
    }
    markers.push(m);
    if (m === 0xda) break;
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    segments.push({ marker: m, payload: bytes.subarray(pos + 4, pos + 2 + len) });
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      frame = { height: (bytes[pos + 5] << 8) | bytes[pos + 6], width: (bytes[pos + 7] << 8) | bytes[pos + 8] };
    }
    pos += 2 + len;
  }
  return { markers, segments, frame };
}
