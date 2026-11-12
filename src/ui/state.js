// SPDX-License-Identifier: AGPL-3.0-or-later
// UI state and small pure helpers. No DOM access here, so it is unit-tested
// under node:test.
import { byteRange } from "../core/index.js";

export const CUSTOM_ID = "custom";
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const THRESHOLD_MIN = 120;
export const THRESHOLD_MAX = 220;
export const THRESHOLD_DEFAULT = 170;
export const MAX_SIDE = 4096;
export const PREVIEW_MAX_HEIGHT = 420;
// Same bounds the preset schema allows, so custom sizes behave like presets.
export const CUSTOM_MIN_PX = 50;
export const CUSTOM_MAX_PX = 4000;

/**
 * @param {object[]} presets
 * @param {string} [search] location.search
 */
export function createState(presets, search = "") {
  const { examId, docId } = parseSelection(search, presets);
  const state = {
    examId,
    docId,
    custom: { width: "200", height: "230", minKb: "20", maxKb: "50" },
    bitmap: null,
    fileName: "",
    zoom: 1,
    panX: 0,
    panY: 0,
    clean: false,
    threshold: THRESHOLD_DEFAULT,
    working: false,
    result: null,
  };
  resetAdjust(state, presets);
  return state;
}

/**
 * Read ?exam=&doc= into a valid selection. Unknown ids fall back to the first
 * preset (and its first document); a known exam with an unknown doc falls
 * back to that exam's first document.
 *
 * @param {string} search
 * @param {object[]} presets
 * @returns {{ examId: string, docId: string | null }}
 */
export function parseSelection(search, presets) {
  const params = new URLSearchParams(search);
  const exam = params.get("exam");
  if (exam === CUSTOM_ID) return { examId: CUSTOM_ID, docId: null };
  const preset = presets.find((p) => p.id === exam);
  if (!preset) return { examId: presets[0].id, docId: presets[0].documents[0].id };
  const doc = preset.documents.find((d) => d.id === params.get("doc")) ?? preset.documents[0];
  return { examId: preset.id, docId: doc.id };
}

/**
 * New query string with exam/doc set, keeping any other params (e.g. test=1).
 *
 * @param {string} search current location.search
 * @param {{ examId: string, docId: string | null }} selection
 * @returns {string} "" or "?..."
 */
