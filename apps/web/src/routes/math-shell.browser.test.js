import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const viteCli = fileURLToPath(
  new URL("../../node_modules/vite/bin/vite.js", import.meta.url)
);

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {}

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");
  await delay(500);
}

function startServer(port) {
  return process.platform === "win32"
    ? spawn(
        process.env.ComSpec || "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          `"${process.execPath}" "${viteCli}" --host 127.0.0.1 --port ${port}`
        ],
        {
          cwd: webRoot,
          stdio: "ignore"
        }
      )
    : spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", String(port)], {
        cwd: webRoot,
        stdio: "ignore"
      });
}

async function withMathServer(port, callback) {
  const testServerUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  let browser = null;

  try {
    await waitForServer(`${testServerUrl}/questions/problem-9?surface=math`);
    browser = await chromium.launch({ headless: true });
    await callback({
      browser,
      testServerUrl
    });
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopServer(server);
  }
}

test(
  "math shell renders immediately from an approved math handoff and survives revalidation",
  { timeout: 60_000 },
  async () => {
    await withMathServer(4186, async ({ browser, testServerUrl }) => {
      const context = await browser.newContext({
        viewport: { width: 1360, height: 900 }
      });
      await context.addCookies([
        {
          name: "paretoproof_approved_auth_handoff",
          value: encodeURIComponent(
            JSON.stringify({
              role: "helper",
              savedAtMs: Date.now(),
              status: "approved",
              surface: "math",
              version: 1
            })
          ),
          url: `${testServerUrl}/`
        }
      ]);

      const page = await context.newPage();

      await page.route("http://127.0.0.1:3000/portal/me", async (route) => {
        await delay(1_200);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            access: {
              email: "reviewer@paretoproof.test",
              role: "helper",
              status: "approved"
            },
            identity: {
              provider: "cloudflare_google"
            }
          })
        });
      });

      await page.goto(`${testServerUrl}/questions/problem-9?surface=math`, {
        waitUntil: "domcontentloaded"
      });
      await delay(400);

      assert.equal(new URL(page.url()).pathname, "/questions/problem-9");

      const provisionalBody = await page.locator("body").innerText();
      assert.match(provisionalBody, /Math question workflow/);
      assert.match(provisionalBody, /Questions/);
      assert.match(provisionalBody, /Submissions/);
      assert.doesNotMatch(provisionalBody, /Opening math workspace/);
      assert.doesNotMatch(provisionalBody, /Workers/);

      await page.waitForFunction(
        () =>
          window.location.pathname === "/questions/problem-9" &&
          document.body.innerText.includes("reviewer@paretoproof.test"),
        { timeout: 10_000 }
      );

      const settledBody = await page.locator("body").innerText();
      assert.match(settledBody, /reviewer@paretoproof\.test/);
      assert.match(settledBody, /helper/);
      assert.doesNotMatch(settledBody, /Workers/);

      await context.close();
    });
  }
);

test(
  "math shell local unauthenticated entry routes back through math auth guidance",
  { timeout: 60_000 },
  async () => {
    await withMathServer(4187, async ({ browser, testServerUrl }) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }
      });
      const page = await context.newPage();

      await page.route("http://127.0.0.1:3000/portal/me", async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "access_assertion_required" })
        });
      });

      await page.goto(`${testServerUrl}/questions/problem-9?surface=math`, {
        waitUntil: "domcontentloaded"
      });

      await page.waitForFunction(
        () => document.body.innerText.includes("Local preview needs auth context"),
        { timeout: 10_000 }
      );

      const body = await page.locator("body").innerText();
      assert.match(body, /localhost math route/);

      const authHref = await page
        .locator("a", { hasText: "Open local auth guidance" })
        .getAttribute("href");
      assert.equal(
        authHref,
        `${testServerUrl}/?surface=auth&app=math&redirect=%2Fquestions%2Fproblem-9`
      );

      await context.close();
    });
  }
);

test(
  "math pending users are routed to the existing portal pending state",
  { timeout: 60_000 },
  async () => {
    await withMathServer(4188, async ({ browser, testServerUrl }) => {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 }
      });
      const page = await context.newPage();

      await page.route("http://127.0.0.1:3000/portal/me", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            access: {
              email: "pending@paretoproof.test",
              status: "pending"
            },
            identity: {
              provider: "cloudflare_google"
            }
          })
        });
      });

      await page.goto(`${testServerUrl}/launch?surface=math`, {
        waitUntil: "domcontentloaded"
      });

      await page.waitForFunction(
        () =>
          window.location.pathname === "/pending" &&
          new URLSearchParams(window.location.search).get("surface") === "portal" &&
          document.body.innerText.includes("Approval pending"),
        { timeout: 10_000 }
      );

      const body = await page.locator("body").innerText();
      assert.match(body, /Approval pending/);
      assert.doesNotMatch(body, /Math launch entry/);

      await context.close();
    });
  }
);
