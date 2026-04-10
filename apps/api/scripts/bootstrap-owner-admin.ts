import postgres from "postgres";
import {
  selectBootstrapOwnerAccessUser,
  parseBootstrapOwnerIdentityProvider,
  type BootstrapOwnerIdentityProvider,
  type CloudflareAccessUserCandidate,
  type CloudflareLastSeenIdentity
} from "../src/lib/owner-identity-provider.js";

type BootstrapUserRow = {
  id: string;
};

type ExistingIdentityRow = {
  id: string;
  provider: BootstrapOwnerIdentityProvider | "cloudflare_one_time_pin";
  user_id: string;
};

type ExistingGrantRow = {
  id: string;
  role: "admin" | "collaborator" | "helper";
};

function getDatabaseUrl() {
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "MIGRATION_DATABASE_URL or DATABASE_URL is required to bootstrap the owner admin user."
    );
  }

  return connectionString;
}

function getOwnerEmail() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();

  if (!email) {
    throw new Error("OWNER_EMAIL is required to bootstrap the owner admin user.");
  }

  return email;
}

function getOwnerIdentityProvider() {
  return parseBootstrapOwnerIdentityProvider(process.env.OWNER_IDENTITY_PROVIDER);
}

function getCloudflareHeaders(): Record<string, string> {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json"
    };
  }

  if (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_GLOBAL_API_KEY) {
    return {
      "Content-Type": "application/json",
      "X-Auth-Email": process.env.CLOUDFLARE_EMAIL,
      "X-Auth-Key": process.env.CLOUDFLARE_GLOBAL_API_KEY
    };
  }

  throw new Error(
    "Cloudflare API credentials are required to resolve the owner Access identity."
  );
}

async function readCloudflareAccessUser(ownerEmail: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!accountId) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID is required to resolve the owner Access identity."
    );
  }

  const requestUrl = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/users`
  );
  requestUrl.searchParams.set("email", ownerEmail);
  requestUrl.searchParams.set("per_page", "50");

  const response = await fetch(
    requestUrl,
    {
      headers: getCloudflareHeaders()
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to read Cloudflare Access users: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as {
    result?: CloudflareAccessUserCandidate[];
    success?: boolean;
  };

  if (!payload.success || !payload.result) {
    throw new Error("Cloudflare Access users response was not successful.");
  }

  return payload.result;
}

async function readCloudflareAccessLastSeenIdentity(userId: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!accountId) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID is required to resolve the owner Access identity."
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/users/${encodeURIComponent(userId)}/last_seen_identity`,
    {
      headers: getCloudflareHeaders()
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to read Cloudflare Access last seen identity: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as {
    result?: {
      idp?: {
        type?: string;
      };
      user_uuid?: string;
    };
    success?: boolean;
  };

  if (!payload.success || !payload.result) {
    throw new Error("Cloudflare Access last seen identity response was not successful.");
  }

  return {
    idpType: payload.result.idp?.type ?? null,
    userUuid: payload.result.user_uuid ?? null
  } satisfies CloudflareLastSeenIdentity;
}

async function main() {
  const ownerEmail = getOwnerEmail();
  const ownerIdentityProvider = getOwnerIdentityProvider();
  const ownerAccessUsers = await readCloudflareAccessUser(ownerEmail);
  const lastSeenIdentityByUserId = new Map<string, CloudflareLastSeenIdentity>();

  await Promise.all(
    ownerAccessUsers.map(async (candidate) => {
      lastSeenIdentityByUserId.set(
        candidate.id,
        await readCloudflareAccessLastSeenIdentity(candidate.id)
      );
    })
  );

  const ownerAccessUser = selectBootstrapOwnerAccessUser(
    ownerAccessUsers,
    ownerEmail,
    ownerIdentityProvider,
    lastSeenIdentityByUserId
  );
  const sql = postgres(getDatabaseUrl(), {
    max: 1,
    prepare: false
  });

  try {
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;

      const [user] = await tx<Array<BootstrapUserRow>>`
        insert into public.users (email)
        values (${ownerEmail})
        on conflict (email)
        do update set updated_at = now()
        returning id
      `;

      if (!user) {
        throw new Error("Owner user bootstrap failed to return a user id.");
      }

      // The Access users API returns the stable user uid that the portal JWT subject resolves to for the current IdP.
      const [existingIdentity] = await tx<Array<ExistingIdentityRow>>`
        select id, provider, user_id
        from public.user_identities
        where provider = ${ownerIdentityProvider}
          and provider_subject = ${ownerAccessUser.uid}
        limit 1
      `;

      const [legacyOtpIdentity] = await tx<Array<ExistingIdentityRow>>`
        select id, provider, user_id
        from public.user_identities
        where provider = ${"cloudflare_one_time_pin"}
          and provider_subject = ${ownerAccessUser.uid}
        limit 1
      `;

      if (existingIdentity && existingIdentity.user_id !== user.id) {
        throw new Error(
          `Cloudflare Access subject ${ownerAccessUser.uid} is already linked to a different user.`
        );
      }

      if (legacyOtpIdentity && legacyOtpIdentity.user_id !== user.id) {
        throw new Error(
          `Legacy Cloudflare Access subject ${ownerAccessUser.uid} is already linked to a different user.`
        );
      }

      if (existingIdentity) {
        await tx`
          update public.user_identities
          set provider_email = ${ownerEmail},
              last_seen_at = now()
          where id = ${existingIdentity.id}
        `;
      } else if (legacyOtpIdentity) {
        await tx`
          update public.user_identities
          set provider = ${ownerIdentityProvider},
              provider_email = ${ownerEmail},
              last_seen_at = now()
          where id = ${legacyOtpIdentity.id}
        `;
      } else {
        await tx`
          insert into public.user_identities (
            user_id,
            provider,
            provider_subject,
            provider_email
          )
          values (
            ${user.id},
            ${ownerIdentityProvider},
            ${ownerAccessUser.uid},
            ${ownerEmail}
          )
        `;
      }

      const activeGrantRows = await tx<Array<ExistingGrantRow>>`
        select id, role
        from public.role_grants
        where user_id = ${user.id}
          and revoked_at is null
      `;

      const hasActiveAdminGrant = activeGrantRows.some(({ role }) => role === "admin");

      if (!hasActiveAdminGrant) {
        await tx`
          update public.role_grants
          set revoked_at = now()
          where user_id = ${user.id}
            and revoked_at is null
        `;

        await tx`
          insert into public.role_grants (user_id, role)
          values (${user.id}, ${"admin"})
        `;

        await tx`
          update public.sessions
          set revoked_at = now()
          where user_id = ${user.id}
            and revoked_at is null
        `;

        await tx`
          insert into public.audit_events (
            event_id,
            actor_kind,
            subject_kind,
            severity,
            target_user_id,
            payload
          )
          values (
            ${"user_identity.bootstrapped_admin"},
            ${"system_bootstrap"},
            ${"user_identity"},
            ${"critical"},
            ${user.id},
            ${JSON.stringify({
              provider: ownerIdentityProvider,
              providerSubject: ownerAccessUser.uid,
              targetEmail: ownerEmail,
              targetUserId: user.id
            })}::jsonb
          )
        `;
      }
    });

    console.log(`Bootstrapped owner admin access for ${ownerEmail}.`);
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
