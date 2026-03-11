import { useEffect } from "react";
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
  const finalizeUrl = buildApiSessionFinalizeUrl(redirectPath);
  const retryUrl = new URL(buildAuthUrl(redirectPath));

  retryUrl.searchParams.set("handoff", "retry");

  useEffect(() => {
    window.location.replace(finalizeUrl);
  }, [finalizeUrl]);

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
          If you are not redirected automatically,{" "}
          <a href={finalizeUrl}>continue to the portal</a> or{" "}
          <a href={retryUrl.toString()}>retry sign in</a>.
        </p>
      </section>
    </main>
  );
}
