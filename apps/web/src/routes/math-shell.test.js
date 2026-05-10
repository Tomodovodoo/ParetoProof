import { afterEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalWindow = globalThis.window;

function setWindowUrl(url) {
  globalThis.window = {
    location: new URL(url)
  };
}

async function loadMathShellModule() {
  return import(`./math-shell.tsx?test=${Date.now()}`);
}

async function renderMathShell({ pathname, url }) {
  setWindowUrl(url);
  const { MathShell } = await loadMathShellModule();

  return renderToStaticMarkup(
    createElement(MathShell, {
      email: "ada@paretoproof.local",
      pathname,
      roles: ["helper"]
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

describe("MathShell review workspace", () => {
  it("renders review queues instead of the old placeholder", async () => {
    const html = await renderMathShell({
      pathname: "/reviews",
      url:
        "http://127.0.0.1/reviews?surface=math&access=approved&roles=helper&queue=peer"
    });

    expect(html).toContain("Review queues");
    expect(html).toContain("Peer review");
    expect(html).toContain("Problem 9 Lean proof submission");
    expect(html).toContain("Contract fixture");
    expect(html).not.toContain("Durable review objects and actions remain follow-on work");
  });

  it("renders line-anchored detail for a review record", async () => {
    const html = await renderMathShell({
      pathname: "/reviews/review-peer-problem9-submission",
      url:
        "http://127.0.0.1/reviews/review-peer-problem9-submission?surface=math&access=approved&roles=helper"
    });

    expect(html).toContain("Math review detail");
    expect(html).toContain("FirstProof/Problem9/Candidate.lean");
    expect(html).toContain("problem9_candidate");
    expect(html).toContain("The rewrite is promising");
    expect(html).toContain("Review decisions stay separate");
  });

  it("renders an explicit not-found state for unknown review ids", async () => {
    const html = await renderMathShell({
      pathname: "/reviews/missing-review",
      url:
        "http://127.0.0.1/reviews/missing-review?surface=math&access=approved&roles=helper"
    });

    expect(html).toContain("Review not found");
    expect(html).toContain("Back to reviews");
  });
});
