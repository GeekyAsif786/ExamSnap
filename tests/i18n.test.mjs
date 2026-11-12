// SPDX-License-Identifier: AGPL-3.0-or-later
// Locales: coverage logic, English fallback, preset localization, and the
// Hindi page templates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLocaleList, checkLocales, flatten, localeReport, paramNames, percent, render } from "../scripts/check-locales.mjs";
import { localizePreset, withFallback } from "../src/ui/i18n/localize.js";
import { DEFAULT_LOCALE, LOCALES } from "../src/ui/i18n/locales.js";
import { STRINGS as EN } from "../src/ui/i18n/en.js";
import { STRINGS as HI } from "../src/ui/i18n/hi.js";
import { PRESETS } from "../src/generated/presets.js";
import { docSummary, pageDescription, pageTitle, TITLE_MAX } from "../scripts/build-lib.mjs";

const en = { a: "Hello", n: (w, h) => `${w} × ${h} px`, brand: "ExamSnap rocks", group: { x: "X", y: "Y" } };

test("flatten, paramNames, render", () => {
  assert.deepEqual(flatten(en).map(([k]) => k), ["a", "n", "brand", "group.x", "group.y"]);
  assert.deepEqual(paramNames((w, h) => w + h), ["w", "h"]);
  assert.deepEqual(paramNames((date) => date), ["date"]);
  assert.deepEqual(paramNames((x) => x), ["x"]);
  assert.equal(render(en.n), "{w} × {h} px");
  assert.equal(render("plain"), "plain");
});

test("localeReport: complete", () => {
  const own = { a: "नमस्ते", n: (w, h) => `${w} × ${h} px`, brand: "ExamSnap बढ़िया", group: { x: "क", y: "ख" } };
  assert.deepEqual(localeReport(en, own), { total: 5, translated: 5, missing: [], extra: [], problems: [] });
});

test("localeReport: missing, extra, wrong type, unused argument, brand, digits, empty", () => {
  const own = {
    n: (w) => `${w} px`, // drops h
    brand: "एग्ज़ामस्नैप", // translated brand
    group: { x: "१२", y: "  " }, // Devanagari digits; empty
    a: () => "x", // function where English has a string
    extra: "?",
  };
  const r = localeReport(en, own);
  assert.equal(r.total, 5);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, ["extra"]);
  assert.deepEqual(r.problems, [
    "a: must be a plain string, got function",
    "n: doesn't use {h}",
    'brand: keep "ExamSnap" untranslated',
    "group.x: use Western digits (0–9), not Devanagari digits",
    "group.y: empty",
    "extra: not a key in en.js",
  ]);
  assert.equal(r.translated, 4);
  assert.deepEqual(localeReport(en, { a: "x" }).missing, ["n", "brand", "group.x", "group.y"]);
});

test("checkLocaleList: codes, fields, files", () => {
  const ok = [
    { code: "en", name: "English", dir: "ltr", status: "published" },
    { code: "hi", name: "हिन्दी", dir: "ltr", status: "draft" },
  ];
  assert.deepEqual(checkLocaleList(ok, "en", ["en.js", "hi.js", "locales.js", "localize.js"]), []);
  assert.deepEqual(
    checkLocaleList(
      [
        { code: "en", name: "English", dir: "ltr", status: "draft" },
        { code: "hin", name: "", dir: "up", status: "done" },
      ],
      "en",
      ["en.js", "ta.js"],
    ),
    [
      'locales.js: code "hin" must be two lowercase letters',
      "locales.js: hin: name (in the language itself) is required",
      'locales.js: hin: dir must be "ltr" or "rtl"',
      'locales.js: hin: status must be "published" or "draft"',
      "locales.js: hin: src/ui/i18n/hin.js is missing",
      'locales.js: the default locale "en" must be listed and published',
      'src/ui/i18n/ta.js: not listed in locales.js (add it as "draft")',
    ],
  );
});

test("percent never rounds up to 100", () => {
  assert.equal(percent(102, 103), "99.0%");
  assert.equal(percent(1029, 1030), "99.9%");
  assert.equal(percent(103, 103), "100.0%");
});

async function i18nDir(t, { status, own }) {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-i18n-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, "locales.js"),
    `export const DEFAULT_LOCALE = "en";\nexport const LOCALES = [\n  { code: "en", name: "English", dir: "ltr", status: "published" },\n  { code: "ta", name: "தமிழ்", dir: "ltr", status: "${status}" },\n];\n`,
  );
  await writeFile(join(dir, "en.js"), 'export const STRINGS = { a: "A", b: "B", f: (n) => `${n} KB` };\n');
  await writeFile(join(dir, "ta.js"), `export const STRINGS = ${own};\n`);
  return dir;
}

