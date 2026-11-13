// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  CM_NOTE,
  buildPreset,
  checkCategory,
  checkDimension,
  checkFilename,
  checkId,
  checkKb,
  checkKbRange,
  checkSourceType,
  checkUrl,
  cmToPx,
  docIdFor,
  localDate,
  takenIds,
} from "../scripts/new-preset.mjs";
import { validatePresets } from "../scripts/check-presets.mjs";
import { END, START } from "../scripts/update-readme.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/new-preset.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/presets/valid/", import.meta.url));

const ANSWERS = {
  id: "neet-ug",
  name: "NEET UG (NTA)",
  category: "Entrance exams",
  notes: "Sources agree.",
  sources: [{ title: "NTA NEET UG information bulletin", url: "https://neet.nta.nic.in/bulletin.pdf", type: "notice" }],
  documents: [
    { label: "Photograph (3.5 × 4.5 cm)", kind: "photo", width: "3.5cm", height: "4.5 cm", min_kb: 10, max_kb: 200, notes: "White background." },
    { label: "Signature", kind: "signature", width: 276, height: "118", min_kb: "4", max_kb: 30, filename: "sign.jpg" },
  ],
};

// ---- helpers -----------------------------------------------------------------

test("checkId: kebab-case, not reserved, not taken", () => {
  assert.deepEqual(checkId("neet-ug"), { ok: true, value: "neet-ug" });
  assert.deepEqual(checkId("  neet-ug "), { ok: true, value: "neet-ug" });
  for (const bad of ["", "NEET", "neet_ug", "neet--ug", "-neet", "neet-", "neet ug"]) {
    assert.equal(checkId(bad).ok, false, JSON.stringify(bad));
  }
  assert.match(checkId("").error, /required/);
  assert.match(checkId("Neet").error, /kebab-case/);
  assert.match(checkId("custom").error, /reserved/);
  assert.match(checkId("icons").error, /reserved/);
  assert.match(checkId("src").error, /reserved/);
  for (const lang of ["hi", "en", "ta", "zz"]) assert.match(checkId(lang).error, /two-letter ids are language folders/, lang);
  assert.equal(checkId("hindi").ok, true, "only exactly two letters");
  assert.match(checkId("ssc", new Set(["ssc"])).error, /already taken by presets\/ssc\.json/);
});

test("cmToPx at 200 DPI matches the existing presets", () => {
  assert.equal(cmToPx(3.5), 276);
  assert.equal(cmToPx(4.5), 354);
  assert.equal(cmToPx(6), 472);
  assert.equal(cmToPx(2), 157);
  assert.equal(cmToPx(1.5), 118);
});

test("checkDimension: pixels or cm, within the schema bounds", () => {
  assert.deepEqual(checkDimension("276", "width"), { ok: true, value: 276 });
  assert.deepEqual(checkDimension(276, "width"), { ok: true, value: 276 });
  assert.deepEqual(checkDimension("3.5cm", "width"), { ok: true, value: 276, info: "3.5 cm = 276 px at 200 DPI", cm: true });
  assert.equal(checkDimension("4.5 CM", "height").value, 354);
  assert.match(checkDimension("12.5", "width").error, /whole number of pixels/);
  assert.match(checkDimension("3.5 in", "width").error, /whole number/);
  assert.match(checkDimension("", "width").error, /whole number/);
  assert.match(checkDimension("49", "width").error, /width must be 50–4000 px \(got 49\)/);
  assert.equal(checkDimension("30", "height").ok, true);
  assert.match(checkDimension("29", "height").error, /height must be 30–4000 px/);
  assert.match(checkDimension("60cm", "width").error, /got 4724/);
});

test("checkKb and checkKbRange use the same byte rule as the app", () => {
  assert.deepEqual(checkKb("12.5"), { ok: true, value: 12.5 });
  for (const bad of ["", "0", "-1", "abc", "1e999"]) assert.equal(checkKb(bad).ok, false, bad);
  assert.equal(checkKbRange(20, 50).ok, true);
  assert.match(checkKbRange(20, 20).error, /must be greater than min KB/);
  assert.match(checkKbRange(10, 10.003).error, /bytes wide/);
});

