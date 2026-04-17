import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const testServerUrl = "http://127.0.0.1:4176";

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

test(
  "public same-surface navigation keeps the document alive and closes the mobile menu",
  { timeout: 60_000 },
  async () => {
    const server =
      process.platform === "win32"
        ? spawn(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", "bun run dev --host 127.0.0.1 --port 4176"],
            {
              cwd: webRoot,
              stdio: "ignore"
            }
          )
        : spawn("bun", ["run", "dev", "--host", "127.0.0.1", "--port", "4176"], {
            cwd: webRoot,
            stdio: "ignore"
          });
    const browser = await chromium.launch({ headless: true });

    try {
      await waitForServer(testServerUrl);

      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();

      await page.goto(`${testServerUrl}/`, { waitUntil: "networkidle" });
      const before = await page.evaluate(() => ({
        href: window.location.href,
        timeOrigin: performance.timeOrigin
      }));

      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("link", { name: "Project", exact: true }).click();
      await page.waitForFunction(() => window.location.pathname === "/project");

      const after = await page.evaluate(() => ({
        href: window.location.href,
        menuCount: document.querySelectorAll(".site-mobile-nav").length,
        timeOrigin: performance.timeOrigin,
        toggleLabel:
          document.querySelector(".site-mobile-toggle")?.textContent?.trim() ?? ""
      }));

      assert.equal(before.timeOrigin, after.timeOrigin);
      assert.equal(after.href, `${testServerUrl}/project`);
      assert.equal(after.menuCount, 0);
      assert.match(after.toggleLabel, /Menu/);
    } finally {
      await browser.close();
      await stopServer(server);
    }
  }
);
