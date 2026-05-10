import { useEffect, useRef } from "react";
import { AppIcon } from "../components/app-icon";
import {
  buildAccessFinalizeUrl,
  buildAuthUrl,
  describeAuthenticatedSurface,
  type AuthenticatedSurface
} from "../lib/surface";

type AccessCompletionProps = {
  provider: "github" | "google";
  redirectPath: string;
  redirectSurface: AuthenticatedSurface;
};

export function AccessCompletion({
  provider,
  redirectPath,
  redirectSurface
}: AccessCompletionProps) {
  const finalizeUrl = buildAccessFinalizeUrl(redirectPath, {
    surface: redirectSurface
  });
  const finalizeFormRef = useRef<HTMLFormElement>(null);
  const retryUrl = new URL(
    buildAuthUrl(redirectPath, undefined, {
      surface: redirectSurface
    })
  );
  const destinationLabel = describeAuthenticatedSurface(redirectSurface);

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
          ParetoProof workspace
        </p>
        <h1>Completing {providerLabel} sign in</h1>
        <p>
          Your session is active. Redirecting you to the {destinationLabel} now.
        </p>
        <p>
          If you are not redirected automatically,{" "}
          <a href={retryUrl.toString()}>try signing in again</a> or use the button below.
        </p>
        <form
          ref={finalizeFormRef}
          action={finalizeUrl}
          method="post"
          className="auth-form"
        >
          {redirectPath !== "/" ? <input type="hidden" name="redirect" value={redirectPath} /> : null}
          <input type="hidden" name="app" value={redirectSurface} />
          <button type="submit" className="button">
            Continue to the {destinationLabel}
          </button>
        </form>
      </section>
    </main>
  );
}
