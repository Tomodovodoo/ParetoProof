import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

type MigrationJournal = {
  entries: Array<{
    idx: number;
    tag: string;
    when: number;
  }>;
};

function splitStatements(sqlText: string) {
  return sqlText
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function readMigrationJournal() {
  const journalUrl = new URL("../drizzle/meta/_journal.json", import.meta.url);
  const journalText = await readFile(journalUrl, "utf8");

  return JSON.parse(journalText) as MigrationJournal;
}

async function readMigrationSql(tag: string) {
  const sqlUrl = new URL(`../drizzle/${tag}.sql`, import.meta.url);
  const sqlText = await readFile(sqlUrl, "utf8");

  return {
    hash: createHash("sha256").update(sqlText).digest("hex"),
    statements: splitStatements(sqlText)
  };
}

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required to apply migrations.");
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false
  });

  try {
    // Migration bookkeeping stays in public so the dedicated migration role never needs database-level schema creation.
    const [migrationTable] = await sql<
      Array<{
        to_regclass: string | null;
      }>
    >`select to_regclass('public.__drizzle_migrations')`;

    if (!migrationTable?.to_regclass) {
      await sql`
        create table public.__drizzle_migrations (
          id serial primary key,
          hash text not null,
          created_at numeric not null
        )
      `;
    }

    const appliedMigrations = await sql<
      Array<{
        created_at: string;
        hash: string;
      }>
    >`select created_at, hash from public.__drizzle_migrations`;
    const appliedHashes = new Set(appliedMigrations.map(({ hash }) => hash));
    const journal = await readMigrationJournal();

    for (const entry of journal.entries) {
      const migration = await readMigrationSql(entry.tag);

      if (appliedHashes.has(migration.hash)) {
        continue;
      }

      const conflictingMigration = appliedMigrations.find(
        ({ created_at, hash }) =>
          Number(created_at) === entry.when && hash !== migration.hash
      );

      if (conflictingMigration) {
        throw new Error(
          `Migration journal entry ${entry.tag} conflicts with existing migration metadata for timestamp ${entry.when}.`
        );
      }

      await sql.begin(async (transaction) => {
        for (const statement of migration.statements) {
          await transaction.unsafe(statement);
        }

        await transaction`
          insert into public.__drizzle_migrations (hash, created_at)
          values (${migration.hash}, ${entry.when})
        `;
      });

      appliedMigrations.push({
        created_at: String(entry.when),
        hash: migration.hash
      });
      appliedHashes.add(migration.hash);
      console.log(`Applied migration ${entry.tag}`);
    }
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
