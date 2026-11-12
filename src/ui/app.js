// SPDX-License-Identifier: AGPL-3.0-or-later
// Wiring only: DOM events -> state -> render.
import { PRESETS } from "../generated/presets.js";
import { byteRange, cropRect, fitToRange, isJpeg } from "../core/index.js";
import { STRINGS as S } from "./strings.js";
import {
  CUSTOM_ID,
  CUSTOM_MAX_PX,
  CUSTOM_MIN_PX,
  clampZoom,
  createState,
  currentDoc,
  currentPreset,
  fitWithin,
  formatKb,
  groupByCategory,
  hasMetadataSegment,
  hasNotice,
  panBy,
  parseCustom,
  previewSize,
  resetAdjust,
  selectionSearch,
} from "./state.js";
import { drawCrop, resizeBitmap } from "./render.js";
import { canvasEncoder } from "./encode.js";
import { attachGestures } from "./gestures.js";

const $ = (id) => document.getElementById(id);
const el = {
  exam: $("exam"),
  doc: $("doc"),
  docField: $("doc-field"),
  custom: $("custom"),
  customInputs: { width: $("custom-width"), height: $("custom-height"), minKb: $("custom-min"), maxKb: $("custom-max") },
  customError: $("custom-error"),
  chips: $("chips"),
  warning: $("warning"),
  notes: $("notes"),
  presetNotes: $("preset-notes"),
  sources: $("sources"),
  sourceList: $("source-list"),
  verified: $("verified"),
  file: $("file"),
  drop: $("drop"),
  uploadMsg: $("upload-msg"),
  adjust: $("adjust"),
  adjustEmpty: $("adjust-empty"),
  previewWrap: $("preview-wrap"),
  preview: $("preview"),
  zoom: $("zoom"),
  clean: $("clean"),
  thresholdField: $("threshold-field"),
  threshold: $("threshold"),
  thresholdOut: $("threshold-out"),
  make: $("make"),
  makeMsg: $("make-msg"),
  resultStatus: $("result-status"),
  result: $("result"),
  resultImg: $("result-img"),
  checklist: $("checklist"),
  padded: $("padded"),
  download: $("download"),
};

const state = createState(PRESETS, location.search);
const previewCtx = el.preview.getContext("2d", { willReadFrequently: true });
let lastDoc = currentDoc(state, PRESETS); // last valid spec, keeps the preview up while custom input is invalid
let view = { cssW: 0, cssH: 0 };
let resultUrl = null;
let generation = 0; // bumped whenever an in-flight result would be stale
let frame = 0;

const make$ = (tag, props = {}, children = []) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
};

// ---- Step 1: exam & document -------------------------------------------

function applyStrings() {
  document.title = S.docTitle;
  for (const n of document.querySelectorAll("[data-s]")) n.textContent = S[n.dataset.s];
  el.preview.setAttribute("aria-label", S.previewLabel);
  el.chips.setAttribute("aria-label", S.chipsLabel);
}

function buildExamSelect() {
  for (const group of groupByCategory(PRESETS)) {
    const og = make$("optgroup", { label: group.category });
    for (const p of group.presets) og.append(make$("option", { value: p.id, textContent: p.name }));
    el.exam.append(og);
  }
  el.exam.append(make$("option", { value: CUSTOM_ID, textContent: S.customOption }));
}

function buildDocSelect() {
  const preset = currentPreset(state, PRESETS);
  el.doc.replaceChildren(
    ...(preset?.documents ?? []).map((d) => make$("option", { value: d.id, textContent: d.label })),
  );
  if (preset) el.doc.value = state.docId;
}

