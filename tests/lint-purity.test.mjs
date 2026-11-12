// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ESLint } from "eslint";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: ROOT });

/**
 * Lint `code` as if it were a file at `relPath`, using the repo's real
 * eslint.config.js. Nothing is written to disk.
 */
async function lintAs(relPath, code) {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, relPath) });
  return result.messages;
}

const undefNames = (messages) =>
  messages.filter((m) => m.ruleId === "no-undef").map((m) => m.message.match(/'(.+?)'/)[1]);

test("src/core: browser and Node globals are no-undef errors", async () => {
  const messages = await lintAs(
    "src/core/__purity_probe__.js",
    "export const a = window.x;\nexport const b = document.title;\nexport const c = process.env;\n",
  );
  assert.deepEqual(undefNames(messages), ["window", "document", "process"]);
  assert.ok(messages.every((m) => m.severity === 2), "no-undef is an error, not a warning");
});

test("src/core: ES built-ins are allowed", async () => {
  const messages = await lintAs(
    "src/core/__purity_probe__.js",
    "export const a = new Uint8Array(Math.ceil(1.5));\nexport const b = Promise.resolve(Number.isNaN(NaN));\n",
  );
  assert.deepEqual(messages, []);
});

test("src/ui: browser globals are allowed", async () => {
  const messages = await lintAs("src/ui/__purity_probe__.js", "export const a = window.x;\n");
  assert.deepEqual(messages, []);
});
