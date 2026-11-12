// SPDX-License-Identifier: AGPL-3.0-or-later
// Full-page review screenshots: {empty, adjust, result} × {desktop 1280,
// mobile 390} × {light, dark} -> docs/screenshots/. Run: npm run screenshots
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createDevServer } from "./serve.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "docs", "screenshots");
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };
const SCHEMES = ["light", "dark"];

/** A synthetic head-and-shoulders portrait, drawn in the page. */
async function loadPortrait() {
  const c = Object.assign(document.createElement("canvas"), { width: 1800, height: 2400 });
  const ctx = c.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 0, 2400);
  bg.addColorStop(0, "#e9eef5");
  bg.addColorStop(1, "#cfd8e3");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1800, 2400);
  ctx.fillStyle = "#2f3e56"; // shoulders
  ctx.beginPath();
  ctx.ellipse(900, 2400, 820, 620, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#c68e6a"; // neck
  ctx.fillRect(780, 1500, 240, 320);
  ctx.beginPath(); // face
  ctx.ellipse(900, 1150, 380, 480, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b211c"; // hair
  ctx.beginPath();
  ctx.ellipse(900, 880, 410, 300, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#2b211c"; // eyes
  for (const x of [760, 1040]) {
    ctx.beginPath();
    ctx.ellipse(x, 1120, 38, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#8a4d3c";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(900, 1300, 120, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  return window.__examsnap.loadFile(new File([blob], "portrait.jpg", { type: "image/jpeg" }));
}

const server = createDevServer({ root: ROOT });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const colorScheme of SCHEMES) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        deviceScaleFactor: vpName === "mobile" ? 2 : 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const shot = async (state) => {
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const path = join(OUT, `${state}-${vpName}-${colorScheme}.png`);
        await page.screenshot({ path, fullPage: true });
        console.log(`wrote docs/screenshots/${state}-${vpName}-${colorScheme}.png`);
      };

      await page.goto(`${base}/?test=1&exam=jee-main&doc=photo`);
      await page.waitForFunction(() => window.__examsnap);
      await shot("empty");

      await page.evaluate(loadPortrait);
      await page.locator("#zoom").fill("1.3");
      await page.locator("#zoom").blur();
      await shot("adjust");

      await page.locator("#make").click();
      await page.locator("#result").waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot("result");
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
