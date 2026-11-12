// SPDX-License-Identifier: AGPL-3.0-or-later
// Add an exam preset without reading any app code: npm run new-preset
//   (no flags)               ask questions in the terminal
//   --answers answers.json   non-interactive: read the same answers from JSON
// Writes presets/<id>.json, validates it like `npm run check`, regenerates
// src/generated/presets.js and the README exams table, then prints next steps.
// For tests: --presets-dir DIR, --out FILE, --readme FILE redirect the writes.
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { byteRange } from "../src/core/size.js";
import { validatePresets } from "./check-presets.mjs";
import { OUT_PATH, PRESETS_DIR, run as bundle } from "./bundle-presets.mjs";
import { README_PATH, run as updateReadme } from "./update-readme.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA = JSON.parse(await readFile(join(ROOT, "schema", "preset.schema.json"), "utf8"));

export const DPI = 200;
export const CM_NOTE = `Pixel sizes are cm at ${DPI} DPI.`;
export const CATEGORIES = SCHEMA.properties.category.enum;
export const SOURCE_TYPES = SCHEMA.$defs.source.properties.type.enum;
export const KINDS = SCHEMA.$defs.document.properties.kind.enum;
const DOC = SCHEMA.$defs.document.properties;
const SLUG_RE = new RegExp(SCHEMA.$defs.slug.pattern);
const FILENAME_RE = new RegExp(DOC.filename.pattern);
/** Ids that would clash with the app ("custom") or with built site folders. */
export const RESERVED_IDS = new Set(["custom", "icons", "src"]);

export const SOURCE_HELP = {
  notice: "the official notification or information bulletin that states the sizes (best)",
  portal: "an official website or portal page, but not the spec document itself",
  secondary: "coaching, news or other third-party sites (shown to users as unverified)",
};

const ok = (value, info) => ({ ok: true, value, ...(info ? { info } : {}) });
const fail = (error) => ({ ok: false, error });
const text = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// ---- Validation helpers (shared by both modes) ---------------------------

/**
 * @param {unknown} v
 * @param {Set<string>} taken ids already used by presets
 */
export function checkId(v, taken = new Set()) {
  const id = text(v);
  if (!id) return fail("required");
  if (!SLUG_RE.test(id)) return fail("use lowercase letters, digits and single hyphens (kebab-case), e.g. neet-ug");
  if (RESERVED_IDS.has(id)) return fail(`"${id}" is reserved; choose another id`);
  if (taken.has(id)) return fail(`"${id}" is already taken by presets/${id}.json`);
  return ok(id);
}

export function checkName(v) {
  const s = text(v);
  return s.length >= 3 ? ok(s) : fail("at least 3 characters");
}

/** A category name, or its 1-based number in CATEGORIES. */
export function checkCategory(v) {
  const s = text(v);
  const n = Number(s);
  if (/^\d+$/.test(s) && n >= 1 && n <= CATEGORIES.length) return ok(CATEGORIES[n - 1]);
  const hit = CATEGORIES.find((c) => c.toLowerCase() === s.toLowerCase());
  return hit ? ok(hit) : fail(`one of: ${CATEGORIES.join(", ")}`);
}

