import {
  portalAccessRequestInputSchema,
  type PortalAccessRequestInput
} from "@paretoproof/shared";
import { useState } from "react";

type AccessRequestScreenProps = {
  email: string | null;
  onSubmit: (payload: PortalAccessRequestInput) => Promise<void>;
};

export function AccessRequestScreen({
  email,
  onSubmit
}: AccessRequestScreenProps) {
  const [requestedRole, setRequestedRole] =
    useState<PortalAccessRequestInput["requestedRole"]>("helper");
  const [rationale, setRationale] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = portalAccessRequestInputSchema.safeParse({
      rationale,
      requestedRole
    });

    if (!parsed.success) {
      setErrorMessage("Check the request details and try again.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSubmit(parsed.data);
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
      <section className="auth-card">
        <p className="eyebrow">Portal access</p>
        <h1>Request contributor access</h1>
        <p>
          Signed in{email ? ` as ${email}` : ""}. Tell us what level of access
          you need so an admin can review it.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
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
          <label className="auth-field">
            <span>Why do you need access?</span>
            <textarea
              name="rationale"
              onChange={(event) => {
                setRationale(event.currentTarget.value);
              }}
              placeholder="A short note for the admin review queue."
              rows={4}
              value={rationale}
            />
          </label>
          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Submitting..." : "Request access"}
          </button>
        </form>
      </section>
    </main>
  );
}
