// SPDX-License-Identifier: AGPL-3.0-or-later
// English: the source language. Every user-visible string in the UI and the
// built pages lives here, and every other locale (src/ui/i18n/<code>.js) has
// exactly these keys. `npm run check` prints each locale's coverage.
// Rules: keys used from index.html via data-s="key" must be plain strings; a
// function's translation must use all its arguments; "ExamSnap" is never
// translated; numbers stay in Western digits.

export const STRINGS = {
  appName: "ExamSnap",
  tagline: "Exact pixels. Exact KB. Your photo never leaves your device.",
  docTitle: "ExamSnap — exam photo & signature resizer",

  stepSpec: "Exam & document",
  stepUpload: "Upload",
  stepAdjust: "Adjust",
  stepMake: "Make & download",

  examLabel: "Exam",
  docLabel: "Document",
  customOption: "Custom size…",
  customLegend: "Custom size",
  customWidth: "Width (px)",
  customHeight: "Height (px)",
  customMinKb: "Min KB",
  customMaxKb: "Max KB",
  customSizeError: (min, max) => `Width and height must be whole numbers between ${min} and ${max} px.`,
  customKbMin: "Min KB must be more than 0.",
  customKbOrder: "Max KB must be more than Min KB.",
  customKbNarrow: "The KB range is too narrow. Make Max KB a little larger.",
  customLabel: "Custom size",
  requestExam: "Don't see your exam? Request it",

  chipPixels: (w, h) => `${w} × ${h} px`,
  chipKb: (min, max) => `${min}–${max} KB`,
  chipFormat: "JPG",
  chipsLabel: "Required file",

  secondaryWarning:
    "These specs come from secondary sources. Check the official notification before submitting.",
  sourcesSummary: "Where these numbers come from",
  // Display names for the preset schema's categories (exam select groups).
  categoryName: {
    Banking: "Banking",
    "Government jobs": "Government jobs",
    "Entrance exams": "Entrance exams",
    Other: "Other",
  },
  sourceType: {
    notice: "Official notice",
    portal: "Official site",
    secondary: "Secondary",
  },
  lastVerified: (date) => `Last verified: ${date}`,
  opensInNewTab: "(opens in a new tab)",

  chooseFile: "Choose a photo",
  dropHint: "or drag one here, or paste it (Ctrl+V / ⌘V).",
  loaded: (name, w, h) => `Loaded ${name} (${w} × ${h} px).`,
  loadedNoName: (w, h) => `Image loaded (${w} × ${h} px).`,
  decodeError: "This browser couldn't read that image. If it's an iPhone HEIC photo, export it as JPG first.",
  notAnImage: "That doesn't look like an image. Choose a JPG or PNG file.",

  adjustEmpty: "Add a photo in step 2 to adjust the crop.",
  previewLabel: "Crop preview. Drag to move. Arrow keys move, plus and minus zoom.",
  adjustHint: "Drag to move · pinch, scroll or use the slider to zoom.",
  faceGuideLabel: "Show face guide",
  zoomLabel: "Zoom",
  cleanLabel: "Clean background",
  cleanHint: "Turns paper pure white and makes ink darker.",
  thresholdLabel: "Paper threshold",

  makeButton: "Make my file",
  working: "Working…",
  needImage: "Add a photo first.",
  needValidSpec: "Fix the custom size first.",
  tooLarge: (kb, maxKb) =>
    `Even at the lowest quality the file is ${kb} KB, over the ${maxKb} KB limit. Try a tighter crop (zoom in) or turn on Clean background.`,
  makeFailed: "Something went wrong making the file. Please try again.",

  resultHeading: "Your file is ready",
  resultReady: (kb, filename) => `Your file is ready: ${filename}, ${kb} KB.`,
  resultAlt: "Preview of the finished file",
  checkDimensions: (w, h) => `${w} × ${h} px`,
  checkSize: (kb, min, max) => `${kb} KB (allowed ${min}–${max} KB)`,
  checkFormat: "JPG",
  checkMetadata: "Location & camera data removed",
  checkPass: "Passed:",
  checkFail: "Failed:",
  padded: "File padded up to the minimum size; the image itself is unchanged.",
  download: (filename) => `Download ${filename}`,

  // ---- Built pages (scripts/build.mjs): titles, meta, landing sections ----
  rootDescription:
    "Resize your photo and signature to the exact pixel size and KB range Indian exam portals require. Free, works offline, nothing is uploaded.",
  pageTitle: (name) => `${name} photo & signature resizer: exact size & KB | ExamSnap`,
  pageTitleShort: (name) => `${name} photo & signature resizer | ExamSnap`,
  pageDescription: (exam, parts) => `Resize your ${exam} ${parts}. Free, works offline, nothing is uploaded.`,
  descPart: (noun, w, h, min, max) => `${noun} to ${w}×${h} px, ${min}–${max} KB`,
  listAnd: " and ",
  listComma: ", ",
  kindNoun: {
    photo: "photo",
    signature: "signature",
    thumb: "thumb impression",
  },
  landingHeading: (name) => `${name} photo & signature resizer`,
  summaryPart: (noun, w, h, min, max) => `${noun} ${w}×${h} px, ${min}–${max} KB`,
  summarySep: " · ",
  specTableCaption: "Required files",
  thDocument: "Document",
  thPixels: "Size",
  thKb: "File size",
  thNotes: "Notes",
  emptyCell: "—",
  examPagesHeading: "Exam pages",
  homeLink: "ExamSnap home",
  ogImageAlt: "ExamSnap: Exact pixels. Exact KB. Your photo never leaves your device.",
  notFoundTitle: "Page not found | ExamSnap",
  notFoundHeading: "Page not found",
  notFoundBody: "There is nothing at this address.",
  notFoundHome: "Go to ExamSnap",

  framedMessage: "For your privacy, ExamSnap only runs when opened directly, not inside another website.",
  framedOpen: "Open ExamSnap",
  updateAvailable: "A new version is available.",
  updateReload: "Reload",

  footerRepo: "Source code on GitHub",
  footerReport: "Report a wrong spec",
  footerRequest: "Request an exam",
  footerPrivacy: "Free and open source. No uploads, no tracking.",

  // Header link to the same page in another language (a <nav> label).
  languageNav: "Language",
  // Shown only when JavaScript is off; the build writes it into <noscript>.
  noscript: "ExamSnap needs JavaScript to process your photo on your device. Please enable JavaScript for this page.",
};
