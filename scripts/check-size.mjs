// SPDX-License-Identifier: AGPL-3.0-or-later
// Enforce the shipped-JS budget per page. A page ships every .js file under
// src/ except the generated presets module and the locale modules, plus its
// own language's module (src/ui/i18n/<code>.js). Each total must stay under
// LIMIT_BYTES (uncompressed), counted as the build ships it: comment-only
// lines are dropped (scripts/build-lib.mjs stripComments).
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./build-lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// 60 KB read strictly as 60 000 bytes, so it holds under either KB definition.
export const LIMIT_BYTES = 60_000;
const EXCLUDE = new Set(["generated"]);
const LOCALE_RE = /^ui\/i18n\/([a-z]{2})\.js$/;

/**
 * @param {string} dir directory to scan (src/)
 * @returns {Promise<{ total: number, files: { path: string, size: number, locale: string | null }[],
 *   perLocale: Record<string, number> }>} sizes as shipped; total is every file together.
 */
export async function measureJs(dir) {
  const files = [];
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) {
        if (d === dir && EXCLUDE.has(entry.name)) continue;
        await walk(p);
      } else if (entry.name.endsWith(".js")) {
        const path = relative(dir, p);
        const size = Buffer.byteLength(stripComments(await readFile(p, "utf8")));
        files.push({ path, size, locale: LOCALE_RE.exec(path.split(sep).join("/"))?.[1] ?? null });
      }
    }
  }
  await walk(dir);
  files.sort((a, b) => b.size - a.size);
  const sum = (list) => list.reduce((s, f) => s + f.size, 0);
  const common = sum(files.filter((f) => !f.locale));
  const codes = [...new Set(files.map((f) => f.locale).filter(Boolean))].sort();
  const perLocale = Object.fromEntries(codes.map((c) => [c, common + sum(files.filter((f) => f.locale === c))]));
  return { total: sum(files), files, perLocale };
}

async function main() {
  const { files, perLocale } = await measureJs(join(ROOT, "src"));
  const over = Object.entries(perLocale).filter(([, n]) => n >= LIMIT_BYTES);
  const line = `shipped JS per page: ${Object.entries(perLocale)
    .map(([c, n]) => `${c} ${n} bytes`)
    .join(", ")} (limit ${LIMIT_BYTES}, excluding src/generated/)`;
  if (over.length) {
    for (const f of files) console.error(`  ${String(f.size).padStart(7)}  src/${f.path}`);
    console.error(`ERROR ${line}`);
    process.exit(1);
  }
  console.log(line);
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await main();
}
