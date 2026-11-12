// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker registration and the "new version" handshake.

/**
 * Register the service worker and report when a new version is waiting.
 * `onUpdate(apply)` is called with a function that activates the waiting
 * worker; the page then reloads exactly once. Nothing reloads on its own.
 *
 * @param {string} url service worker script URL
 * @param {(apply: () => void) => void} onUpdate
 */
export function registerServiceWorker(url, onUpdate) {
  const sw = navigator.serviceWorker;
  let requested = false;
  let reloading = false;
  sw.addEventListener("controllerchange", () => {
    // Also fires when a first-ever worker claims the page; only reload when
    // the person asked for the update.
    if (!requested || reloading) return;
    reloading = true;
    location.reload();
  });
  const offer = (worker) =>
    onUpdate(() => {
      requested = true;
      worker.postMessage("SKIP_WAITING");
    });
  return sw
    .register(url)
    .then((reg) => {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && sw.controller) offer(worker);
        });
      });
      return reg;
    })
    .catch(() => null); // offline first load, private mode, etc.: the app still works
}
