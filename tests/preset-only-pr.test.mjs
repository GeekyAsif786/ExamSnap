// SPDX-License-Identifier: AGPL-3.0-or-later
// A preset-only pull request must pass CI with no extra steps: in a fresh
// checkout (tracked files only, so no generated presets module), edit one
// preset JSON and change nothing else, then run what CI runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// The nested `npm test` runs this file again; it must not recurse.
const NESTED = process.env.EXAMSNAP_NESTED === "1";

/** Copy the tracked files (what a fresh clone has) plus node_modules as a link. */
async function freshCheckout() {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-pr-"));
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT }).toString().split("\0").filter(Boolean);
  for (const f of tracked) {
    try {
      await access(join(ROOT, f));
    } catch {
      continue; // deleted in the working tree
    }
    await mkdir(dirname(join(dir, f)), { recursive: true });
    await copyFile(join(ROOT, f), join(dir, f));
  }
  await symlink(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(cwd, args, env = {}) {
  return new Promise((resolve) => {
    // GITHUB_* from an outer CI run must not leak into the simulated one, and
    // NODE_TEST_CONTEXT would make the nested node --test skip every file.
    const base = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("GITHUB_") && k !== "NODE_TEST_CONTEXT"),
    );
    execFile(npm, args, { cwd, env: { ...base, EXAMSNAP_NESTED: "1", ...env }, maxBuffer: 64 << 20 }, (error, stdout, stderr) =>
      resolve({ code: error ? (error.code ?? 1) : 0, out: `${stdout}\n${stderr}` }),
    );
  });
}

async function editPreset(dir, id, change) {
  const file = join(dir, "presets", `${id}.json`);
  const preset = JSON.parse(await readFile(file, "utf8"));
  change(preset);
  await writeFile(file, `${JSON.stringify(preset, null, 2)}\n`);
}

test("preset-only PR: edit a preset JSON, nothing else; check and unit tests pass", { skip: NESTED, timeout: 180_000 }, async (t) => {
  const dir = await freshCheckout();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(access(join(dir, "src/generated/presets.js")), "a fresh checkout has no generated module");

  // Re-checking a preset: one more source and today's date.
  await editPreset(dir, "ssc", (p) => {
    p.sources.push({ title: "Re-checked against the portal", url: "https://ssc.example/notice", type: "secondary" });
    p.last_verified = "2026-11-12";
  });
  const check = await run(dir, ["run", "check"]);
  assert.equal(check.code, 0, check.out);
  const tests = await run(dir, ["test"]);
  assert.equal(tests.code, 0, tests.out);
  assert.match(tests.out, /ℹ pass [1-9]\d*/);
  assert.match(tests.out, /ℹ fail 0/);
  assert.match(await readFile(join(dir, "src/generated/presets.js"), "utf8"), /Re-checked against the portal/);
});

test("preset-only PR that changes a number and notes: check and tests pass on the PR, with warnings", { skip: NESTED, timeout: 180_000 }, async (t) => {
  const dir = await freshCheckout();
  t.after(() => rm(dir, { recursive: true, force: true }));
  // New numbers and new English notes: the README table and the translation
  // review are stale, which is the maintainer's job before merging.
  await editPreset(dir, "ssc", (p) => {
    p.documents[0].max_kb = 60;
    p.notes = `${p.notes} Re-checked against the portal.`;
  });
  const pr = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge" };
  const check = await run(dir, ["run", "check"], pr);
  assert.equal(check.code, 0, check.out);
  assert.match(check.out, /::warning title=README exams table::/);
  assert.match(check.out, /::warning title=Translation review::/);
  const tests = await run(dir, ["test"], pr);
  assert.equal(tests.code, 0, tests.out);
  assert.match(tests.out, /ℹ fail 0/);
  // After merge (push to main) the stale table is an error until regenerated.
  const main = await run(dir, ["run", "check"], { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" });
  assert.notEqual(main.code, 0);
});
