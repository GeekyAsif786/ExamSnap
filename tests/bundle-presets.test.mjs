// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundlePresets, run, OUT_PATH, PRESETS_DIR } from "../scripts/bundle-presets.mjs";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/presets/${name}/`, import.meta.url));

/** Import a module's source text without touching disk. */
const importSource = (src) => import(`data:text/javascript,${encodeURIComponent(src)}`);

test("bundled module has a generated-file header and CC0 SPDX line", async () => {
  const src = await bundlePresets(fixture("valid"));
  assert.match(src, /^\/\/ SPDX-License-Identifier: CC0-1\.0\n/);
  assert.match(src, /GENERATED FILE — DO NOT EDIT BY HAND/);
});

test("PRESETS is sorted by category, then name", async () => {
  const { PRESETS } = await importSource(await bundlePresets(PRESETS_DIR));
  assert.equal(PRESETS.length, 4);
  const keys = PRESETS.map((p) => [p.category, p.name]);
  const sorted = [...keys].sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  assert.deepEqual(keys, sorted);
  assert.deepEqual(
    PRESETS.map((p) => p.id),
    ["banking-ibps", "jee-main", "ssc", "upsc-cse"],
  );
});

test("PRESETS round-trips the JSON exactly", async () => {
  const { PRESETS } = await importSource(await bundlePresets(PRESETS_DIR));
  const ssc = JSON.parse(await readFile(join(PRESETS_DIR, "ssc.json"), "utf8"));
  assert.deepEqual(
    PRESETS.find((p) => p.id === "ssc"),
    ssc,
  );
});

test("invalid presets are refused", async () => {
  await assert.rejects(bundlePresets(fixture("extra-property")), /invalid presets/);
});

test("the committed src/generated/presets.js is up to date", async () => {
  assert.equal(await readFile(OUT_PATH, "utf8"), await bundlePresets());
});

test("--check reports stale without writing; build writes, then is fresh", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "examsnap-bundle-"));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  const dir = join(tmp, "presets");
  const out = join(tmp, "presets.js");
  await cp(fixture("valid"), dir, { recursive: true });

  // Missing output counts as stale.
  assert.deepEqual(await run({ check: true, dir, out }), { stale: true, written: false });

  await writeFile(out, "// hand edited\n");
  assert.deepEqual(await run({ check: true, dir, out }), { stale: true, written: false });
  assert.equal(await readFile(out, "utf8"), "// hand edited\n");

  assert.deepEqual(await run({ dir, out }), { stale: true, written: true });
  assert.deepEqual(await run({ check: true, dir, out }), { stale: false, written: false });
});
