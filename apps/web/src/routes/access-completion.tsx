import { useEffect } from "react";
import { AppIcon } from "../components/app-icon";
import { buildApiSessionFinalizeUrl, buildAuthUrl } from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
};

function buildAuthRetryUrl(redirectPath: string) {
  const retryUrl = new URL(buildAuthUrl(redirectPath, window.location.hostname));

  retryUrl.searchParams.set("handoff", "retry");

  return retryUrl.toString();
}

export function AccessCompletion({ provider, redirectPath }: AccessCompletionProps) {
  useEffect(() => {
    const abortController = new AbortController();
    let isCancelled = false;

    void (async () => {
      try {
        const response = await fetch(buildApiSessionFinalizeUrl(redirectPath), {
          body: JSON.stringify({ redirect: redirectPath }),
          credentials: "include",
          headers: {
            accept: "application/json",
            "content-type": "application/json"
          },
          method: "POST",
          redirect: "error",
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Finalize failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as { redirectUrl?: string };

        if (typeof payload.redirectUrl !== "string") {
          throw new Error("Finalize response did not include a redirect URL.");
        }

        if (!isCancelled) {
          window.location.replace(payload.redirectUrl);
        }
      } catch (error) {
        if (isCancelled || abortController.signal.aborted) {
          return;
        }

        console.error("Provider sign-in completion failed.", error);
        window.location.replace(buildAuthRetryUrl(redirectPath));
      }
    })();

    return () => {
      isCancelled = true;
      abortController.abort();
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
