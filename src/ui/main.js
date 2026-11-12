// SPDX-License-Identifier: AGPL-3.0-or-later
// Page entry. GitHub Pages can't send frame-ancestors headers, so refuse to
// run inside another page's frame (clickjacking): show a short notice with a
// link that opens ExamSnap directly, and never load the app.
import { STRINGS as S } from "./strings.js";
import { isFramed } from "./state.js";

if (isFramed(window)) {
  const main = document.createElement("main");
  main.className = "wrap framed";
  const message = document.createElement("p");
  message.textContent = S.framedMessage;
  const link = document.createElement("a");
  link.className = "button primary";
  link.href = location.href;
  link.target = "_top";
  link.rel = "noopener";
  link.textContent = S.framedOpen;
  const p = document.createElement("p");
  p.append(link);
  main.append(message, p);
  document.body.replaceChildren(main);
} else {
  import("./app.js");
}
