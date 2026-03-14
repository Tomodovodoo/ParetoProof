import { z } from "zod";

export const publicBenchmarkSummarySchema = z.object({
  benchmarkPackageId: z.string(),
  benchmarkPackageVersion: z.string().nullable(),
  label: z.string(),
  status: z.enum(["in_development", "active", "retired"]),
  totalRuns: z.number().int().nonnegative(),
  verdictCounts: z.object({
    fail: z.number().int().nonnegative(),
    invalid_result: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative()
  }),
  providerBreakdown: z.array(
    z.object({
      providerFamily: z.string(),
      totalRuns: z.number().int().nonnegative(),
      passRate: z.number().min(0).max(1).nullable()
    })
  ),
  recentActivity: z.array(
    z.object({
      date: z.string(),
      runs: z.number().int().nonnegative(),
      passes: z.number().int().nonnegative()
    })
  )
});

export const publicBenchmarkSummaryResponseSchema = z.object({
  benchmarks: z.array(publicBenchmarkSummarySchema),
  generatedAt: z.string()
});