export function checkUrl(v) {
  const s = text(v);
  if (!/^https:\/\//.test(s)) return fail("must start with https://");
  try {
    new URL(s);
  } catch {
    return fail("not a valid URL");
  }
  return ok(s);
}

export function checkSourceType(v) {
  const s = text(v).toLowerCase();
  return SOURCE_TYPES.includes(s) ? ok(s) : fail(`one of: ${SOURCE_TYPES.join(", ")}`);
}

export function checkKind(v) {
  const s = text(v).toLowerCase();
  return KINDS.includes(s) ? ok(s) : fail(`one of: ${KINDS.join(", ")}`);
}

export function checkRequired(v) {
  const s = text(v);
  return s ? ok(s) : fail("required");
}

/** Centimetres to pixels at 200 DPI, rounded. */
export function cmToPx(cm) {
  return Math.round((cm / 2.54) * DPI);
}

/**
 * A width or height: whole pixels ("276", 276) or centimetres ("3.5cm").
 * @param {unknown} v
 * @param {"width" | "height"} axis
 * @returns {{ ok: true, value: number, info?: string, cm?: true } | { ok: false, error: string }}
 */
export function checkDimension(v, axis) {
  const { minimum: min, maximum: max } = DOC[axis];
  const s = text(v).toLowerCase();
  const cm = s.match(/^(\d+(?:\.\d+)?)\s*cm$/);
  let px;
  let info;
  if (cm) {
    px = cmToPx(Number(cm[1]));
    info = `${cm[1]} cm = ${px} px at ${DPI} DPI`;
  } else if (/^\d+$/.test(s)) {
    px = Number(s);
  } else {
    return fail('a whole number of pixels, or centimetres like "3.5cm"');
  }
  if (px < min || px > max) return fail(`${axis} must be ${min}–${max} px (got ${px})`);
  return cm ? { ...ok(px, info), cm: true } : ok(px);
}

export function checkKb(v) {
  const s = text(v);
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? ok(n) : fail("a number of KB greater than 0, e.g. 20 or 12.5");
}

/** Check that the KB range is one ExamSnap can actually hit (same rule as the app). */
export function checkKbRange(minKb, maxKb) {
  if (!(maxKb > minKb)) return fail(`max KB (${maxKb}) must be greater than min KB (${minKb})`);
  try {
    byteRange(minKb, maxKb);
  } catch (e) {
    return fail(e.message);
  }
  return ok({ minKb, maxKb });
}

export function checkFilename(v) {
  const s = text(v);
  return FILENAME_RE.test(s) ? ok(s) : fail("letters, digits, - and _ only, ending in .jpg, e.g. photo.jpg");
}

/** A document id from its kind, unique within the preset: photo, photo-2, … */
export function docIdFor(kind, used) {
  let id = kind;
  for (let n = 2; used.has(id); n++) id = `${kind}-${n}`;
  return id;
}

/** Today's date (local time) as YYYY-MM-DD. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Every preset id in `dir` (from file names). */
export async function takenIds(dir) {
  return new Set((await readdir(dir)).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)));
}

// ---- Answers → preset ---------------------------------------------------

/**
 * Turn answers into a preset object (key order as in presets/*.json).
 * Accepts the --answers JSON shape:
 *   { id, name, category, notes?, sources: [{ title, url, type }],
 *     documents: [{ label, kind, width, height, min_kb, max_kb, filename?, notes?, id? }] }
 * width/height may be "3.5cm"; that adds CM_NOTE to the preset notes.
 *
 * @returns {{ preset: object | null, errors: string[] }}
 */
export function buildPreset(answers, { taken = new Set(), today = localDate() } = {}) {
  const errors = [];
  const get = (path, result) => {
    if (result.ok) return result.value;
    errors.push(`${path}: ${result.error}`);
    return undefined;
  };
  const a = answers && typeof answers === "object" ? answers : {};
  const id = get("id", checkId(a.id, taken));
  const name = get("name", checkName(a.name));
  const category = get("category", checkCategory(a.category));

  const rawSources = Array.isArray(a.sources) ? a.sources : [];
  if (!rawSources.length) errors.push("sources: at least one source is required");
  const sources = rawSources.map((s, i) => ({
    title: get(`sources[${i}].title`, checkRequired(s?.title)),
    url: get(`sources[${i}].url`, checkUrl(s?.url)),
    type: get(`sources[${i}].type`, checkSourceType(s?.type)),
  }));

  let usedCm = false;
  const rawDocs = Array.isArray(a.documents) ? a.documents : [];
  if (!rawDocs.length) errors.push("documents: at least one document is required");
  const used = new Set();
  const documents = rawDocs.map((d, i) => {
    const at = (k) => `documents[${i}].${k}`;
    const kind = get(at("kind"), checkKind(d?.kind));
    let docId;
    if (d?.id !== undefined) {
      docId = text(d.id);
      if (!SLUG_RE.test(docId)) errors.push(`${at("id")}: use kebab-case, e.g. photo`);
      else if (used.has(docId)) errors.push(`${at("id")}: duplicate document id "${docId}"`);
    } else if (kind) {
      docId = docIdFor(kind, used);
    }
    if (docId) used.add(docId);
    const w = checkDimension(d?.width, "width");
    const h = checkDimension(d?.height, "height");
    if (w.cm || h.cm) usedCm = true;
    const minKb = get(at("min_kb"), checkKb(d?.min_kb));
    const maxKb = get(at("max_kb"), checkKb(d?.max_kb));
    if (minKb !== undefined && maxKb !== undefined) get(at("max_kb"), checkKbRange(minKb, maxKb));
    const filename = get(at("filename"), checkFilename(d?.filename === undefined && docId ? `${docId}.jpg` : d?.filename));
    const notes = text(d?.notes);
    return {
      id: docId,
      label: get(at("label"), checkRequired(d?.label)),
      kind,
      width: get(at("width"), w),
      height: get(at("height"), h),
      min_kb: minKb,
      max_kb: maxKb,
      filename,
      ...(notes ? { notes } : {}),
    };
  });

  let notes = text(a.notes);
  if (usedCm && !notes.includes(CM_NOTE)) notes = notes ? `${notes} ${CM_NOTE}` : CM_NOTE;
  if (errors.length) return { preset: null, errors };
  return {
    preset: { id, name, category, ...(notes ? { notes } : {}), last_verified: today, sources, documents },
    errors,
  };
}

