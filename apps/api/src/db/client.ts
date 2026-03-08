import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDbClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the API database client.");
  }

  const sql = postgres(connectionString);

  return drizzle(sql);
}
