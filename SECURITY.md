# Security policy

## Supported version

Only the latest deploy of https://examsnap.asifurrahaman.com/ (the `main` branch) is supported. Fixes are not backported.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository ([private vulnerability reporting](https://github.com/GeekyAsif786/ExamSnap/security/advisories/new)). Don't open a public issue for security problems.

Include what you found, how to reproduce it, and what an attacker could do with it.

## Scope

In scope:

- The site itself: anything that runs in the browser, including the service worker.
- The build (`scripts/`) and the deploy workflow.
- Presets that could make ExamSnap produce a wrong file, e.g. a size or KB range that a portal would reject.

Out of scope:

- Third-party sites linked as preset sources.
- GitHub Pages or GitHub itself.
- Problems that need a compromised device or browser.

## What to expect

ExamSnap is maintained by one person in their spare time. Reports are handled on a best-effort basis: I'll acknowledge as soon as I can, keep you informed, and credit you in the fix unless you prefer otherwise.
