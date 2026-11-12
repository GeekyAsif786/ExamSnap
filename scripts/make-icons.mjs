// SPDX-License-Identifier: AGPL-3.0-or-later
// Render app icons and the Open Graph image from favicon.svg with Playwright.
// Run manually (npm run icons); the PNGs in icons/ are committed.
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { STRINGS } from "../src/ui/strings.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "icons");
// Same colours as src/ui/styles.css (light theme).
const ACCENT = "#1d4ed8";
const BG = "#f6f6f3";
const TEXT = "#1b1c1f";
const MUTED = "#55585f";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';

const svg = (await readFile(join(ROOT, "favicon.svg"), "utf8")).replace(/<!--[\s\S]*?-->\s*/g, "");
const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Page that shows the favicon at `scale` of a size×size square, on `bg` (or transparent). */
const iconPage = (size, scale, bg) => `<!doctype html><html><head><style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${bg ?? "transparent"}; }
  body { display: grid; place-items: center; }
  img { width: ${size * scale}px; height: ${size * scale}px; display: block; }
</style></head><body><img src="${svgUrl}" alt=""></body></html>`;

const ogPage = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1200px; height: 630px; background: ${BG}; font-family: ${FONT}; }
  body { display: flex; flex-direction: column; justify-content: center; padding: 0 96px; box-sizing: border-box; gap: 28px; }
  .row { display: flex; align-items: center; gap: 32px; }
  img { width: 140px; height: 140px; }
  h1 { margin: 0; font-size: 108px; line-height: 1; letter-spacing: -0.02em; color: ${TEXT}; }
  p { margin: 0; font-size: 46px; line-height: 1.3; color: ${MUTED}; max-width: 1000px; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; background: ${ACCENT}; }
</style></head><body>
  <div class="row"><img src="${svgUrl}" alt=""><h1>${esc(STRINGS.appName)}</h1></div>
  <p>${esc(STRINGS.tagline)}</p>
  <div class="bar"></div>
</body></html>`;

// name, size, scale of the favicon, background (null = transparent)
const ICONS = [
  ["icon-192.png", 192, 1, null],
  ["icon-512.png", 512, 1, null],
  // Maskable: full-bleed background, artwork inside the central 80% safe zone.
  ["icon-512-maskable.png", 512, 0.66, ACCENT],
  // iOS adds its own rounding and ignores transparency, so fill the square.
  ["apple-touch-icon.png", 180, 0.86, ACCENT],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, size, scale, bg] of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(iconPage(size, scale, bg));
    await page.screenshot({ path: join(OUT, name), omitBackground: bg === null });
    await page.close();
    console.log(`wrote icons/${name}`);
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(ogPage);
  await page.screenshot({ path: join(OUT, "og-image.png") });
  console.log("wrote icons/og-image.png");
} finally {
  await browser.close();
}
