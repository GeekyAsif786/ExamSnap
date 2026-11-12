// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from "@playwright/test";

// e2e runs against the BUILT site (npm run preview): at the domain root like
// production, and once more (chromium only) under a sub-path to prove
// BASE_PATH support for GitHub Pages project sites.
const baseURL = "http://127.0.0.1:4173/";
const subpathURL = "http://127.0.0.1:4174/ExamSnap/";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run preview",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/preview.mjs --port 4174 --out dist-subpath",
      env: { BASE_PATH: "/ExamSnap/" },
      url: subpathURL,
      reuseExistingServer: !process.env.CI,
    },
  ],
  // The JPEG encoders differ between engines; that is the point.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "chromium-subpath", use: { ...devices["Desktop Chrome"], baseURL: subpathURL } },
  ],
});