test("category, source type, URL and filename checks", () => {
  assert.equal(checkCategory("2").value, CATEGORIES[1]);
  assert.equal(checkCategory("banking").value, "Banking");
  assert.match(checkCategory("9").error, /one of: Banking, Government jobs, Entrance exams, Other/);
  assert.equal(checkSourceType("Notice").value, "notice");
  assert.match(checkSourceType("blog").error, /notice, portal, secondary/);
  assert.equal(checkUrl("https://x.example/a.pdf").ok, true);
  for (const bad of ["http://x.example/", "javascript:alert(1)", "https://", "x.example"]) assert.equal(checkUrl(bad).ok, false, bad);
  assert.equal(checkFilename("photo_1.jpg").ok, true);
  for (const bad of ["photo.jpeg", "my photo.jpg", "../x.jpg", "photo.JPG"]) assert.equal(checkFilename(bad).ok, false, bad);
});

test("docIdFor numbers repeated kinds; localDate is YYYY-MM-DD local time", () => {
  assert.equal(docIdFor("photo", new Set()), "photo");
  assert.equal(docIdFor("photo", new Set(["photo", "photo-2"])), "photo-3");
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("buildPreset: schema key order, derived ids and filenames, cm note", () => {
  const { preset, errors } = buildPreset(ANSWERS, { today: "2026-11-12" });
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(preset), ["id", "name", "category", "notes", "last_verified", "sources", "documents"]);
  assert.equal(preset.notes, `Sources agree. ${CM_NOTE}`);
  assert.equal(preset.last_verified, "2026-11-12");
  assert.deepEqual(preset.documents, [
    { id: "photo", label: "Photograph (3.5 × 4.5 cm)", kind: "photo", width: 276, height: 354, min_kb: 10, max_kb: 200, filename: "photo.jpg", notes: "White background." },
    { id: "signature", label: "Signature", kind: "signature", width: 276, height: 118, min_kb: 4, max_kb: 30, filename: "sign.jpg" },
  ]);
  // No cm, no notes → no notes key.
  const px = buildPreset({ ...ANSWERS, notes: "", documents: [{ ...ANSWERS.documents[1] }] }).preset;
  assert.equal("notes" in px, false);
  // The cm note is not duplicated.
  assert.equal(buildPreset({ ...ANSWERS, notes: CM_NOTE }).preset.notes, CM_NOTE);
});

test("buildPreset reports every problem with its path", () => {
  const { preset, errors } = buildPreset(
    {
      id: "ssc",
      name: "X",
      category: "Sports",
      sources: [{ url: "http://x", type: "blog" }],
      documents: [
        { id: "photo", label: "", kind: "selfie", width: "3.5in", height: 10, min_kb: 20, max_kb: 20, filename: "a.png" },
        { id: "photo", label: "B", kind: "photo", width: 100, height: 100, min_kb: 1, max_kb: 2 },
      ],
    },
    { taken: new Set(["ssc"]) },
  );
  assert.equal(preset, null);
  assert.deepEqual(errors, [
    'id: "ssc" is already taken by presets/ssc.json',
    "name: at least 3 characters",
    "category: one of: Banking, Government jobs, Entrance exams, Other",
    "sources[0].title: required",
    "sources[0].url: must start with https://",
    "sources[0].type: one of: notice, portal, secondary",
    "documents[0].kind: one of: photo, signature, thumb, document",
    "documents[0].max_kb: max KB (20) must be greater than min KB (20)",
    "documents[0].filename: letters, digits, - and _ only, ending in .jpg, e.g. photo.jpg",
    "documents[0].label: required",
    'documents[0].width: a whole number of pixels, or centimetres like "3.5cm"',
    "documents[0].height: height must be 30–4000 px (got 10)",
    'documents[1].id: duplicate document id "photo"',
  ]);
  assert.deepEqual(buildPreset({}).errors.slice(-2), ["sources: at least one source is required", "documents: at least one document is required"]);
});

// ---- CLI runs into a temp dir --------------------------------------------------

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "examsnap-new-preset-"));
  const dir = join(root, "presets");
  await cp(FIXTURE, dir, { recursive: true });
  const out = join(root, "presets.js");
  const readme = join(root, "README.md");
  await writeFile(readme, `# Test\n\n${START}\n${END}\n`);
  return { root, dir, out, readme, args: ["--presets-dir", dir, "--out", out, "--readme", readme] };
}

