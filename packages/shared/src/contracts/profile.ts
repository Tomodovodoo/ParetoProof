import {
  portalProfileLinkIntentInputSchema,
  portalProfileLinkIntentSchema,
  portalProfileSchema,
  portalProfileUpdateInputSchema
} from "../schemas/profile.js";

export const portalProfileContract = {
  createLinkIntentInput: portalProfileLinkIntentInputSchema,
  createLinkIntentOutput: portalProfileLinkIntentSchema,
  readOutput: portalProfileSchema,
  updateInput: portalProfileUpdateInputSchema,
  updateOutput: portalProfileSchema
};
