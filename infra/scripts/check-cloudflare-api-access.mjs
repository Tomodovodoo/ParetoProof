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
    "Cloudflare API credentials are required. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL together with CLOUDFLARE_GLOBAL_API_KEY."
  );
}

function getCloudflareAccountId() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required.");
  }

  return accountId;
}

async function readJson(url) {
  const response = await fetch(url, {
    headers: getCloudflareHeaders()
  });

  if (!response.ok) {
    throw new Error(`Cloudflare API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  if (!payload?.success) {
    throw new Error(`Cloudflare API request was not successful for ${url.toString()}.`);
  }

  return payload.result;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function appMatchesDomain(app, expectedDomain) {
  return (
    app?.domain === expectedDomain ||
    toArray(app?.self_hosted_domains).includes(expectedDomain)
  );
}

function policyIncludesEveryone(policy) {
  return toArray(policy?.include).some((rule) => {
    return Boolean(rule && typeof rule === "object" && "everyone" in rule);
  });
}

function describePolicies(policies) {
  return policies.map((policy) => `${policy.name ?? policy.id}:${policy.decision}`).join(", ");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const accountId = getCloudflareAccountId();
  const appsUrl = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`
  );
  const apps = toArray(await readJson(appsUrl));

  const portalApp = apps.find((app) => appMatchesDomain(app, "api.paretoproof.com/portal/*"));
  assert(
    portalApp,
    "Missing Cloudflare Access app for api.paretoproof.com/portal/*."
  );

  const internalApp = apps.find((app) => appMatchesDomain(app, "api.paretoproof.com/internal/*"));
  assert(
    internalApp,
    "Missing Cloudflare Access app for api.paretoproof.com/internal/*."
  );

  const portalPolicies = toArray(
    await readJson(
      new URL(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${portalApp.id}/policies`
      )
    )
  );
  const internalPolicies = toArray(
    await readJson(
      new URL(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps/${internalApp.id}/policies`
      )
    )
  );

  assert(
    portalPolicies.some(
      (policy) => policy.decision === "bypass" && policyIncludesEveryone(policy)
    ),
    `api.paretoproof.com/portal/* must have an everyone+bypass policy. Current policies: ${describePolicies(portalPolicies)}`
  );
  assert(
    !portalPolicies.some((policy) => policy.decision === "allow"),
    `api.paretoproof.com/portal/* must not require Cloudflare Access allow policies. Current policies: ${describePolicies(portalPolicies)}`
  );
  assert(
    internalPolicies.length > 0,
    "api.paretoproof.com/internal/* must keep at least one Cloudflare Access policy."
  );
  assert(
    !internalPolicies.some((policy) => policy.decision === "bypass"),
    `api.paretoproof.com/internal/* must stay protected by Cloudflare Access. Current policies: ${describePolicies(internalPolicies)}`
  );

  console.log(
    [
      "Cloudflare Access API split verified.",
      `Portal app ${portalApp.id} bypasses /portal/* for browser fetches.`,
      `Internal app ${internalApp.id} still protects /internal/* for owner and service-token callers.`
    ].join(" ")
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
