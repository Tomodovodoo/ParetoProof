import { afterEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessRequestScreen } from "./access-request-screen.tsx";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow;
    return;
  }

  delete globalThis.window;
});

describe("AccessRequestScreen", () => {
  it("renders escape routes for contributor-access requests", () => {
    globalThis.window = {
      location: new URL("https://portal.paretoproof.com/access-request")
    };

    const html = renderToStaticMarkup(
      <AccessRequestScreen email="collab@example.com" onSubmit={mock(async () => {})} />
    );

    expect(html).toContain("Restart from auth guidance");
    expect(html).toContain("guidance=1");
    expect(html).toContain("redirect=%2Faccess-request");
    expect(html).toContain("Back to paretoproof.com");
  });

  it("renders truthful local escape routes for recovery requests", () => {
    globalThis.window = {
      location: new URL("http://127.0.0.1/access-request?surface=portal")
    };

    const html = renderToStaticMarkup(
      <AccessRequestScreen
        email="owner@example.com"
        mode="identity_recovery"
        onSubmit={mock(async () => {})}
      />
    );

    expect(html).toContain("Restart from auth guidance");
    expect(html).toContain("guidance=1");
    expect(html).toContain("redirect=%2Fprofile");
    expect(html).toContain("Back to local home");
  });
});
