// SPDX-License-Identifier: AGPL-3.0-or-later
// Regenerate the "Supported exams" table in README.md from presets/*.json,
// between <!-- exams:start --> and <!-- exams:end -->.
//   node scripts/update-readme.mjs          write README.md
//   node scripts/update-readme.mjs --check  report a stale README.md (npm run check)
// A stale table is an error locally and on pushes to main (so main and the
// deploy stay correct), but only a warning on pull requests: contributors
// editing a preset on GitHub can't regenerate it, so the maintainer does
// before merging. --readme FILE redirects the file (for tests).
import { appendFile, readFile, writeFile } from "node:fs/promises";
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

/**
 * How a stale table is reported: "warning" in GitHub Actions runs other than
 * a push to main (pull requests, pushes to PR branches), else "error".
 * @param {Record<string, string | undefined>} env
 * @returns {"warning" | "error"}
 */
export function staleSeverity(env) {
  if (env.GITHUB_ACTIONS !== "true") return "error";
  if (env.GITHUB_EVENT_NAME === "push" && env.GITHUB_REF === "refs/heads/main") return "error";
  return "warning";
}

export const STALE_MESSAGE = "README.md exams table is out of date.";
export const STALE_SUMMARY =
  "> [!WARNING]\n> The README exams table is out of date. Maintainer: run `npm run update-readme` and commit the result before merging.\n";

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes("--check");
  const i = process.argv.indexOf("--readme");
  const readme = i >= 0 ? process.argv[i + 1] : README_PATH;
  const { stale, written } = await run({ check, readme });
  if (check && stale) {
    if (staleSeverity(process.env) === "error") {
      console.error(`ERROR ${STALE_MESSAGE} Run: npm run update-readme`);
      process.exit(1);
    }
    // GitHub annotation, plus a line in the job summary for the maintainer.
    console.log(`::warning title=README exams table::${STALE_MESSAGE} The maintainer regenerates it before merging (npm run update-readme).`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, STALE_SUMMARY);
  } else {
    console.log(check ? "README.md exams table is up to date." : written ? "Updated README.md exams table." : "README.md exams table already up to date.");
  }
}
