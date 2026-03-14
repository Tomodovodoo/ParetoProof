import { useEffect, useRef } from "react";
import { AppIcon } from "../components/app-icon";
import {
  buildAccessFinalizeUrl,
  buildAuthUrl,
  isLocalHostname
} from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
};

export function AccessCompletion({ provider, redirectPath }: AccessCompletionProps) {
  const finalizeUrl = buildAccessFinalizeUrl(redirectPath);
  const finalizeFormRef = useRef<HTMLFormElement>(null);
  const retryUrl = new URL(buildAuthUrl(redirectPath));
  const isLocal = isLocalHostname(window.location.hostname.toLowerCase());

  retryUrl.searchParams.set("handoff", "retry");

  useEffect(() => {
    if (isLocal) {
      return;
    }

    finalizeFormRef.current?.requestSubmit();
  }, [isLocal]);

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
          method="post"
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
