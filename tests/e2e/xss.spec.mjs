// SPDX-License-Identifier: AGPL-3.0-or-later
// A preset whose name, notes, labels and source title carry HTML/script
// payloads must render as inert text in the generated landing page and in
// the live app: no extra elements, no dialog, no console error.
import { createDevServer } from "../../scripts/serve.mjs";
import { buildXssSite, PAYLOADS } from "../support/xss-site.mjs";
import { test, expect } from "./helpers.mjs";

const base = () => new URL(test.info().project.use.baseURL).pathname;

/** Elements and handlers the payloads would create if they were parsed. */
const inertness = () =>
  ({
    imgs: [...document.querySelectorAll("img")].map((i) => i.id),
    scripts: [...document.scripts].map((s) => s.type || "classic"),
    handlers: [...document.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].filter((a) => a.name.startsWith("on")).map((a) => `${el.tagName}[${a.name}]`),
    ),
  });

test("XSS fixture renders as inert text: landing page, then the live app", async ({ newContext }) => {
  const { outDir, cleanup } = await buildXssSite({ base: base() });
  const server = createDevServer({ root: outDir, base: base(), notFound: "404.html" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const site = `http://127.0.0.1:${server.address().port}${base()}`;
  try {
    const context = await newContext();
    const page = await context.newPage();
    const dialogs = [];
    const errors = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      d.dismiss();
    });
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    // Generated landing page.
    await page.goto(`${site}xss-test/?test=1`);
    await page.waitForFunction(() => window.__examsnap);
    const expectInert = async () =>
      expect(await page.evaluate(inertness)).toEqual({
        imgs: ["result-img"],
        scripts: ["module", "application/ld+json"],
        handlers: [],
      });
    await expectInert();
    for (const p of PAYLOADS) {
      await expect(page.locator("h1")).toContainText(p);
      await expect(page.locator(".page-sources")).toContainText(p);
      await expect(page.locator(".spec-table tbody tr").first()).toContainText(p);
    }
    expect(await page.title()).toContain("<script>alert(1)</script>");
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    for (const p of PAYLOADS) expect(ld.description).toContain(p);
    await expect(page.locator(".page-sources a")).toHaveAttribute("href", "https://example.org/notice?a=1&b=2");

    // Live app on the same page: selects, notes, chips, sources (rendered by JS).
    await expect(page.locator("#exam option:checked")).toContainText("<script>alert(1)</script>");
    await expect(page.locator("#doc option:checked")).toContainText('"><img src=x onerror=alert(1)>');
    await expect(page.locator("#notes")).toContainText("</script>");
    await page.getByText("Where these numbers come from").first().click();
    for (const p of PAYLOADS) {
      await expect(page.locator("#preset-notes")).toContainText(p);
      await expect(page.locator("#source-list")).toContainText(p);
    }
    await expectInert();

    // Root page: the exam list and the app's default selection.
    await page.goto(`${site}?test=1`);
    await page.waitForFunction(() => window.__examsnap);
    await expect(page.locator(".exam-links a")).toContainText("<script>alert(1)</script>");
    await expectInert();

    // Hostile query strings are ignored, not reflected.
    await page.goto(`${site}?exam=${encodeURIComponent('"><img src=x onerror=alert(1)>')}&doc=${encodeURIComponent("<script>alert(1)</script>")}`);
    await expect(page.locator("#exam")).toHaveValue("xss-test");
    await expect(page.locator("#doc")).toHaveValue("photo");
    await expectInert();

    await page.waitForTimeout(300); // give any (unexpected) handler a chance to fire
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await new Promise((r) => server.close(r));
    await cleanup();
  }
});
