import { publicBenchmarkSummaryResponseSchema } from "@paretoproof/shared";
import { count, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { attempts, runs } from "../db/schema.js";
import type { ReturnTypeOfCreateDbClient } from "../types/db-client.js";

export function registerPublicRoutes(
  app: FastifyInstance,
  db: ReturnTypeOfCreateDbClient
) {
  app.get("/public/benchmarks", async (_request, reply) => {
    const benchmarkRows = await db
      .select({
        benchmarkPackageId: runs.benchmarkPackageId,
        benchmarkPackageVersion: runs.benchmarkPackageVersion,
        totalRuns: count(runs.id),
        passes: count(
          sql`case when ${runs.verdictClass} = 'pass' then 1 end`
        ),
        fails: count(
          sql`case when ${runs.verdictClass} = 'fail' then 1 end`
        ),
        invalidResults: count(
          sql`case when ${runs.verdictClass} = 'invalid_result' then 1 end`
        )
      })
      .from(runs)
      .groupBy(runs.benchmarkPackageId, runs.benchmarkPackageVersion)
      .orderBy(runs.benchmarkPackageId);

    const providerRows = await db
      .select({
        benchmarkPackageId: runs.benchmarkPackageId,
        providerFamily: runs.providerFamily,
        totalRuns: count(runs.id),
        passes: count(
          sql`case when ${runs.verdictClass} = 'pass' then 1 end`
        )
      })
      .from(runs)
      .groupBy(runs.benchmarkPackageId, runs.providerFamily)
      .orderBy(runs.benchmarkPackageId, runs.providerFamily);

    const recentActivityRows = await db
      .select({
        benchmarkPackageId: runs.benchmarkPackageId,
        date: sql<string>`to_char(${runs.completedAt}, 'YYYY-MM-DD')`,
        runs: count(runs.id),
        passes: count(
          sql`case when ${runs.verdictClass} = 'pass' then 1 end`
        )
      })
      .from(runs)
      .where(
        sql`${runs.completedAt} >= now() - interval '30 days'`
      )
      .groupBy(
        runs.benchmarkPackageId,
        sql`to_char(${runs.completedAt}, 'YYYY-MM-DD')`
      )
      .orderBy(runs.benchmarkPackageId, sql`to_char(${runs.completedAt}, 'YYYY-MM-DD')`);

    const providerMap = new Map<string, typeof providerRows>();

    for (const row of providerRows) {
      const existing = providerMap.get(row.benchmarkPackageId) ?? [];
      existing.push(row);
      providerMap.set(row.benchmarkPackageId, existing);
    }

    const activityMap = new Map<string, typeof recentActivityRows>();

    for (const row of recentActivityRows) {
      const existing = activityMap.get(row.benchmarkPackageId) ?? [];
      existing.push(row);
      activityMap.set(row.benchmarkPackageId, existing);
    }

    const benchmarks = benchmarkRows.map((row) => ({
      benchmarkPackageId: row.benchmarkPackageId,
      benchmarkPackageVersion: row.benchmarkPackageVersion,
      label: row.benchmarkPackageId,
      status: row.totalRuns > 0 ? "active" as const : "in_development" as const,
      totalRuns: row.totalRuns,
      verdictCounts: {
        fail: row.fails,
        invalid_result: row.invalidResults,
        pass: row.passes
      },
      providerBreakdown: (providerMap.get(row.benchmarkPackageId) ?? []).map(
        (providerRow) => ({
          providerFamily: providerRow.providerFamily,
          totalRuns: providerRow.totalRuns,
          passRate:
            providerRow.totalRuns > 0
              ? providerRow.passes / providerRow.totalRuns
              : null
        })
      ),
      recentActivity: (activityMap.get(row.benchmarkPackageId) ?? []).map(
        (activityRow) => ({
          date: activityRow.date,
          runs: activityRow.runs,
          passes: activityRow.passes
        })
      )
    }));

    const responseBody = {
      benchmarks,
      generatedAt: new Date().toISOString()
    };

    reply.header("cache-control", "public, max-age=300, stale-while-revalidate=60");

    return responseBody;
  });
}
