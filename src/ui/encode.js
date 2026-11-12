// SPDX-License-Identifier: AGPL-3.0-or-later
import { ensureJfif, stripMetadata } from "../core/index.js";

/**
 * JPEG encoder for core fitToRange, backed by canvas.toBlob. Metadata
 * segments some engines add (WebKit writes APP1 Exif and APP13) are stripped
 * and a JFIF APP0 is guaranteed here, so fitToRange measures the bytes that
 * are actually downloaded.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {(q: number) => Promise<Uint8Array>}
 */
export function canvasEncoder(canvas) {
  return (q) =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
        "image/jpeg",
        q,
      );
    })
      .then((blob) => blob.arrayBuffer())
      .then((buf) => ensureJfif(stripMetadata(new Uint8Array(buf))));
}
