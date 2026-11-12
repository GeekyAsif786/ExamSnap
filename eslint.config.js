// SPDX-License-Identifier: AGPL-3.0-or-later
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "playwright-report/", "test-results/", "dist/", "dist-subpath/"] },
  js.configs.recommended,
  {
    // Pure logic: ES built-ins only. No browser or Node globals, so any DOM or
    // runtime access is a no-undef error.
    files: ["src/core/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {},
    },
  },
  {
    files: ["src/ui/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    // Service worker source; scripts/build.mjs prepends CACHE and PRECACHE.
    files: ["src/sw/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.serviceworker, CACHE: "readonly", PRECACHE: "readonly" },
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.js", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // Playwright specs run in Node, but page.evaluate callbacks run in the page.
    files: ["tests/e2e/**/*.mjs", "scripts/screenshots.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
