// SPDX-License-Identifier: AGPL-3.0-or-later
// Translation coverage: every locale in src/ui/i18n/locales.js against
// en.js. Prints each locale's coverage (npm run check). A "published" locale
// must be 100% with no problems; a "draft" may be partial (missing keys fall
// back to English) but its problems are still listed.
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const I18N_DIR = join(ROOT, "src", "ui", "i18n");
export const BRAND = "ExamSnap";
const CODE_RE = /^[a-z]{2}$/;
const MODULE_RE = /^([a-z]{2})\.js$/;

/**
 * Flatten one level of nested objects into dotted keys:
 * { a: "x", sourceType: { notice: "y" } } -> [["a", "x"], ["sourceType.notice", "y"]].
 * @returns {[string, unknown][]}
 */
export function flatten(strings, prefix = "") {
  return Object.entries(strings ?? {}).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

/** Argument names of a template function, from its source: (w, h) => … -> ["w", "h"]. */
export function paramNames(fn) {
  const m = /^\s*(?:\(([^)]*)\)|([\w$]+))\s*=>/.exec(String(fn));
  const list = m ? (m[1] ?? m[2]) : "";
  return list.split(",").map((s) => s.trim()).filter(Boolean);
}

/** A template's text with each argument shown as {name}; strings as they are. */
export function render(value, names = typeof value === "function" ? paramNames(value) : []) {
  return typeof value === "function" ? String(value(...names.map((n) => `{${n}}`))) : value;
}

/**
 * Compare one locale's strings with English.
 * @param {Record<string, unknown>} en
 * @param {Record<string, unknown>} own
 * @returns {{ total: number, translated: number, missing: string[], extra: string[], problems: string[] }}
 */
export function localeReport(en, own) {
  const enMap = new Map(flatten(en));
  const ownMap = new Map(flatten(own));
  const missing = [];
  const problems = [];
  let translated = 0;
  for (const [key, ref] of enMap) {
    if (!ownMap.has(key)) {
      missing.push(key);
      continue;
    }
    const v = ownMap.get(key);
    if (typeof v !== typeof ref) {
      problems.push(`${key}: must be a ${typeof ref === "function" ? "function like English" : "plain string"}, got ${typeof v}`);
      continue;
    }
    let text = v;
    if (typeof ref === "function") {
      // Same arguments as English, each used in the text.
      const names = paramNames(ref);
      const marks = names.map((_, i) => `⟦${i}⟧`);
      try {
        text = String(v(...marks));
      } catch (e) {
        problems.push(`${key}: throws (${e.message})`);
        continue;
      }
      const unused = names.filter((_, i) => !text.includes(marks[i]));
      if (unused.length) problems.push(`${key}: doesn't use ${unused.map((n) => `{${n}}`).join(", ")}`);
    }
    if (!String(text).trim()) problems.push(`${key}: empty`);
    if (String(render(ref)).includes(BRAND) && !String(text).includes(BRAND)) problems.push(`${key}: keep "${BRAND}" untranslated`);
    if (/[०-९]/.test(text)) problems.push(`${key}: use Western digits (0–9), not Devanagari digits`);
    translated++;
  }
  const extra = [...ownMap.keys()].filter((k) => !enMap.has(k));
  for (const k of extra) problems.push(`${k}: not a key in en.js`);
  return { total: enMap.size, translated, missing, extra, problems };
}

/**
 * Problems with the locale list itself, given the module files that exist.
 * @param {{ code: string, name: string, dir: string, status: string }[]} locales
 * @param {string} defaultCode
 * @param {string[]} files file names in src/ui/i18n/
 * @returns {string[]}
 */
export function checkLocaleList(locales, defaultCode, files) {
  const errors = [];
  const codes = locales.map((l) => l.code);
  for (const l of locales) {
    if (!CODE_RE.test(l.code)) errors.push(`locales.js: code "${l.code}" must be two lowercase letters`);
    if (!l.name?.trim()) errors.push(`locales.js: ${l.code}: name (in the language itself) is required`);
    if (!["ltr", "rtl"].includes(l.dir)) errors.push(`locales.js: ${l.code}: dir must be "ltr" or "rtl"`);
    if (!["published", "draft"].includes(l.status)) errors.push(`locales.js: ${l.code}: status must be "published" or "draft"`);
    if (!files.includes(`${l.code}.js`)) errors.push(`locales.js: ${l.code}: src/ui/i18n/${l.code}.js is missing`);
  }
  if (new Set(codes).size !== codes.length) errors.push("locales.js: duplicate locale codes");
  const def = locales.find((l) => l.code === defaultCode);
  if (!def || def.status !== "published") errors.push(`locales.js: the default locale "${defaultCode}" must be listed and published`);
  for (const f of files) {
    const code = MODULE_RE.exec(f)?.[1];
    if (code && !codes.includes(code)) errors.push(`src/ui/i18n/${f}: not listed in locales.js (add it as "draft")`);
  }
  return errors;
}

/** "93.5%" with one decimal, never rounding up to 100. */
export function percent(n, total) {
  return `${(Math.floor((total ? n / total : 1) * 1000) / 10).toFixed(1)}%`;
}

/**
 * Check every locale in `dir`.
 * @returns {Promise<{ ok: boolean, lines: string[], errors: string[], reports: Record<string, object> }>}
 */
export async function checkLocales(dir = I18N_DIR) {
  const load = async (f) => import(pathToFileURL(join(dir, f)).href);
  const { LOCALES, DEFAULT_LOCALE } = await load("locales.js");
  const files = (await readdir(dir)).sort();
  const errors = checkLocaleList(LOCALES, DEFAULT_LOCALE, files);
  const lines = [];
  const reports = {};
  const en = (await load(`${DEFAULT_LOCALE}.js`)).STRINGS;
  for (const l of LOCALES) {
    if (!files.includes(`${l.code}.js`)) continue;
    const r = localeReport(en, (await load(`${l.code}.js`)).STRINGS);
    reports[l.code] = r;
    lines.push(`  ${l.code}  ${percent(r.translated, r.total).padStart(6)}  (${r.translated}/${r.total})  ${l.status.padEnd(9)}  ${l.name}`);
    const where = `${l.code} (${l.status})`;
    if (l.status === "published") {
      for (const k of r.missing) errors.push(`${where}: missing ${k}`);
      for (const p of r.problems) errors.push(`${where}: ${p}`);
    } else {
      for (const p of r.problems) lines.push(`      problem: ${p}`);
      if (r.missing.length) lines.push(`      missing ${r.missing.length} (English is shown): ${r.missing.join(", ")}`);
    }
  }
  return { ok: errors.length === 0, lines, errors, reports };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const { ok, lines, errors } = await checkLocales();
  console.log("Translation coverage (keys of src/ui/i18n/en.js):");
  for (const l of lines) console.log(l);
  for (const e of errors) console.error(`ERROR ${e}`);
  if (!ok) {
    console.error(`\n${errors.length} translation error(s). A published locale must be 100% with no problems.`);
    process.exit(1);
  }
}
