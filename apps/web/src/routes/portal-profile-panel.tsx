import type {
  PortalLinkableIdentityProvider,
  PortalProfile,
  PortalProfileLinkIntent,
  PortalProfileUpdateInput
} from "@paretoproof/shared";
import {
  portalProfileLinkIntentInputSchema,
  portalProfileUpdateInputSchema
} from "@paretoproof/shared";
import { useEffect, useMemo, useState, startTransition } from "react";
import { PortalFreshnessCard } from "../components/portal-freshness-card";
import { getApiBaseUrl } from "../lib/api-base-url";
import { isLocalHostname } from "../lib/surface";

type PortalProfilePanelProps = {
  email: string | null;
};

const linkableProviders: {
  key: PortalLinkableIdentityProvider;
  label: string;
}[] = [
  {
    key: "cloudflare_github",
    label: "GitHub"
  },
  {
    key: "cloudflare_google",
    label: "Google"
  }
];

function formatIdentityProviderLabel(provider: PortalProfile["identities"][number]["provider"]) {
  if (provider === "cloudflare_github") {
    return "GitHub";
  }

  if (provider === "cloudflare_google") {
    return "Google";
  }

  return "One-time pin";
}

function getLocalProfileStorageKey(email: string | null) {
  return `paretoproof.portal.profile.displayName:${email ?? "anonymous"}`;
}

function getLocalIdentityStorageKey(email: string | null) {
  return `paretoproof.portal.profile.identities:${email ?? "anonymous"}`;
}

function readLocalDisplayName(email: string | null) {
  return window.localStorage.getItem(getLocalProfileStorageKey(email));
}

function readLocalIdentities(email: string | null): PortalProfile["identities"] {
  const rawValue = window.localStorage.getItem(getLocalIdentityStorageKey(email));

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as PortalProfile["identities"];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDisplayName(email: string | null, displayName: string | null) {
  const storageKey = getLocalProfileStorageKey(email);

  if (!displayName) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, displayName);
}

function writeLocalIdentities(email: string | null, identities: PortalProfile["identities"]) {
  window.localStorage.setItem(getLocalIdentityStorageKey(email), JSON.stringify(identities));
}

function buildLocalProfile(email: string | null): PortalProfile {
  const storedIdentities = readLocalIdentities(email);

  if (email && storedIdentities.length === 0) {
    writeLocalIdentities(email, [
      {
        createdAt: new Date().toISOString(),
        current: true,
        id: "local-development-identity",
        lastSeenAt: new Date().toISOString(),
        provider: "cloudflare_github",
        providerEmail: email
      }
    ]);
  }

  return {
    createdAt: null,
    displayName: readLocalDisplayName(email),
    email,
    identities: readLocalIdentities(email),
    linkedUserId: null,
    updatedAt: null
  };
}

export function PortalProfilePanel({ email }: PortalProfilePanelProps) {
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<PortalLinkableIdentityProvider | null>(
    null
  );
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
            setLastUpdatedAt(new Date().toISOString());
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
          setLastUpdatedAt(new Date().toISOString());
          setProfile(payload.profile);
          setLinkMessage(readLinkStatusMessage());
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

  async function handleStartLink(provider: PortalLinkableIdentityProvider) {
    const parsed = portalProfileLinkIntentInputSchema.safeParse({
      provider,
      redirectPath: "/profile"
    });

    if (!parsed.success) {
      setErrorMessage("The selected sign-in method could not be prepared.");
      return;
    }

    try {
      setErrorMessage(null);
      setLinkMessage(null);
      setLinkingProvider(provider);

      if (isLocalHostname(window.location.hostname)) {
        const localProfile = buildLocalProfile(email);

        if (!localProfile.identities.some((identity) => identity.provider === provider)) {
          writeLocalIdentities(email, [
            ...localProfile.identities,
            {
              createdAt: new Date().toISOString(),
              current: false,
              id: `local-${provider}`,
              lastSeenAt: new Date().toISOString(),
              provider,
              providerEmail: email
            }
          ]);
        }

        setProfile(buildLocalProfile(email));
        setLastUpdatedAt(new Date().toISOString());
        setLinkMessage("The new sign-in method has been linked to this local profile.");
        return;
      }

      const response = await fetch(`${apiBaseUrl}/portal/profile/link-intents`, {
        body: JSON.stringify(parsed.data),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`Link preparation failed with ${response.status}.`);
      }

      const payload = (await response.json()) as {
        intent: PortalProfileLinkIntent;
      };

      window.location.assign(payload.intent.startUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The sign-in method could not be prepared."
      );
    } finally {
      setLinkingProvider(null);
    }
  }

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
        setLastUpdatedAt(new Date().toISOString());
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
      setLastUpdatedAt(new Date().toISOString());
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
          Update the supported contributor details and attach an extra GitHub or Google
          sign-in method without changing your approved portal account.
        </p>
        <PortalFreshnessCard lastUpdatedAt={lastUpdatedAt} routeId="portal.profile" />
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
            <div className="portal-identity-row" key={identity.id}>
              <div>
                <p className="portal-action-title">{formatIdentityProviderLabel(identity.provider)}</p>
                <p className="portal-action-copy">
                  {identity.providerEmail ?? "No provider email available"}
                </p>
              </div>
              {identity.current ? (
                <span className="portal-action-badge">Current</span>
              ) : (
                <span className="portal-action-badge">Linked</span>
              )}
            </div>
          ))}
        </div>
        <div className="portal-link-actions">
          {linkableProviders.map((provider) => {
            const alreadyLinked = profile.identities.some(
              (identity) => identity.provider === provider.key
            );

            return (
              <button
                className="button button-secondary"
                disabled={alreadyLinked || linkingProvider !== null}
                key={provider.key}
                onClick={() => {
                  startTransition(() => {
                    void handleStartLink(provider.key);
                  });
                }}
                type="button"
              >
                {alreadyLinked
                  ? `${provider.label} linked`
                  : linkingProvider === provider.key
                    ? `Connecting ${provider.label}...`
                    : `Add ${provider.label}`}
              </button>
            );
          })}
        </div>
        <p className="portal-panel-muted">
          Link an extra sign-in method from here. The portal only marks it as linked after the
          Cloudflare Access handoff returns and the backend confirms the new identity.
        </p>
        {linkMessage ? <p className="portal-panel-muted">{linkMessage}</p> : null}
      </article>
    </section>
  );
}

function readLinkStatusMessage() {
  const params = new URLSearchParams(window.location.search);
  const linkStatus = params.get("link");

  if (!linkStatus) {
    return null;
  }

  const nextParams = new URLSearchParams(params);
  nextParams.delete("link");
  const nextSearch = nextParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);

  switch (linkStatus) {
    case "linked":
      return "The new sign-in method has been linked to your portal account.";
    case "conflict":
      return "That sign-in method is already linked to a different portal account.";
    case "provider_mismatch":
      return "Finish the linking flow with the same provider you selected in the portal.";
    case "invalid":
      return "The sign-in method handoff expired or was already used. Start it again from your profile.";
    default:
      return null;
  }
}
