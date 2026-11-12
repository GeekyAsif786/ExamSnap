// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePresets } from "./check-presets.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PRESETS_DIR = join(ROOT, "presets");
export const OUT_PATH = join(ROOT, "src", "generated", "presets.js");

const HEADER = `// SPDX-License-Identifier: CC0-1.0
// GENERATED FILE — DO NOT EDIT BY HAND.
// Built from presets/*.json by scripts/bundle-presets.mjs (npm run build:presets).
// \`npm run check\` fails if this file is out of date.
`;

const byCategoryThenName = (a, b) =>
  a.category < b.category ? -1 : a.category > b.category ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * Build the source text of the presets module from every *.json in `dir`.
 * Throws if any preset fails validation.
 *
 * @param {string} [dir]
 * @returns {Promise<string>}
 */
export async function bundlePresets(dir = PRESETS_DIR) {
  const { errors } = await validatePresets(dir);
  if (errors.length) {
    throw new Error(`invalid presets, run npm run check:\n${errors.join("\n")}`);
  }
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  const presets = [];
  for (const name of names) presets.push(JSON.parse(await readFile(join(dir, name), "utf8")));
  presets.sort(byCategoryThenName);
  return `${HEADER}\nexport const PRESETS = ${JSON.stringify(presets, null, 2)};\n`;
}

/**
 * @param {{ check?: boolean, dir?: string, out?: string }} [options]
 * @returns {Promise<{ stale: boolean, written: boolean }>}
 */
export async function run({ check = false, dir = PRESETS_DIR, out = OUT_PATH } = {}) {
  const next = await bundlePresets(dir);
  let current = null;
  try {
    current = await readFile(out, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const stale = current !== next;
  if (check || !stale) return { stale, written: false };
  await writeFile(out, next);
  return { stale, written: true };
}

async function main() {
  const check = process.argv.includes("--check");
  const { stale, written } = await run({ check });
  const rel = "src/generated/presets.js";
  if (check && stale) {
    console.error(`ERROR ${rel} is out of date. Run: npm run build:presets`);
    process.exit(1);
  }
  console.log(check ? `${rel} is up to date.` : written ? `Wrote ${rel}.` : `${rel} already up to date.`);
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await main();
}
