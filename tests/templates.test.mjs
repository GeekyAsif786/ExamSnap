// SPDX-License-Identifier: AGPL-3.0-or-later
// Community files: issue/discussion/PR templates, CODEOWNERS, release notes.
// Text checks (no YAML parser); labels must exist in .github/labels.yml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { LABELS_PATH, parseLabels } from "../scripts/sync-labels.mjs";

const gh = (p) => new URL(`../.github/${p}`, import.meta.url);
const read = (p) => readFile(gh(p), "utf8");
const known = async () => new Set(parseLabels(await readFile(LABELS_PATH, "utf8")).map((l) => l.name));
/** `labels: [a, b]` → ["a", "b"] */
const labelsOf = (text) => {
  const m = text.match(/^labels: \[(.*)\]$/m);
  return m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : [];
};
const ids = (text) => [...text.matchAll(/^ {4}id: (\S+)$/gm)].map((m) => m[1]);

test("issue forms: names, labels from labels.yml, unique field ids", async () => {
  const labels = await known();
  const names = (await readdir(gh("ISSUE_TEMPLATE/"))).sort();
  assert.deepEqual(names, ["add-preset.yml", "bug.yml", "config.yml", "feature.yml", "request-exam.yml", "wrong-spec.yml"]);
  const expected = {
    "request-exam.yml": ["preset", "needs-triage"],
    "add-preset.yml": ["preset"],
    "wrong-spec.yml": ["preset", "bug"],
    "bug.yml": ["bug", "needs-triage"],
    "feature.yml": ["enhancement", "needs-triage"],
  };
  for (const [name, want] of Object.entries(expected)) {
    const text = await read(`ISSUE_TEMPLATE/${name}`);
    assert.match(text, /^name: .+\ndescription: .+\n/, name);
    assert.deepEqual(labelsOf(text), want, name);
    for (const l of labelsOf(text)) assert.ok(labels.has(l), `${name}: unknown label ${l}`);
    const fieldIds = ids(text);
    assert.equal(new Set(fieldIds).size, fieldIds.length, `${name}: duplicate ids`);
  }
});

test("request-exam: [Exam] title, and the field ids the app prefills", async () => {
  const text = await read("ISSUE_TEMPLATE/request-exam.yml");
  assert.match(text, /^title: "\[Exam\] "$/m);
  assert.deepEqual(ids(text), ["exam", "notice", "specs", "self"]);
  assert.match(text, /I can add it myself/);
  // The notice link is optional; the exam name is required.
  assert.match(text, /id: exam\n[\s\S]*?required: true/);
  assert.match(text, /id: notice\n[\s\S]*?required: false/);
});

test("add-preset requires the notice link; wrong-spec asks for the portal's message", async () => {
  assert.match(await read("ISSUE_TEMPLATE/add-preset.yml"), /id: notice\n[\s\S]*?required: true/);
  const wrong = await read("ISSUE_TEMPLATE/wrong-spec.yml");
  assert.deepEqual(ids(wrong), ["preset", "document", "portal", "notice"]);
});

test("bug form and Q&A warn against posting personal photos", async () => {
  for (const p of ["ISSUE_TEMPLATE/bug.yml", "DISCUSSION_TEMPLATE/q-a.yml"]) {
    assert.match(await read(p), /don't (attach|post) (personal photos|your photo)/i, p);
  }
  assert.deepEqual(ids(await read("ISSUE_TEMPLATE/bug.yml")), ["device", "browser", "steps", "expected"]);
});

test("config: no blank issues; Q&A and security policy contact links", async () => {
  const text = await read("ISSUE_TEMPLATE/config.yml");
  assert.match(text, /^blank_issues_enabled: false$/m);
  assert.match(text, /url: https:\/\/github\.com\/GeekyAsif786\/ExamSnap\/discussions\/new\?category=q-a$/m);
  assert.match(text, /url: https:\/\/github\.com\/GeekyAsif786\/ExamSnap\/security\/policy$/m);
});

test("discussion forms exist for the ideas and q-a categories", async () => {
  assert.deepEqual((await readdir(gh("DISCUSSION_TEMPLATE/"))).sort(), ["ideas.yml", "q-a.yml"]);
  assert.deepEqual(ids(await read("DISCUSSION_TEMPLATE/q-a.yml")), ["exam", "document", "browser", "portal", "question"]);
});

test("PR template has the general and preset checklists", async () => {
  const text = await read("PULL_REQUEST_TEMPLATE.md");
  for (const s of ["npm run check", "official notification", "npm run preview", "real photo", "last_verified"]) {
    assert.ok(text.includes(s), s);
  }
});

test("CODEOWNERS: the maintainer owns everything", async () => {
  assert.match(await read("CODEOWNERS"), /^\* @GeekyAsif786$/m);
});

test("release notes: categories by label, in order", async () => {
  const text = await read("release.yml");
  const labels = await known();
  const cats = [...text.matchAll(/- title: (.+)\n\s+labels: \[(.+)\]/g)].map((m) => [m[1], m[2].replace(/"/g, "")]);
  assert.deepEqual(cats, [
    ["Fixes", "bug"],
    ["New exams", "preset"],
    ["Features", "enhancement"],
    ["Translations", "i18n"],
    ["Docs", "documentation"],
    ["Dependencies", "dependencies"],
    // The catch-all only takes PRs no earlier category matched, so it is last.
    ["Other changes", "*"],
  ]);
  for (const [, l] of cats) if (l !== "*") assert.ok(labels.has(l), l);
});
