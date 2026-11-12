// SPDX-License-Identifier: AGPL-3.0-or-later
// Hindi pages (/hi/, /hi/<exam>/) against the built site: language, SEO
// links, the full make flow, the switcher, no leftover English, offline,
// the phone first-screen rule and Devanagari rendering.
import { PRESETS } from "../../src/generated/presets.js";
import { STRINGS as EN } from "../../src/ui/i18n/en.js";
import { STRINGS as HI } from "../../src/ui/i18n/hi.js";
import { localizePreset } from "../../src/ui/i18n/localize.js";
import { DEFAULT_ORIGIN, siteUrl } from "../../scripts/build-lib.mjs";
import { flatten, paramNames } from "../../scripts/check-locales.mjs";
import { test, expect, loadImage, readResult, gotoReady, reloadReady, waitReady } from "./helpers.mjs";

const base = () => new URL(test.info().project.use.baseURL).pathname;
const live = (path = "") => siteUrl(DEFAULT_ORIGIN, base(), path);
const PAGES = ["", ...PRESETS.map((p) => `${p.id}/`)];
const HI_PRESETS = PRESETS.map((p) => localizePreset(p, "hi"));

async function openHi(page, path, query = "") {
  await gotoReady(page, `./hi/${path}?test=1${query ? `&${query}` : ""}`);
  await page.waitForFunction(() => window.__examsnap);
}