function renderSpec() {
  const isCustom = state.examId === CUSTOM_ID;
  const preset = currentPreset(state, PRESETS);
  el.exam.value = state.examId;
  el.docField.hidden = isCustom;
  el.custom.hidden = !isCustom;

  let doc = currentDoc(state, PRESETS);
  if (isCustom) {
    const r = parseCustom(state.custom);
    el.customError.textContent = r.ok ? "" : r.error === "size" ? S.customSizeError(CUSTOM_MIN_PX, CUSTOM_MAX_PX) : r.message;
    for (const input of Object.values(el.customInputs)) input.setAttribute("aria-invalid", String(!r.ok));
    doc = r.ok ? r.doc : null;
  }
  if (doc) lastDoc = doc;

  el.chips.replaceChildren(
    ...(doc
      ? [S.chipPixels(doc.width, doc.height), S.chipKb(doc.min_kb, doc.max_kb), S.chipFormat].map((t) =>
          make$("li", { className: "chip", textContent: t }),
        )
      : []),
  );

  el.warning.hidden = isCustom || hasNotice(preset);
  // The document's own notes stay visible; preset-wide notes live in the
  // collapsible sources section to keep step 1 short on phones.
  const paragraphs = (...texts) => texts.filter(Boolean).map((t) => make$("p", { textContent: t }));
  el.notes.replaceChildren(...paragraphs(doc?.notes));
  el.presetNotes.replaceChildren(...paragraphs(preset?.notes));

  el.sources.hidden = isCustom;
  el.sourceList.replaceChildren(
    ...(preset?.sources ?? []).map((s) =>
      make$("li", {}, [
        make$("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, [
          s.title,
          make$("span", { className: "visually-hidden", textContent: ` ${S.opensInNewTab}` }),
        ]),
        " ",
        make$("span", { className: `badge badge-${s.type}`, textContent: S.sourceType[s.type] }),
      ]),
    ),
  );
  el.verified.textContent = preset ? S.lastVerified(preset.last_verified) : "";
  updateMakeButton();
}

function selectionChanged() {
  const search = selectionSearch(location.search, state);
  history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
  resetAdjust(state, PRESETS);
  syncAdjustControls();
  invalidate();
  buildDocSelect();
  renderSpec();
  layoutPreview();
}

el.exam.addEventListener("change", () => {
  state.examId = el.exam.value;
  state.docId = currentPreset(state, PRESETS)?.documents[0].id ?? null;
  selectionChanged();
});

el.doc.addEventListener("change", () => {
  state.docId = el.doc.value;
  selectionChanged();
});

for (const [key, input] of Object.entries(el.customInputs)) {
  input.value = state.custom[key];
  input.addEventListener("input", () => {
    const before = lastDoc;
    state.custom[key] = input.value;
    invalidate();
    renderSpec();
    const doc = currentDoc(state, PRESETS);
    if (doc && (doc.width !== before?.width || doc.height !== before?.height)) {
      state.zoom = 1;
      state.panX = state.panY = 0;
      syncAdjustControls();
      layoutPreview();
    }
  });
}

// ---- Step 2: upload ----------------------------------------------------

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    // Older engines reject the option value itself; their default already
    // follows EXIF orientation.
    if (e instanceof TypeError) return createImageBitmap(file);
    throw e;
  }
}

/**
 * Decode and load one image. Returns true on success.
 * @param {Blob} file
 */
async function loadFile(file) {
  el.uploadMsg.classList.remove("error");
  el.uploadMsg.textContent = "";
  if (!file) return false;
  const fail = (msg) => {
    el.uploadMsg.classList.add("error");
    el.uploadMsg.textContent = msg;
    return false;
  };
  if (file.type && !file.type.startsWith("image/")) return fail(S.notAnImage);

  let bitmap;
  try {
    bitmap = await decode(file);
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.scaled) {
      const small = await resizeBitmap(bitmap, size);
      bitmap.close();
      bitmap = small;
    }
  } catch {
    bitmap?.close?.();
    return fail(S.decodeError);
  }

  state.bitmap?.close();
  state.bitmap = bitmap;
  state.fileName = file.name ?? "";
  state.zoom = 1;
  state.panX = state.panY = 0;
  syncAdjustControls();
  invalidate();
  el.uploadMsg.textContent = state.fileName
    ? S.loaded(state.fileName, bitmap.width, bitmap.height)
    : S.loadedNoName(bitmap.width, bitmap.height);
  el.adjust.hidden = false;
  el.adjustEmpty.hidden = true;
  layoutPreview();
  updateMakeButton();
  return true;
}

