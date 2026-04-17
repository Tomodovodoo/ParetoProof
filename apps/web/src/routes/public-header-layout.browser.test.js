import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appCss = readFileSync(
  fileURLToPath(new URL("../styles/app.css", import.meta.url)),
  "utf8"
);

const publicHeaderHtml = `
  <div class="site-shell site-home-shell site-home-shell-compact">
    <header class="site-header">
      <div class="site-header-bar">
        <a class="site-brand" href="http://127.0.0.1:4174/">
          <span class="site-brand-mark" aria-hidden="true"></span>
          <span class="site-brand-name">ParetoProof</span>
        </a>
        <nav class="site-primary-nav" aria-label="Primary">
          <a class="site-nav-link site-nav-link-active" href="http://127.0.0.1:4174/">Home</a>
          <a class="site-nav-link" href="http://127.0.0.1:4174/project">Project</a>
          <a class="site-nav-link" href="http://127.0.0.1:4174/benchmarks">Benchmarks</a>
          <a class="site-nav-link" href="https://github.com/Tomodovodoo/ParetoProof/blob/main/docs/README.md">Docs</a>
        </nav>
        <div class="site-header-actions">
          <a class="button button-secondary site-header-github" href="https://github.com/Tomodovodoo/ParetoProof/discussions">GitHub</a>
          <a class="button" href="http://127.0.0.1:4174/?surface=auth">Sign in</a>
          <button class="site-mobile-toggle" type="button" aria-expanded="false" aria-label="Open menu">
            <span class="site-mobile-toggle-icon" aria-hidden="true"></span>
            <span class="site-mobile-toggle-label">Menu</span>
          </button>
        </div>
      </div>
    </header>
  </div>
`;

test(
  "public mobile header collapses inline CTAs and shows a labeled menu control at 390px",
  { timeout: 20_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();

      await page.setContent(
        `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${appCss}</style></head><body>${publicHeaderHtml}</body></html>`,
        { waitUntil: "domcontentloaded" }
      );

      const [signInDisplay, githubDisplay, toggleDisplay, toggleText, bodyMetrics] =
        await Promise.all([
          page
            .locator(".site-header-actions > a.button")
            .nth(1)
            .evaluate((element) => getComputedStyle(element).display),
          page.locator(".site-header-github").evaluate((element) => getComputedStyle(element).display),
          page.locator(".site-mobile-toggle").evaluate((element) => getComputedStyle(element).display),
          page.locator(".site-mobile-toggle").innerText(),
          page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth
          }))
        ]);

      assert.equal(signInDisplay, "none");
      assert.equal(githubDisplay, "none");
      assert.equal(toggleDisplay, "flex");
      assert.match(toggleText, /Menu/);
      assert.ok(bodyMetrics.scrollWidth <= bodyMetrics.clientWidth);
    } finally {
      await browser.close();
    }
  }
);

test(
  "public compact home header still keeps the menu control visible at 360px",
  { timeout: 20_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();

      await page.setContent(
        `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${appCss}</style></head><body>${publicHeaderHtml}</body></html>`,
        { waitUntil: "domcontentloaded" }
      );

      const [actionsDisplay, toggleDisplay, toggleText] = await Promise.all([
        page.locator(".site-header-actions").evaluate((element) => getComputedStyle(element).display),
        page.locator(".site-mobile-toggle").evaluate((element) => getComputedStyle(element).display),
        page.locator(".site-mobile-toggle").innerText()
      ]);

      assert.equal(actionsDisplay, "flex");
      assert.equal(toggleDisplay, "flex");
      assert.match(toggleText, /Menu/);
    } finally {
      await browser.close();
    }
  }
);
