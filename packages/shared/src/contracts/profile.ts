import {
  portalMeResponseSchema,
  portalProfileLinkIntentInputSchema,
  portalProfileLinkIntentResponseSchema,
  portalProfileLinkIntentSchema,
  portalProfileResponseSchema,
  portalProfileSchema,
  portalSessionFinalizeResponseSchema,
  portalProfileUpdateInputSchema
} from "../schemas/profile.js";

export const portalProfileContract = {
  createLinkIntentInput: portalProfileLinkIntentInputSchema,
  createLinkIntentResponse: portalProfileLinkIntentResponseSchema,
  createLinkIntentOutput: portalProfileLinkIntentSchema,
  meResponse: portalMeResponseSchema,
  readOutput: portalProfileSchema,
  readResponse: portalProfileResponseSchema,
  sessionFinalizeResponse: portalSessionFinalizeResponseSchema,
  updateInput: portalProfileUpdateInputSchema,
  updateOutput: portalProfileSchema,
  updateResponse: portalProfileResponseSchema
};
