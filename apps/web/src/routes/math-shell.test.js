import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { describeMathPath, MathShell } from "./math-shell.tsx";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("describeMathPath", () => {
  it("describes question detail continuation as math-owned workflow state", () => {
    expect(describeMathPath("/questions/problem-9")).toMatchObject({
      eyebrow: "Question workflow",
      title: "Math question workflow"
    });
  });

  it("falls back to the math workspace for unknown math paths", () => {
    expect(describeMathPath("/profile")).toMatchObject({
      eyebrow: "Workspace",
      title: "Math workspace"
    });
  });
});

describe("MathShell", () => {
  it("renders top-level math navigation without portal admin routes", () => {
    globalThis.window = {
      location: new URL(
        "http://127.0.0.1/questions/problem-9?surface=math&access=approved&role=helper"
      )
    };

    const html = renderToStaticMarkup(
      <MathShell
        email="reviewer@paretoproof.local"
        pathname="/questions/problem-9"
        roles={["helper"]}
      />
    );

    expect(html).toContain("Math question workflow");
    expect(html).toContain("Question-specific continuation for problem-9");
    expect(html).toContain("Signed in as reviewer@paretoproof.local");
    expect(html).toContain("helper");
    expect(html).toContain('href="http://127.0.0.1/questions?surface=math');
    expect(html).toContain('href="http://127.0.0.1/submissions?surface=math');
    expect(html).toContain('href="http://127.0.0.1/reviews?surface=math');
    expect(html).toContain('href="http://127.0.0.1/launch?surface=math');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('math-shell-nav-label">Workers');
    expect(html).not.toContain('math-shell-nav-label">Runs');
    expect(html).not.toContain('math-shell-nav-label">Admin');
  });

  it("keeps portal links explicit and outside the math navigation", () => {
    globalThis.window = {
      location: new URL("https://math.paretoproof.com/submissions")
    };

    const html = renderToStaticMarkup(
      <MathShell email={null} pathname="/submissions" roles={[]} />
    );

    expect(html).toContain("Structured submission workflow belongs on the math surface");
    expect(html).toContain('href="https://math.paretoproof.com/submissions"');
    expect(html).toContain('href="https://portal.paretoproof.com/profile"');
    expect(html).toContain('href="https://portal.paretoproof.com/runs"');
    expect(html).toContain("Portal handoff");
  });
});