function runCli(args, input) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [SCRIPT, ...args], { cwd: tmpdir() }, (error, stdout, stderr) =>
      resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
    if (input !== undefined) child.stdin.end(input);
  });
}

async function assertCreated(s, stdout, id) {
  const preset = JSON.parse(await readFile(join(s.dir, `${id}.json`), "utf8"));
  assert.equal(preset.last_verified, localDate());
  assert.deepEqual((await validatePresets(s.dir)).errors, []);
  const { PRESETS } = await import(`data:text/javascript,${encodeURIComponent(await readFile(s.out, "utf8"))}`);
  assert.deepEqual(PRESETS.find((p) => p.id === id), preset);
  assert.match(await readFile(s.readme, "utf8"), new RegExp(`\\(https://examsnap\\.xac3\\.xyz/${id}/\\)`));
  assert.match(stdout, /Next steps:/);
  assert.match(stdout, /npm run preview/);
  assert.ok(stdout.includes(`http://localhost:4173/${id}/`), stdout);
  assert.match(stdout, /pull request/);
  return preset;
}

test("non-interactive --answers run writes, validates and regenerates", async () => {
  const s = await sandbox();
  try {
    const answers = join(s.root, "answers.json");
    await writeFile(answers, JSON.stringify(ANSWERS));
    const r = await runCli(["--answers", answers, ...s.args]);
    assert.equal(r.code, 0, r.stderr);
    const preset = await assertCreated(s, r.stdout, "neet-ug");
    assert.equal(preset.notes, `Sources agree. ${CM_NOTE}`);
    assert.equal(r.stderr, "");
    // The same answers again: id now taken, nothing changes.
    const again = await runCli(["--answers", answers, ...s.args]);
    assert.equal(again.code, 1);
    assert.match(again.stderr, /ERROR id: "neet-ug" is already taken/);
    assert.match(again.stderr, /nothing was written/);
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});

test("non-interactive run with bad answers writes nothing", async () => {
  const s = await sandbox();
  try {
    const answers = join(s.root, "answers.json");
    await writeFile(answers, JSON.stringify({ ...ANSWERS, id: "Bad Id" }));
    const r = await runCli(["--answers", answers, ...s.args]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /ERROR id: use lowercase letters/);
    assert.deepEqual(await readdir(s.dir), ["sample.json"]);
    assert.equal(await readFile(s.readme, "utf8"), `# Test\n\n${START}\n${END}\n`);
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});

test("interactive run with piped answers, re-asking after invalid input", async () => {
  const s = await sandbox();
  try {
    const lines = [
      "sample", // taken → asked again
      "neet-ug",
      "NEET UG (NTA)",
      "3", // Entrance exams
      "https://neet.nta.nic.in/bulletin.pdf",
      "secondary",
      "Coaching site",
      "n",
      "",
      "Photograph",
      "photo",
      "3.5cm",
      "4.5cm",
      "20",
      "10", // max <= min → both asked again
      "10",
      "200",
      "", // default filename photo.jpg
      "",
      "n",
    ];
    const r = await runCli(s.args, `${lines.join("\n")}\n`);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /✗ "sample" is already taken/);
    assert.match(r.stdout, /3\.5 cm = 276 px at 200 DPI/);
    assert.match(r.stdout, /✗ max KB \(10\) must be greater than min KB \(20\)/);
    assert.match(r.stdout, /notice +the official notification/);
    const preset = await assertCreated(s, r.stdout, "neet-ug");
    assert.equal(preset.category, "Entrance exams");
    assert.equal(preset.notes, CM_NOTE);
    assert.deepEqual(preset.documents, [
      { id: "photo", label: "Photograph", kind: "photo", width: 276, height: 354, min_kb: 10, max_kb: 200, filename: "photo.jpg" },
    ]);
    assert.match(r.stderr, /WARN {2}neet-ug: no official notice linked/);
    assert.deepEqual(await takenIds(s.dir), new Set(["sample", "neet-ug"]));
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});

test("interactive run that ends early writes nothing", async () => {
  const s = await sandbox();
  try {
    const r = await runCli(s.args, "neet-ug\nNEET UG\n");
    assert.equal(r.code, 1);
    assert.match(r.stderr, /input ended before all questions were answered/);
    assert.deepEqual(await readdir(s.dir), ["sample.json"]);
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});
