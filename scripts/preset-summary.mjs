// SPDX-License-Identifier: AGPL-3.0-or-later
// Markdown table of every preset × document for the CI job summary:
//   node scripts/preset-summary.mjs --base origin/main >> "$GITHUB_STEP_SUMMARY"
// Presets changed since the merge base with --base are listed first and
// marked "changed". Read-only: no network, no tokens, no comments.
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { byteRange } from "../src/core/size.js";
import { PRESETS_DIR, readPresets } from "./bundle-presets.mjs";
import { cell } from "./update-readme.mjs";

/**
 * Preset ids whose presets/<id>.json differs between the merge base of
 * `base` and HEAD.
 *
 * @param {string} base a git revision, e.g. origin/main
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<{ ids: Set<string>, error?: string }>}
 */
export async function changedPresetIds(base, { cwd = process.cwd() } = {}) {
  try {
    const { stdout } = await promisify(execFile)(
      "git",
      ["diff", "--name-only", "--no-renames", `${base}...HEAD`, "--", "presets/"],
      { cwd },
    );
    const ids = stdout
      .split("\n")
      .map((f) => f.match(/^presets\/([^/]+)\.json$/)?.[1])
      .filter(Boolean);
    return { ids: new Set(ids) };
  } catch (e) {
    return { ids: new Set(), error: (e.stderr || e.message).trim().split("\n")[0] };
  }
}

const TYPE_ORDER = ["notice", "portal", "secondary"];

const bytes = (d) => {
  try {
    const r = byteRange(d.min_kb, d.max_kb);
    return `${r.minBytes}–${r.maxBytes}${r.fallback ? " (1000-byte KB)" : ""}`;
  } catch (e) {
    return `⚠ ${cell(e.message)}`;
  }
};

/**
 * @param {object[]} presets in display order
 * @param {Set<string>} changed ids changed in this PR (may include deleted ones)
 * @param {{ base?: string, error?: string }} [info]
 */
export function summaryMarkdown(presets, changed, { base, error } = {}) {
  const ordered = [...presets.filter((p) => changed.has(p.id)), ...presets.filter((p) => !changed.has(p.id))];
  const present = new Set(presets.map((p) => p.id));
  const removed = [...changed].filter((id) => !present.has(id)).sort();
  const docs = presets.reduce((n, p) => n + p.documents.length, 0);

  const lines = ["## Presets", ""];
  let status = `${presets.length} presets, ${docs} documents.`;
  if (error) status += ` Couldn't diff against \`${cell(base)}\`: ${cell(error)}`;
  else if (base) {
    const names = [...changed].filter((id) => present.has(id)).sort();
    status += names.length
      ? ` Changed vs \`${cell(base)}\`: ${names.map((id) => `\`${id}\``).join(", ")}.`
      : ` No presets changed vs \`${cell(base)}\`.`;
    if (removed.length) status += ` Removed: ${removed.map((id) => `\`${id}\``).join(", ")}.`;
  }
  lines.push(status, "");
  lines.push("| | Exam | Document | Pixels | KB range | Bytes (min–max) | Sources | Last verified |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const p of ordered) {
    const mark = changed.has(p.id) ? "**changed**" : "";
    const types = TYPE_ORDER.filter((t) => p.sources.some((s) => s.type === t)).join(", ");
    for (const d of p.documents) {
      lines.push(
        `| ${mark} | ${cell(p.name)} (\`${p.id}\`) | ${cell(d.label)} | ${d.width}×${d.height} | ${d.min_kb}–${d.max_kb} | ${bytes(d)} | ${types} | ${p.last_verified} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const i = process.argv.indexOf("--base");
  const base = i >= 0 ? process.argv[i + 1] : undefined;
  const { ids, error } = base ? await changedPresetIds(base) : { ids: new Set() };
  process.stdout.write(summaryMarkdown(await readPresets(PRESETS_DIR), ids, { base, error }));
}
