import postgres from "postgres";

type CloudflareAccessUser = {
  email: string;
  uid: string;
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

function getCloudflareHeaders() {
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

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/users`,
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
    result?: CloudflareAccessUser[];
    success?: boolean;
  };

  if (!payload.success || !payload.result) {
    throw new Error("Cloudflare Access users response was not successful.");
  }

  const matchingUser = payload.result.find(
    ({ email }) => email.toLowerCase() === ownerEmail
  );

  if (!matchingUser) {
    throw new Error(
      `No Cloudflare Access user found for ${ownerEmail}. Sign into the protected portal once before bootstrapping.`
    );
  }

  return matchingUser;
}

async function main() {
  const ownerEmail = getOwnerEmail();
  const ownerAccessUser = await readCloudflareAccessUser(ownerEmail);
  const sql = postgres(getDatabaseUrl(), {
    max: 1,
    prepare: false
  });

  try {
    await sql.begin(async (transaction) => {
      const [user] = await transaction<
        Array<{
          id: string;
        }>
      >`
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
      const [existingIdentity] = await transaction<
        Array<{
          id: string;
          user_id: string;
        }>
      >`
        select id, user_id
        from public.user_identities
        where provider_subject = ${ownerAccessUser.uid}
        limit 1
      `;

      if (existingIdentity && existingIdentity.user_id !== user.id) {
        throw new Error(
          `Cloudflare Access subject ${ownerAccessUser.uid} is already linked to a different user.`
        );
      }

      if (!existingIdentity) {
        await transaction`
          insert into public.user_identities (
            user_id,
            provider,
            provider_subject,
            provider_email
          )
          values (
            ${user.id},
            ${"cloudflare_one_time_pin"},
            ${ownerAccessUser.uid},
            ${ownerEmail}
          )
        `;
      } else {
        await transaction`
          update public.user_identities
          set provider_email = ${ownerEmail},
              last_seen_at = now()
          where id = ${existingIdentity.id}
        `;
      }

      const [existingAdminGrant] = await transaction<
        Array<{
          id: string;
        }>
      >`
        select id
        from public.role_grants
        where user_id = ${user.id}
          and role = ${"admin"}
          and revoked_at is null
        limit 1
      `;

      if (!existingAdminGrant) {
        await transaction`
          insert into public.role_grants (user_id, role)
          values (${user.id}, ${"admin"})
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
