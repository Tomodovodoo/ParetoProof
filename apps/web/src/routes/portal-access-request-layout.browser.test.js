import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appCss = readFileSync(
  fileURLToPath(new URL("../styles/app.css", import.meta.url)),
  "utf8"
);

const compactAccessRequestCardHtml = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${appCss}</style>
  </head>
  <body>
    <main class="portal-grid portal-grid-stack portal-grid-admin-workspace">
      <section class="portal-admin-layout">
        <article class="portal-panel portal-admin-list-panel">
          <div class="portal-admin-record-list">
            <button class="portal-admin-record" type="button">
              <div class="portal-admin-record-header">
                <strong>morgan@paretoproof.local</strong>
                <span class="portal-state-badge portal-admin-status-pending">Pending</span>
              </div>
              <p class="portal-panel-muted">Access request - helper</p>
              <div class="portal-admin-meta-row">
                <span>Submitted 13/03/2026, 19:25:00</span>
                <span>Awaiting reviewer</span>
              </div>
              <div class="portal-filter-chip-row">
                <span class="role-chip role-chip-muted">Approved</span>
                <span class="role-chip role-chip-muted">User 44444444</span>
              </div>
            </button>
          </div>
        </article>
      </section>
    </main>
  </body>
</html>
`;

test(
  "portal access-request compact layout keeps the status pill inside the queue card at 320px",
  { timeout: 20_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();

      await page.setContent(compactAccessRequestCardHtml, {
        waitUntil: "domcontentloaded"
      });

      const queueCard = page.locator(".portal-admin-record").first();
      const statusBadge = queueCard.locator(".portal-state-badge").first();
      const header = queueCard.locator(".portal-admin-record-header").first();

      const [queueCardBox, headerBox, statusBadgeBox, queueCardMetrics, headerMetrics] =
        await Promise.all([
          queueCard.boundingBox(),
          header.boundingBox(),
          statusBadge.boundingBox(),
          queueCard.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          })),
          header.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          }))
        ]);

      assert.ok(queueCardBox, "Expected a visible queue card.");
      assert.ok(headerBox, "Expected a visible queue-card header.");
      assert.ok(statusBadgeBox, "Expected a visible status badge.");
      assert.ok(queueCardMetrics.scrollWidth <= queueCardMetrics.clientWidth);
      assert.ok(headerMetrics.scrollWidth <= headerMetrics.clientWidth);

      const queueCardRightEdge = queueCardBox.x + queueCardBox.width;
      const headerRightEdge = headerBox.x + headerBox.width;
      const statusBadgeRightEdge = statusBadgeBox.x + statusBadgeBox.width;

      assert.ok(statusBadgeRightEdge <= queueCardRightEdge);
      assert.ok(statusBadgeRightEdge <= headerRightEdge);
      assert.ok(statusBadgeBox.y >= headerBox.y);
    } finally {
      await browser.close();
    }
  }
);