// ---- Write, validate, regenerate ------------------------------------------

/**
 * Write presets/<id>.json, validate the whole folder like `npm run check`
 * (removing the new file again if anything fails), then regenerate the
 * presets module and (if `readme` is given) the README exams table.
 *
 * @returns {Promise<{ file: string, warnings: string[] }>}
 */
export async function createPreset(preset, { dir = PRESETS_DIR, out = OUT_PATH, readme = README_PATH } = {}) {
  const file = join(dir, `${preset.id}.json`);
  await writeFile(file, `${JSON.stringify(preset, null, 2)}\n`, { flag: "wx" });
  try {
    const { errors, warnings } = await validatePresets(dir);
    if (errors.length) throw new Error(`validation failed:\n${errors.join("\n")}`);
    await bundle({ dir, out });
    if (readme) await updateReadme({ dir, readme });
    return { file, warnings: warnings.filter((w) => w.startsWith(`${preset.id}:`)) };
  } catch (e) {
    await unlink(file).catch(() => {});
    throw e;
  }
}

export function nextSteps(id, files) {
  return `
Next steps:
  1. npm run preview
  2. Open http://localhost:4173/${id}/ and make a file from a real photo for each document.
  3. Commit on a new branch:
       git checkout -b add-${id}
       git add ${files.join(" ")}
       git commit -m "Add ${id} preset"
  4. Push and open a pull request. The template has a short checklist.
`;
}

// ---- Interactive mode --------------------------------------------------------

/**
 * Ask questions on `input`/`output` until every answer is valid.
 * Works with a terminal or with piped input (one answer per line).
 */
