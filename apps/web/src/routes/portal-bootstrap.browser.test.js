import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));

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

  if (processHandle.exitCode === null && process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(processHandle.pid), "/f", "/t"], {
        stdio: "ignore"
      });
      killer.on("close", resolve);
      killer.on("error", resolve);
    });
  }
}

function startServer(port) {
  return process.platform === "win32"
    ? spawn(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", `bun run dev --host 127.0.0.1 --port ${port}`],
        {
          cwd: webRoot,
          stdio: "ignore"
        }
      )
    : spawn("bun", ["run", "dev", "--host", "127.0.0.1", "--port", String(port)], {
        cwd: webRoot,
        stdio: "ignore"
      });
}

async function assertApprovedHandoffTransition({
  expectedText,
  expectedPathname,
  port,
  revalidationResponse
}) {
  const testServerUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForServer(`${testServerUrl}/?surface=portal`);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 }
    });
    await context.addCookies([
      {
        name: "paretoproof_approved_auth_handoff",
        value: encodeURIComponent(
          JSON.stringify({
            role: "admin",
            savedAtMs: Date.now(),
            status: "approved",
            surface: "portal",
            version: 1
          })
        ),
        url: `${testServerUrl}/`
      }
    ]);

    const page = await context.newPage();

    await page.route("http://127.0.0.1:3000/portal/me", async (route) => {
      await delay(1_500);
      await route.fulfill({
        status: revalidationResponse.status,
        contentType: "application/json",
        body: revalidationResponse.body
      });
    });

    await page.goto(`${testServerUrl}/?surface=portal`, { waitUntil: "domcontentloaded" });
    await delay(1_000);

    const provisionalBody = await page.locator("body").innerText();
    assert.match(provisionalBody, /Formal benchmark operations and contributor tooling\./);
    assert.doesNotMatch(provisionalBody, /Opening portal/);

    await page.waitForFunction(
      ({ expected, expectedPathname }) =>
        window.location.pathname === expectedPathname &&
        document.body.innerText.includes(expected),
      {
        expected: expectedText.source.replace(/\\/g, ""),
        expectedPathname
      },
      { timeout: 10_000 }
    );

    const recoveredBody = await page.locator("body").innerText();
    assert.match(recoveredBody, expectedText);
    assert.doesNotMatch(recoveredBody, /Formal benchmark operations and contributor tooling\./);

    await context.close();
  } finally {
    await browser.close();
    await stopServer(server);
  }
}

test(
  "portal bootstrap replaces a provisional approved handoff when /portal/me revalidation disagrees",
  { timeout: 120_000 },
  async () => {
    for (const scenario of [
      {
        expectedText: /Local preview needs auth context/,
        expectedPathname: "/",
        name: "401",
        port: 4177,
        revalidationResponse: {
          body: JSON.stringify({ error: "access_assertion_required" }),
          status: 401
        }
      },
      {
        expectedText: /Approval pending/,
        expectedPathname: "/pending",
        name: "pending",
        port: 4179,
        revalidationResponse: {
          body: JSON.stringify({
            access: {
              email: "reviewer@paretoproof.test",
              status: "pending"
            },
            identity: {
              provider: "cloudflare_google"
            }
          }),
          status: 200
        }
      },
      {
        expectedText: /Access denied/,
        expectedPathname: "/denied",
        name: "denied",
        port: 4180,
        revalidationResponse: {
          body: JSON.stringify({
            access: {
              email: "reviewer@paretoproof.test",
              reason: "rejected_or_withdrawn",
              status: "denied"
            },
            identity: {
              provider: "cloudflare_google"
            }
          }),
          status: 200
        }
      }
    ]) {
      await assertApprovedHandoffTransition({
        expectedText: scenario.expectedText,
        expectedPathname: scenario.expectedPathname,
        port: scenario.port,
        revalidationResponse: scenario.revalidationResponse
      });
    }
  }
);