el.file.addEventListener("change", () => {
  const [file] = el.file.files;
  el.file.value = ""; // allow re-choosing the same file
  loadFile(file);
});

const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
for (const type of ["dragenter", "dragover"]) {
  el.drop.addEventListener(type, (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    el.drop.classList.add("over");
  });
}
el.drop.addEventListener("dragleave", (e) => {
  if (!el.drop.contains(e.relatedTarget)) el.drop.classList.remove("over");
});
el.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  el.drop.classList.remove("over");
  loadFile(e.dataTransfer.files[0]);
});
// A file dropped outside the zone must not navigate away from the page.
for (const type of ["dragover", "drop"]) {
  document.addEventListener(type, (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
}

document.addEventListener("paste", (e) => {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (!file) return; // let ordinary text paste into inputs through
  e.preventDefault();
  loadFile(file);
});

// ---- Step 3: adjust ----------------------------------------------------

function syncAdjustControls() {
  el.zoom.value = String(state.zoom);
  el.clean.checked = state.clean;
  el.threshold.value = String(state.threshold);
  el.thresholdOut.textContent = String(state.threshold);
  el.thresholdField.hidden = !state.clean;
}

function viewRect() {
  const doc = lastDoc;
  const b = state.bitmap;
  return cropRect(b.width, b.height, doc.width, doc.height, state.zoom, state.panX, state.panY);
}

function layoutPreview() {
  if (!state.bitmap || !lastDoc) return;
  const { width, height } = previewSize(lastDoc.width, lastDoc.height, el.previewWrap.clientWidth);
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.max(1, Math.round(width * dpr));
  const bh = Math.max(1, Math.round(height * dpr));
  if (view.cssW !== width || view.cssH !== height || el.preview.width !== bw || el.preview.height !== bh) {
    el.preview.style.width = `${width}px`;
    el.preview.style.height = `${height}px`;
    el.preview.width = bw;
    el.preview.height = bh;
    view = { cssW: width, cssH: height };
  }
  scheduleRender();
}

function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!state.bitmap || !lastDoc) return;
    drawCrop(previewCtx, state.bitmap, viewRect(), {
      width: el.preview.width,
      height: el.preview.height,
      clean: state.clean,
      threshold: state.threshold,
    });
  });
}

function adjusted() {
  invalidate();
  scheduleRender();
}

attachGestures(el.preview, {
  onPan(dx, dy) {
    if (!state.bitmap) return;
    const b = state.bitmap;
    Object.assign(state, panBy(state, dx, dy, { rect: viewRect(), imgW: b.width, imgH: b.height, ...view }));
    adjusted();
  },
  onZoom(factor) {
    if (!state.bitmap) return;
    state.zoom = clampZoom(state.zoom * factor);
    el.zoom.value = String(state.zoom);
    adjusted();
  },
});

el.zoom.addEventListener("input", () => {
  state.zoom = clampZoom(Number(el.zoom.value));
  adjusted();
});

el.clean.addEventListener("change", () => {
  state.clean = el.clean.checked;
  el.thresholdField.hidden = !state.clean;
  adjusted();
});

el.threshold.addEventListener("input", () => {
  state.threshold = Number(el.threshold.value);
  el.thresholdOut.textContent = el.threshold.value;
  adjusted();
});

new ResizeObserver(() => layoutPreview()).observe(el.previewWrap);
window.addEventListener("resize", () => layoutPreview());

// ---- Step 4: make & download ------------------------------------------

function updateMakeButton() {
  el.make.disabled = state.working || !state.bitmap || !currentDoc(state, PRESETS);
  el.make.textContent = state.working ? S.working : S.makeButton;
  el.make.setAttribute("aria-busy", String(state.working));
}

