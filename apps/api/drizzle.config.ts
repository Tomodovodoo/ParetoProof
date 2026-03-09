import { defineConfig } from "drizzle-kit";

function readDatabaseUrl(name: "DATABASE_URL" | "MIGRATION_DATABASE_URL") {
  const value = process.env[name]?.trim();

  if (!value || value.includes("user:password@host:5432")) {
    return null;
  }

  return value;
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  migrations: {
    schema: "public"
  },
  dbCredentials: {
    url: readDatabaseUrl("MIGRATION_DATABASE_URL") ?? readDatabaseUrl("DATABASE_URL") ?? ""
  }
});
