// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep the repo light: no file under docs/ may exceed LIMIT_BYTES.
// (Review screenshots live in the gitignored screenshots/ folder and are
// uploaded by CI as an artifact instead.)
import { readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const LIMIT_BYTES = 200_000; // 200 KB, read strictly as 200 000 bytes

/**
 * @param {string} dir
 * @returns {Promise<{ total: number, files: { path: string, size: number }[], oversized: { path: string, size: number }[] }>}
 */
export async function scanDocs(dir, limit = LIMIT_BYTES) {
  const files = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else files.push({ path: relative(dir, p), size: (await stat(p)).size });
    }
  }
  await walk(dir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    total: files.reduce((n, f) => n + f.size, 0),
    files,
    oversized: files.filter((f) => f.size > limit),
  };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const { total, files, oversized } = await scanDocs(join(ROOT, "docs"));
  for (const f of oversized) console.error(`ERROR docs/${f.path} is ${f.size} bytes (limit ${LIMIT_BYTES})`);
  if (oversized.length) process.exit(1);
  console.log(`docs/: ${files.length} file(s), ${total} bytes, none over ${LIMIT_BYTES}.`);
}
