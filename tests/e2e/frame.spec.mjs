// SPDX-License-Identifier: AGPL-3.0-or-later
// Anti-framing: inside another page's iframe the app must not run.
import { STRINGS as S } from "../../src/ui/i18n/en.js";
import { test, expect } from "./helpers.mjs";

test("framed: only a notice with a top-level link, no file input; the link opens the app", async ({ page, baseURL }) => {
  const url = new URL("./ssc/", baseURL).href;
  // A hostile page that frames ExamSnap.
  await page.setContent(`<!doctype html><title>framer</title><iframe src="${url}" width="800" height="600"></iframe>`);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByText(S.framedMessage)).toBeVisible();
  await expect(frame.locator("input[type=file]")).toHaveCount(0);
  await expect(frame.locator("#exam, #make, canvas")).toHaveCount(0);
  const link = frame.getByRole("link", { name: S.framedOpen });
  await expect(link).toHaveAttribute("target", "_top");
  await expect(link).toHaveAttribute("rel", "noopener");
  await expect(link).toHaveAttribute("href", url);
  // The app module never loaded inside the frame.
  const inner = page.frames().find((f) => f.url() === url);
  expect(await inner.evaluate(() => "__examsnap" in window || document.querySelector("#file") !== null)).toBe(false);

  await link.click();
  // The app then records the selected document in the query string.
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`^${escaped}(\\?doc=photo)?$`));
  await expect(page.locator("#exam")).toHaveValue("ssc");
  await expect(page.locator("input[type=file]")).toHaveCount(1);
});

test("not framed: the app runs normally", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("input[type=file]")).toHaveCount(1);
  await expect(page.getByText(S.framedMessage)).toHaveCount(0);
});
