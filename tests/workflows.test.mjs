// SPDX-License-Identifier: AGPL-3.0-or-later
// Supply-chain rules for .github/workflows (text checks; no YAML parser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const workflows = async () => {
  const names = (await readdir(DIR)).filter((n) => /\.ya?ml$/.test(n)).sort();
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(join(DIR, name), "utf8") })));
};

test("every action is pinned to a full commit SHA with its version in a comment", async () => {
  for (const { name, text } of await workflows()) {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((m) => m[1].trim());
    assert.ok(uses.length > 0, name);
    for (const u of uses) {
      assert.match(u, /^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${name}: ${u}`);
    }
  }
});

test("every workflow declares least-privilege permissions", async () => {
  for (const { name, text } of await workflows()) {
    assert.match(text, /^permissions:\n {2}contents: read\n/m, `${name}: top-level permissions must be contents: read`);
    assert.doesNotMatch(text, /permissions:\s*write-all|permissions:\s*read-all/, name);
  }
});

test("npm ci never runs install scripts", async () => {
  for (const { name, text } of await workflows()) {
    for (const m of text.matchAll(/npm ci\b.*$/gm)) assert.match(m[0], /--ignore-scripts/, `${name}: ${m[0]}`);
  }
});

test("deploy: only from main, github-pages environment, Pages/OIDC only on the deploy job", async () => {
  const { text } = (await workflows()).find((w) => w.name === "deploy.yml");
  assert.equal(text.match(/if: github\.ref == 'refs\/heads\/main'/g).length, 2);
  assert.match(text, /environment:\n\s+name: github-pages/);
  const deployJob = text.slice(text.indexOf("\n  deploy:"));
  assert.match(deployJob, /pages: write\n\s+id-token: write/);
  assert.doesNotMatch(text.slice(0, text.indexOf("\n  deploy:")), /pages: write|id-token: write/);
});

test("CI runs npm audit on runtime dependencies; CodeQL covers JavaScript on PR, main and weekly", async () => {
  const all = await workflows();
  const ci = all.find((w) => w.name === "ci.yml").text;
  assert.match(ci, /npm audit --omit=dev --audit-level=high/);
  const codeql = all.find((w) => w.name === "codeql.yml").text;
  assert.match(codeql, /pull_request:/);
  assert.match(codeql, /push:\n\s+branches: \[main\]/);
  assert.match(codeql, /schedule:\n\s+- cron:/);
  assert.match(codeql, /languages: javascript-typescript/);
  assert.match(codeql, /security-events: write/);
});

test("CI uploads review screenshots on every PR (14 days)", async () => {
  const ci = (await workflows()).find((w) => w.name === "ci.yml").text;
  assert.match(ci, /- run: npm run screenshots\n\s+if: github\.event_name == 'pull_request'/);
  assert.match(ci, /name: screenshots\n\s+path: screenshots\/\n\s+retention-days: 14/);
});

test("no workflow uses pull_request_target; CI explains why", async () => {
  for (const { name, text } of await workflows()) {
    const code = text.replace(/#.*$/gm, "");
    assert.doesNotMatch(code, /pull_request_target/, name);
  }
  const ci = (await workflows()).find((w) => w.name === "ci.yml").text;
  assert.match(ci, /^on:\n {2}push:\n {2}pull_request:\n/m);
  assert.match(ci, /# Triggers stay push and pull_request\. Never use pull_request_target/);
});

test("CI test job writes the preset summary from full history, base ref via env", async () => {
  const ci = (await workflows()).find((w) => w.name === "ci.yml").text;
  const testJob = ci.slice(ci.indexOf("\n  test:"), ci.indexOf("\n  e2e:"));
  assert.match(testJob, /persist-credentials: false\n(\s+#.*\n)*\s+fetch-depth: 0\n/);
  assert.match(testJob, /BASE_REF: \$\{\{ github\.base_ref \|\| 'main' \}\}/);
  assert.match(testJob, /run: node scripts\/preset-summary\.mjs --base "origin\/\$BASE_REF" >> "\$GITHUB_STEP_SUMMARY"/);
  // No ${{ }} expression inside any run: line (script injection).
  for (const m of ci.matchAll(/^\s+(?:- )?run: (.*)$/gm)) assert.doesNotMatch(m[1], /\$\{\{/, m[0]);
});

test("the required check names stay test, e2e and codeql", async () => {
  const all = await workflows();
  const jobs = (name) => {
    const text = all.find((w) => w.name === name).text;
    return [...text.slice(text.indexOf("\njobs:")).matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]);
  };
  assert.deepEqual(jobs("ci.yml"), ["test", "e2e"]);
  assert.deepEqual(jobs("codeql.yml"), ["codeql"]);
});
