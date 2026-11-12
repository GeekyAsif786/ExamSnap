// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createDevServer, resolvePath, MIME } from "../scripts/serve.mjs";

let tmp, server, base;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), "examsnap-serve-"));
  await mkdir(join(tmp, "src"));
  await mkdir(join(tmp, "docs"));
  const files = {
    "index.html": "<!doctype html>",
    "src/app.js": "export {}",
    "src/styles.css": "body{}",
    "src/data.json": "{}",
    "src/icon.svg": "<svg/>",
    "src/app.webmanifest": "{}",
    "docs/index.html": "docs",
  };
  for (const [name, body] of Object.entries(files)) await writeFile(join(tmp, name), body);
  server = createDevServer({ root: tmp });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await rm(tmp, { recursive: true, force: true });
});

test("serves files with the right MIME types", async () => {
  const cases = {
    "/": "text/html; charset=utf-8",
    "/src/app.js": "text/javascript; charset=utf-8",
    "/src/styles.css": "text/css; charset=utf-8",
    "/src/data.json": "application/json; charset=utf-8",
    "/src/icon.svg": "image/svg+xml",
    "/src/app.webmanifest": "application/manifest+json",
  };
  for (const [path, type] of Object.entries(cases)) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("content-type"), type, path);
  }
  assert.equal(await (await fetch(`${base}/src/app.js?v=1`)).text(), "export {}");
});

test("directories serve index.html; missing trailing slash redirects", async () => {
  assert.equal(await (await fetch(`${base}/docs/`)).text(), "docs");
  const res = await fetch(`${base}/docs`, { redirect: "manual" });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "/docs/");
});

test("missing files are 404, other methods 405", async () => {
  assert.equal((await fetch(`${base}/nope.js`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: "POST" })).status, 405);
});

test("path traversal cannot escape the root", async () => {
  // fetch() normalises "..", so send the raw path with node:http.
  const status = (path) =>
    new Promise((resolve, reject) => {
      const req = request(`${base}/`, { path }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.end();
    });
  for (const path of ["/../package.json", "/%2e%2e/package.json", "/src/..%2f..%2fpackage.json", "/%00"]) {
    assert.ok([400, 404].includes(await status(path)), path);
  }
});

test("resolvePath stays inside root", () => {
  assert.equal(resolvePath("/r", "/a/b.js"), "/r/a/b.js");
  assert.equal(resolvePath("/r", "/"), "/r/index.html");
  // The URL parser treats %2e%2e as ".." and clamps it at "/".
  assert.equal(resolvePath("/r", "/%2e%2e/x"), "/r/x");
  // Encoded slashes survive URL parsing, so the path check must catch them.
  assert.equal(resolvePath("/r", "/a/..%2f..%2fx"), null);
  assert.equal(resolvePath("/r", "/%E0%A4%A"), null);
});

test("MIME map covers the required extensions", () => {
  for (const ext of [".html", ".js", ".css", ".json", ".svg", ".webmanifest"]) assert.ok(MIME[ext], ext);
});
