// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core/index.js";

test("core index re-exports every public function", () => {
  assert.deepEqual(Object.keys(core).sort(), ["byteRange", "cleanInk", "cropRect", "ensureJfif", "fitToRange", "isJpeg", "padJpeg", "stripMetadata"]);
  for (const fn of Object.values(core)) assert.equal(typeof fn, "function");
});
