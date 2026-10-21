// Contracts shared between the build integrator and the adoption module.
// This file imports nothing, so services/ContextIntegrator.ts can depend on it
// without pulling the rest of adoption/ into its import graph.

/** The context profile / prompt instruction selected for a brownfield build. */
export const BROWNFIELD_ADOPTION_INSTRUCTION = 'brownfield-adoption';

export type AdoptionSelection =
  | { selected: false }
  | { selected: true; instruction: typeof BROWNFIELD_ADOPTION_INSTRUCTION; facts: string };

export type AdoptionResolver = (
  projectPath: string,
  checkoutPath: string,
  instruction: string,
) => Promise<AdoptionSelection>;

/**
 * Raised when adoption cannot be decided or applied (guide without the profile or
 * prompt, failed state write, unfinishable walk). The message carries the remedy.
 * The build rethrows it instead of falling back to the concept prompt.
 */
export class AdoptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AdoptionError';
  }
}
