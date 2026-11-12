// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, JS_BUDGET } from "../scripts/build.mjs";
import { CSP } from "../scripts/build-lib.mjs";
import { cp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PRESETS } from "../src/generated/presets.js";

const tmp = () => mkdtemp(join(tmpdir(), "examsnap-build-"));

test("two builds are byte-identical", async (t) => {
  const [a, b] = await Promise.all([tmp(), tmp()]);
  t.after(() => Promise.all([rm(a, { recursive: true, force: true }), rm(b, { recursive: true, force: true })]));
  const ra = await build({ outDir: a });
  const rb = await build({ outDir: b });
  assert.deepEqual(ra.files, rb.files);
  for (const f of ra.files) {
    assert.ok((await readFile(join(a, f.path))).equals(await readFile(join(b, f.path))), f.path);
  }
});

test("output layout: pages, crawl files, hashed assets, budget", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const paths = r.files.map((f) => f.path);
  for (const p of ["index.html", "404.html", "sitemap.xml", "robots.txt", "manifest.webmanifest", "sw.js", ...PRESETS.map((p) => `${p.id}/index.html`)]) {
    assert.ok(paths.includes(p), p);
  }
  // Every JS/CSS/image asset is content-hashed; no unhashed source paths ship.
  for (const p of paths.filter((p) => /\.(js|css|png|svg)$/.test(p) && p !== "sw.js")) {
    assert.match(p, /\.[0-9a-f]{8}\.(js|css|png|svg)$/, p);
  }
  assert.ok(r.jsBytes < JS_BUDGET);
  assert.deepEqual(r.pages, ["", ...PRESETS.map((p) => `${p.id}/`)]);
});

test("defaults: the custom domain at the root", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir });
  const ssc = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.match(ssc, /<link rel="canonical" href="https:\/\/examsnap\.asifurrahaman\.com\/ssc\/">/);
  assert.equal(await readFile(join(dir, "robots.txt"), "utf8"), "User-agent: *\nAllow: /\n\nSitemap: https://examsnap.asifurrahaman.com/sitemap.xml\n");
  const manifest = JSON.parse(await readFile(join(dir, "manifest.webmanifest"), "utf8"));
  assert.deepEqual([manifest.id, manifest.start_url, manifest.scope], ["/", "/", "/"]);
  assert.match(await readFile(join(dir, "sitemap.xml"), "utf8"), /<loc>https:\/\/examsnap\.asifurrahaman\.com\/<\/loc>/);
  assert.match(await readFile(join(dir, "404.html"), "utf8"), /href="\/src\/ui\/styles\.[0-9a-f]{8}\.css"/);
});

test("BASE_PATH still works: a GitHub Pages project site under /ExamSnap/", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir, base: "/ExamSnap/", origin: "https://geekyasif786.github.io" });
  const ssc = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.match(ssc, /<link rel="canonical" href="https:\/\/geekyasif786\.github\.io\/ExamSnap\/ssc\/">/);
  assert.match(ssc, /src="\.\.\/src\/ui\/app\.[0-9a-f]{8}\.js"/, "assets stay relative");
  assert.match(await readFile(join(dir, "404.html"), "utf8"), /href="\/ExamSnap\/src\/ui\/styles\.[0-9a-f]{8}\.css"/);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.webmanifest"), "utf8"));
  assert.deepEqual([manifest.id, manifest.start_url, manifest.scope], ["/ExamSnap/", "/ExamSnap/", "/ExamSnap/"]);
});

test("BASE_PATH and SITE_ORIGIN: another custom domain only needs base '/' and a new origin", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir, base: "/", origin: "https://examsnap.example" });
  const ssc = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.match(ssc, /<link rel="canonical" href="https:\/\/examsnap\.example\/ssc\/">/);
  assert.match(ssc, /src="\.\.\/src\/ui\/app\.[0-9a-f]{8}\.js"/, "assets stay relative");
  const notFound = await readFile(join(dir, "404.html"), "utf8");
  assert.match(notFound, /href="\/src\/ui\/styles\.[0-9a-f]{8}\.css"/, "404 uses root-absolute paths under the base");
  assert.match(await readFile(join(dir, "robots.txt"), "utf8"), /Sitemap: https:\/\/examsnap\.example\/sitemap\.xml/);
  // No root-absolute /ExamSnap/ paths or default-origin URLs left over (the
  // GitHub repo link in the footer legitimately contains "ExamSnap/").
  assert.doesNotMatch(ssc + notFound, /["'(]\/ExamSnap\//, "no leftover /ExamSnap/ paths");
  assert.doesNotMatch(ssc + notFound, /github\.io/, "no default-origin URLs");
});

