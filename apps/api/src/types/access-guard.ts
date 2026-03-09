import type { createAccessGuard } from "../auth/require-access.js";

export type ReturnTypeOfCreateAccessGuard = ReturnType<typeof createAccessGuard>;
