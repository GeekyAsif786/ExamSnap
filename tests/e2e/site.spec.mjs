// SPDX-License-Identifier: AGPL-3.0-or-later
// The built site: landing pages, crawlable links/assets, sitemap, robots, 404.
import { PRESETS } from "../../src/generated/presets.js";
import { STRINGS as S } from "../../src/ui/strings.js";
import { CSP, DEFAULT_ORIGIN, docSummary, pageDescription, pageTitle, siteUrl } from "../../scripts/build-lib.mjs";
import { test, expect } from "./helpers.mjs";

// The site's base path in this project ("/" or "/ExamSnap/").
const base = () => new URL(test.info().project.use.baseURL).pathname;
const live = (path = "") => siteUrl(DEFAULT_ORIGIN, base(), path);
const hasNotice = (p) => p.sources.some((s) => s.type === "notice");

test.describe("landing pages", () => {
  for (const preset of PRESETS) {
    test(`${preset.id}: preselected, title, canonical, h1, spec table, meta`, async ({ page }) => {
      await page.goto(`./${preset.id}/`);
      await expect(page.locator("#exam")).toHaveValue(preset.id);
      await expect(page.locator("#doc")).toHaveValue(preset.documents[0].id);
      // The page's own exam is implied by the path, so only doc is in the URL.
      expect(new URL(page.url()).search).toBe(`?doc=${preset.documents[0].id}`);
      await expect(page.locator("body")).toHaveAttribute("data-exam", preset.id);

      const title = pageTitle(preset, S);
      expect(title.length).toBeLessThanOrEqual(65);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", live(`${preset.id}/`));
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", pageDescription(preset, S));
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", live(`${preset.id}/`));
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`^${live("icons/og-image.")}[0-9a-f]{8}\\.png$`));
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(S.landingHeading(preset.name));

      // Spec table matches the preset JSON row for row.
      const rows = await page.locator(".spec-table tbody tr").evaluateAll((trs) =>
        trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())),
      );
      expect(rows).toEqual(
        preset.documents.map((d) => [
          d.label,
          S.chipPixels(d.width, d.height),
          S.chipKb(d.min_kb, d.max_kb),
          d.notes ?? S.emptyCell,
        ]),
      );
      await expect(page.locator(".intro .warning")).toHaveCount(hasNotice(preset) ? 0 : 1);

      // Above the tool: h1, one summary line, the warning. Table below the tool, above sources.
      await expect(page.locator(".intro .summary")).toHaveText(docSummary(preset, S));
      await expect(page.locator(".intro table")).toHaveCount(0);
      const order = await page.evaluate(() => {
        const at = (sel) => document.querySelector(sel).getBoundingClientRect().top;
        return [at("#h-make"), at(".page-specs"), at(".page-sources")];
      });
      expect(order[0]).toBeLessThan(order[1]);
      expect(order[1]).toBeLessThan(order[2]);

      // Sources below the tool, with badges and last verified.
      await expect(page.locator(".page-sources li a")).toHaveCount(preset.sources.length);
      await expect(page.locator(".page-sources .badge")).toHaveText(preset.sources.map((s) => S.sourceType[s.type]));
      await expect(page.locator(".page-sources")).toContainText(S.lastVerified(preset.last_verified));
      if (preset.notes) await expect(page.locator(".page-sources")).toContainText(preset.notes);

      // JSON-LD: one WebApplication, nothing else.
      const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(ld).toHaveLength(1);
      const data = JSON.parse(ld[0]);
      expect(data).toMatchObject({
        "@type": "WebApplication",
        name: "ExamSnap",
        url: live(`${preset.id}/`),
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      });
      expect(JSON.stringify(ld)).not.toMatch(/FAQPage|HowTo|Review/);
    });
  }

  test("on a 390×844 phone the tool starts on the first screen; the warning appears once", async ({ newContext }) => {
    const context = await newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    for (const preset of PRESETS) {
      await page.goto(`./${preset.id}/`);
      const top = await page.getByText("Choose a photo").evaluate((n) => n.getBoundingClientRect().top);
      expect(top, preset.id).toBeLessThan(844);
      // Exactly one warning element per page; visible only without an official notice.
      const warnings = page.locator(".warning", { hasText: S.secondaryWarning });
      await expect(warnings, preset.id).toHaveCount(1);
      await expect(warnings.first(), preset.id).toBeVisible({ visible: !hasNotice(preset) });
      // Switching to another exam on the page never adds a second copy.
      await page.locator("#exam").selectOption(PRESETS.find((p) => p.id !== preset.id && !hasNotice(p)).id);
      await expect(warnings, preset.id).toHaveCount(1);
    }
    await context.close();
  });

  test("landing pages fit 360 px without horizontal scrolling", async ({ newContext }) => {
    const context = await newContext({ viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    for (const preset of PRESETS) {
      await page.goto(`./${preset.id}/`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, preset.id).toBeLessThanOrEqual(0);
      // Each document is a labelled card; notes are readable without scrolling the table.
      const wrap = await page.locator(".table-wrap").evaluate((w) => w.scrollWidth - w.clientWidth);
      expect(wrap, preset.id).toBeLessThanOrEqual(0);
    }
    await context.close();
  });

  test("?exam= and ?doc= override a landing page's exam", async ({ page }) => {
    await page.goto("./ssc/?exam=jee-main&doc=signature");
    await expect(page.locator("#exam")).toHaveValue("jee-main");
    await expect(page.locator("#doc")).toHaveValue("signature");
    await page.goto("./ssc/?doc=signature");
    await expect(page.locator("#exam")).toHaveValue("ssc");
    await expect(page.locator("#doc")).toHaveValue("signature");
  });

  test("root page: generic meta and a link to every exam page", async ({ page }) => {
    await page.goto("./");
    await expect(page).toHaveTitle(S.docTitle);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", live());
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", S.rootDescription);
    await expect(page.locator("body")).not.toHaveAttribute("data-exam", /.*/);
    const links = await page.locator(".exam-links a").evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.textContent]));
    expect(links).toEqual(PRESETS.map((p) => [`${p.id}/`, p.name]));
    await page.locator(".exam-links a", { hasText: PRESETS[1].name }).click();
    await expect(page.locator("#exam")).toHaveValue(PRESETS[1].id);
  });

  test("text is in the HTML before any script runs", async ({ request }) => {
    const html = await (await request.get("./ssc/")).text();
    expect(html).toContain(">Exact pixels. Exact KB. Your photo never leaves your device.<");
    expect(html).toContain(">Make my file<");
  });
});

