import type { z } from "zod";
import type {
  publicBenchmarkSummaryResponseSchema,
  publicBenchmarkSummarySchema
} from "../schemas/public-benchmark.js";

export type PublicBenchmarkSummary = z.infer<typeof publicBenchmarkSummarySchema>;
export type PublicBenchmarkSummaryResponse = z.infer<typeof publicBenchmarkSummaryResponseSchema>;