export function selectionSearch(search, { examId, docId }) {
  const params = new URLSearchParams(search);
  params.set("exam", examId);
  if (examId === CUSTOM_ID || !docId) params.delete("doc");
  else params.set("doc", docId);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Clean background is on by default for signatures and thumb impressions. */
export function defaultClean(kind) {
  return kind === "signature" || kind === "thumb";
}

/** True if any source is an official notice. */
export function hasNotice(preset) {
  return preset.sources.some((s) => s.type === "notice");
}

/**
 * Group presets by category, keeping input order (presets are pre-sorted).
 * @returns {{ category: string, presets: object[] }[]}
 */
export function groupByCategory(presets) {
  const groups = [];
  for (const p of presets) {
    let g = groups.find((x) => x.category === p.category);
    if (!g) groups.push((g = { category: p.category, presets: [] }));
    g.presets.push(p);
  }
  return groups;
}

const INT_RE = /^\s*\d+\s*$/;

/**
 * Validate the custom-size inputs (raw strings).
 *
 * @param {{ width: string, height: string, minKb: string, maxKb: string }} raw
 * @returns {{ ok: true, doc: object } | { ok: false, error: "size" } | { ok: false, error: "range", message: string }}
 */
export function parseCustom(raw) {
  const dims = [raw.width, raw.height].map((v) => (INT_RE.test(String(v)) ? Number(v) : NaN));
  if (dims.some((n) => !(n >= CUSTOM_MIN_PX && n <= CUSTOM_MAX_PX))) return { ok: false, error: "size" };
  const [width, height] = dims;
  const toNum = (v) => (String(v).trim() === "" ? NaN : Number(v));
  const minKb = toNum(raw.minKb);
  const maxKb = toNum(raw.maxKb);
  try {
    byteRange(minKb, maxKb);
  } catch (e) {
    return { ok: false, error: "range", message: e.message };
  }
  return {
    ok: true,
    doc: {
      id: CUSTOM_ID,
      kind: "photo",
      width,
      height,
      min_kb: minKb,
      max_kb: maxKb,
      filename: `examsnap-${width}x${height}.jpg`,
    },
  };
}

/** The selected preset, or null for custom. */
export function currentPreset(state, presets) {
  return presets.find((p) => p.id === state.examId) ?? null;
}

/** The selected document spec, or null if the custom size is invalid. */
export function currentDoc(state, presets) {
  if (state.examId === CUSTOM_ID) {
    const r = parseCustom(state.custom);
    return r.ok ? r.doc : null;
  }
  const preset = currentPreset(state, presets);
  return preset?.documents.find((d) => d.id === state.docId) ?? null;
}

/** Reset crop and clean-up settings for the current document. */
export function resetAdjust(state, presets) {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  state.clean = defaultClean(currentDoc(state, presets)?.kind);
  state.threshold = THRESHOLD_DEFAULT;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Clamp zoom to the UI range; NaN becomes 1. */
export function clampZoom(z) {
  return Number.isNaN(z) ? ZOOM_MIN : clamp(z, ZOOM_MIN, ZOOM_MAX);
}

/**
 * Pan after dragging the preview by (dx, dy) CSS px. Dragging right moves
 * the image right, i.e. the crop window left.
 *
 * @param {{ panX: number, panY: number }} pan
 * @param {number} dx
 * @param {number} dy
 * @param {{ rect: { sw: number, sh: number }, imgW: number, imgH: number, cssW: number, cssH: number }} view
 * @returns {{ panX: number, panY: number }}
 */
export function panBy({ panX, panY }, dx, dy, { rect, imgW, imgH, cssW, cssH }) {
  const step = (pan, d, src, css, img) => {
    const slack = img - src;
    if (!(slack > 0) || !(css > 0)) return pan;
    return clamp(pan - (2 * d * (src / css)) / slack, -1, 1);
  };
  return {
    panX: step(panX, dx, rect.sw, cssW, imgW),
    panY: step(panY, dy, rect.sh, cssH, imgH),
  };
}

/**
 * Size that fits w×h inside maxSide on its longest side.
 * @returns {{ width: number, height: number, scaled: boolean }}
 */
export function fitWithin(w, h, maxSide = MAX_SIDE) {
  const long = Math.max(w, h);
  if (long <= maxSide) return { width: w, height: h, scaled: false };
  const s = maxSide / long;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scaled: true };
}

/**
 * CSS size of the preview: the document's aspect ratio, at most the
 * container width and maxHeight tall.
 * @returns {{ width: number, height: number }}
 */
export function previewSize(docW, docH, containerW, maxHeight = PREVIEW_MAX_HEIGHT) {
  const aspect = docW / docH;
  let width = Math.max(1, containerW);
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

/**
 * Bytes as KB with one decimal, rounded down. Uses 1024 bytes per KB unless
 * the byte range fell back to 1000 (see core byteRange), so a file inside the
 * range never displays as outside it.
 */
export function formatKb(bytes, fallback = false) {
  const kb = bytes / (fallback ? 1000 : 1024);
  return (Math.floor(kb * 10) / 10).toFixed(1);
}

/**
 * True if a JPEG carries a metadata segment that can hold location, camera
 * or device data (APP1 = EXIF/XMP, APP13 = IPTC/Photoshop, or a COM comment
 * with any text) before the image data starts. COM segments of only spaces
 * are size padding and don't count. Returns true for anything it can't
 * parse, so a malformed file never shows as "clean".
 *
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function hasMetadataSegment(bytes) {
  if (!(bytes?.length >= 4) || bytes[0] !== 0xff || bytes[1] !== 0xd8) return true;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return true;
    const marker = bytes[pos + 1];
    if (marker === 0xda) return false; // SOS: image data follows
    if (marker === 0xe1 || marker === 0xed) return true;
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (len < 2 || pos + 2 + len > bytes.length) return true;
    if (marker === 0xfe && !bytes.subarray(pos + 4, pos + 2 + len).every((b) => b === 0x20)) return true;
    pos += 2 + len;
  }
  return true;
}
