// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { END, README_PATH, START, STALE_SUMMARY, VERIFY_URL, cell, examsTable, replaceBlock, run, staleSeverity } from "../scripts/update-readme.mjs";
import { execFile } from "node:child_process";
import { readPresets } from "../scripts/bundle-presets.mjs";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/presets/${name}/`, import.meta.url));

const preset = (over = {}) => ({
  id: "x",
  name: "X exam",
  category: "Other",
  last_verified: "2026-11-12",
  sources: [{ title: "t", url: "https://e.example/", type: "notice" }],
  documents: [{ id: "photo", label: "Photo", kind: "photo", width: 200, height: 230, min_kb: 20, max_kb: 50, filename: "photo.jpg" }],
  ...over,
});

test("table: exam linked to its landing page, documents, source status", () => {
  const two = [
    preset(),
    preset({
      id: "y",
      name: "Y",
      sources: [{ title: "t", url: "https://e.example/", type: "secondary" }],
      documents: [
        { id: "a", label: "A", kind: "photo", width: 1, height: 2, min_kb: 3, max_kb: 4, filename: "a.jpg" },
        { id: "b", label: "B", kind: "signature", width: 5, height: 6, min_kb: 7, max_kb: 8.5, filename: "b.jpg" },
      ],
    }),
  ];
  assert.equal(
    examsTable(two, { origin: "https://site.example/" }),
    [
      "| Exam | Documents | Source |",
      "| --- | --- | --- |",
      "| [X exam](https://site.example/x/) | Photo: 200×230 px, 20–50 KB | Official notice |",
      `| [Y](https://site.example/y/) | A: 1×2 px, 3–4 KB<br>B: 5×6 px, 7–8.5 KB | [⚠ Needs verification](${VERIFY_URL}) |`,
    ].join("\n"),
  );
  assert.match(examsTable([preset()]), /\(https:\/\/examsnap\.xac3\.xyz\/x\/\)/);
});

test("portal-only sources still need verification", () => {
  const t = examsTable([preset({ sources: [{ title: "t", url: "https://e.example/", type: "portal" }] })]);
  assert.match(t, /⚠ Needs verification/);
});

test("cell escapes Markdown and HTML that would break the table", () => {
  assert.equal(cell("A | B"), "A \\| B");
  assert.equal(cell("[x](javascript:1)"), "\\[x\\](javascript:1)");
  assert.equal(cell("<img src=x>"), "&lt;img src=x&gt;");
  assert.equal(cell("a_b*c`d\\"), "a\\_b\\*c\\`d\\\\");
  assert.equal(cell("two\nlines"), "two lines");
});

test("replaceBlock swaps only the marked block and rejects bad markers", () => {
  const doc = `top\n${START}\nold\n${END}\nbottom\n`;
  assert.equal(replaceBlock(doc, "T"), `top\n${START}\nT\n${END}\nbottom\n`);
  assert.throws(() => replaceBlock("no markers", "T"), /exactly once/);
  assert.throws(() => replaceBlock(`${END}\n${START}`, "T"), /exactly once/);
  assert.throws(() => replaceBlock(`${START}${START}${END}`, "T"), /exactly once/);
});

test("run: --check reports stale without writing; write mode fixes it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-readme-"));
  try {
    const readme = join(dir, "README.md");
    await writeFile(readme, `# R\n${START}\nstale\n${END}\n`);
    assert.deepEqual(await run({ check: true, dir: fixture("valid"), readme }), { stale: true, written: false });
    assert.match(await readFile(readme, "utf8"), /stale/);
    assert.deepEqual(await run({ dir: fixture("valid"), readme }), { stale: true, written: true });
    assert.deepEqual(await run({ check: true, dir: fixture("valid"), readme }), { stale: false, written: false });
    assert.doesNotMatch(await readFile(readme, "utf8"), /stale/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the committed README table is up to date and lists every preset", async (t) => {
  // On a pull request a stale table is the maintainer's job (a warning in npm run check).
  const { stale } = await run({ check: true });
  if (stale && staleSeverity(process.env) === "warning") return t.skip("README table stale on a PR: maintainer regenerates it");
  assert.equal(stale, false);
  const text = await readFile(README_PATH, "utf8");
  for (const p of await readPresets()) assert.ok(text.includes(`(https://examsnap.xac3.xyz/${p.id}/)`), p.id);
  assert.match(text, /Your exam missing\? \[Request it\]\(https:\/\/github\.com\/GeekyAsif786\/ExamSnap\/issues\/new\?template=request-exam\.yml&title=%5BExam%5D%20\) · \[Add it yourself in 10 minutes\]\(CONTRIBUTING\.md#add-an-exam-in-10-minutes\)/);
  assert.match(text, /contrib\.rocks\/image\?repo=GeekyAsif786\/ExamSnap/);
});

test("staleSeverity: error locally and on push to main, warning on pull requests", () => {
  assert.equal(staleSeverity({}), "error");
  assert.equal(staleSeverity({ GITHUB_EVENT_NAME: "pull_request" }), "error", "not in Actions");
  const gh = { GITHUB_ACTIONS: "true" };
  assert.equal(staleSeverity({ ...gh, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" }), "error");
  assert.equal(staleSeverity({ ...gh, GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/9/merge" }), "warning");
  assert.equal(staleSeverity({ ...gh, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/add-neet" }), "warning");
});

const SCRIPT = fileURLToPath(new URL("../scripts/update-readme.mjs", import.meta.url));
function checkStale(readme, env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GITHUB_")));
  return new Promise((resolve) =>
    execFile(process.execPath, [SCRIPT, "--check", "--readme", readme], { env: { ...clean, ...env } }, (error, stdout, stderr) =>
      resolve({ code: error ? error.code : 0, stdout, stderr }),
    ),
  );
}

test("--check on a stale README: ::warning + job summary line on a PR, error on push to main", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-readme-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const readme = join(dir, "README.md");
  const summary = join(dir, "summary.md");
  await writeFile(readme, `# T\n\n${START}\nold\n${END}\n`);
  await writeFile(summary, "");

  const pr = await checkStale(readme, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge", GITHUB_STEP_SUMMARY: summary });
  assert.equal(pr.code, 0, pr.stderr);
  assert.match(pr.stdout, /^::warning title=README exams table::README\.md exams table is out of date\./m);
  assert.equal(await readFile(summary, "utf8"), STALE_SUMMARY);
  assert.match(STALE_SUMMARY, /npm run update-readme/);
  assert.match(await readFile(readme, "utf8"), /\nold\n/, "--check never writes");

  const main = await checkStale(readme, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" });
  assert.equal(main.code, 1);
  assert.match(main.stderr, /ERROR README\.md exams table is out of date\. Run: npm run update-readme/);

  const local = await checkStale(readme, {});
  assert.equal(local.code, 1);
});
