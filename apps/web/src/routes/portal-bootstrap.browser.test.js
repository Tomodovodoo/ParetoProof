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
    assert.match(provisionalBody, /Portal landing summary for current run activity/);
    assert.match(provisionalBody, /Requests/);
    assert.match(provisionalBody, /Users/);
    assert.doesNotMatch(provisionalBody, /Formal benchmark operations and contributor tooling\./);
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

async function assertRestrictedRouteHandoffRevalidation({
  port,
  provisionalRole,
  revalidatedRole
}) {
  const testServerUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForServer(`${testServerUrl}/admin/users?surface=portal`);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 }
    });
    await context.addCookies([
      {
        name: "paretoproof_approved_auth_handoff",
        value: encodeURIComponent(
          JSON.stringify({
            role: provisionalRole,
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
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access: {
            email: "reviewer@paretoproof.test",
            role: revalidatedRole,
            status: "approved"
          },
          identity: {
            provider: "cloudflare_google"
          }
        })
      });
    });

    await page.route("http://127.0.0.1:3000/portal/admin/users", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              accessPosture: "approved",
              activeRole: revalidatedRole,
              displayName: "Ada",
              email: "ada@example.com",
              lastReviewedRequestStatus: null,
              linkedIdentityProviders: ["cloudflare_google"],
              pendingRequest: null,
              userId: "11111111-1111-4111-8111-111111111111"
            }
          ]
        })
      });
    });

    await page.goto(`${testServerUrl}/admin/users?surface=portal`, {
      waitUntil: "domcontentloaded"
    });
    await delay(1_000);

    assert.equal(new URL(page.url()).pathname, "/admin/users");
    assert.doesNotMatch(await page.locator("body").innerText(), /Access denied/);

    await page.waitForFunction(
      () =>
        window.location.pathname === "/admin/users" &&
        document.body.innerText.includes("reviewer@paretoproof.test") &&
        document.body.innerText.includes("ADMIN USERS"),
      { timeout: 10_000 }
    );

    const settledBody = await page.locator("body").innerText();
    assert.equal(new URL(page.url()).pathname, "/admin/users");
    assert.match(settledBody, /reviewer@paretoproof\.test/);
    assert.match(settledBody, /ADMIN USERS/);
    assert.doesNotMatch(settledBody, /Access denied/);

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

test(
  "portal bootstrap does not preemptively redirect restricted routes before approved role revalidation",
  { timeout: 60_000 },
  async () => {
    await assertRestrictedRouteHandoffRevalidation({
      port: 4181,
      provisionalRole: "collaborator",
      revalidatedRole: "admin"
    });
  }
);
