// SPDX-License-Identifier: AGPL-3.0-or-later
// e2e hygiene: app pages start asynchronously (the locale module is a
// dynamic import), so specs must navigate with gotoReady/reloadReady, which
// wait for <html data-ready="1">, never a bare page.goto/page.reload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./e2e/", import.meta.url));
// Pages where the app never starts (the 404 page).
const NOT_APP = [/page\.goto\("\.\/no-such-page\/"\)/, /page\.goto\("\.\/no\/such\/page\/"\)/];

test("e2e specs navigate to app pages only through gotoReady / reloadReady", async () => {
  const bad = [];
  for (const name of (await readdir(DIR)).filter((n) => n.endsWith(".spec.mjs"))) {
    const lines = (await readFile(join(DIR, name), "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (/page\.(goto|reload)\(/.test(line) && !NOT_APP.some((re) => re.test(line))) bad.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the app marks itself ready as the last step of starting", async () => {
  const app = await readFile(fileURLToPath(new URL("../src/ui/app.js", import.meta.url)), "utf8");
  const code = app.trimEnd().split("\n").filter((l) => !l.trim().startsWith("//"));
  assert.equal(code.at(-1), 'document.documentElement.dataset.ready = "1";');
});
