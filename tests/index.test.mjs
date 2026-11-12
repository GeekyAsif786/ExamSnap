// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core/index.js";

test("core index re-exports every public function", () => {
  assert.deepEqual(Object.keys(core).sort(), ["byteRange", "cleanInk", "cropRect", "fitToRange", "isJpeg", "padJpeg"]);
  for (const fn of Object.values(core)) assert.equal(typeof fn, "function");
});

test("src/core has no DOM access", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../src/core/", import.meta.url);
  for (const name of await readdir(dir)) {
    const src = await readFile(new URL(name, dir), "utf8");
    assert.doesNotMatch(src, /\b(document|window|navigator|HTMLElement|OffscreenCanvas|createElement)\b/, name);
  }
});