export async function interview({ input = process.stdin, output = process.stdout, taken = new Set() } = {}) {
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  rl.on("SIGINT", () => {
    output.write("\nCancelled. Nothing was written.\n");
    process.exit(130);
  });
  const lines = rl[Symbol.asyncIterator]();
  const say = (s = "") => output.write(`${s}\n`);
  const ask = async (q) => {
    output.write(q);
    const { value, done } = await lines.next();
    if (done) throw new Error("input ended before all questions were answered");
    if (!input.isTTY) output.write("\n");
    return value.trim();
  };
  /** Ask until `check` passes; empty answers take `fallback` when given. */
  const until = async (q, check, fallback) => {
    for (;;) {
      const raw = await ask(q);
      const r = check(raw === "" && fallback !== undefined ? fallback : raw);
      if (r.ok) {
        if (r.info) say(`    → ${r.info}`);
        return r;
      }
      say(`    ✗ ${r.error}`);
    }
  };
  const yes = async (q) => /^y(es)?$/i.test(await ask(q));

  try {
    say("Add an exam preset to ExamSnap. Have the official notification open. Ctrl+C quits without writing.\n");
    const answers = { sources: [], documents: [] };
    answers.id = (await until("Exam id, kebab-case (used in the URL, e.g. neet-ug): ", (v) => checkId(v, taken))).value;
    answers.name = (await until('Exam name as candidates know it (e.g. "NEET UG (NTA)"): ', checkName)).value;
    say("Category:");
    CATEGORIES.forEach((c, i) => say(`  ${i + 1}) ${c}`));
    answers.category = (await until(`Choose 1–${CATEGORIES.length}: `, checkCategory)).value;

    say("\nWhere do the numbers come from? Source types:");
    for (const t of SOURCE_TYPES) say(`  ${t.padEnd(10)} ${SOURCE_HELP[t]}`);
    do {
      const url = (await until("Source URL (https://…): ", checkUrl)).value;
      const type = (await until(`Source type [${SOURCE_TYPES.join("/")}]: `, checkSourceType)).value;
      const title = (await until('Source title (e.g. "NTA NEET UG 2026 information bulletin"): ', checkRequired)).value;
      answers.sources.push({ title, url, type });
    } while (await yes("Add another source? (y/N): "));
    answers.notes = await ask("Preset notes (optional; e.g. how you resolved sources that disagree): ");

    say(`\nDocuments. Width and height take pixels, or centimetres like 3.5cm (converted at ${DPI} DPI).`);
    const used = new Set();
    let usedCm = false;
    do {
      say(`\nDocument ${answers.documents.length + 1}`);
      const label = (await until('  Label (e.g. "Photograph (3.5 × 4.5 cm)"): ', checkRequired)).value;
      const kind = (await until(`  Kind [${KINDS.join("/")}]: `, checkKind)).value;
      const id = docIdFor(kind, used);
      used.add(id);
      const width = await until("  Width (px or cm): ", (v) => checkDimension(v, "width"));
      const height = await until("  Height (px or cm): ", (v) => checkDimension(v, "height"));
      let minKb;
      let maxKb;
      for (;;) {
        minKb = (await until("  Min KB: ", checkKb)).value;
        maxKb = (await until("  Max KB: ", checkKb)).value;
        const r = checkKbRange(minKb, maxKb);
        if (r.ok) break;
        say(`    ✗ ${r.error}`);
      }
      const filename = (await until(`  File name [${id}.jpg]: `, checkFilename, `${id}.jpg`)).value;
      const notes = await ask("  Notes (optional; e.g. white background, black ink): ");
      if (width.cm || height.cm) usedCm = true;
      answers.documents.push({
        id,
        label,
        kind,
        width: width.value,
        height: height.value,
        min_kb: minKb,
        max_kb: maxKb,
        filename,
        notes,
      });
    } while (await yes("Add another document? (y/N): "));
    if (usedCm) answers.notes = answers.notes ? `${answers.notes} ${CM_NOTE}` : CM_NOTE;
    return answers;
  } finally {
    rl.close();
  }
}

// ---- CLI ----------------------------------------------------------------------

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = flag(args, "--presets-dir") ?? PRESETS_DIR;
  const out = flag(args, "--out") ?? OUT_PATH;
  const readme = flag(args, "--readme") ?? README_PATH;
  const answersPath = flag(args, "--answers");
  const taken = await takenIds(dir);

  const answers = answersPath ? JSON.parse(await readFile(answersPath, "utf8")) : await interview({ taken });
  const { preset, errors } = buildPreset(answers, { taken });
  if (!preset) {
    for (const e of errors) console.error(`ERROR ${e}`);
    console.error(`\n${errors.length} problem(s); nothing was written.`);
    process.exit(1);
  }
  const { file, warnings } = await createPreset(preset, { dir, out, readme });
  const rel = (p) => relative(process.cwd(), p) || p;
  const files = [rel(file), rel(out), rel(readme)];
  console.log(`\nCreated ${files[0]}; updated ${files[1]} and ${files[2]}.`);
  for (const w of warnings) console.warn(`WARN  ${w}`);
  console.log(nextSteps(preset.id, files));
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (e) {
    console.error(`ERROR ${e.message}`);
    process.exit(1);
  }
}
