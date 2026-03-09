import { portalProfileSchema, portalProfileUpdateInputSchema } from "../schemas/profile";

export const portalProfileContract = {
  readOutput: portalProfileSchema,
  updateInput: portalProfileUpdateInputSchema,
  updateOutput: portalProfileSchema
};
