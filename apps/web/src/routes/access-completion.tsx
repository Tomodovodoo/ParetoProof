import { useEffect, useRef } from "react";
import { AppIcon } from "../components/app-icon";
import {
  buildApiSessionFinalizeUrl,
  buildAuthUrl
} from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
};

export function AccessCompletion({ provider, redirectPath }: AccessCompletionProps) {
  const finalizeUrl = buildApiSessionFinalizeUrl();
  const finalizeFormRef = useRef<HTMLFormElement>(null);
  const retryUrl = new URL(buildAuthUrl(redirectPath));
  const flow = new URLSearchParams(window.location.search).get("flow");
  const finalizeMethod = flow === "link" ? "post" : "get";

  retryUrl.searchParams.set("handoff", "retry");

  useEffect(() => {
    finalizeFormRef.current?.requestSubmit();
  }, []);

  const providerLabel = provider === "github" ? "GitHub" : "Google";

  return (
    <main className="auth-shell auth-shell-compact">
      <section className="auth-inline-status">
        <p className="eyebrow">
          <span className="inline-icon" aria-hidden="true">
            <AppIcon name="shield" />
          </span>
          ParetoProof Portal
        </p>
        <h1>Completing {providerLabel} sign in</h1>
        <p>
          Your Cloudflare Access session is active. Finishing the portal handoff now.
        </p>
        <p>
          If you are not redirected automatically, use the secure handoff below or{" "}
          <a href={retryUrl.toString()}>retry sign in</a>.
        </p>
        <form
          ref={finalizeFormRef}
          action={finalizeUrl}
          method={finalizeMethod}
          className="auth-form"
        >
          {redirectPath !== "/" ? <input type="hidden" name="redirect" value={redirectPath} /> : null}
          <button type="submit" className="button">
            Continue to the portal
          </button>
        </form>
      </section>
    </main>
  );
}
