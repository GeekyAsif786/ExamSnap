// SPDX-License-Identifier: AGPL-3.0-or-later
// Enforce the shipped-JS budget: every .js file under src/, excluding the
// generated presets module, must total under LIMIT_BYTES (uncompressed).
import { readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// 60 KB read strictly as 60 000 bytes, so it holds under either KB definition.
export const LIMIT_BYTES = 60_000;
const EXCLUDE = new Set(["generated"]);

/**
 * @param {string} dir directory to scan (src/)
 * @returns {Promise<{ total: number, files: { path: string, size: number }[] }>}
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
        files.push({ path: relative(dir, p), size: (await stat(p)).size });
      }
    }
  }
  await walk(dir);
  files.sort((a, b) => b.size - a.size);
  return { total: files.reduce((s, f) => s + f.size, 0), files };
}

async function main() {
  const { total, files } = await measureJs(join(ROOT, "src"));
  const line = `shipped JS: ${total} bytes in ${files.length} file(s) (limit ${LIMIT_BYTES}, excluding src/generated/)`;
  if (total >= LIMIT_BYTES) {
    for (const f of files) console.error(`  ${String(f.size).padStart(7)}  src/${f.path}`);
    console.error(`ERROR ${line}`);
    process.exit(1);
  }
  console.log(line);
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await main();
}
