import { portalProfileSchema, portalProfileUpdateInputSchema } from "../schemas/profile.js";

export const portalProfileContract = {
  readOutput: portalProfileSchema,
  updateInput: portalProfileUpdateInputSchema,
  updateOutput: portalProfileSchema
};
