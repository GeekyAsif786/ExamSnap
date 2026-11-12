// SPDX-License-Identifier: AGPL-3.0-or-later
// Regenerate the "Supported exams" table in README.md from presets/*.json,
// between <!-- exams:start --> and <!-- exams:end -->.
//   node scripts/update-readme.mjs          write README.md
//   node scripts/update-readme.mjs --check  fail if README.md is stale (npm run check)
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ORIGIN, siteUrl } from "./build-lib.mjs";
import { PRESETS_DIR, readPresets } from "./bundle-presets.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const README_PATH = join(ROOT, "README.md");
export const START = "<!-- exams:start -->";
export const END = "<!-- exams:end -->";
export const VERIFY_URL = "https://github.com/GeekyAsif786/ExamSnap/labels/verify-preset";

/** Escape text for a Markdown table cell (and link text). */
export function cell(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\|[\]*_`])/g, "\\$1")
    .replace(/\s*\n\s*/g, " ");
}

/**
 * The Markdown table for `presets` (already in display order).
 * @param {object[]} presets
 * @param {{ origin?: string }} [options]
 */
export function examsTable(presets, { origin = DEFAULT_ORIGIN } = {}) {
  const rows = presets.map((p) => {
    const exam = `[${cell(p.name)}](${siteUrl(origin, "/", `${p.id}/`)})`;
    const docs = p.documents
      .map((d) => `${cell(d.label)}: ${d.width}×${d.height} px, ${d.min_kb}–${d.max_kb} KB`)
      .join("<br>");
    const status = p.sources.some((s) => s.type === "notice") ? "Official notice" : `[⚠ Needs verification](${VERIFY_URL})`;
    return `| ${exam} | ${docs} | ${status} |`;
  });
  return ["| Exam | Documents | Source |", "| --- | --- | --- |", ...rows].join("\n");
}

/** Replace the block between the markers. Throws unless each marker appears once, in order. */
export function replaceBlock(readme, table) {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s < 0 || e < 0 || e < s || readme.indexOf(START, s + 1) >= 0 || readme.indexOf(END, e + 1) >= 0) {
    throw new Error(`README.md must contain ${START} and ${END} exactly once, in that order`);
  }
  return `${readme.slice(0, s + START.length)}\n${table}\n${readme.slice(e)}`;
}

/**
 * @param {{ check?: boolean, dir?: string, readme?: string }} [options]
 * @returns {Promise<{ stale: boolean, written: boolean }>}
 */
export async function run({ check = false, dir = PRESETS_DIR, readme = README_PATH } = {}) {
  const current = await readFile(readme, "utf8");
  const next = replaceBlock(current, examsTable(await readPresets(dir)));
  const stale = next !== current;
  if (check || !stale) return { stale, written: false };
  await writeFile(readme, next);
  return { stale, written: true };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes("--check");
  const { stale, written } = await run({ check });
  if (check && stale) {
    console.error("ERROR README.md exams table is out of date. Run: npm run update-readme");
    process.exit(1);
  }
  console.log(check ? "README.md exams table is up to date." : written ? "Updated README.md exams table." : "README.md exams table already up to date.");
}