function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  state.result = null;
  el.result.hidden = true;
  el.resultImg.removeAttribute("src");
  el.download.setAttribute("href", "#");
  el.checklist.replaceChildren();
  el.makeMsg.textContent = "";
  el.resultStatus.textContent = "";
}

/** Drop any shown or in-flight result: the inputs it was made from changed. */
function invalidate() {
  generation++;
  clearResult();
}

async function decodedSize(blob) {
  try {
    const b = await createImageBitmap(blob);
    const size = { width: b.width, height: b.height };
    b.close();
    return size;
  } catch {
    return null;
  }
}

async function showResult(r, doc, range) {
  const blob = new Blob([r.bytes], { type: "image/jpeg" });
  const dims = await decodedSize(blob);
  resultUrl = URL.createObjectURL(blob);
  const kb = formatKb(r.size, range.fallback);
  const checks = [
    [dims?.width === doc.width && dims?.height === doc.height, S.checkDimensions(doc.width, doc.height)],
    [r.size >= range.minBytes && r.size <= range.maxBytes, S.checkSize(kb, doc.min_kb, doc.max_kb)],
    [isJpeg(r.bytes), S.checkFormat],
    [!hasMetadataSegment(r.bytes), S.checkMetadata],
  ];
  el.checklist.replaceChildren(
    ...checks.map(([ok, text]) =>
      make$("li", { className: ok ? "pass" : "fail" }, [
        make$("span", { className: "visually-hidden", textContent: `${ok ? S.checkPass : S.checkFail} ` }),
        text,
      ]),
    ),
  );
  Object.assign(el.resultImg, { src: resultUrl, alt: S.resultAlt, width: doc.width, height: doc.height });
  el.padded.hidden = !r.padded;
  el.download.href = resultUrl;
  el.download.download = doc.filename;
  el.download.textContent = S.download(doc.filename);
  el.result.hidden = false;
  el.resultStatus.textContent = S.resultReady(kb, doc.filename);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.result.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}

/**
 * Render at the exact size and fit into the KB range.
 * @returns {Promise<null | object>} the fitToRange result (null if nothing to make).
 */
async function make() {
  const doc = currentDoc(state, PRESETS);
  if (!doc || !state.bitmap || state.working) return null;
  clearResult();
  const mine = ++generation;
  state.working = true;
  updateMakeButton();
  try {
    const range = byteRange(doc.min_kb, doc.max_kb);
    const canvas = document.createElement("canvas");
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: state.clean });
    const b = state.bitmap;
    const rect = cropRect(b.width, b.height, doc.width, doc.height, state.zoom, state.panX, state.panY);
    drawCrop(ctx, b, rect, { width: doc.width, height: doc.height, clean: state.clean, threshold: state.threshold });
    const r = await fitToRange(canvasEncoder(canvas), range);
    if (mine !== generation) return r; // inputs changed while encoding
    if (r.ok) {
      state.result = { ...r, filename: doc.filename, width: doc.width, height: doc.height };
      await showResult(r, doc, range);
    } else if (r.reason === "too-large") {
      el.makeMsg.textContent = S.tooLarge(formatKb(r.size, range.fallback), doc.max_kb);
    } else {
      el.makeMsg.textContent = S.makeFailed;
    }
    return r;
  } catch (e) {
    if (mine === generation) el.makeMsg.textContent = S.makeFailed;
    console.error(e);
    return null;
  } finally {
    state.working = false;
    updateMakeButton();
  }
}

el.make.addEventListener("click", () => make());

// ---- Start -------------------------------------------------------------

applyStrings();
buildExamSelect();
buildDocSelect();
renderSpec();
syncAdjustControls();
history.replaceState(null, "", `${location.pathname}${selectionSearch(location.search, state)}${location.hash}`);

if (new URLSearchParams(location.search).get("test") === "1") {
  window.__examsnap = { state, loadFile, make };
}
