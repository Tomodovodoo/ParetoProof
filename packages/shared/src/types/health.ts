import type { z } from "zod";
import { healthResponseSchema } from "../schemas/health";

export type HealthResponse = z.infer<typeof healthResponseSchema>;
