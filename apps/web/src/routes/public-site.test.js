import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;

function setWindowUrl(url) {
  globalThis.window = {
    location: new URL(url)
  };
}

function renderPublicSiteAt(url) {
  setWindowUrl(url);
}

async function loadPublicSiteModule() {
  return import(`./public-site.tsx?test=${Date.now()}`);
}

async function renderPublicSiteAt(url) {
  setWindowUrl(url);
  const { PublicSite } = await loadPublicSiteModule();
  return renderToStaticMarkup(PublicSite());
}

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("resolvePublicSiteRoute", () => {
  it("routes /benchmarks to the benchmark index", async () => {
    setWindowUrl("http://127.0.0.1/");
    const { resolvePublicSiteRoute } = await loadPublicSiteModule();

    expect(resolvePublicSiteRoute("/benchmarks")).toEqual({ kind: "benchmarks" });
  });

  it("routes /reports/:benchmarkVersionId to the release summary view", async () => {
    setWindowUrl("http://127.0.0.1/");
    const { resolvePublicSiteRoute } = await loadPublicSiteModule();

    expect(resolvePublicSiteRoute("/reports/problem-9-v1")).toEqual({
      benchmarkVersionId: "problem-9-v1",
      kind: "report"
    });
  });

  it("handles malformed percent-encoding in report routes", async () => {
    setWindowUrl("http://127.0.0.1/");
    const { resolvePublicSiteRoute } = await loadPublicSiteModule();

    expect(resolvePublicSiteRoute("/reports/%")).toEqual({
      benchmarkVersionId: "%",
      kind: "report"
    });
  });
});

describe("PublicSite", () => {
  it("renders the benchmark index on /benchmarks", async () => {
    const html = await renderPublicSiteAt("http://127.0.0.1/benchmarks");

    expect(html).toContain("Read the current public benchmark slices");
    expect(html).toContain("Problem 9");
    expect(html).not.toContain("Measure frontier reasoning with reproducible proof workflows.");
  });

  it("renders the release summary on /reports/:benchmarkVersionId", async () => {
    const html = await renderPublicSiteAt("http://127.0.0.1/reports/problem-9-v1");

    expect(html).toContain("Problem 9 public release");
    expect(html).toContain("One release table, presented as calm mobile-safe rows.");
    expect(html).not.toContain("Measure frontier reasoning with reproducible proof workflows.");
  });

  it("keeps the project pack route intact", async () => {
    const html = await renderPublicSiteAt("http://127.0.0.1/project");

    expect(html).toContain("One public pack for project context, contributor entry, and contact rules.");
  });
});
