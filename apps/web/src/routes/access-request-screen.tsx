import {
  portalAccessRecoveryInputSchema,
  portalAccessRequestInputSchema,
  type PortalAccessRecoveryInput,
  type PortalAccessRequestInput
} from "@paretoproof/shared";
import { useState } from "react";
import { AppIcon } from "../components/app-icon";

type AccessRequestScreenProps =
  | {
      email: string | null;
      mode?: "access_request";
      onSubmit: (payload: PortalAccessRequestInput) => Promise<void>;
    }
  | {
      email: string | null;
      mode: "identity_recovery";
      onSubmit: (payload: PortalAccessRecoveryInput) => Promise<void>;
    };

export function AccessRequestScreen({
  email,
  mode = "access_request",
  onSubmit
}: AccessRequestScreenProps) {
  const [requestedRole, setRequestedRole] =
    useState<PortalAccessRequestInput["requestedRole"]>("helper");
  const [rationale, setRationale] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (mode === "identity_recovery") {
        const parsed = portalAccessRecoveryInputSchema.safeParse({
          rationale
        });

        if (!parsed.success) {
          setErrorMessage("Add a short recovery note before submitting.");
          return;
        }

        await (onSubmit as (payload: PortalAccessRecoveryInput) => Promise<void>)(
          parsed.data
        );
        return;
      }

      const parsed = portalAccessRequestInputSchema.safeParse({
        rationale,
        requestedRole
      });

      if (!parsed.success) {
        setErrorMessage("Add a short note explaining why you need access.");
        return;
      }

      await (onSubmit as (payload: PortalAccessRequestInput) => Promise<void>)(
        parsed.data
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The access request could not be submitted."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-polished auth-status-card">
        <p className="eyebrow">
          <span className="inline-icon" aria-hidden="true">
            <AppIcon name="key" />
          </span>
          Portal access
        </p>
        <h1>
          {mode === "identity_recovery"
            ? "Recover approved access"
            : "Request contributor access"}
        </h1>
        <p>
          {mode === "identity_recovery"
            ? `Signed in${email ? ` as ${email}` : ""}. This account already has portal access, but your current Cloudflare Access identity is not linked yet. Submit a recovery request so an admin can attach this login method.`
            : `Signed in${email ? ` as ${email}` : ""}. Tell us what level of access you need so an admin can review it.`}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "access_request" ? (
            <label className="auth-field">
              <span>Requested role</span>
              <select
                name="requestedRole"
                onChange={(event) => {
                  setRequestedRole(
                    event.currentTarget.value as PortalAccessRequestInput["requestedRole"]
                  );
                }}
                value={requestedRole}
              >
                <option value="helper">Helper</option>
                <option value="collaborator">Collaborator</option>
              </select>
            </label>
          ) : null}
          <label className="auth-field">
            <span>
              {mode === "identity_recovery"
                ? "What changed?"
                : "Why do you need access?"}
            </span>
            <textarea
              name="rationale"
              onChange={(event) => {
                setRationale(event.currentTarget.value);
              }}
              placeholder={
                mode === "identity_recovery"
                  ? "A short note for the admin so they can verify this recovery request."
                  : "A short note for the admin review queue."
              }
              rows={4}
              value={rationale}
            />
          </label>
          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Submitting..."
              : mode === "identity_recovery"
                ? "Request recovery"
                : "Request access"}
          </button>
        </form>
      </section>
    </main>
  );
}
