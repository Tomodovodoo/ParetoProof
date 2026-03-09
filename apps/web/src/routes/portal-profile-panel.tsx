import type { PortalProfile, PortalProfileUpdateInput } from "@paretoproof/shared";
import { portalProfileUpdateInputSchema } from "@paretoproof/shared";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../lib/api-base-url";
import { isLocalHostname } from "../lib/surface";

type PortalProfilePanelProps = {
  email: string | null;
};

function getLocalProfileStorageKey(email: string | null) {
  return `paretoproof.portal.profile.displayName:${email ?? "anonymous"}`;
}

function readLocalDisplayName(email: string | null) {
  return window.localStorage.getItem(getLocalProfileStorageKey(email));
}

function writeLocalDisplayName(email: string | null, displayName: string | null) {
  const storageKey = getLocalProfileStorageKey(email);

  if (!displayName) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, displayName);
}

function buildLocalProfile(email: string | null): PortalProfile {
  return {
    createdAt: null,
    displayName: readLocalDisplayName(email),
    email,
    identities: email
      ? [
          {
            createdAt: new Date().toISOString(),
            current: true,
            id: "local-development-identity",
            lastSeenAt: new Date().toISOString(),
            provider: "cloudflare_one_time_pin",
            providerEmail: email
          }
        ]
      : [],
    linkedUserId: null,
    updatedAt: null
  };
}

export function PortalProfilePanel({ email }: PortalProfilePanelProps) {
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        if (isLocalHostname(window.location.hostname)) {
          const localProfile = buildLocalProfile(email);

          if (!cancelled) {
            setDisplayNameInput(localProfile.displayName ?? "");
            setProfile(localProfile);
            setIsLoading(false);
          }
          return;
        }

        const response = await fetch(`${apiBaseUrl}/portal/profile`, {
          credentials: "include",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Profile load failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          profile: PortalProfile;
        };

        if (!cancelled) {
          setDisplayNameInput(payload.profile.displayName ?? "");
          setProfile(payload.profile);
          setIsLoading(false);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "The profile could not be loaded."
        );
        setIsLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, email]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = portalProfileUpdateInputSchema.safeParse({
      displayName: displayNameInput
    });

    if (!parsed.success) {
      setErrorMessage("Check the profile fields and try again.");
      return;
    }

    try {
      setErrorMessage(null);
      setIsSaving(true);

      if (isLocalHostname(window.location.hostname)) {
        writeLocalDisplayName(email, parsed.data.displayName);
        const nextProfile = buildLocalProfile(email);
        setDisplayNameInput(nextProfile.displayName ?? "");
        setProfile(nextProfile);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/portal/profile`, {
        body: JSON.stringify(parsed.data satisfies PortalProfileUpdateInput),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error(`Profile save failed with ${response.status}.`);
      }

      const payload = (await response.json()) as {
        profile: PortalProfile;
      };

      setDisplayNameInput(payload.profile.displayName ?? "");
      setProfile(payload.profile);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The profile could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="portal-grid">
        <article className="portal-panel">
          <p className="eyebrow">Profile</p>
          <h2>Loading profile</h2>
          <p>Resolving your contributor profile and linked Access identities.</p>
        </article>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="portal-grid">
        <article className="portal-panel">
          <p className="eyebrow">Profile</p>
          <h2>Profile unavailable</h2>
          <p>{errorMessage ?? "The profile could not be loaded."}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="portal-grid portal-grid-profile">
      <article className="portal-panel">
        <p className="eyebrow">Contributor profile</p>
        <h2>Your details</h2>
        <p>
          The MVP portal only lets you edit small contributor details here. Login-method
          linking stays separate until the Cloudflare Access trust model is finalized.
        </p>
        <form className="auth-form" onSubmit={handleSave}>
          <label className="auth-field">
            <span>Display name</span>
            <input
              className="auth-input"
              name="displayName"
              onChange={(event) => {
                setDisplayNameInput(event.currentTarget.value);
              }}
              placeholder="How your name should appear in the portal"
              value={displayNameInput}
            />
          </label>
          <label className="auth-field">
            <span>Primary email</span>
            <input
              className="auth-input"
              disabled
              name="email"
              value={profile.email ?? ""}
            />
          </label>
          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
          <button className="button" disabled={isSaving} type="submit">
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </article>

      <article className="portal-panel">
        <p className="eyebrow">Sign-in methods</p>
        <h2>Linked Access identities</h2>
        <div className="portal-identity-list">
          {profile.identities.map((identity) => (
            <article className="portal-identity-card" key={identity.id}>
              <div>
                <p className="portal-action-title">{identity.provider}</p>
                <p className="portal-action-copy">
                  {identity.providerEmail ?? "No provider email available"}
                </p>
              </div>
              {identity.current ? (
                <span className="portal-action-badge">Current</span>
              ) : (
                <span className="portal-action-badge">Linked</span>
              )}
            </article>
          ))}
        </div>
        <p className="portal-panel-muted">
          Adding GitHub and Google as extra login methods is intentionally deferred until the
          identity-linking flow is fully scoped and implemented.
        </p>
      </article>
    </section>
  );
}
