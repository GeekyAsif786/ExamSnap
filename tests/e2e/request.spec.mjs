// SPDX-License-Identifier: AGPL-3.0-or-later
// "Don't see your exam? Request it": a safe new-tab link to the request-exam
// issue form, prefilled with the custom specs and nothing else. The fixtures
// fail the test on any CSP violation, page error or external request.
import { REQUEST_EXAM_URL } from "../../scripts/build-lib.mjs";
import { STRINGS as S } from "../../src/ui/strings.js";
import { test, expect, openApp } from "./helpers.mjs";

const requestLink = (page) => page.locator(".field .request a");
const footerLink = (page) => page.locator("footer a[data-request]");

/** Assert both links point at `href` and are safe new-tab links. */
async function expectHref(page, href) {
  for (const link of [requestLink(page), footerLink(page)]) {
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
}

test("request link sits under the exam select and opens the bare form", async ({ page }) => {
  await openApp(page);
  await expect(requestLink(page)).toBeVisible();
  await expect(requestLink(page)).toHaveText(`${S.requestExam} ${S.opensInNewTab}`);
  // Directly below the exam select, above the document select.
  const [select, link, doc] = await page.evaluate(() =>
    ["#exam", ".field .request a", "#doc"].map((s) => document.querySelector(s).getBoundingClientRect().top),
  );
  expect(select).toBeLessThan(link);
  expect(link).toBeLessThan(doc);
  await expectHref(page, REQUEST_EXAM_URL);
  await expect(footerLink(page)).toHaveText(`${S.footerRequest} ${S.opensInNewTab}`);
  const url = new URL(await requestLink(page).getAttribute("href"));
  expect([...url.searchParams]).toEqual([["template", "request-exam.yml"], ["title", "[Exam] "]]);
});

test("on Custom size, the link carries only width, height and KB range", async ({ page }) => {
  await openApp(page);
  await page.locator("#exam").selectOption("custom");
  await page.getByLabel("Width (px)").fill("320");
  await page.getByLabel("Height (px)").fill("240");
  await page.getByLabel("Min KB").fill("15");
  await page.getByLabel("Max KB").fill("40");

  const href = `${REQUEST_EXAM_URL}&specs=${encodeURIComponent(S.requestSpecs(320, 240, 15, 40))}`;
  await expectHref(page, href);
  const url = new URL(href);
  expect([...url.searchParams.keys()]).toEqual(["template", "title", "specs"]);
  expect(url.searchParams.get("specs")).toBe("Custom size I used in ExamSnap: 320 × 240 px, 15–40 KB");
  // Nothing from the page URL, the file name or the browser leaks in.
  for (const leak of ["test=1", "exam=", "localhost", "127.0.0.1", "examsnap-320x240", ".jpg"]) {
    expect(href).not.toContain(leak);
  }

  // Invalid custom input: back to the bare form, no half-typed values.
  await page.getByLabel("Max KB").fill("10");
  await expectHref(page, REQUEST_EXAM_URL);

  // Back to a preset: no specs.
  await page.getByLabel("Max KB").fill("40");
  await page.locator("#exam").selectOption("ssc");
  await expectHref(page, REQUEST_EXAM_URL);
});

test("landing pages and the 404 page carry the footer request link", async ({ page }) => {
  await page.goto("./ssc/");
  await expectHref(page, REQUEST_EXAM_URL);
  await page.goto("./no-such-page/");
  const link = page.locator("footer a", { hasText: S.footerRequest });
  await expect(link).toHaveAttribute("href", REQUEST_EXAM_URL);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
