import { useEffect } from "react";
import { buildApiSessionCompleteUrl } from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
};

export function AccessCompletion({ provider, redirectPath }: AccessCompletionProps) {
  useEffect(() => {
    window.location.replace(buildApiSessionCompleteUrl(redirectPath));
  }, [redirectPath]);

  const providerLabel = provider === "github" ? "GitHub" : "Google";

  return (
    <main className="auth-shell auth-shell-compact">
      <section className="auth-inline-status">
        <p className="eyebrow">ParetoProof Portal</p>
        <h1>Completing {providerLabel} sign in</h1>
        <p>
          Your Cloudflare Access session is active. Finishing the portal handoff now.
        </p>
      </section>
    </main>
  );
}
