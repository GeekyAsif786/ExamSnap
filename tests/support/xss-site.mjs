// SPDX-License-Identifier: AGPL-3.0-or-later
// Build a site whose only preset is tests/fixtures/presets/xss (hostile
// name/notes/labels/source title), for the XSS unit and e2e tests.
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../../scripts/build.mjs";
import { bundlePresets } from "../../scripts/bundle-presets.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const XSS_PRESET_DIR = join(ROOT, "tests/fixtures/presets/xss");
export const PAYLOADS = ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "</script>"];

/**
 * @param {{ base?: string }} [options]
 * @returns {Promise<{ outDir: string, cleanup: () => Promise<void> }>}
 */
export async function buildXssSite({ base = "/" } = {}) {
  const src = await mkdtemp(join(tmpdir(), "examsnap-xss-src-"));
  const outDir = await mkdtemp(join(tmpdir(), "examsnap-xss-out-"));
  for (const p of ["index.html", "favicon.svg", "icons", "src"]) await cp(join(ROOT, p), join(src, p), { recursive: true });
  await mkdir(join(src, "src/generated"), { recursive: true });
  await writeFile(join(src, "src/generated/presets.js"), await bundlePresets(XSS_PRESET_DIR));
  await build({ root: src, outDir, base });
  return {
    outDir,
    cleanup: () => Promise.all([rm(src, { recursive: true, force: true }), rm(outDir, { recursive: true, force: true })]),
  };
}
