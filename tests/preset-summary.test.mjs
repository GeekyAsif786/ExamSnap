// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedPresetIds, summaryMarkdown } from "../scripts/preset-summary.mjs";

const doc = (over = {}) => ({ id: "photo", label: "Photo", kind: "photo", width: 200, height: 230, min_kb: 20, max_kb: 50, filename: "photo.jpg", ...over });
const preset = (id, over = {}) => ({
  id,
  name: `Exam ${id}`,
  category: "Other",
  last_verified: "2026-11-01",
  sources: [
    { title: "s", url: "https://e.example/", type: "secondary" },
    { title: "n", url: "https://e.example/n", type: "notice" },
  ],
  documents: [doc()],
  ...over,
});

test("table rows: every preset × document with pixels, KB, bytes, sources, last verified", () => {
  const md = summaryMarkdown([preset("a", { documents: [doc(), doc({ id: "sig", label: "Sig | x", width: 140, height: 60, min_kb: 10, max_kb: 10.2 })] })], new Set());
  const rows = md.split("\n").filter((l) => l.startsWith("|  |"));
  assert.deepEqual(rows, [
    "|  | Exam a (`a`) | Photo | 200×230 | 20–50 | 20480–50000 | notice, secondary | 2026-11-01 |",
    // 10–10.2 KB has no room at 1024 bytes per KB, so both ends use 1000.
    "|  | Exam a (`a`) | Sig \\| x | 140×60 | 10–10.2 | 10000–10200 (1000-byte KB) | notice, secondary | 2026-11-01 |",
  ]);
  assert.match(md, /^## Presets\n\n1 presets, 2 documents\.\n\n\| \| Exam \| Document \| Pixels \| KB range \| Bytes \(min–max\) \| Sources \| Last verified \|\n/);
});

test("changed presets come first and are marked; removed ones are listed", () => {
  const md = summaryMarkdown([preset("a"), preset("b"), preset("c")], new Set(["c", "gone"]), { base: "origin/main" });
  const exams = md.split("\n").filter((l) => /^\| (\*\*changed\*\*)? \| Exam/.test(l));
  assert.deepEqual(exams.map((l) => l.split(" | ").slice(0, 2).join(" | ")), ["| **changed** | Exam c (`c`)", "|  | Exam a (`a`)", "|  | Exam b (`b`)"]);
  assert.match(md, /Changed vs `origin\/main`: `c`\. Removed: `gone`\./);
  assert.match(summaryMarkdown([preset("a")], new Set(), { base: "origin/main" }), /No presets changed vs `origin\/main`\./);
  assert.match(summaryMarkdown([preset("a")], new Set(), { base: "x", error: "fatal: bad revision" }), /Couldn't diff against `x`: fatal: bad revision/);
});

test("preset text is escaped so it can't break the table or inject HTML", () => {
  const md = summaryMarkdown([preset("a", { name: "<script>|x", documents: [doc({ label: "a\nb" })] })], new Set());
  assert.match(md, /\| &lt;script&gt;\\\|x \(`a`\) \| a b \|/);
  assert.doesNotMatch(md, /<script>/);
});

test("changedPresetIds diffs presets/ against the merge base", async () => {
  const dir = await mkdtemp(join(tmpdir(), "examsnap-summary-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    await mkdir(join(dir, "presets"));
    for (const id of ["a", "b", "c"]) await writeFile(join(dir, "presets", `${id}.json`), `{"id":"${id}"}\n`);
    await writeFile(join(dir, "README.md"), "x\n");
    git("add", ".");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "pr");
    await writeFile(join(dir, "presets", "a.json"), '{"id":"a","x":1}\n');
    await writeFile(join(dir, "presets", "new.json"), '{"id":"new"}\n');
    await unlink(join(dir, "presets", "c.json"));
    await writeFile(join(dir, "README.md"), "y\n");
    git("add", "-A");
    git("commit", "-qm", "pr");
    // main moves on after the branch point; that change is not the PR's.
    git("checkout", "-q", "main");
    await writeFile(join(dir, "presets", "b.json"), '{"id":"b","y":2}\n');
    git("commit", "-qam", "main moves");
    git("checkout", "-q", "pr");

    assert.deepEqual(await changedPresetIds("main", { cwd: dir }), { ids: new Set(["a", "c", "new"]) });
    const bad = await changedPresetIds("nope", { cwd: dir });
    assert.deepEqual(bad.ids, new Set());
    assert.match(bad.error, /nope/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
