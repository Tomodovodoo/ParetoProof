function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for the API runtime.`);
  }

  return value;
}

export function assertApiRuntimeEnv() {
  readRequiredEnv("DATABASE_URL");
  readRequiredEnv("ACCESS_PROVIDER_STATE_SECRET");
  readRequiredEnv("CF_ACCESS_TEAM_DOMAIN");

  if (!(process.env.CF_ACCESS_PORTAL_AUD?.trim() || process.env.CF_ACCESS_AUD?.trim())) {
    throw new Error(
      "CF_ACCESS_PORTAL_AUD or CF_ACCESS_AUD is required for Access JWT validation."
    );
  }
}
