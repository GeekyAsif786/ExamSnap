// SPDX-License-Identifier: AGPL-3.0-or-later
// Community health files GitHub's community profile looks for, and the
// anchors other files link to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const headings = (md) => [...md.matchAll(/^#{1,3} (.+)$/gm)].map((m) => m[1]);
const slug = (h) => h.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s/g, "-");

test("community profile files exist", async () => {
  for (const p of [
    "README.md", "LICENSE", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "SECURITY.md",
    ".github/PULL_REQUEST_TEMPLATE.md", ".github/ISSUE_TEMPLATE/config.yml", ".github/CODEOWNERS",
  ]) {
    await access(new URL(`../${p}`, import.meta.url));
  }
});

test("Code of Conduct: Contributor Covenant 2.1 with the enforcement contact", async () => {
  const coc = await read("CODE_OF_CONDUCT.md");
  assert.match(coc, /^# Contributor Covenant Code of Conduct$/m);
  assert.match(coc, /version 2\.1/);
  assert.match(coc, /\[conduct@asifurrahaman\.com\]\(mailto:conduct@asifurrahaman\.com\)/);
  assert.doesNotMatch(coc, /INSERT CONTACT METHOD/);
});

test("CONTRIBUTING: sections, anchors, review promise and licensing", async () => {
  const md = await read("CONTRIBUTING.md");
  const hs = headings(md);
  for (const h of [
    "Add an exam in 10 minutes", "A filled example", "Preset rules", "Verify a preset (no coding)",
    "Translations", "Code", "Reviews", "Licensing of contributions",
  ]) {
    assert.ok(hs.includes(h), h);
  }
  assert.equal(slug("Add an exam in 10 minutes"), "add-an-exam-in-10-minutes");
  for (const s of ["npm run new-preset", "npm run check", "npm run preview", "200 DPI", "overlap", "Never guess a number"]) {
    assert.ok(md.includes(s), s);
  }
  assert.match(md, /I aim to reply to issues and PRs within 48 hours\./);
  assert.match(md, /AGPL-3\.0-or-later/);
  assert.match(md, /CC0-1\.0/);
  assert.match(md, /no CLA/);
  assert.match(md, /labels\/i18n/);
  assert.match(md, /README\.md#development/);
});

test("the example preset in CONTRIBUTING is valid and matches the cm conversion", async () => {
  const md = await read("CONTRIBUTING.md");
  const json = JSON.parse(md.match(/```json\n([\s\S]+?)\n```/)[1]);
  const { buildPreset } = await import("../scripts/new-preset.mjs");
  const { preset, errors } = buildPreset(
    {
      ...json,
      notes: "",
      documents: json.documents.map((d) => ({ ...d, width: `${d.label.match(/\(([\d.]+) ×/)[1]}cm`, height: `${d.label.match(/× ([\d.]+) cm/)[1]}cm` })),
    },
    { today: json.last_verified },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(preset, json);
});

test("README and templates link to anchors that exist", async () => {
  const readme = await read("README.md");
  assert.ok(headings(readme).includes("Development"));
  assert.ok(headings(readme).includes("Supported exams"));
  assert.match(readme, /CONTRIBUTING\.md#add-an-exam-in-10-minutes/);
});
