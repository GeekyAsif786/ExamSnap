// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureJs, LIMIT_BYTES } from "../scripts/check-size.mjs";

test("counts .js under src as shipped, skipping src/generated, non-js files and comment-only lines", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-size-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "core"));
  await mkdir(join(dir, "ui"));
  await mkdir(join(dir, "generated"));
  await writeFile(join(dir, "core", "a.js"), `${"x".repeat(99)}\n// a comment that does not ship\n`);
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

test("per page: shared modules plus one locale module each", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-size-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "ui", "i18n"), { recursive: true });
  await writeFile(join(dir, "ui", "app.js"), "x".repeat(1000));
  await writeFile(join(dir, "ui", "i18n", "locales.js"), "x".repeat(10));
  await writeFile(join(dir, "ui", "i18n", "en.js"), "x".repeat(200));
  await writeFile(join(dir, "ui", "i18n", "hi.js"), "x".repeat(500));
  const { total, perLocale } = await measureJs(dir);
  assert.equal(total, 1710);
  assert.deepEqual(perLocale, { en: 1210, hi: 1510 });
});

test("the real src/ is within budget on every page", async () => {
  const { perLocale } = await measureJs(fileURLToPath(new URL("../src/", import.meta.url)));
  assert.deepEqual(Object.keys(perLocale), ["en", "hi"]);
  for (const [code, bytes] of Object.entries(perLocale)) assert.ok(bytes < LIMIT_BYTES, `${code}: ${bytes} >= ${LIMIT_BYTES}`);
});