/** href/src URLs (and canonical/og:image mapped to the local server) in an HTML page. */
function htmlRefs(html) {
  const refs = [...html.matchAll(/\b(?:href|src|data-sw)="([^"]+)"/g)].map((m) => m[1]);
  const metas = [...html.matchAll(/<meta property="og:(?:image|url)" content="([^"]+)"/g)].map((m) => m[1]);
  return [...refs, ...metas].map((r) => r.replaceAll("&amp;", "&"));
}

test("every internal link and asset returns 200 under BASE_PATH (crawl from the root)", async ({ request, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const liveBase = live();
  const toLocal = (abs) => (abs.startsWith(liveBase) ? `${origin}${base()}${abs.slice(liveBase.length)}` : abs);
  const seen = new Map(); // url -> status
  const queue = [new URL("./", baseURL).href];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    const res = await request.get(url);
    seen.set(url, res.status());
    if (res.status() !== 200) continue;
    const type = res.headers()["content-type"] ?? "";
    const body = await res.text();
    let refs = [];
    if (type.startsWith("text/html")) refs = htmlRefs(body);
    else if (type.startsWith("text/javascript")) refs = [...body.matchAll(/\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]);
    else if (type.startsWith("application/manifest+json")) refs = [JSON.parse(body).start_url, ...JSON.parse(body).icons.map((i) => i.src)];
    for (const ref of refs) {
      const abs = toLocal(new URL(toLocal(ref), url).href.split("#")[0]);
      if (abs.startsWith(`${origin}/`)) queue.push(abs);
    }
  }
  const bad = [...seen].filter(([, status]) => status !== 200);
  expect(bad).toEqual([]);
  // Sanity: the crawl reached every exam page, the app module and the stylesheet.
  const urls = [...seen.keys()];
  for (const p of PRESETS) expect(urls).toContain(`${origin}${base()}${p.id}/`);
  expect(urls.some((u) => /\/src\/ui\/app\.[0-9a-f]{8}\.js$/.test(u))).toBe(true);
  expect(urls.some((u) => /\/src\/core\/jpeg\.[0-9a-f]{8}\.js$/.test(u))).toBe(true);
  expect(urls.some((u) => /\/src\/ui\/styles\.[0-9a-f]{8}\.css$/.test(u))).toBe(true);
  expect(urls).toContain(`${origin}${base()}sw.js`);
  expect(urls).toContain(`${origin}${base()}manifest.webmanifest`);
  expect(urls.some((u) => /\/icons\/icon-512-maskable\.[0-9a-f]{8}\.png$/.test(u))).toBe(true);
  expect(urls.every((u) => u.startsWith(`${origin}${base()}`))).toBe(true);
});

test("sitemap lists the root and one URL per preset; robots points to it", async ({ request }) => {
  const xml = await (await request.get("./sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual([live(), ...PRESETS.map((p) => live(`${p.id}/`))]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  expect(lastmods.slice(1)).toEqual(PRESETS.map((p) => p.last_verified));
  const robots = await (await request.get("./robots.txt")).text();
  expect(robots).toContain("User-agent: *\nAllow: /");
  expect(robots).toContain(`Sitemap: ${live("sitemap.xml")}`);
});

test("unknown paths get 404.html with status 404, and its assets load", async ({ page, request, baseURL }) => {
  const res = await request.get("./no/such/page/");
  expect(res.status()).toBe(404);
  const html = await res.text();
  expect(html).toContain(S.notFoundHeading);
  for (const ref of htmlRefs(html)) {
    expect((await request.get(new URL(ref, baseURL).href)).status(), ref).toBe(200);
  }
  await page.goto("./no/such/page/");
  await expect(page.locator("h1")).toHaveText(S.notFoundHeading);
  await page.getByRole("link", { name: S.notFoundHome }).click();
  await expect(page).toHaveURL(new RegExp(`${base()}(\\?.*)?$`));
  await expect(page.locator("#exam")).toBeVisible();
});

test("every page carries the exact CSP and no-referrer meta tags", async ({ request }) => {
  const paths = ["./", ...PRESETS.map((p) => `./${p.id}/`), "./404.html"];
  for (const path of paths) {
    const html = await (await request.get(path)).text();
    const csp = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)].map((m) => m[1]);
    expect(csp, path).toEqual([CSP]);
    expect(html, path).toContain('<meta name="referrer" content="no-referrer">');
  }
  expect(CSP).toBe(
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
  );
});

test("a CSP violation is reported (the e2e watcher itself works)", async ({ page, cspViolations }) => {
  await page.goto("./");
  // Blocked by connect-src 'self'. Drain the list so this test still passes.
  await page.evaluate(() => fetch("blob:nope").catch(() => {}));
  await expect.poll(() => cspViolations.length).toBeGreaterThan(0);
  expect(cspViolations.join("\n")).toMatch(/connect-src/);
  cspViolations.length = 0;
});
