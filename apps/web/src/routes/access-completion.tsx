import { useEffect } from "react";
import { AppIcon } from "../components/app-icon";
import { buildApiSessionFinalizeUrl } from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
};

export function AccessCompletion({ provider, redirectPath }: AccessCompletionProps) {
  useEffect(() => {
    const form = document.createElement("form");

    form.method = "POST";
    form.action = buildApiSessionFinalizeUrl(redirectPath);
    form.style.display = "none";
    document.body.append(form);
    form.submit();

    return () => {
      form.remove();
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
