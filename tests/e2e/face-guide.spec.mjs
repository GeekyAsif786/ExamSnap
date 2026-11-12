// SPDX-License-Identifier: AGPL-3.0-or-later
import { STRINGS as S } from "../../src/ui/i18n/en.js";
import { test, expect, openApp, loadImage, readResult } from "./helpers.mjs";

test("the photo guide leaves crop controls and exported pixels unchanged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page, "exam=ssc&doc=photo");
  await loadImage(page, "photo");

  const toggle = page.getByRole("checkbox", { name: "Show face guide" });
  const guide = page.locator("#face-guide");
  const preview = page.locator("#preview");
  const make = page.getByRole("button", { name: S.makeButton });
  const result = page.locator("#result");
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(guide).toBeHidden();
  await make.click();
  await expect(result).toBeVisible();
  const withoutGuide = await readResult(page);

  await toggle.check();
  await expect(guide).toBeVisible();
  await expect(result).toBeVisible();
  await preview.scrollIntoViewIfNeeded();
  expect(await preview.evaluate((canvas) => {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    return document.elementFromPoint(left + width / 2, top + height / 2) === canvas;
  })).toBe(true);
  await make.click();
  await expect(result).toBeVisible();
  const withGuide = await readResult(page);
  expect(withGuide.bytes.equals(withoutGuide.bytes)).toBe(true);

  await toggle.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect(guide).toBeHidden();
});

test("touch can toggle the face guide for photo documents only", async ({ newContext }) => {
  const context = await newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await openApp(page, "exam=ssc&doc=photo");
  await loadImage(page, "photo");
  const toggle = page.getByRole("checkbox", { name: "Show face guide" });
  const guide = page.locator("#face-guide");
  const documentPicker = page.locator("#doc");

  await toggle.tap();
  await expect(guide).toBeVisible();
  await documentPicker.selectOption("signature");
  await expect(toggle).toBeHidden();
  await expect(guide).toBeHidden();

  await documentPicker.selectOption("photo");
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(guide).toBeHidden();
});
