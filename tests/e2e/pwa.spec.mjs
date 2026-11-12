// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline use and the update flow, against built sites.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../../scripts/build.mjs";
import { createDevServer } from "../../scripts/serve.mjs";
import { STRINGS as S } from "../../src/ui/strings.js";
import { test, expect, openApp, loadImage, readResult } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BASE = "/ExamSnap/";

/** Wait until a service worker controls the page and has finished precaching. */
async function waitForControl(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test("offline: reload, make a photo, and open an exam page", async ({ page, context }) => {
  await openApp(page, "exam=jee-main&doc=photo");
  await waitForControl(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");

  await context.setOffline(true);
  try {
    await page.reload();
    await page.waitForFunction(() => window.__examsnap);
    await expect(page.locator("#exam")).toHaveValue("jee-main");
    await loadImage(page, "photo");
    await page.getByRole("button", { name: "Make my file" }).click();
    await expect(page.locator("#result")).toBeVisible();
    const out = await readResult(page);
    expect(out.decoded).toEqual({ width: 276, height: 354 });

    await page.goto("./ssc/");
    await expect(page.locator("h1")).toHaveText(S.landingHeading("SSC — CGL / CHSL / MTS / GD / CPO"));
    await expect(page.locator("#exam")).toHaveValue("ssc");
    await expect(page.locator(".spec-table tbody tr")).toHaveCount(2);
  } finally {
    await context.setOffline(false);
  }
});

/** Copy the source tree needed by build() into a temp dir. */
async function copySource(dest) {
  for (const p of ["index.html", "favicon.svg", "icons", "src"]) {
    await cp(join(ROOT, p), join(dest, p), { recursive: true });
  }
}

test("update: a new build shows the banner, and Reload activates it once", async ({ browser }) => {
  const site = await mkdtemp(join(tmpdir(), "examsnap-site-"));
  const src2 = await mkdtemp(join(tmpdir(), "examsnap-src-"));
  const server = createDevServer({ root: site, base: BASE, notFound: "404.html" });
  try {
    await build({ outDir: site, base: BASE });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}${BASE}`;

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}?test=1`);
    await waitForControl(page);
    const cssV1 = await page.locator('link[rel="stylesheet"]').getAttribute("href");
    const cacheV1 = await page.evaluate(() => caches.keys());
    expect(cacheV1).toHaveLength(1);
    // Mid-task state that a surprise reload would lose.
    await page.evaluate(() => (window.__marker = "still here"));
    await expect(page.locator("#update")).toBeHidden();

    // Version 2: same app, different stylesheet.
    await copySource(src2);
    const css = join(src2, "src/ui/styles.css");
    await writeFile(css, `${await readFile(css, "utf8")}\n/* v2 */\n`);
    await build({ root: src2, outDir: site, base: BASE });

    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.locator("#update")).toBeVisible();
    await expect(page.locator("#update")).toContainText(S.updateAvailable);
    // The new worker waits; nothing reloads by itself.
    expect(await page.evaluate(() => window.__marker)).toBe("still here");

    let loads = 0;
    page.on("load", () => loads++);
    await page.getByRole("button", { name: S.updateReload }).click();
    await page.waitForFunction(() => window.__marker === undefined && window.__examsnap);
    const cssV2 = await page.locator('link[rel="stylesheet"]').getAttribute("href");
    expect(cssV2).not.toBe(cssV1);
    expect(cssV2).toMatch(/^src\/ui\/styles\.[0-9a-f]{8}\.css$/);
    await expect(page.locator("#update")).toBeHidden();
    // Exactly one reload, and the old cache is gone.
    await page.waitForTimeout(500);
    expect(loads).toBe(1);
    const cacheV2 = await page.evaluate(() => caches.keys());
    expect(cacheV2).toHaveLength(1);
    expect(cacheV2[0]).not.toBe(cacheV1[0]);
    expect(errors).toEqual([]);
    await context.close();
  } finally {
    await new Promise((r) => server.close(r));
    await rm(site, { recursive: true, force: true });
    await rm(src2, { recursive: true, force: true });
  }
});
