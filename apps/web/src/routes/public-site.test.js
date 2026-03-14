import { afterEach, describe, expect, it } from "bun:test";
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
  globalThis.window = {
    location: new URL(url),
    matchMedia: createMatchMedia(width)
  };
}

async function loadPublicSiteModule() {
  return import(`./public-site.tsx?test=${Date.now()}`);
}

async function renderPublicSiteAt(url, width = 1280) {
  setWindow(url, width);
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
    setWindow("http://127.0.0.1/");
    const { resolvePublicSiteRoute } = await loadPublicSiteModule();

    expect(resolvePublicSiteRoute("/benchmarks")).toEqual({ kind: "benchmarks" });
  });

  it("routes /reports/:benchmarkVersionId to the release summary view", async () => {
    setWindow("http://127.0.0.1/");
    const { resolvePublicSiteRoute } = await loadPublicSiteModule();

    expect(resolvePublicSiteRoute("/reports/problem-9-v1")).toEqual({
      benchmarkVersionId: "problem-9-v1",
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
    expect(html).not.toContain("site-benchmark-report-partial");
    expect(html).not.toContain("Measure frontier reasoning with reproducible proof workflows.");
  });

  it("marks partial release reports for compact-only layout tuning", async () => {
    const html = await renderPublicSiteAt(
      "http://127.0.0.1/reports/statement-formalization-pilot-v1"
    );

    expect(html).toContain("Statement formalization pilot release");
    expect(html).toContain("site-benchmark-report-partial");
  });

  it("keeps compact benchmark index release cards ahead of the support summary", async () => {
    const html = await renderPublicSiteAt("http://127.0.0.1/benchmarks", 320);

    expect(html).toContain("site-benchmark-index-shell-compact");
    expect(html.indexOf("Problem 9")).toBeLessThan(
      html.indexOf("Benchmark status cues stay available after the released slices.")
    );
  });

  it("keeps the wide benchmark index summary ahead of the release cards", async () => {
    const html = await renderPublicSiteAt("http://127.0.0.1/benchmarks", 1280);

    expect(html).not.toContain("site-benchmark-index-shell-compact");
    expect(html.indexOf("Released slices")).toBeLessThan(html.indexOf("Problem 9"));
  });

  it("keeps the project pack route intact", async () => {
    const html = await renderPublicSiteAt("http://127.0.0.1/project");

    expect(html).toContain("One public pack for project context, contributor entry, and contact rules.");
  });
});