test("checkLocales: a draft may be partial; a published locale must be 100%", async (t) => {
  const partial = '{ a: "அ" }';
  const draft = await checkLocales(await i18nDir(t, { status: "draft", own: partial }));
  assert.equal(draft.ok, true);
  assert.match(draft.lines.join("\n"), /ta +33\.3% {2}\(1\/3\) {2}draft/);
  assert.match(draft.lines.join("\n"), /missing 2 \(English is shown\): b, f/);

  const pub = await checkLocales(await i18nDir(t, { status: "published", own: partial }));
  assert.equal(pub.ok, false);
  assert.deepEqual(pub.errors, ["ta (published): missing b", "ta (published): missing f"]);

  const full = await checkLocales(await i18nDir(t, { status: "published", own: '{ a: "அ", b: "ஆ", f: (n) => `${n} KB` }' }));
  assert.equal(full.ok, true);
  assert.match(full.lines[1], /ta +100\.0% {2}\(3\/3\) {2}published/);
});

test("the real locales: en and hi published at 100% with no problems", async () => {
  const { ok, errors, reports } = await checkLocales();
  assert.deepEqual(errors, []);
  assert.equal(ok, true);
  assert.deepEqual(Object.keys(reports), ["en", "hi"]);
  assert.equal(reports.hi.translated, reports.hi.total);
  assert.deepEqual(LOCALES.map((l) => [l.code, l.name, l.dir, l.status]), [
    ["en", "English", "ltr", "published"],
    ["hi", "हिन्दी", "ltr", "published"],
  ]);
  assert.equal(DEFAULT_LOCALE, "en");
});

test("withFallback: English fills missing keys and wrong types, per nested key", () => {
  const out = withFallback({ a: "अ", group: { x: "क" }, n: "not a function", junk: 1 }, en);
  assert.equal(out.a, "अ");
  assert.equal(out.n, en.n);
  assert.equal(out.brand, "ExamSnap rocks");
  assert.deepEqual(out.group, { x: "क", y: "Y" });
  assert.equal("junk" in out, false);
  assert.deepEqual(Object.keys(withFallback(undefined, en)), Object.keys(en));
  // A complete locale comes back unchanged.
  assert.deepEqual(flatten(withFallback(HI, EN)).map(([k, v]) => [k, String(v)]), flatten(HI).map(([k, v]) => [k, String(v)]));
});

test("localizePreset: translated text replaces English, the rest falls back", () => {
  const preset = {
    id: "x",
    name: "X exam",
    notes: "English notes",
    documents: [
      { id: "photo", label: "Photograph", notes: "White background" },
      { id: "signature", label: "Signature" },
    ],
    translations: { hi: { name: "X परीक्षा", documents: { photo: { label: "फोटो" }, signature: { label: "हस्ताक्षर" } } } },
  };
  const hi = localizePreset(preset, "hi");
  assert.equal(hi.name, "X परीक्षा");
  assert.equal(hi.notes, "English notes", "untranslated notes stay English");
  assert.deepEqual(hi.documents, [
    { id: "photo", label: "फोटो", notes: "White background" },
    { id: "signature", label: "हस्ताक्षर" },
  ]);
  assert.equal("translations" in hi, false);
  const enP = localizePreset(preset, "en");
  assert.equal(enP.name, "X exam");
  assert.equal("translations" in enP, false);
  assert.deepEqual(localizePreset({ ...preset, translations: undefined }, "hi").documents, preset.documents);
});

test("Hindi titles, descriptions and summaries: real specs only, titles within the length rule", () => {
  for (const p of PRESETS.map((x) => localizePreset(x, "hi"))) {
    const title = pageTitle(p, HI);
    assert.ok(title.length <= TITLE_MAX, `${p.id}: ${title} (${title.length})`);
    assert.ok(title.endsWith("| ExamSnap"), title);
    const desc = pageDescription(p, HI);
    const summary = docSummary(p, HI);
    for (const d of p.documents) {
      for (const text of [desc, summary]) {
        assert.ok(text.includes(`${d.width}×${d.height} px`), `${p.id}: ${text}`);
        assert.ok(text.includes(`${d.min_kb}–${d.max_kb} KB`), `${p.id}: ${text}`);
      }
    }
    assert.match(desc, /मुफ़्त, ऑफ़लाइन भी चलता है, कुछ भी अपलोड नहीं होता।$/);
    assert.doesNotMatch(desc + summary + title, /[०-९]/, "Western digits");
  }
  assert.equal(pageTitle({ name: "JEE Main (NTA)", documents: [] }, HI), "JEE Main (NTA) फोटो और हस्ताक्षर: सही साइज़ और KB | ExamSnap");
  assert.equal(pageTitle({ name: "SSC — CGL / CHSL / MTS / GD / CPO" }, HI), "SSC फोटो और हस्ताक्षर: सही साइज़ और KB | ExamSnap");
});