test("every /hi/ page: lang, canonical, hreflang en/hi/x-default, Hindi title and h1", async ({ page }) => {
  for (const p of PAGES) {
    await gotoReady(page, `./hi/${p}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", live(`hi/${p}`));
    const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((ls) => ls.map((l) => [l.hreflang, l.href]));
    expect(alternates, p).toEqual([
      ["en", live(p)],
      ["hi", live(`hi/${p}`)],
      ["x-default", live(p)],
    ]);
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(ld.inLanguage).toBe("hi");
    await expect(page.locator("#make")).toHaveText(HI.makeButton);
    if (p) {
      const preset = HI_PRESETS.find((x) => `${x.id}/` === p);
      await expect(page.locator("h1")).toHaveText(HI.landingHeading(preset.name));
      await expect(page.locator("#exam")).toHaveValue(preset.id);
    } else {
      await expect(page).toHaveTitle(HI.docTitle);
    }
  }
  // The English pages point back the same way.
  await gotoReady(page, "./ssc/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveAttribute("href", live("hi/ssc/"));
});

test("each page downloads only its own language's strings module", async ({ page }) => {
  for (const [path, own, other] of [["./hi/ssc/", "hi", "en"], ["./ssc/", "en", "hi"]]) {
    const modules = [];
    const listener = (req) => {
      const m = /\/src\/ui\/i18n\/([a-z]{2})\.[0-9a-f]{8}\.js$/.exec(req.url());
      if (m) modules.push(m[1]);
    };
    page.on("request", listener);
    await gotoReady(page, path);
    await expect(page.locator("#make")).toHaveText(own === "hi" ? HI.makeButton : EN.makeButton);
    page.off("request", listener);
    expect(modules, path).toContain(own);
    expect(modules, path).not.toContain(other);
  }
});

test("/hi/ssc/: make a photo end to end, in Hindi", async ({ page }) => {
  const photo = HI_PRESETS.find((p) => p.id === "ssc").documents.find((d) => d.id === "photo");
  await openHi(page, "ssc/");
  await expect(page.locator("#doc")).toHaveValue("photo");
  await expect(page.locator("#doc option:checked")).toHaveText(photo.label);
  await loadImage(page, "photo");
  await expect(page.locator("#upload-msg")).toHaveText(HI.loaded("photo.jpg", 4000, 3000));
  await page.getByRole("button", { name: HI.makeButton }).click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result h3")).toHaveText(HI.resultHeading);
  const out = await readResult(page);
  expect(out.decoded).toEqual({ width: photo.width, height: photo.height });
  expect(out.bytes.length).toBeGreaterThanOrEqual(photo.min_kb * 1024);
  expect(out.bytes.length).toBeLessThanOrEqual(photo.max_kb * 1000);
  await expect(page.locator("#checklist li.pass")).toHaveCount(4);
  await expect(page.locator("#checklist")).toContainText(HI.checkMetadata);
  await expect(page.locator("#result-status")).toHaveText(new RegExp(`^आपकी फ़ाइल तैयार है: ${photo.filename.replace(".", "\\.")}, \\d+\\.\\d KB।$`));
  await expect(page.locator("#download")).toHaveText(HI.download(photo.filename));
  await expect(page.locator("#download")).toHaveAttribute("download", photo.filename);
});

test("/hi/jee-main/: make a signature end to end, in Hindi", async ({ page }) => {
  const sig = HI_PRESETS.find((p) => p.id === "jee-main").documents.find((d) => d.id === "signature");
  await openHi(page, "jee-main/", "doc=signature");
  await expect(page.locator("#doc")).toHaveValue("signature");
  await expect(page.locator("#clean")).toBeHidden();
  await loadImage(page, "signature");
  await expect(page.getByLabel(HI.cleanLabel)).toBeChecked();
  await page.getByRole("button", { name: HI.makeButton }).click();
  await expect(page.locator("#result")).toBeVisible();
  const out = await readResult(page);
  expect(out.decoded).toEqual({ width: sig.width, height: sig.height });
  await expect(page.locator("#checklist li.pass")).toHaveCount(4);
  await expect(page.locator("#checklist")).toContainText(new RegExp(`\\d+\\.\\d KB \\(सीमा ${sig.min_kb}–${sig.max_kb} KB\\)`));
  await expect(page.locator("#download")).toHaveAttribute("download", sig.filename);
});

test("language switcher: same page, keeps ?doc= (and ?exam=), round-trips", async ({ page }) => {
  await gotoReady(page, "./ssc/?doc=signature&test=1");
  await page.getByRole("link", { name: "हिंदी" }).click();
  await waitReady(page);
  await expect(page).toHaveURL(new RegExp(`${base()}hi/ssc/\\?doc=signature$`));
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator("#doc")).toHaveValue("signature");

  // A changed selection is carried too.
  await page.locator("#doc").selectOption("photo");
  await expect(page.getByRole("link", { name: "English" })).toHaveAttribute("href", "../../ssc/?doc=photo");
  await page.getByRole("link", { name: "English" }).click();
  await waitReady(page);
  await expect(page).toHaveURL(new RegExp(`${base()}ssc/\\?doc=photo$`));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#doc")).toHaveValue("photo");

  // Root page: ?exam= and ?doc= both survive.
  await gotoReady(page, "./?exam=jee-main&doc=signature");
  const link = page.getByRole("link", { name: "हिंदी" });
  await expect(link).toHaveAttribute("lang", "hi");
  await expect(link).toHaveAttribute("hreflang", "hi");
  await link.click();
  await waitReady(page);
  await expect(page).toHaveURL(new RegExp(`${base()}hi/\\?exam=jee-main&doc=signature$`));
  await expect(page.locator("#exam")).toHaveValue("jee-main");
  await page.getByRole("link", { name: "English" }).click();
  await waitReady(page);
  await expect(page).toHaveURL(new RegExp(`${base()}\\?exam=jee-main&doc=signature$`));
});

/**
 * Text fragments of every en.js string: plain strings whole, templates split
 * around their arguments. Only fragments with a Latin word count.
 */
function englishFragments() {
  const out = new Set();
  for (const [, v] of flatten(EN)) {
    const parts = typeof v === "function" ? String(v(...paramNames(v).map((_, i) => `\u27e6${i}\u27e7`))).split(/\u27e6\d+\u27e7/) : [v];
    for (const part of parts) {
      const s = part.trim();
      if (/[A-Za-z]{2,}/.test(s.replace(ALLOWED, ""))) out.add(s);
    }
  }
  return [...out];
}
// Allowed in Hindi text: the brand, units, formats, product and key names.
const ALLOWED = /\b(ExamSnap|KB|JPG|PNG|HEIC|px|cm|iPhone|Ctrl|GitHub|JavaScript)\b/g;

/** Visible text, accessible names and the title, minus preset data that stays English. */
async function pageText(page) {
  return page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true;
    const attrs = [...document.querySelectorAll("[aria-label], img[alt]")].map((n) => n.getAttribute("aria-label") ?? n.alt);
    const optgroups = [...document.querySelectorAll("optgroup")].map((g) => g.label);
    return [document.title, document.body.innerText, ...attrs, ...optgroups].join("\n");
  });
}

function englishLeft(text) {
  // External documents keep their own (English) titles; exam names and file
  // names are allowed as they are.
  let t = text;
  const keep = [
    ...PRESETS.flatMap((p) => p.sources.map((s) => s.title)),
    ...HI_PRESETS.map((p) => p.name),
    ...PRESETS.flatMap((p) => p.documents.map((d) => d.filename)),
    "English", // the switcher's link to the English page, in English by design
  ];
  for (const k of keep) t = t.split(k).join(" ");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return englishFragments().filter((f) => {
    const edge = (c) => (/[A-Za-z]/.test(c) ? "\\b" : "");
    return new RegExp(`${edge(f[0])}${esc(f)}${edge(f.at(-1))}`).test(t);
  });
}

test("no English UI string on /hi/ pages, in every state", async ({ page }) => {
  expect(englishFragments()).toContain("Make my file"); // the fragment list is real
  for (const p of PAGES) {
    await openHi(page, p);
    expect(englishLeft(await pageText(page)), `hi/${p}`).toEqual([]);
  }
  // With a result, and with the custom-size form and its errors.
  await openHi(page, "ssc/");
  await loadImage(page, "photo");
  await page.getByRole("button", { name: HI.makeButton }).click();
  await expect(page.locator("#result")).toBeVisible();
  expect(englishLeft(await pageText(page)), "result").toEqual([]);
  await page.locator("#exam").selectOption("custom");
  await page.getByLabel(HI.customMinKb).fill("50");
  await page.getByLabel(HI.customMaxKb).fill("20");
  await expect(page.locator("#custom-error")).toHaveText(HI.customKbOrder);
  expect(englishLeft(await pageText(page)), "custom range error").toEqual([]);
  await page.getByLabel(HI.customWidth).fill("10");
  await expect(page.locator("#custom-error")).toHaveText(HI.customSizeError(50, 4000));
  expect(englishLeft(await pageText(page)), "custom size error").toEqual([]);
  // Exam groups are named in Hindi.
  const groups = await page.locator("#exam optgroup").evaluateAll((gs) => gs.map((g) => g.label));
  expect(groups).toEqual(["बैंकिंग", "प्रवेश परीक्षाएँ", "सरकारी नौकरियाँ"]);
});

test("the English-leftover check catches English (self-test)", async () => {
  expect(englishLeft("फ़ोटो चुनें Make my file")).toEqual(["Make my file"]);
  expect(englishLeft("Loaded x.jpg (1 × 2 px).")).toContain("Loaded");
  expect(englishLeft("photo.jpg डाउनलोड करें · 20–50 KB · JPG · ExamSnap · English")).toEqual([]);
});

test("on a 390×844 phone the tool starts on the first screen of every /hi/ page", async ({ newContext }) => {
  const context = await newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const p of PAGES) {
    await gotoReady(page, `./hi/${p}`);
    const top = await page.getByText(HI.chooseFile, { exact: true }).evaluate((n) => n.getBoundingClientRect().bottom);
    expect(top, `hi/${p}`).toBeLessThan(844);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `hi/${p}`).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test("exam list at 390 px: each bullet sits on its exam name's first line, even when it wraps", async ({ newContext }) => {
  const context = await newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const path of ["./hi/", "./"]) {
    await gotoReady(page, path);
    const items = await page.locator(".exam-links li").evaluateAll((lis) =>
      lis.map((li) => {
        const a = li.querySelector("a");
        const marker = getComputedStyle(li, "::before");
        const link = getComputedStyle(a);
        const liTop = li.getBoundingClientRect().top;
        const aBox = a.getBoundingClientRect();
        // Top of the first line box of the bullet and of the link text.
        const markerLine = liTop + parseFloat(marker.paddingTop);
        const textLine = aBox.top + parseFloat(link.paddingTop);
        const firstGlyph = document.createRange();
        firstGlyph.setStart(a.firstChild, 0);
        firstGlyph.setEnd(a.firstChild, 1);
        return {
          name: a.textContent,
          marker: marker.content,
          markerLine,
          textLine,
          sameMetrics: marker.lineHeight === link.lineHeight && marker.fontSize === link.fontSize,
          glyphTop: firstGlyph.getBoundingClientRect().top,
          lineHeight: parseFloat(link.lineHeight),
          lines: Math.round((aBox.height - parseFloat(link.paddingTop) - parseFloat(link.paddingBottom)) / parseFloat(link.lineHeight)),
        };
      }),
    );
    expect(items.length, path).toBe(PRESETS.length);
    for (const it of items) {
      expect(it.marker, it.name).toBe('"•"');
      expect(Math.abs(it.markerLine - it.textLine), it.name).toBeLessThanOrEqual(0.5);
      expect(it.sameMetrics, it.name).toBe(true);
      // The first character is on that first line.
      expect(it.glyphTop - it.textLine, it.name).toBeLessThan(it.lineHeight);
    }
    // The check means something: at least one name wraps at this width.
    if (path === "./hi/") expect(Math.max(...items.map((it) => it.lines)), path).toBeGreaterThan(1);
  }
  await context.close();
});

test("Devanagari renders with system fonts: real, distinct glyphs (no tofu)", async ({ page }) => {
  await gotoReady(page, "./hi/");
  const result = await page.evaluate(() => {
    const font = getComputedStyle(document.body).fontFamily;
    const draw = (text) => {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 64;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = "#000";
      ctx.font = `40px ${font}`;
      ctx.fillText(text, 8, 48);
      const d = ctx.getImageData(0, 0, 96, 64).data;
      let ink = 0;
      let hash = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 128) ink++;
        hash = (hash * 31 + d[i]) | 0;
      }
      return { ink, hash };
    };
    const letters = ["क", "ख", "ग", "ह", "फ़", "ज़"].map(draw);
    // A matra changes the glyph if the font shapes Devanagari.
    const shaped = [draw("कि"), draw("की")];
    return { font, letters, shaped };
  });
  for (const g of result.letters) expect(g.ink, result.font).toBeGreaterThan(20);
  // Missing glyphs all draw the same box; real glyphs differ.
  expect(new Set(result.letters.map((g) => g.hash)).size, result.font).toBe(result.letters.length);
  expect(result.shaped[0].hash).not.toBe(result.shaped[1].hash);
});

test("offline: a /hi/ page reloads and makes a file, and other /hi/ pages open", async ({ page, context }) => {
  await openHi(page, "jee-main/", "doc=photo");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  try {
    await reloadReady(page);
    await page.waitForFunction(() => window.__examsnap);
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await loadImage(page, "photo");
    await page.getByRole("button", { name: HI.makeButton }).click();
    await expect(page.locator("#result")).toBeVisible();
    const photo = PRESETS.find((p) => p.id === "jee-main").documents.find((d) => d.id === "photo");
    expect((await readResult(page)).decoded).toEqual({ width: photo.width, height: photo.height });

    const ssc = HI_PRESETS.find((p) => p.id === "ssc");
    await gotoReady(page, "./hi/ssc/");
    await expect(page.locator("h1")).toHaveText(HI.landingHeading(ssc.name));
    await gotoReady(page, "./hi/");
    await expect(page.locator("#make")).toHaveText(HI.makeButton);
  } finally {
    await context.setOffline(false);
  }
});
