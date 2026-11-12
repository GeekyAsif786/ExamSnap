// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMIT_BYTES, scanDocs } from "../scripts/check-docs-size.mjs";

test("scanDocs flags files over the limit, recursively", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-docs-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "screenshots"));
  await writeFile(join(dir, "ok.md"), "x".repeat(LIMIT_BYTES));
  await writeFile(join(dir, "screenshots", "big.png"), Buffer.alloc(LIMIT_BYTES + 1));
  const { total, oversized } = await scanDocs(dir);
  assert.equal(total, 2 * LIMIT_BYTES + 1);
  assert.deepEqual(oversized, [{ path: join("screenshots", "big.png"), size: LIMIT_BYTES + 1 }]);
});

test("the real docs/ is within the limit and holds only the two README screenshots", async () => {
  const { files, oversized } = await scanDocs(fileURLToPath(new URL("../docs/", import.meta.url)));
  assert.deepEqual(oversized, []);
  assert.deepEqual(
    files.map((f) => f.path),
    [join("screenshots", "root-empty-desktop-light.webp"), join("screenshots", "ssc-result-mobile-light.webp")],
  );
  for (const f of files) assert.ok(f.size <= 150_000, `${f.path} is ${f.size} bytes`);
});
