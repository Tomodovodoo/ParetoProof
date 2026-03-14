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

function setWindow(url, width) {
  const location = new URL(url);

  globalThis.window = {
    addEventListener() {},
    history: {
      replaceState() {},
      state: null
    },
    location,
    matchMedia: createMatchMedia(width),
    removeEventListener() {}
  };
}

async function loadPortalShellModule() {
  return import(`./portal-shell.tsx?test=${Date.now()}`);
}

async function renderPortalShell({ email, roles, url, width }) {
  setWindow(url, width);
  const { PortalShell } = await loadPortalShellModule();
  return renderToStaticMarkup(createElement(PortalShell, { email, roles }));
}

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("PortalShell overview ordering", () => {
  it("puts compact admin recent-run evidence before the action rail", async () => {
    const html = await renderPortalShell({
      email: "ada@paretoproof.local",
      roles: ["admin"],
      url: "http://127.0.0.1/?surface=portal&access=approved&roles=admin&email=ada%40paretoproof.local",
      width: 320
    });

    expect(html).toContain("Review access requests");
    expect(html.indexOf("Recent runs route back into the canonical cluster.")).toBeLessThan(
      html.indexOf("Approval state")
    );
    expect(html.indexOf("Recent runs route back into the canonical cluster.")).toBeLessThan(
      html.indexOf("Review runs")
    );
  });

  it("keeps the wide admin overview metric strip before the action rail", async () => {
    const html = await renderPortalShell({
      email: "ada@paretoproof.local",
      roles: ["admin"],
      url: "http://127.0.0.1/?surface=portal&access=approved&roles=admin&email=ada%40paretoproof.local",
      width: 1280
    });

    expect(html).toContain("Review access requests");
    expect(html.indexOf("Approval state")).toBeLessThan(html.indexOf("Review runs"));
  });
});
