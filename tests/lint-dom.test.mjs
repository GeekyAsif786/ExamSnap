// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ESLint } from "eslint";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: ROOT });

async function errorsFor(relPath, code) {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, relPath) });
  return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

const BAD = {
  "el.innerHTML = x": "no-restricted-properties",
  "el.outerHTML = x": "no-restricted-properties",
  'el["innerHTML"] = x': "no-restricted-properties",
  'el.insertAdjacentHTML("beforeend", x)': "no-restricted-properties",
  "document.write(x)": "no-restricted-properties",
  "document.writeln(x)": "no-restricted-properties",
  "range.createContextualFragment(x)": "no-restricted-properties",
  "el.setHTMLUnsafe(x)": "no-restricted-properties",
  "frame.srcdoc = x": "no-restricted-properties",
  "Object.assign(el, { innerHTML: x })": "no-restricted-syntax",
  'Object.assign(el, { "outerHTML": x })': "no-restricted-syntax",
  "eval(x)": "no-eval",
  "new Function(x)": "no-new-func",
  'setTimeout("x()", 1)': "no-implied-eval",
};

for (const dir of ["src/ui", "src/core", "src/sw"]) {
  test(`${dir}: HTML-parsing and eval APIs are lint errors`, async () => {
    for (const [stmt, rule] of Object.entries(BAD)) {
      // src/core has no globals at all, so setTimeout there is already no-undef.
      const expected = dir === "src/core" && rule === "no-implied-eval" ? "no-undef" : rule;
      // src/sw is a classic script (no export); the others are modules.
      const code =
        dir === "src/sw"
          ? `function f(el, range, frame, x) {\n  ${stmt};\n}\nf();\n`
          : `export function f(el, range, frame, x) {\n  ${stmt};\n}\n`;
      const errors = await errorsFor(`${dir}/__xss_probe__.js`, code);
      assert.ok(errors.includes(expected), `${dir}: "${stmt}" should be a ${expected} error, got ${JSON.stringify(errors)}`);
    }
  });
}

test("src/ui: textContent and createElement stay allowed", async () => {
  const code = `export function f(el, x) {\n  const p = document.createElement("p");\n  p.textContent = x;\n  el.replaceChildren(p);\n}\n`;
  assert.deepEqual(await errorsFor("src/ui/__xss_probe__.js", code), []);
});
