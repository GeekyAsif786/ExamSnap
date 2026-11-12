// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureJs, LIMIT_BYTES } from "../scripts/check-size.mjs";

test("counts .js under src, skipping src/generated and non-js files", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-size-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "core"));
  await mkdir(join(dir, "ui"));
  await mkdir(join(dir, "generated"));
  await writeFile(join(dir, "core", "a.js"), "x".repeat(100));
  await writeFile(join(dir, "ui", "b.js"), "x".repeat(50));
  await writeFile(join(dir, "ui", "styles.css"), "x".repeat(999));
  await writeFile(join(dir, "generated", "presets.js"), "x".repeat(10_000));
  const { total, files } = await measureJs(dir);
  assert.equal(total, 150);
  assert.deepEqual(
    files.map((f) => f.path),
    [join("core", "a.js"), join("ui", "b.js")],
  );
});

test("the real src/ is within budget", async () => {
  const { total } = await measureJs(fileURLToPath(new URL("../src/", import.meta.url)));
  assert.ok(total < LIMIT_BYTES, `${total} >= ${LIMIT_BYTES}`);
});