test("hashed imports point at files that exist in the build", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const paths = new Set(r.files.map((f) => f.path));
  for (const f of r.files.filter((f) => f.path.endsWith(".js") && f.path.startsWith("src/"))) {
    const code = await readFile(join(dir, f.path), "utf8");
    for (const m of code.matchAll(/\bfrom\s*"(\.{1,2}\/[^"]+)"/g)) {
      const target = new URL(m[1], `file:///${f.path}`).pathname.slice(1);
      assert.ok(paths.has(target), `${f.path} imports missing ${target}`);
    }
  }
});

test("sw.js precaches every page and shipped asset (not the OG image), and parses", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const sw = await readFile(join(dir, "sw.js"), "utf8");
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert.ok(precache.includes("./"));
  for (const p of PRESETS) assert.ok(precache.includes(`${p.id}/`), p.id);
  for (const f of r.files) {
    if (/^(sw\.js|sitemap\.xml|robots\.txt)$/.test(f.path) || f.path.includes("og-image")) continue;
    const url = f.path === "index.html" ? "./" : f.path.replace(/index\.html$/, "");
    assert.ok(precache.includes(url), `${f.path} not precached`);
  }
  assert.ok(!precache.some((u) => u.includes("og-image")));
  new Function(sw); // syntax check
  // A content change gives a new cache name.
  const other = await tmp();
  t.after(() => rm(other, { recursive: true, force: true }));
  await build({ outDir: other, origin: "https://examsnap.example" });
  const cacheOf = async (d) => (await readFile(join(d, "sw.js"), "utf8")).match(/const CACHE = "([^"]+)"/)[1];
  assert.notEqual(await cacheOf(dir), await cacheOf(other));
});

test("the in-tool warning is left out exactly where the page-level warning is shown", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir });
  for (const p of PRESETS) {
    const html = await readFile(join(dir, `${p.id}/index.html`), "utf8");
    const pageLevel = !p.sources.some((s) => s.type === "notice");
    assert.equal(html.includes('id="page-warning"'), pageLevel, p.id);
    assert.equal(html.includes('id="warning"'), !pageLevel, p.id);
    assert.equal(html.match(/class="warning"/g).length, 1, p.id);
  }
  assert.ok((await readFile(join(dir, "index.html"), "utf8")).includes('id="warning"'), "root keeps the in-tool warning");
});

const cspOf = (html) => [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)].map((m) => m[1]);

test("production, preview and e2e (sub-path) builds emit the identical CSP on every page", async (t) => {
  const configs = [
    {}, // production defaults (also what npm run preview builds)
    { base: "/ExamSnap/" }, // e2e chromium-subpath
    { base: "/", origin: "https://examsnap.example" },
  ];
  for (const config of configs) {
    const dir = await tmp();
    t.after(() => rm(dir, { recursive: true, force: true }));
    const r = await build({ outDir: dir, ...config });
    for (const f of r.files.filter((f) => f.path.endsWith(".html"))) {
      const html = await readFile(join(dir, f.path), "utf8");
      assert.deepEqual(cspOf(html), [CSP], `${JSON.stringify(config)} ${f.path}`);
      assert.ok(html.includes('<meta name="referrer" content="no-referrer">'), f.path);
    }
  }
  // The dev template carries the same policy, so npm run dev behaves alike.
  const template = await readFile(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  assert.deepEqual(cspOf(template), [CSP]);
});

test("the build fails on any http:// URL in its output", async (t) => {
  const src = await tmp();
  const out = await tmp();
  t.after(() => Promise.all([rm(src, { recursive: true, force: true }), rm(out, { recursive: true, force: true })]));
  const root = fileURLToPath(new URL("..", import.meta.url));
  for (const p of ["index.html", "favicon.svg", "icons", "src"]) await cp(join(root, p), join(src, p), { recursive: true });
  const css = join(src, "src/ui/styles.css");
  await writeFile(css, `${await readFile(css, "utf8")}\n.x { background: url(http://cdn.example/x.png); }\n`);
  await assert.rejects(build({ root: src, outDir: out }), /http:\/\/ URLs in the build:\nsrc\/ui\/styles\.[0-9a-f]{8}\.css: http:\/\/cdn\.example\/x\.png/);
});
