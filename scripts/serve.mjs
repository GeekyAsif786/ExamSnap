// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny static dev server for the repo root. node:http only, no dependencies.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_PORT = 5173;

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Map a request URL path to a file under `root`, or null if it escapes root
 * or is malformed. Directory paths ("/", "/docs/") map to index.html.
 *
 * @param {string} root absolute directory
 * @param {string} urlPath e.g. "/src/ui/app.js?x=1"
 * @returns {string | null}
 */
export function resolvePath(root, urlPath) {
  let p;
  try {
    p = decodeURIComponent(new URL(urlPath, "http://x").pathname);
  } catch {
    return null;
  }
  if (p.includes("\0")) return null;
  if (p.endsWith("/")) p += "index.html";
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  const file = normalize(join(base, p));
  return file.startsWith(base) ? file : null;
}

/**
 * Normalise a base path to "/x/y/" form ("/" stays "/").
 * @param {string} base
 */
export function normalizeBase(base = "/") {
  const parts = String(base).split("/").filter(Boolean);
  return parts.length ? `/${parts.join("/")}/` : "/";
}

/**
 * @param {{ root?: string, base?: string, notFound?: string | null }} [options]
 *   root: directory to serve. base: URL prefix it is served under (e.g.
 *   "/ExamSnap/"). notFound: file (relative to root) sent with status 404
 *   for unknown paths, like GitHub Pages' 404.html.
 * @returns {import("node:http").Server}
 */
export function createDevServer({ root = ROOT, base = "/", notFound = null } = {}) {
  const prefix = normalizeBase(base);
  return createServer(async (req, res) => {
    const send = (code, body, type = "text/plain; charset=utf-8") => {
      res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    const notFoundPage = async () => {
      if (notFound) {
        try {
          return send(404, await readFile(join(root, notFound)), MIME[".html"]);
        } catch {
          // fall through to the plain-text 404
        }
      }
      send(404, "Not Found");
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "Method Not Allowed");

    const { pathname, search } = new URL(req.url, "http://x");
    if (prefix !== "/" && `${pathname}/` === prefix) {
      res.writeHead(301, { Location: `${prefix}${search}` });
      return res.end();
    }
    if (!pathname.startsWith(prefix)) return notFoundPage();
    const file = resolvePath(root, `/${req.url.slice(prefix.length)}`);
    if (!file) return send(400, "Bad Request");
    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        res.writeHead(301, { Location: `${pathname}/${search}` });
        return res.end();
      }
      const body = await readFile(file);
      send(200, body, MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
    } catch {
      notFoundPage();
    }
  });
}

/**
 * Parse CLI options: --port N (or PORT), --dir D, --base B, --not-found F.
 * @returns {{ port: number, dir: string | null, base: string, notFound: string | null }}
 */
export function parseArgs(argv, env = {}) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const raw = get("--port") ?? env.PORT;
  const port = raw === undefined ? DEFAULT_PORT : Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid port: ${raw}`);
  return { port, dir: get("--dir") ?? null, base: normalizeBase(get("--base") ?? "/"), notFound: get("--not-found") ?? null };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const { port, dir, base, notFound } = parseArgs(process.argv, process.env);
  const root = dir ? resolve(ROOT, dir) : ROOT;
  createDevServer({ root, base, notFound }).listen(port, "127.0.0.1", () => {
    console.log(`ExamSnap server: http://localhost:${port}${base}`);
  });
}
