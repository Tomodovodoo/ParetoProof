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
  useEffect(() => {
    const finalizeAbortController = new AbortController();
    const retryUrl = new URL(buildAuthUrl(redirectPath));
    const finalizeDeadlineTimeoutId = window.setTimeout(() => {
      finalizeAbortController.abort();
    }, 12000);

    retryUrl.searchParams.set("handoff", "retry");

    const finalizePortalSession = async () => {
      try {
        const response = await fetch(buildApiSessionFinalizeUrl(redirectPath), {
          credentials: "include",
          headers: {
            Accept: "application/json"
          },
          method: "POST",
          signal: finalizeAbortController.signal
        });
        const payload =
          (await response.json().catch(() => null)) as { redirectTo?: string } | null;

        if (!response.ok || !payload?.redirectTo) {
          throw new Error("finalize_failed");
        }

        window.location.replace(payload.redirectTo);
      } catch {
        if (!finalizeAbortController.signal.aborted) {
          window.location.replace(retryUrl.toString());
        }
      } finally {
        window.clearTimeout(finalizeDeadlineTimeoutId);
      }
    };

    void finalizePortalSession();

    return () => {
      finalizeAbortController.abort();
      window.clearTimeout(finalizeDeadlineTimeoutId);
    };
  }, [redirectPath]);

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
      </section>
    </main>
  );
}
