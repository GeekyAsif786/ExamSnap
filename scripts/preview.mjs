// SPDX-License-Identifier: AGPL-3.0-or-later
// Build, then serve dist/ under BASE_PATH the way GitHub Pages does
// (404.html for unknown paths). Port: PORT or --port, default 4173.
// Output directory: --out DIR (default dist), so several previews (e.g. a
// sub-path build for e2e) can run side by side.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { DEFAULT_BASE, DEFAULT_ORIGIN, normalizeBase } from "./build-lib.mjs";
import { createDevServer, parseArgs } from "./serve.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PREVIEW_PORT = 4173;

const base = normalizeBase(process.env.BASE_PATH || DEFAULT_BASE);
const origin = process.env.SITE_ORIGIN || DEFAULT_ORIGIN;
const args = parseArgs(process.argv, { PORT: process.env.PORT ?? String(PREVIEW_PORT) });
const outIndex = process.argv.indexOf("--out");
const outDir = join(ROOT, outIndex >= 0 ? process.argv[outIndex + 1] : "dist");
const { files, jsBytes } = await build({ base, origin, outDir });
console.log(`Built ${files.length} files (shipped JS ${jsBytes} bytes).`);
createDevServer({ root: outDir, base, notFound: "404.html" }).listen(args.port, "127.0.0.1", () => {
  console.log(`ExamSnap preview: http://localhost:${args.port}${base}`);
});
