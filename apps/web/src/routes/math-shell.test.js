import { afterEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;

function createMatchMedia(width) {
  return (query) => {
    const maxWidthMatch = /\(max-width:\s*(\d+)px\)/.exec(query);
    const maxWidth = maxWidthMatch ? Number(maxWidthMatch[1]) : Number.POSITIVE_INFINITY;

    return {
      addEventListener() {},
      matches: width <= maxWidth,
      media: query,
      removeEventListener() {}
    };
  };
}

function setWindow(url, width = 1280) {
  const location = new URL(url);

  globalThis.window = {
    location,
    matchMedia: createMatchMedia(width)
  };
}

async function loadMathShellModule() {
  return import(`./math-shell.tsx?test=${Date.now()}`);
}

async function renderMathShell({ roles = ["collaborator"], url, width = 1280 }) {
  setWindow(url, width);
  const { MathShell } = await loadMathShellModule();
  return renderToStaticMarkup(
    createElement(MathShell, {
      email: "ada@paretoproof.local",
      pathname: new URL(url).pathname,
      roles
    })
  );
}

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("MathShell question launch UI", () => {
  it("renders hosted, local connected, and offline export paths on question pages", async () => {
    const html = await renderMathShell({
      url: "http://127.0.0.1/questions/firstproof%2FProblem9?surface=math"
    });

    expect(html).toContain("Problem 9");
    expect(html).toContain("Hosted run");
    expect(html).toContain("Local connected");
    expect(html).toContain("Offline export");
    expect(html).toContain("problem9_hosted");
    expect(html).toContain("problem9_trusted_local_devbox");
    expect(html).toContain("Download descriptor");
    expect(html).toContain("openai/problem9-single-pass");
    expect(html).toContain("Open run evidence");
  });

  it("surfaces hosted role gating for helper-only users", async () => {
    const html = await renderMathShell({
      roles: ["helper"],
      url: "http://127.0.0.1/launch?surface=math"
    });

    expect(html).toContain("Collaborator access required");
    expect(html).toContain("Launch pending");
  });

  it("keeps submission and review routes as math placeholders with launch navigation", async () => {
    const html = await renderMathShell({
      url: "http://127.0.0.1/reviews?surface=math"
    });

    expect(html).toContain("Math reviews");
    expect(html).toContain("Open Problem 9 launch");
  });
});
